/**
 * `preflight install owner/repo`: install skills, subagents, commands, MCP
 * servers, hooks, plugins and instructions from any GitHub repository (or a
 * local folder), with no catalog/index.json in it.
 *
 * The discovery rules follow Bridle's `install` discovery (MIT, d0,
 * https://github.com/neiii/bridle, crates/bridle/src/install/discovery.rs):
 * every SKILL.md, every `.md` in an `agents/` or `commands/` folder, and every
 * `.mcp.json`. Preflight adds the agent-kit layout that `buildCatalog` reads.
 *
 * Nothing is written to an agent until `--apply`: the resources go through
 * PreflightService.import, the same preview-then-apply transaction as every
 * other change, and each one records its origin (repository, commit, path).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { buildCatalog } from "./catalog-build.js";
import { skillAssets } from "./catalog.js";
import { createAdapters, frontmatter, safeRelative } from "./adapters.js";
import { toCodexServer } from "./adapters/codex.js";
import { fetchCommit, resolveCommit } from "./sources.js";
import {
  HarnessIdSchema,
  ResourceSchema,
  ScopeSchema,
  secretPaths,
  type HarnessId,
  type Origin,
  type Resource,
  type ResourceType,
  type Scope,
} from "./schema.js";
import type { PreflightService } from "./service.js";

export interface RepoSpec {
  kind: "github" | "local";
  repo?: string;
  ref?: string;
  /** Local kind: the folder to read. */
  path?: string;
  /** A folder inside the repository to scan instead of its root. */
  subdir?: string;
}

const githubUrl =
  /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([\w.-]+)(?:\/(.+?))?)?\/?$/;
const githubShort =
  /^(?:github:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:@([\w.-]+))?(?:\/(.+?))?\/?$/;
const localPath = /^(?:\.{1,2}(?:\/|$)|\/|~\/|file:\/\/)/;

/**
 * True for an argument that names a repository rather than a resource id.
 * Resource ids always hold a colon before any slash ("skill:name").
 */
export function isRepositorySpec(value: string) {
  if (/^(?:github:|https?:\/\/(?:www\.)?github\.com\/)/.test(value))
    return true;
  if (localPath.test(value)) return true;
  const slash = value.indexOf("/");
  const colon = value.indexOf(":");
  return slash > 0 && (colon < 0 || colon > slash);
}

export function parseRepoSpec(spec: string, cwd: string): RepoSpec {
  if (localPath.test(spec)) {
    const raw = spec.startsWith("file://") ? spec.slice(7) : spec;
    const path = resolve(
      cwd,
      raw.startsWith("~/") ? join(process.env.HOME ?? "", raw.slice(2)) : raw,
    );
    return { kind: "local", path };
  }
  const match = githubUrl.exec(spec) ?? githubShort.exec(spec);
  if (!match)
    throw new Error(
      `Unrecognised repository "${spec}". Use owner/repo, owner/repo@ref, github:owner/repo@ref/folder, a GitHub URL or a local path such as ./repo`,
    );
  const [, owner, name, ref, subdir] = match;
  if (ref && (ref.includes("..") || ref.startsWith("-")))
    throw new Error("Invalid ref");
  if (subdir !== undefined && !safeRelative(subdir.replace(/\/+$/, "")))
    throw new Error(`Invalid folder in the repository: ${subdir}`);
  return {
    kind: "github",
    repo: `${owner}/${name}`,
    ...(ref ? { ref } : {}),
    ...(subdir ? { subdir: subdir.replace(/\/+$/, "") } : {}),
  };
}

export interface Found {
  resource: Resource;
  /** File or folder, relative to the scanned folder. */
  path: string;
  /** Why no agent can take it, for example a literal secret. */
  blocked?: string;
  /** The plugin (id) whose folder holds this component. */
  partOf?: string;
}

const skippedDirs = new Set([".git", "node_modules", "vendor", "dist", "build"]);
async function files(root: string) {
  const found: string[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > 8 || found.length > 20000) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (skippedDirs.has(entry.name) || entry.isSymbolicLink()) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path, depth + 1);
      else if (entry.isFile())
        found.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
  await walk(root, 0);
  return found;
}
const meta = (content: string) => {
  try {
    return frontmatter(content);
  } catch {
    return {};
  }
};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const idFor = (type: ResourceType, name: string) =>
  `${type}:${name.replace(/[^a-z0-9._-]/gi, "-").replace(/^-+/, "") || "x"}`;
const inside = (path: string, dir: string) =>
  dir === "" || path === dir || path.startsWith(dir + "/");
const ASSET_FILES = 200;
const ASSET_BYTES = 2_000_000;

/** A file that an MCP server would run from the repository folder. */
function repositoryFile(config: Record<string, unknown>) {
  const values = [
    config.command,
    ...(Array.isArray(config.args) ? config.args : []),
  ].filter((v): v is string => typeof v === "string");
  return values.find(
    (v) =>
      /^\.\.?\//.test(v) ||
      v.includes("${CLAUDE_PLUGIN_ROOT}") ||
      v.includes("${workspaceFolder}"),
  );
}

/**
 * Everything installable in a folder. The agent-kit layout comes from
 * buildCatalog; the generic rules add what other repositories use.
 */
export async function scanRepository(root: string) {
  const notes: string[] = [];
  const found: Found[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  const add = (entry: Found) => {
    if (ids.has(entry.resource.id)) {
      notes.push(
        `${entry.resource.id} at ${entry.path || "."} has the same name as an earlier one; the first is used`,
      );
      return;
    }
    ids.add(entry.resource.id);
    paths.add(entry.path);
    found.push(entry);
  };
  try {
    const index = await buildCatalog(root, { name: "install" });
    for (const input of index.resources) {
      const resource = ResourceSchema.parse(input);
      add({ resource, path: resource.source.replace(/^local:/, "") });
    }
  } catch (error) {
    notes.push(`Catalogue layout skipped: ${String(error)}`);
  }
  const plugins = found
    .filter(
      (f) =>
        f.resource.type === "plugin" &&
        !f.path.endsWith(".claude-plugin/marketplace.json"),
    )
    .map((f) => ({ id: f.resource.id, dir: f.path }));
  const partOf = (path: string) =>
    plugins.find((p) => inside(path, p.dir))?.id;
  const all = await files(root);
  const skillDirs = all
    .filter((f) => f === "SKILL.md" || f.endsWith("/SKILL.md"))
    .map((f) => (f === "SKILL.md" ? "" : f.slice(0, -"/SKILL.md".length)));
  for (const dir of skillDirs) {
    const path = dir ? `${dir}/SKILL.md` : "SKILL.md";
    if (paths.has(path)) continue;
    const content = await readFile(join(root, path), "utf8");
    const m = meta(content);
    const name = text(m.name) || basename(dir || root);
    let assets: { path: string; contents: string }[] = [];
    let blocked: string | undefined;
    try {
      assets = await skillAssets(join(root, dir));
      const bytes = assets.reduce((n, a) => n + a.contents.length, 0);
      if (assets.length > ASSET_FILES || bytes > ASSET_BYTES)
        blocked = `The skill folder holds ${assets.length} files (${Math.round(bytes / 1000)} kB); Preflight copies at most ${ASSET_FILES} files and ${ASSET_BYTES / 1_000_000} MB`;
    } catch (error) {
      blocked = `${String(error).replace(/^Error: /, "").replace(join(root, ""), "")}; Preflight copies text files only`;
    }
    const resource = ResourceSchema.safeParse({
      id: idFor("skill", name),
      type: "skill",
      name,
      description: text(m.description),
      source: `local:${path}`,
      scope: "project",
      harnesses: ["claude-code"],
      content,
      config: { ...m, files: blocked ? [] : assets },
    });
    if (!resource.success) {
      notes.push(`${path}: unreadable front matter`);
      continue;
    }
    const owner = partOf(path);
    add({
      resource: resource.data,
      path,
      ...(blocked ? { blocked } : {}),
      ...(owner ? { partOf: owner } : {}),
    });
  }
  const inSkill = (path: string) =>
    skillDirs.some((dir) => dir !== "" && inside(path, dir));
  for (const [folder, type] of [
    ["agents", "subagent"],
    ["commands", "command"],
  ] as const)
    for (const path of all) {
      if (
        paths.has(path) ||
        inSkill(path) ||
        !path.endsWith(".md") ||
        basename(dirname(path)) !== folder ||
        /^(?:readme|agents|claude)\.md$/i.test(basename(path))
      )
        continue;
      const content = await readFile(join(root, path), "utf8");
      const m = meta(content);
      const name =
        type === "subagent" && text(m.name)
          ? text(m.name)
          : basename(path, ".md");
      const resource = ResourceSchema.safeParse({
        id: idFor(type, name),
        type,
        name,
        description: text(m.description),
        source: `local:${path}`,
        scope: "project",
        harnesses: ["claude-code"],
        content,
        config: m,
      });
      if (!resource.success) {
        notes.push(`${path}: unreadable front matter`);
        continue;
      }
      const owner = partOf(path);
      add({ resource: resource.data, path, ...(owner ? { partOf: owner } : {}) });
    }
  for (const path of all) {
    if (
      paths.has(path) ||
      inSkill(path) ||
      !/^(?:\.mcp|mcp)\.json$/.test(basename(path))
    )
      continue;
    let servers: Record<string, unknown>;
    try {
      const doc = JSON.parse(await readFile(join(root, path), "utf8"));
      servers =
        doc && typeof doc.mcpServers === "object" ? doc.mcpServers : doc;
      if (!servers || typeof servers !== "object" || Array.isArray(servers))
        throw new Error("no server map");
    } catch (error) {
      notes.push(`${path}: not an MCP configuration (${String(error)})`);
      continue;
    }
    for (const [name, value] of Object.entries(servers)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const config = value as Record<string, unknown>;
      if (typeof config.command !== "string" && typeof config.url !== "string")
        continue;
      const resource = ResourceSchema.safeParse({
        id: idFor("mcp", name),
        type: "mcp",
        name,
        description: `MCP server from ${path}`,
        source: `local:${path}`,
        scope: "project",
        harnesses: ["claude-code"],
        config,
      });
      if (!resource.success) {
        notes.push(`${path}: ${name} is not a valid MCP entry`);
        continue;
      }
      const secrets = secretPaths(config);
      const file = repositoryFile(config);
      const owner = partOf(path);
      const blocked = secrets.length
        ? `The configuration holds a possible secret at ${secrets[0]}; Preflight does not copy literal secrets`
        : file && !owner
          ? `The server runs ${file} from the repository; Preflight copies the configuration, not the server's files`
          : undefined;
      add({
        resource: resource.data,
        path,
        ...(blocked ? { blocked } : {}),
        ...(owner ? { partOf: owner } : {}),
      });
    }
  }
  return { found, notes };
}

const harnessName: Record<HarnessId, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};
function unsupported(type: ResourceType, harness: HarnessId) {
  const name = harnessName[harness];
  switch (type) {
    case "plugin":
      return "Plugins are a Claude Code format; select the plugin's skills to install them in other agents";
    case "hook":
    case "statusline":
      return `${type === "hook" ? "Hooks live" : "The status line lives"} in Claude Code settings; other agents have no equivalent`;
    case "command":
      return harness === "codex"
        ? "Codex removed custom prompts, its command files, in version 0.117"
        : `${name} has no command files`;
    case "subagent":
      return `${name} has no subagent format that Preflight writes`;
    case "prompt":
      return "A prompt is catalogue text; no agent reads it from a file";
    default:
      return `${name} cannot hold a ${type}`;
  }
}

export interface InstallOptions {
  select?: string[];
  all?: boolean;
  harnesses?: HarnessId[];
  scope?: Scope;
  apply?: boolean;
}
export interface FoundSummary {
  id: string;
  type: ResourceType;
  name: string;
  description: string;
  path: string;
  /** Agents that can take it. */
  supports: HarnessId[];
  /** Why each other agent cannot. */
  reasons: Partial<Record<HarnessId, string>>;
  partOf?: string;
}

/**
 * Scan a repository, then preview (default) or apply the installation of
 * the selected resources into the selected agents.
 */
export async function installFromRepository(
  service: PreflightService,
  spec: string,
  options: InstallOptions = {},
) {
  const context = service.context;
  const parsed = parseRepoSpec(spec, context.root);
  let dir: string;
  let base: Omit<Origin, "path">;
  let label: string;
  if (parsed.kind === "github") {
    const commit = await resolveCommit(parsed.repo!, parsed.ref ?? "HEAD");
    dir = await fetchCommit(
      context.home,
      `_install/${parsed.repo!.toLowerCase()}`,
      parsed.repo!,
      commit,
    );
    base = {
      kind: "github",
      repo: parsed.repo!,
      ...(parsed.ref ? { ref: parsed.ref } : {}),
      commit,
    };
    label = `github:${parsed.repo}@${parsed.ref ?? commit.slice(0, 7)}`;
  } else {
    dir = parsed.path!;
    base = { kind: "local", root: dir };
    label = dir;
  }
  const scanned = parsed.subdir ? join(dir, parsed.subdir) : dir;
  if (!(await stat(scanned).catch(() => null))?.isDirectory())
    throw new Error(
      parsed.subdir
        ? `No folder ${parsed.subdir} in ${label}`
        : `No such directory: ${scanned}`,
    );
  const { found, notes } = await scanRepository(scanned);
  const prefix = parsed.subdir ? `${parsed.subdir}/` : "";
  const originOf = (entry: Found): Origin => ({
    ...base,
    path: (prefix + entry.path).replace(/\/$/, "") || ".",
  });
  const sourceOf = (entry: Found) =>
    base.kind === "github"
      ? `https://github.com/${base.repo}/blob/${base.commit}/${prefix}${entry.path}`
      : `file://${join(scanned, entry.path)}`;
  // A GitHub marketplace is read from the repository root by Claude Code.
  for (const entry of found)
    if (entry.resource.type === "plugin" && base.kind === "github") {
      if (parsed.subdir)
        entry.blocked =
          "Claude Code reads a GitHub marketplace from the repository root; install the repository without a folder";
      else
        entry.resource.config.marketplace = {
          ...(entry.resource.config.marketplace as Record<string, unknown>),
          source: {
            source: "github",
            repo: base.repo!,
            ...(base.ref ? { ref: base.ref } : {}),
          },
        };
    }

  const scope =
    options.scope ?? (context.globalOnly ? "global" : "project");
  ScopeSchema.parse(scope);
  if (context.globalOnly && scope === "project")
    throw new Error(
      "The global workspace only accepts global resources; open a project to install with project scope",
    );
  const adapters = createAdapters(context);
  const states = await service.detect();
  const detected = states.filter((s) => s.detected).map((s) => s.id);
  const targets = options.harnesses
    ? options.harnesses.map((h) => HarnessIdSchema.parse(h))
    : detected;
  const reason = (entry: Found, harness: HarnessId) => {
    if (entry.blocked) return entry.blocked;
    const adapter = adapters.find((a) => a.id === harness)!;
    const resource = { ...entry.resource, scope, harnesses: [harness] };
    if (!adapter.capabilities.includes(resource.type))
      return unsupported(resource.type, harness);
    try {
      adapter.target(resource);
      if (resource.type === "mcp" && harness === "codex")
        toCodexServer(resource.config);
    } catch (error) {
      return String(error).replace(/^Error: (?:Invalid resource: )?/, "");
    }
    return undefined;
  };
  const summaries: FoundSummary[] = found.map((entry) => {
    const reasons: Partial<Record<HarnessId, string>> = {};
    for (const harness of HarnessIdSchema.options) {
      const why = reason(entry, harness);
      if (why) reasons[harness] = why;
    }
    return {
      id: entry.resource.id,
      type: entry.resource.type,
      name: entry.resource.name,
      description: entry.resource.description,
      path: originOf(entry).path,
      supports: HarnessIdSchema.options.filter((h) => !reasons[h]),
      reasons,
      ...(entry.partOf ? { partOf: entry.partOf } : {}),
    };
  });

  if (options.apply && !options.all && !options.select?.length)
    throw new Error(
      "Choose what to install: --select <id,...> or --all. Run without --apply to see what the repository holds",
    );
  let selection = found;
  if (options.select?.length && !options.all) {
    selection = options.select.map((wanted) => {
      const entry =
        found.find((f) => f.resource.id === wanted) ??
        found.find(
          (f) => f.resource.name.toLowerCase() === wanted.toLowerCase(),
        );
      if (!entry)
        throw new Error(
          `Not in ${label}: ${wanted}. Found: ${found.map((f) => f.resource.id).join(", ") || "nothing"}`,
        );
      return entry;
    });
    selection = [...new Set(selection)];
  }
  const chosen = new Set(selection.map((f) => f.resource.id));

  let existing: Resource[] | undefined;
  try {
    existing = await service.list();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const sameOrigin = (a: Origin | undefined, b: Origin) =>
    !!a &&
    a.kind === b.kind &&
    (a.kind === "github" ? a.repo === b.repo : a.root === b.root);

  const install: Resource[] = [];
  const skipped: { id: string; harness?: HarnessId; reason: string }[] = [];
  for (const entry of selection) {
    const origin = originOf(entry);
    const current = existing?.find((r) => r.id === entry.resource.id);
    if (current && !sameOrigin(current.origin, origin)) {
      skipped.push({
        id: entry.resource.id,
        reason: `A resource with this id exists and does not come from ${label}; delete or rename it first`,
      });
      continue;
    }
    const harnesses: HarnessId[] = [];
    for (const harness of targets) {
      const why =
        reason(entry, harness) ??
        (harness === "claude-code" && entry.partOf && chosen.has(entry.partOf)
          ? `Comes with ${entry.partOf}, which is also selected`
          : undefined);
      if (why) skipped.push({ id: entry.resource.id, harness, reason: why });
      else harnesses.push(harness);
    }
    if (!targets.length)
      skipped.push({
        id: entry.resource.id,
        reason:
          "No supported agent was detected on this machine; choose one with --harness claude-code,codex,cursor",
      });
    if (!harnesses.length) continue;
    install.push(
      ResourceSchema.parse({
        ...entry.resource,
        source: sourceOf(entry),
        scope,
        harnesses,
        enabled: true,
        origin,
      }),
    );
  }

  const report = {
    repository: {
      ...base,
      ...(parsed.subdir ? { folder: parsed.subdir } : {}),
    },
    scope,
    detected,
    harnesses: targets,
    found: summaries.reduce<Partial<Record<ResourceType, FoundSummary[]>>>(
      (groups, s) => ({ ...groups, [s.type]: [...(groups[s.type] ?? []), s] }),
      {},
    ),
    install: install.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      harnesses: r.harnesses,
    })),
    skipped,
    notes,
  };
  const warnings = skipped.map(
    (s) => `${s.id}${s.harness ? ` (${harnessName[s.harness]})` : ""}: ${s.reason}`,
  );
  const dryRun = !options.apply;
  if (!existing) {
    if (options.apply) throw new Error("Run preflight init first");
    return {
      ...report,
      files: [],
      dryRun: true,
      warnings,
      hint: "Run preflight init first, then install.",
    };
  }
  if (!install.length)
    return { ...report, files: [], dryRun, warnings };
  const plan = await service.import(install, dryRun, `install:${label}`);
  return {
    ...report,
    ...plan,
    warnings: [...warnings, ...plan.warnings],
    ...(dryRun
      ? {
          hint: options.select?.length || options.all
            ? "Preview only. Add --apply to write these files."
            : "Preview of every resource found. Choose with --select <id,...> or --all, then add --apply to write.",
        }
      : {}),
  };
}
