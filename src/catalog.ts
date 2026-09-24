import { readdir, readFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { z } from "zod";
import { ResourceSchema, type Resource, type ResourceType } from "./schema.js";
import { RegistryServer, registryMcpConfig } from "./registry.js";
import { frontmatter } from "./adapters.js";
export interface CatalogSource {
  id: string;
  /**
   * Candidate resources. Anything the source cannot read is forwarded as-is;
   * searchSources rejects and counts it instead of dropping the source.
   */
  search(query: string): Promise<unknown[]>;
}
export const matches = (r: Resource, q: string) =>
  `${r.id} ${r.name} ${r.description} ${r.tags.join(" ")}`
    .toLowerCase()
    .includes(q.toLowerCase());
export async function searchSources(
  query: string,
  sources: CatalogSource[],
  type?: ResourceType,
) {
  const resources = new Map<string, Resource>();
  const errors: string[] = [];
  await Promise.all(
    sources.map(async (source) => {
      try {
        // One unreadable entry must not remove a whole source from the
        // results, so entries are validated one at a time and counted.
        let skipped = 0;
        for (const input of await source.search(query)) {
          const parsed = ResourceSchema.safeParse(input);
          if (!parsed.success) {
            skipped++;
            continue;
          }
          const r = parsed.data;
          if ((!type || r.type === type) && matches(r, query))
            resources.set(r.id, r);
        }
        if (skipped)
          errors.push(
            `${source.id}: skipped ${skipped} entr${skipped === 1 ? "y" : "ies"} this version cannot read`,
          );
      } catch (e) {
        errors.push(`${source.id}: ${String(e)}`);
      }
    }),
  );
  return {
    resources: [...resources.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    errors,
  };
}
export async function fetchJson(
  url: string,
  headers: Record<string, string> = {},
) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 8_000_000) throw new Error("Source response too large");
  return JSON.parse(text) as unknown;
}
async function skillAssets(
  root: string,
  dir = root,
): Promise<{ path: string; contents: string }[]> {
  const files: { path: string; contents: string }[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (
      entry.name.startsWith(".") ||
      entry.name === "node_modules" ||
      entry.name === "__pycache__"
    )
      continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await skillAssets(root, path)));
    else if (entry.isFile() && path !== join(root, "SKILL.md")) {
      const contents = await readFile(path, "utf8");
      if (contents.length > 250000 || contents.includes("\u0000"))
        throw new Error(`Unsupported skill asset: ${path}`);
      files.push({
        path: relative(root, path).replaceAll("\\", "/"),
        contents,
      });
    }
  }
  return files;
}
export async function localCatalog(root: string): Promise<Resource[]> {
  const resources: Resource[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > 6) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
    for (const entry of entries) {
      if (
        entry.name.startsWith(".") ||
        ["node_modules", "dist"].includes(entry.name)
      )
        continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path, depth + 1);
      else if (
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        entry.name !== "README.md"
      ) {
        const rel = relative(root, path);
        let type: ResourceType | undefined;
        if (entry.name === "SKILL.md") type = "skill";
        else if (rel.includes("agents/")) type = "subagent";
        else if (rel.startsWith("prompts/") || rel.includes("instincts/"))
          type = "prompt";
        else if (rel.includes("commands/")) type = "command";
        if (!type) continue;
        const content = await readFile(path, "utf8");
        let meta: Record<string, unknown> = {};
        try {
          meta = frontmatter(content);
        } catch {
          /* Plain markdown remains inspectable. */
        }
        const name =
          typeof meta.name === "string"
            ? meta.name
            : entry.name === "SKILL.md"
              ? basename(dir)
              : entry.name.replace(/\.md$/, "");
        resources.push(
          ResourceSchema.parse({
            id: `${type}:${name.replace(/[^a-z0-9._-]/gi, "-")}`,
            name,
            type,
            description:
              typeof meta.description === "string" ? meta.description : "",
            source: `file://${path}`,
            scope: "project",
            harnesses: ["claude-code"],
            content,
            config:
              type === "skill"
                ? { ...meta, files: await skillAssets(dir) }
                : meta,
            tags: [rel.split("/")[0]],
          }),
        );
      }
    }
  }
  await walk(root, 0);
  return resources;
}
const RegistryMeta = z
  .object({
    "io.modelcontextprotocol.registry/official": z
      .object({
        status: z.string().optional(),
        isLatest: z.boolean().optional(),
      })
      .optional(),
  })
  .optional();

export const mcpRegistry: CatalogSource = {
  id: "mcp-registry",
  async search(query) {
    const data = z
      .object({
        servers: z.array(
          z.object({ server: z.unknown(), _meta: z.unknown().optional() }),
        ),
      })
      .parse(
        await fetchJson(
          `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(query)}&limit=100`,
        ),
      );
    // The registry lists every published version of a server. Keep the one it
    // marks current, so a pinned launch configuration is not an old release,
    // and forward what this version cannot read so the caller counts it.
    const unreadable: unknown[] = [];
    const current = new Map<string, z.infer<typeof RegistryServer>>();
    for (const entry of data.servers) {
      const parsed = RegistryServer.safeParse(entry.server);
      if (!parsed.success) {
        unreadable.push(entry.server);
        continue;
      }
      const meta = RegistryMeta.safeParse(entry._meta);
      const official = meta.success
        ? meta.data?.["io.modelcontextprotocol.registry/official"]
        : undefined;
      if (official?.status && official.status !== "active") continue;
      if (!current.has(parsed.data.name) || official?.isLatest)
        current.set(parsed.data.name, parsed.data);
    }
    return [
      ...[...current.values()].map((entry) => ({
        id: `mcp:${entry.name}`,
        type: "mcp",
        name: entry.name,
        description: entry.description ?? "",
        source:
          entry.repository?.url ?? "https://registry.modelcontextprotocol.io",
        scope: "project",
        harnesses: ["claude-code", "cursor"],
        config: registryMcpConfig(entry),
        tags: ["mcp-registry"],
      })),
      ...unreadable,
    ];
  },
};
export const skillsSource: CatalogSource = {
  id: "skills.sh",
  async search(query) {
    const token = process.env.VERCEL_OIDC_TOKEN;
    if (!token)
      throw new Error("Set VERCEL_OIDC_TOKEN for the documented skills.sh API");
    const Skill = z.object({
      id: z.string(),
      name: z.string(),
      source: z.string(),
      installUrl: z.string().optional(),
    });
    const data = z
      .object({ data: z.array(z.unknown()) })
      .parse(
        await fetchJson(
          `https://skills.sh/api/v1/skills/search?q=${encodeURIComponent(query)}&limit=100`,
          { Authorization: `Bearer ${token}` },
        ),
      );
    return data.data.map((entry) => {
      const parsed = Skill.safeParse(entry);
      if (!parsed.success) return entry;
      const skill = parsed.data;
      return {
        id: `skill:${skill.id}`,
        type: "skill",
        name: skill.name,
        source: skill.installUrl ?? `https://github.com/${skill.source}`,
        scope: "project",
        harnesses: ["claude-code", "cursor"],
        tags: ["skills.sh"],
        config: { skillsId: skill.id },
      };
    });
  },
};
export function githubSource(
  repo: string,
  type: ResourceType = "skill",
): CatalogSource {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo))
    throw new Error("Expected GitHub owner/repo");
  return {
    id: `github:${repo}`,
    async search(query) {
      const headers: Record<string, string> = process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {};
      const meta = z
        .object({ default_branch: z.string() })
        .parse(
          await fetchJson(`https://api.github.com/repos/${repo}`, headers),
        );
      const tree = z
        .object({
          sha: z.string(),
          tree: z.array(z.object({ path: z.string(), type: z.string() })),
        })
        .parse(
          await fetchJson(
            `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(meta.default_branch)}?recursive=1`,
            headers,
          ),
        );
      return tree.tree
        .filter(
          (f) =>
            f.type === "blob" &&
            (type === "skill"
              ? f.path.endsWith("SKILL.md")
              : f.path.endsWith(".md")) &&
            f.path.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 100)
        .map((f) =>
          ResourceSchema.parse({
            id: `${type}:${repo}/${f.path.replace(/[^a-z0-9._/-]/gi, "-")}`,
            type,
            name:
              type === "skill"
                ? basename(f.path.replace(/\/SKILL.md$/, ""))
                : basename(f.path),
            source: `https://github.com/${repo}/blob/${tree.sha}/${f.path}`,
            scope: "project",
            harnesses: ["claude-code"],
            tags: ["github", repo],
            config: {
              repository: `https://github.com/${repo}`,
              commit: tree.sha,
              rawUrl: `https://raw.githubusercontent.com/${repo}/${tree.sha}/${f.path}`,
            },
          }),
        );
    },
  };
}
export async function inspectRemote(resource: Resource) {
  if (typeof resource.config.rawUrl === "string") {
    const url = new URL(resource.config.rawUrl);
    if (
      url.hostname !== "raw.githubusercontent.com" ||
      url.protocol !== "https:"
    )
      throw new Error("Unsupported content host");
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const content = await res.text();
    if (content.length > 1_000_000) throw new Error("Resource too large");
    const files: { path: string; contents: string }[] = [];
    if (
      resource.type === "skill" &&
      typeof resource.config.repository === "string" &&
      typeof resource.config.commit === "string"
    ) {
      const repo = new URL(resource.config.repository).pathname.slice(1);
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo))
        throw new Error("Invalid repository");
      const prefix = url.pathname.split("/").slice(4, -1).join("/") + "/";
      const tree = z
        .object({
          tree: z.array(
            z.object({
              path: z.string(),
              type: z.string(),
              size: z.number().optional(),
            }),
          ),
        })
        .parse(
          await fetchJson(
            `https://api.github.com/repos/${repo}/git/trees/${resource.config.commit}?recursive=1`,
          ),
        );
      const assets = tree.tree.filter(
        (f) =>
          f.type === "blob" &&
          f.path.startsWith(prefix) &&
          f.path !== prefix + "SKILL.md",
      );
      if (assets.length > 100)
        throw new Error(
          "Skill has more than 100 assets; use the upstream installer",
        );
      for (const asset of assets) {
        if ((asset.size ?? 0) > 250000)
          throw new Error("Skill asset too large");
        const response = await fetch(
          `https://raw.githubusercontent.com/${repo}/${resource.config.commit}/${asset.path}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (!response.ok) throw new Error(`Asset HTTP ${response.status}`);
        const contents = await response.text();
        if (contents.includes("\u0000"))
          throw new Error("Binary asset requires upstream installer");
        files.push({ path: asset.path.slice(prefix.length), contents });
      }
    }
    return { ...resource, content, config: { ...resource.config, files } };
  }
  if (typeof resource.config.skillsId === "string") {
    const token = process.env.VERCEL_OIDC_TOKEN;
    if (!token) throw new Error("Set VERCEL_OIDC_TOKEN");
    const data = z
      .object({
        files: z
          .array(z.object({ path: z.string(), contents: z.string() }))
          .nullable(),
      })
      .parse(
        await fetchJson(
          `https://skills.sh/api/v1/skills/${resource.config.skillsId}`,
          { Authorization: `Bearer ${token}` },
        ),
      );
    return {
      ...resource,
      content: data.files?.find((f) => f.path === "SKILL.md")?.contents ?? "",
      config: { ...resource.config, files: data.files ?? [] },
    };
  }
  return resource;
}
