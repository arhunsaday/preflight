import { readdir, lstat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { z } from "zod";
import { createHash } from "node:crypto";
import { parse as yaml } from "yaml";
import {
  ResourceSchema,
  type Resource,
  type HarnessId,
  type ResourceType,
  type Scope,
} from "./schema.js";
import {
  readText,
  jsonText,
  applyFiles,
  type FileChange,
} from "./transaction.js";
export interface Context {
  root: string;
  home: string;
}
export interface HarnessPaths {
  global: string;
  project: string;
}
export interface HarnessState {
  resources: Resource[];
  issues: string[];
}
export interface HarnessAdapter {
  id: HarnessId;
  capabilities: ResourceType[];
  detect(): Promise<boolean>;
  paths(): HarnessPaths;
  read(): Promise<HarnessState>;
  plan(desired: Resource[], previous: Resource[]): Promise<FileChange[]>;
  write(plan: { files: FileChange[]; dryRun?: boolean }): Promise<unknown>;
}
export const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const slug = (id: string) =>
  id.replace(/[^a-z0-9_-]/gi, "-") + "-" + digest(id).slice(0, 8);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected configuration object");
  return value as Record<string, unknown>;
}
export function frontmatter(content: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  return match ? object(yaml(match[1]!)) : {};
}
async function emptyDirectoryTree(path: string): Promise<boolean> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      !(await emptyDirectoryTree(join(path, entry.name)))
    )
      return false;
  }
  return true;
}
class FileAdapter implements HarnessAdapter {
  capabilities: ResourceType[];
  constructor(
    readonly id: HarnessId,
    readonly context: Context,
  ) {
    this.capabilities =
      id === "claude-code"
        ? [
            "skill",
            "mcp",
            "subagent",
            "hook",
            "command",
            "statusline",
            "plugin",
          ]
        : ["skill", "mcp", "command"];
  }
  paths() {
    return {
      global: join(
        this.context.home,
        this.id === "claude-code" ? ".claude" : ".cursor",
      ),
      project: join(
        this.context.root,
        this.id === "claude-code" ? ".claude" : ".cursor",
      ),
    };
  }
  async detect() {
    return (
      await Promise.all(
        Object.values(this.paths()).map(async (p) => {
          try {
            await lstat(p);
            return true;
          } catch {
            return false;
          }
        }),
      )
    ).some(Boolean);
  }
  base(scope: Scope) {
    return this.paths()[scope];
  }
  target(resource: Resource): { path: string; key?: string; section?: string } {
    const base = this.base(resource.scope);
    const name = slug(resource.id);
    switch (resource.type) {
      case "skill":
        return { path: join(base, "skills", name, "SKILL.md") };
      case "subagent":
        return { path: join(base, "agents", `${name}.md`) };
      case "command":
        return { path: join(base, "commands", `${name}.md`) };
      case "mcp":
        return {
          path:
            this.id === "cursor"
              ? join(base, "mcp.json")
              : resource.scope === "global"
                ? join(this.context.home, ".claude.json")
                : join(this.context.root, ".mcp.json"),
          section: "mcpServers",
          key: resource.name,
        };
      case "hook":
        return {
          path: join(base, "settings.json"),
          section: "hooks",
          key: String(resource.config.event ?? "PreToolUse"),
        };
      case "plugin":
        if (!/^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9._-]*$/i.test(resource.name))
          throw new Error(
            "Invalid resource: plugin name must be name@marketplace",
          );
        return {
          path: join(base, "settings.json"),
          section: "enabledPlugins",
          key: resource.name,
        };
      case "statusline":
        return { path: join(base, "settings.json"), key: "statusLine" };
      default:
        throw new Error(`${this.id} does not support ${resource.type}`);
    }
  }
  async plan(desired: Resource[], previous: Resource[]) {
    const files = new Map<string, FileChange>();
    const relevant = (r: Resource) =>
      r.harnesses.includes(this.id) &&
      (r.enabled || r.type === "plugin") &&
      this.capabilities.includes(r.type);
    const wanted = desired.filter(relevant),
      old = previous.filter(relevant);
    const targets = new Set<string>();
    for (const resource of wanted) {
      if (resource.type === "mcp" && resource.config.unsupportedReason)
        throw new Error(
          `Invalid resource: ${String(resource.config.unsupportedReason)}`,
        );
      const target = this.target(resource);
      const key = target.path + "#" + (target.key ?? "");
      if (resource.type !== "hook" && targets.has(key))
        throw new Error(`Target collision: ${key}`);
      targets.add(key);
    }
    const obtain = async (path: string) => {
      let file = files.get(path);
      if (!file) {
        const before = await readText(path);
        file = { path, before, after: before };
        files.set(path, file);
      }
      return file;
    };
    for (const resource of [...old, ...wanted]) {
      const removing = !wanted.includes(resource);
      const target = this.target(resource);
      const file = await obtain(target.path);
      if (!target.key) {
        if (!removing && resource.type === "skill" && !resource.content?.trim())
          throw new Error(
            `Invalid resource: inspect and materialize skill content before applying ${resource.id}`,
          );
        file.after = removing
          ? null
          : (resource.content ?? jsonText(resource.config));
        if (resource.type === "skill")
          for (const asset of z
            .array(z.object({ path: z.string(), contents: z.string() }))
            .parse(resource.config.files ?? [])) {
            if (asset.path === "SKILL.md") continue;
            if (
              !asset.path ||
              asset.path.startsWith("/") ||
              asset.path.includes("\\") ||
              asset.path
                .split("/")
                .some((part) => part === ".." || part === "." || !part) ||
              asset.path.includes(":")
            )
              throw new Error("Invalid resource asset path");
            const extra = await obtain(join(dirname(target.path), asset.path));
            extra.after = removing ? null : asset.contents;
          }
        continue;
      }
      const doc = object(JSON.parse(file.after ?? "{}"));
      const block = target.section ? object(doc[target.section] ?? {}) : doc;
      if (resource.type === "hook") {
        const current = block[target.key];
        if (current !== undefined && !Array.isArray(current))
          throw new Error("Malformed hooks");
        let entry = resource.config.entry ?? {
          matcher: String(resource.config.matcher ?? ""),
          hooks: resource.config.hooks ?? [],
        };
        if (resource.config.script === true) {
          if (!removing && !resource.content)
            throw new Error("Invalid resource: hook script has no content");
          const scriptPath = join(
            this.base(resource.scope),
            "hooks",
            slug(resource.id) + ".sh",
          );
          const script = await obtain(scriptPath);
          script.after = removing ? null : resource.content!;
          const quoted = "'" + scriptPath.replaceAll("'", "'\"'\"'") + "'";
          entry = {
            matcher: String(resource.config.matcher ?? ""),
            hooks: [{ type: "command", command: `bash ${quoted}` }],
          };
        }
        const entries = (current as unknown[] | undefined) ?? [];
        block[target.key] = removing
          ? entries.filter((e) => JSON.stringify(e) !== JSON.stringify(entry))
          : [...entries, entry];
        if ((block[target.key] as unknown[]).length === 0)
          delete block[target.key];
      } else if (removing) delete block[target.key];
      else {
        if (Object.hasOwn(block, target.key))
          throw new Error(`Refusing unmanaged entry: ${target.key}`);
        block[target.key] =
          resource.type === "plugin" ? resource.enabled : resource.config;
      }
      if (target.section) doc[target.section] = block;
      file.after = jsonText(doc);
    }
    return [...files.values()];
  }
  async write(plan: { files: FileChange[]; dryRun?: boolean }) {
    return applyFiles(this.context.root, plan.files, {
      actor: process.env.USER ?? "local",
      dryRun: plan.dryRun ?? false,
    });
  }
  async read(): Promise<HarnessState> {
    const resources: Resource[] = [];
    const issues: string[] = [];
    for (const scope of ["global", "project"] as const) {
      const base = this.base(scope);
      for (const [folder, type] of [
        ["skills", "skill"],
        ["commands", "command"],
        ...(this.id === "claude-code" ? [["agents", "subagent"]] : []),
      ] as [string, ResourceType][]) {
        let names: string[] = [];
        try {
          names = await readdir(join(base, folder));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
        for (const name of names) {
          const path = join(
            base,
            folder,
            name,
            ...(type === "skill" ? ["SKILL.md"] : []),
          );
          if (type !== "skill" && !name.endsWith(".md")) continue;
          try {
            const content = await readText(path);
            if (content === null) {
              if (type === "skill" && (await emptyDirectoryTree(dirname(path))))
                continue;
              issues.push(`Broken or missing resource: ${path}`);
              continue;
            }
            const meta = frontmatter(content);
            resources.push(
              ResourceSchema.parse({
                id: `${type}:${this.id}:${scope}:${name.replace(/[^a-z0-9._-]/gi, "-")}`,
                type,
                name:
                  typeof meta.name === "string"
                    ? meta.name
                    : name.replace(/\.md$/, ""),
                description:
                  typeof meta.description === "string" ? meta.description : "",
                source: `file://${path}`,
                scope,
                harnesses: [this.id],
                content,
                config: meta,
              }),
            );
          } catch (e) {
            issues.push(`${path}: ${String(e)}`);
          }
        }
      }
      const fake = ResourceSchema.parse({
        id: "mcp:probe",
        type: "mcp",
        name: "probe",
        source: "local",
        scope,
        harnesses: [this.id],
      });
      const mcpPath = this.target(fake).path;
      const raw = await readText(mcpPath);
      if (raw) {
        const doc = object(JSON.parse(raw));
        const servers = object(doc.mcpServers ?? {});
        for (const [name, config] of Object.entries(servers))
          resources.push(
            ResourceSchema.parse({
              id: `mcp:${this.id}:${scope}:${slug(name)}`,
              type: "mcp",
              name,
              source: `file://${mcpPath}`,
              scope,
              harnesses: [this.id],
              config: object(config),
            }),
          );
      }
      if (this.id === "claude-code") {
        const path = join(base, "settings.json");
        const settings = await readText(path);
        if (settings) {
          const doc = object(JSON.parse(settings));
          for (const [event, entries] of Object.entries(
            object(doc.hooks ?? {}),
          )) {
            if (!Array.isArray(entries)) throw new Error("Malformed hooks");
            entries.forEach((entry, i) =>
              resources.push(
                ResourceSchema.parse({
                  id: `hook:${scope}:${event}:${i}`,
                  type: "hook",
                  name: `${event} ${i + 1}`,
                  source: `file://${path}`,
                  scope,
                  harnesses: [this.id],
                  config: { event, entry },
                }),
              ),
            );
          }
          for (const [name, enabled] of Object.entries(
            object(doc.enabledPlugins ?? {}),
          )) {
            if (typeof enabled !== "boolean")
              throw new Error("Malformed enabledPlugins");
            resources.push(
              ResourceSchema.parse({
                id: `plugin:${this.id}:${scope}:${slug(name)}`,
                type: "plugin",
                name,
                enabled,
                scope,
                source: `file://${path}`,
                harnesses: [this.id],
              }),
            );
          }
          if (doc.statusLine)
            resources.push(
              ResourceSchema.parse({
                id: `statusline:${scope}`,
                type: "statusline",
                name: "Status line",
                source: `file://${path}`,
                scope,
                harnesses: [this.id],
                config: object(doc.statusLine),
              }),
            );
        }
      }
    }
    return { resources, issues };
  }
}
export const createAdapters = (context: Context): HarnessAdapter[] => [
  new FileAdapter("claude-code", context),
  new FileAdapter("cursor", context),
];
export async function detectAll(adapters: HarnessAdapter[]) {
  return Promise.all(
    adapters.map(async (adapter) => {
      try {
        return {
          id: adapter.id,
          detected: await adapter.detect(),
          capabilities: adapter.capabilities,
          ...(await adapter.read()),
        };
      } catch (e) {
        return {
          id: adapter.id,
          detected: false,
          capabilities: adapter.capabilities,
          resources: [],
          issues: [],
          error: `unsupported today: ${String(e)}`,
        };
      }
    }),
  );
}
