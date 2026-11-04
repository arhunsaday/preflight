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
  globalOnly?: boolean;
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
  /** Where this harness keeps a resource; throws for a type it cannot hold. */
  target(resource: Resource): { path: string; key?: string; section?: string };
  read(): Promise<HarnessState>;
  plan(desired: Resource[], previous: Resource[]): Promise<FileChange[]>;
  write(plan: { files: FileChange[]; dryRun?: boolean }): Promise<unknown>;
}
export const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const slug = (id: string) =>
  id.replace(/[^a-z0-9_-]/gi, "-") + "-" + digest(id).slice(0, 8);
/** A path inside a harness directory: relative, no traversal, no drive. */
export function safeRelative(path: unknown): path is string {
  return (
    typeof path === "string" &&
    !!path &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.includes(":") &&
    !path
      .split("/")
      .some((part) => part === ".." || part === "." || part === "")
  );
}

/** The harness that owns an adopted resource's existing file, if any. */
function adoptedIn(resource: Resource, id: HarnessId) {
  return resource.config.adoptedBy === id &&
    safeRelative(resource.config.adoptedPath)
    ? resource.config.adoptedPath
    : undefined;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected configuration object");
  return value as Record<string, unknown>;
}
export function frontmatter(content: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  return match ? object(yaml(match[1]!)) : {};
}
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const blockPattern = (id?: string) => {
  const name = id ? escapeRegExp(id) : "[^ ]+";
  return new RegExp(
    `\\n?<!-- preflight:begin (${name}) -->\\n[\\s\\S]*?\\n<!-- preflight:end \\1 -->\\n?`,
    "g",
  );
};
/**
 * Instructions are written as a marked block, so the text a person wrote
 * around it is kept. Returns null when nothing but whitespace would remain.
 */
export function setInstructionBlock(
  text: string | null,
  id: string,
  content: string | null,
): string | null {
  const current = text ?? "";
  const block =
    content === null
      ? ""
      : `<!-- preflight:begin ${id} -->\n${content.replace(/\n+$/, "")}\n<!-- preflight:end ${id} -->\n`;
  const pattern = blockPattern(id);
  let next: string;
  if (pattern.test(current)) {
    pattern.lastIndex = 0;
    next = current.replace(pattern, (match) =>
      block ? (match.startsWith("\n") ? "\n" : "") + block : "\n",
    );
  } else if (!block) next = current;
  else next = current.trim() ? current.replace(/\n*$/, "\n\n") + block : block;
  next = next.replace(/\n{3,}/g, "\n\n");
  if (content === null) next = next.replace(/\n+$/, "\n");
  return next.trim() ? next.replace(/^\n+/, "") : null;
}
/** The Preflight blocks of an instruction file, in order. */
export function instructionBlocks(text: string | null) {
  return [...(text ?? "").matchAll(blockPattern())].map((match) => ({
    id: match[1]!,
    content: match[0]
      .replace(/^\n?<!-- preflight:begin [^ ]+ -->\n/, "")
      .replace(/\n<!-- preflight:end [^ ]+ -->\n?$/, ""),
  }));
}
function instructionResources(
  harness: HarnessId,
  scope: Scope,
  path: string,
  text: string | null,
) {
  return instructionBlocks(text).map((block) =>
    ResourceSchema.parse({
      id: `instruction:${harness}:${scope}:${slug(block.id)}`,
      type: "instruction",
      name: block.id.replace(/^instruction:/, ""),
      source: `file://${path}`,
      scope,
      harnesses: [harness],
      content: block.content,
      config: { block: block.id },
    }),
  );
}
/** The text of a file outside every Preflight block. */
export function unmanagedText(text: string | null) {
  return (text ?? "").replace(blockPattern(), "\n").replace(/\s+/g, " ").trim();
}
const hasBlocks = (text: string) => /<!-- preflight:begin [^ ]+ -->/.test(text);
/**
 * Lock digest of a managed file. For a file holding instruction blocks only the
 * blocks count, so a person editing their own text around them is not drift.
 */
export function lockDigest(text: string) {
  if (!hasBlocks(text)) return digest(text);
  return digest(
    (text.match(blockPattern()) ?? []).map((b) => b.trim()).join("\n"),
  );
}
/** True when a change to an existing file only touched Preflight blocks. */
export function onlyBlocksChanged(before: string, after: string | null) {
  return (
    (hasBlocks(before) || hasBlocks(after ?? "")) &&
    unmanagedText(before) === unmanagedText(after)
  );
}
/** extraKnownMarketplaces entry for a plugin resource, if it names one. */
export function pluginMarketplace(resource: Resource) {
  const parsed = z
    .object({
      name: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/i),
      source: z.union([
        z
          .object({
            source: z.literal("github"),
            repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
            ref: z.string().optional(),
          })
          .strict(),
        z
          .object({ source: z.literal("directory"), path: z.string().min(1) })
          .strict(),
        z
          .object({
            source: z.literal("git"),
            url: z.string().url(),
            ref: z.string().optional(),
          })
          .strict(),
      ]),
    })
    .strict()
    .safeParse(resource.config.marketplace);
  if (!parsed.success) return undefined;
  if (resource.name.split("@")[1] !== parsed.data.name)
    throw new Error(
      "Invalid resource: plugin marketplace name differs from name@marketplace",
    );
  return parsed.data;
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
            "instruction",
          ]
        : ["skill", "mcp", "command", "instruction"];
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
    if (!this.capabilities.includes(resource.type))
      throw new Error(`${this.id} does not support ${resource.type}`);
    const base = this.base(resource.scope);
    const name = slug(resource.id);
    // An adopted resource keeps the file it was found in; Preflight manages it where
    // it already lives rather than moving the user's layout.
    const adopted = adoptedIn(resource, this.id);
    switch (resource.type) {
      case "skill":
        return {
          path: adopted
            ? join(base, adopted)
            : join(base, "skills", name, "SKILL.md"),
        };
      case "subagent":
        return {
          path: adopted
            ? join(base, adopted)
            : join(base, "agents", `${name}.md`),
        };
      case "command":
        return {
          path: adopted
            ? join(base, adopted)
            : join(base, "commands", `${name}.md`),
        };
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
      case "instruction":
        if (this.id === "cursor") {
          if (resource.scope === "global")
            throw new Error(
              "Invalid resource: Cursor keeps user rules in its settings, not a file; use project scope",
            );
          return { path: join(base, "rules", `${name}.mdc`) };
        }
        return {
          path:
            resource.scope === "global"
              ? join(base, "CLAUDE.md")
              : join(this.context.root, "CLAUDE.md"),
          section: "block",
          key: resource.id,
        };
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
      if (
        resource.type !== "hook" &&
        target.section !== "block" &&
        targets.has(key)
      )
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
    // A hook or status line can carry its own script; Preflight writes it next to
    // the settings that point at it, and removes it again on rollback.
    const materialize = async (resource: Resource, removing: boolean) => {
      if (!removing && !resource.content)
        throw new Error(
          `Invalid resource: ${resource.type} script has no content`,
        );
      const path = join(
        this.base(resource.scope),
        resource.type === "hook" ? "hooks" : "statusline",
        slug(resource.id) + ".sh",
      );
      const script = await obtain(path);
      script.after = removing ? null : resource.content!;
      return `bash '${path.replaceAll("'", "'\"'\"'")}'`;
    };
    for (const resource of [...old, ...wanted]) {
      const removing = !wanted.includes(resource);
      const target = this.target(resource);
      const file = await obtain(target.path);
      if (resource.type === "instruction") {
        if (!removing && !resource.content?.trim())
          throw new Error(
            `Invalid resource: instruction ${resource.id} has no content`,
          );
        file.after =
          target.section === "block"
            ? setInstructionBlock(
                file.after,
                resource.id,
                removing ? null : resource.content!,
              )
            : removing
              ? null
              : `---\ndescription: ${JSON.stringify(resource.description || resource.name)}\nalwaysApply: true\n---\n${resource.content!.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")}`;
        continue;
      }
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
        if (resource.config.script === true)
          entry = {
            matcher: String(resource.config.matcher ?? ""),
            hooks: [
              {
                type: "command",
                command: await materialize(resource, removing),
              },
            ],
          };
        const entries = (current as unknown[] | undefined) ?? [];
        const same = (e: unknown) =>
          JSON.stringify(e) === JSON.stringify(entry);
        block[target.key] = removing
          ? entries.filter((e) => !same(e))
          : entries.some(same)
            ? entries
            : [...entries, entry];
        if ((block[target.key] as unknown[]).length === 0)
          delete block[target.key];
      } else if (removing) {
        delete block[target.key];
        const marketplace =
          resource.type === "plugin" ? pluginMarketplace(resource) : undefined;
        if (marketplace && doc.extraKnownMarketplaces) {
          const known = object(doc.extraKnownMarketplaces);
          const stillUsed = wanted.some(
            (r) =>
              r.type === "plugin" &&
              r.scope === resource.scope &&
              pluginMarketplace(r)?.name === marketplace.name,
          );
          if (
            !stillUsed &&
            JSON.stringify(known[marketplace.name]) ===
              JSON.stringify({ source: marketplace.source })
          )
            delete known[marketplace.name];
          if (Object.keys(known).length) doc.extraKnownMarketplaces = known;
          else delete doc.extraKnownMarketplaces;
        }
        if (resource.type === "statusline" && resource.config.script === true)
          await materialize(resource, true);
      } else {
        const value =
          resource.type === "plugin" ? resource.enabled : resource.config;
        if (
          Object.hasOwn(block, target.key) &&
          !(
            resource.config.adoptedBy === this.id &&
            JSON.stringify(block[target.key]) === JSON.stringify(value)
          )
        )
          throw new Error(`Refusing unmanaged entry: ${target.key}`);
        if (resource.type === "plugin") {
          block[target.key] = resource.enabled;
          const marketplace = pluginMarketplace(resource);
          if (marketplace) {
            const known = object(doc.extraKnownMarketplaces ?? {});
            const entry = { source: marketplace.source };
            // A person's own declaration of the same marketplace is kept.
            if (!Object.hasOwn(known, marketplace.name))
              known[marketplace.name] = entry;
            doc.extraKnownMarketplaces = known;
          }
        } else if (
          resource.type === "statusline" &&
          resource.config.script === true
        ) {
          const rest = { ...resource.config };
          delete rest.script;
          block[target.key] = {
            ...rest,
            type: "command",
            command: await materialize(resource, removing),
          };
        } else block[target.key] = resource.config;
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
        const path =
          scope === "global"
            ? join(base, "CLAUDE.md")
            : join(this.context.root, "CLAUDE.md");
        resources.push(
          ...instructionResources(this.id, scope, path, await readText(path)),
        );
      } else if (scope === "project") {
        let rules: string[] = [];
        try {
          rules = await readdir(join(base, "rules"));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
        for (const name of rules.filter((n) => n.endsWith(".mdc"))) {
          const path = join(base, "rules", name);
          const content = await readText(path);
          if (content === null) continue;
          const meta = frontmatter(content);
          resources.push(
            ResourceSchema.parse({
              id: `instruction:${this.id}:${scope}:${name.replace(/[^a-z0-9._-]/gi, "-")}`,
              type: "instruction",
              name: name.replace(/\.mdc$/, ""),
              description:
                typeof meta.description === "string" ? meta.description : "",
              source: `file://${path}`,
              scope,
              harnesses: [this.id],
              content,
              config: meta,
            }),
          );
        }
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
/**
 * Codex reads AGENTS.md: ~/.codex/AGENTS.md for every session and AGENTS.md
 * at the project root. Preflight manages instructions there, nothing else yet.
 */
class CodexAdapter implements HarnessAdapter {
  readonly id = "codex" as const;
  capabilities: ResourceType[] = ["instruction"];
  constructor(readonly context: Context) {}
  paths() {
    return {
      global: join(this.context.home, ".codex"),
      project: this.context.root,
    };
  }
  async detect() {
    for (const path of [
      this.paths().global,
      join(this.context.root, "AGENTS.md"),
    ])
      try {
        await lstat(path);
        return true;
      } catch {
        /* Not there. */
      }
    return false;
  }
  target(resource: Resource) {
    if (resource.type !== "instruction")
      throw new Error(`codex does not support ${resource.type}`);
    return {
      path: join(this.paths()[resource.scope], "AGENTS.md"),
      section: "block",
      key: resource.id,
    };
  }
  async read(): Promise<HarnessState> {
    const resources: Resource[] = [];
    for (const scope of ["global", "project"] as const) {
      const path = join(this.paths()[scope], "AGENTS.md");
      resources.push(
        ...instructionResources(this.id, scope, path, await readText(path)),
      );
    }
    return { resources, issues: [] };
  }
  async plan(desired: Resource[], previous: Resource[]) {
    const files = new Map<string, FileChange>();
    const relevant = (r: Resource) =>
      r.harnesses.includes(this.id) && r.enabled && r.type === "instruction";
    const wanted = desired.filter(relevant);
    for (const resource of [...previous.filter(relevant), ...wanted]) {
      const removing = !wanted.includes(resource);
      if (!removing && !resource.content?.trim())
        throw new Error(
          `Invalid resource: instruction ${resource.id} has no content`,
        );
      const { path } = this.target(resource);
      let file = files.get(path);
      if (!file) {
        const before = await readText(path);
        file = { path, before, after: before };
        files.set(path, file);
      }
      file.after = setInstructionBlock(
        file.after,
        resource.id,
        removing ? null : resource.content!,
      );
    }
    return [...files.values()];
  }
  async write(plan: { files: FileChange[]; dryRun?: boolean }) {
    return applyFiles(this.context.root, plan.files, {
      actor: process.env.USER ?? "local",
      dryRun: plan.dryRun ?? false,
    });
  }
}
export const createAdapters = (context: Context): HarnessAdapter[] => [
  new FileAdapter("claude-code", context),
  new FileAdapter("cursor", context),
  new CodexAdapter(context),
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
