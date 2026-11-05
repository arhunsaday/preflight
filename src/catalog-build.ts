import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { z } from "zod";
import { frontmatter } from "./adapters.js";
import { skillAssets } from "./catalog.js";
import { ResourceSchema, type Resource } from "./schema.js";

/**
 * The exchange format between a content repository and Preflight:
 * catalog/index.json, written by `preflight catalog build <dir>`.
 * Resources are validated one by one when read, so a newer entry type
 * only drops that entry, not the source.
 */
export const CATALOG_SCHEMA = 1;
export const CatalogIndexSchema = z
  .object({
    schema: z.literal(CATALOG_SCHEMA),
    name: z.string().min(1),
    repository: z.string().optional(),
    ref: z.string().optional(),
    resources: z.array(z.unknown()),
    loadouts: z
      .object({
        loadouts: z.record(z.string(), z.unknown()),
        presets: z.record(z.string(), z.array(z.string())).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type CatalogIndex = z.infer<typeof CatalogIndexSchema>;

export interface BuildOptions {
  /** GitHub owner/repo the index is published from; sources link there. */
  repo?: string;
  /** Branch, tag or commit the links point at (default main). */
  ref?: string;
  name?: string;
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}
async function list(dir: string, suffix: string) {
  try {
    return (await readdir(dir))
      .filter((n) => n.endsWith(suffix) && n !== "README.md")
      .sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}
async function find(root: string, file: string, depth = 4): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, level: number) {
    if (level > depth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path, level + 1);
      else if (entry.name === file) found.push(path);
    }
  }
  await walk(root, 0);
  return found;
}
const id = (type: string, name: string) =>
  `${type}:${name.replace(/[^a-z0-9._-]/gi, "-")}`;
function meta(content: string) {
  try {
    return frontmatter(content);
  } catch {
    return {};
  }
}

/**
 * Scans a content repository laid out like agent-kit and returns its index:
 *   skills/<category>/<name>/SKILL.md     skill
 *   claude/agents/*.md                    subagent
 *   claude/commands/*.md                  command
 *   claude/settings.base.json hooks       hook (script from claude/hooks/)
 *   claude/settings.base.json statusLine  statusline (claude/statusline/)
 *   claude/mcp.json mcpServers            mcp
 *   claude/CLAUDE.md                      instructions(~/.claude/CLAUDE.md)
 *   prompts/*.md, **\/instincts/*.md       prompt
 *   .claude-plugin/marketplace.json       plugin (name@marketplace)
 *   loadouts/loadouts.json                loadouts and presets
 * Every folder is optional.
 */
export async function buildCatalog(
  directory: string,
  options: BuildOptions = {},
): Promise<CatalogIndex> {
  const root = resolve(directory);
  const ref = options.ref ?? "main";
  if (options.repo && !/^[\w.-]+\/[\w.-]+$/.test(options.repo))
    throw new Error("Expected --repo owner/repo");
  const source = (path: string) => {
    const rel = relative(root, path).replaceAll("\\", "/");
    return options.repo
      ? `https://github.com/${options.repo}/blob/${ref}/${rel}`
      : `local:${rel}`;
  };
  const resources: Resource[] = [];
  const add = (input: unknown) => resources.push(ResourceSchema.parse(input));

  let parked = new Set<string>();
  const registry = join(root, "third-party", "registry.json");
  if (await exists(registry)) {
    const data = z
      .object({
        mine: z.object({ parked: z.record(z.string(), z.unknown()) }).partial(),
      })
      .partial()
      .safeParse(await readJson(registry));
    if (data.success)
      parked = new Set(Object.keys(data.data.mine?.parked ?? {}));
  }
  for (const path of await find(join(root, "skills"), "SKILL.md")) {
    const dir = resolve(path, "..");
    const content = await readFile(path, "utf8");
    const m = meta(content);
    const name = typeof m.name === "string" ? m.name : basename(dir);
    const category = relative(join(root, "skills"), dir).split(/[\\/]/)[0]!;
    add({
      id: id("skill", name),
      type: "skill",
      name,
      description: typeof m.description === "string" ? m.description : "",
      source: source(path),
      scope: "project",
      harnesses: ["claude-code"],
      content,
      config: {
        ...m,
        files: await skillAssets(dir),
        ...(options.repo
          ? { repository: `https://github.com/${options.repo}` }
          : {}),
      },
      tags: [
        ...(category !== name ? [category] : []),
        ...(parked.has(name) ? ["parked"] : []),
      ],
    });
  }
  for (const [folder, type] of [
    ["agents", "subagent"],
    ["commands", "command"],
  ] as const)
    for (const file of await list(join(root, "claude", folder), ".md")) {
      const path = join(root, "claude", folder, file);
      const content = await readFile(path, "utf8");
      const m = meta(content);
      const name =
        typeof m.name === "string" ? m.name : file.replace(/\.md$/, "");
      add({
        id: id(type, name),
        type,
        name,
        description: typeof m.description === "string" ? m.description : "",
        source: source(path),
        scope: "project",
        harnesses: ["claude-code"],
        content,
        config: m,
      });
    }
  const prompts: string[] = [
    ...(await list(join(root, "prompts"), ".md")).map((f) =>
      join(root, "prompts", f),
    ),
  ];
  for (const instincts of await findDirs(root, "instincts"))
    for (const f of await list(instincts, ".md"))
      prompts.push(join(instincts, f));
  for (const path of prompts) {
    const content = await readFile(path, "utf8");
    const m = meta(content);
    const name = typeof m.name === "string" ? m.name : basename(path, ".md");
    add({
      id: id("prompt", name),
      type: "prompt",
      name,
      description: typeof m.description === "string" ? m.description : "",
      source: source(path),
      scope: "project",
      harnesses: ["claude-code"],
      content,
      config: m,
      tags: [path.includes("/instincts/") ? "instinct" : "prompt"],
    });
  }
  const settingsPath = [
    join(root, "claude", "settings.base.json"),
    join(root, "claude", "settings.json"),
  ];
  for (const path of settingsPath) {
    if (!(await exists(path))) continue;
    const settings = z
      .object({
        hooks: z
          .record(
            z.string(),
            z.array(
              z.object({
                matcher: z.string().optional(),
                hooks: z.array(z.object({ command: z.string() }).passthrough()),
              }),
            ),
          )
          .optional(),
        statusLine: z
          .object({ command: z.string(), padding: z.number().optional() })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .parse(await readJson(path));
    for (const [event, groups] of Object.entries(settings.hooks ?? {}))
      for (const group of groups)
        for (const hook of group.hooks) {
          const file = hook.command.split("/").at(-1)!;
          const script = join(root, "claude", "hooks", file);
          if (!(await exists(script))) continue;
          const name = file.replace(/\.sh$/, "");
          add({
            id: id("hook", name),
            type: "hook",
            name,
            description: `${event} hook${group.matcher ? ` for ${group.matcher}` : ""}`,
            source: source(script),
            scope: "project",
            harnesses: ["claude-code"],
            content: await readFile(script, "utf8"),
            config: { event, matcher: group.matcher ?? "", script: true },
          });
        }
    if (settings.statusLine) {
      const file = settings.statusLine.command.split("/").at(-1)!;
      const script = join(root, "claude", "statusline", file);
      if (await exists(script))
        add({
          id: id("statusline", file.replace(/^statusline-|\.sh$/g, "")),
          type: "statusline",
          name: file.replace(/^statusline-|\.sh$/g, ""),
          description:
            "Claude Code status line; Preflight writes the script it points at",
          source: source(script),
          scope: "global",
          harnesses: ["claude-code"],
          content: await readFile(script, "utf8"),
          config: { script: true, padding: settings.statusLine.padding ?? 0 },
        });
    }
    break;
  }
  const mcpPath = join(root, "claude", "mcp.json");
  if (await exists(mcpPath)) {
    const mcp = z
      .object({
        mcpServers: z.record(z.string(), z.record(z.string(), z.unknown())),
      })
      .passthrough()
      .parse(await readJson(mcpPath));
    for (const [name, config] of Object.entries(mcp.mcpServers))
      add({
        id: id("mcp", name),
        type: "mcp",
        name,
        description: `${name} MCP configuration template; supply required environment variables`,
        source: source(mcpPath),
        scope: "project",
        harnesses: ["claude-code", "cursor"],
        config,
      });
  }
  const instruction = join(root, "claude", "CLAUDE.md");
  if (await exists(instruction)) {
    const content = await readFile(instruction, "utf8");
    if (content.trim())
      add({
        id: "instructions:claude-global",
        type: "instructions",
        name: "claude-global",
        description:
          "Global instructions for every Claude Code session (~/.claude/CLAUDE.md)",
        source: source(instruction),
        scope: "global",
        harnesses: ["claude-code"],
        content,
      });
  }
  const marketplacePath = join(root, ".claude-plugin", "marketplace.json");
  if (await exists(marketplacePath)) {
    const marketplace = z
      .object({
        name: z.string(),
        plugins: z.array(
          z
            .object({
              name: z.string(),
              source: z.union([z.string(), z.record(z.string(), z.unknown())]),
              description: z.string().optional(),
              category: z.string().optional(),
              tags: z.array(z.string()).optional(),
            })
            .passthrough(),
        ),
      })
      .passthrough()
      .parse(await readJson(marketplacePath));
    for (const plugin of marketplace.plugins) {
      const dir =
        typeof plugin.source === "string" ? resolve(root, plugin.source) : root;
      let version: string | undefined;
      try {
        const manifest = z
          .object({ version: z.string().optional() })
          .passthrough()
          .parse(await readJson(join(dir, ".claude-plugin", "plugin.json")));
        version = manifest.version;
      } catch {
        /* A plugin without a readable manifest still lists. */
      }
      add({
        id: id("plugin", plugin.name),
        type: "plugin",
        name: `${plugin.name}@${marketplace.name}`,
        description: plugin.description ?? "",
        source:
          typeof plugin.source === "string"
            ? source(dir)
            : source(marketplacePath),
        scope: "global",
        harnesses: ["claude-code"],
        config: {
          marketplace: {
            name: marketplace.name,
            source: options.repo
              ? { source: "github", repo: options.repo }
              : { source: "directory", path: root },
          },
          ...(version ? { version } : {}),
          ...(plugin.category ? { category: plugin.category } : {}),
        },
        tags: [...new Set([marketplace.name, ...(plugin.tags ?? [])])],
      });
    }
  }
  const loadoutsPath = join(root, "loadouts", "loadouts.json");
  const loadouts = (await exists(loadoutsPath))
    ? CatalogIndexSchema.shape.loadouts.parse(await readJson(loadoutsPath))
    : undefined;
  const seen = new Set<string>();
  for (const r of resources) {
    if (seen.has(r.id)) throw new Error(`Duplicate catalogue id: ${r.id}`);
    seen.add(r.id);
  }
  return {
    schema: CATALOG_SCHEMA,
    name:
      options.name ??
      (options.repo ? options.repo.split("/")[1]! : basename(root)),
    ...(options.repo
      ? { repository: `https://github.com/${options.repo}`, ref }
      : {}),
    resources,
    ...(loadouts ? { loadouts } : {}),
  };
}

async function findDirs(root: string, name: string, depth = 5) {
  const found: string[] = [];
  async function walk(dir: string, level: number) {
    if (level > depth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith(".") ||
        entry.name === "node_modules"
      )
        continue;
      if (
        ["plugins", "skills", "scaffolds"].includes(entry.name) &&
        level === 0
      )
        continue;
      const path = join(dir, entry.name);
      if (entry.name === name) found.push(path);
      else await walk(path, level + 1);
    }
  }
  await walk(root, 0);
  return found;
}
