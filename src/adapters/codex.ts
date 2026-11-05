import { lstat, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import {
  ResourceSchema,
  type Resource,
  type ResourceType,
  type Scope,
} from "../schema.js";
import { applyFiles, readText, type FileChange } from "../transaction.js";
import { parseToml, setTomlTable, tomlGet } from "../toml-edit.js";
import { managedBlocks, setManagedBlock, unmanagedText } from "../agents-md.js";
import {
  adoptedIn,
  emptyDirectoryTree,
  frontmatter,
  slug,
  type Context,
  type HarnessAdapter,
  type HarnessNote,
  type HarnessState,
} from "./common.js";
import { canonical, mdPart, tomlPart } from "./parts.js";

/**
 * OpenAI Codex CLI.
 *
 * - MCP servers: `[mcp_servers.<name>]` tables in `$CODEX_HOME/config.toml`
 *   (user) and `.codex/config.toml` (project, loaded for trusted projects).
 *   Preflight edits only those tables and keeps the rest of the file as is.
 * - Skills: `~/.agents/skills` (user) and `.agents/skills` (project), the
 *   shared locations Codex reads; symlinked skill folders are followed.
 * - Instructions: managed blocks in `$CODEX_HOME/AGENTS.md` and the project's
 *   `AGENTS.md`.
 * - Custom prompts (`~/.codex/prompts`) were removed in Codex 0.117 and are
 *   reported, not written.
 */

const envReference = /^\$\{([A-Z_][A-Z0-9_]*)\}$/;
const portableKeys = new Set([
  "type",
  "url",
  "headers",
  "command",
  "args",
  "env",
  "adoptedBy",
  "adoptedPath",
]);

const invalid = (message: string) => new Error(`Invalid resource: ${message}`);

/** A portable (Claude-style) MCP configuration as a Codex `mcp_servers` table. */
export function toCodexServer(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const type = typeof config.type === "string" ? config.type : undefined;
  if (type === "sse")
    throw invalid(
      "Codex supports stdio and streamable HTTP MCP servers, not SSE",
    );
  if (typeof config.command === "string") {
    out.command = config.command;
    if (Array.isArray(config.args)) out.args = config.args;
    const env: Record<string, unknown> = {};
    const forwarded: string[] = [];
    for (const [key, value] of Object.entries(
      (config.env ?? {}) as Record<string, unknown>,
    )) {
      const match = typeof value === "string" ? envReference.exec(value) : null;
      if (match && match[1] === key) forwarded.push(key);
      else if (match || (typeof value === "string" && value.includes("${")))
        throw invalid(
          `Codex forwards environment variables by name only; set env.${key} to "\${${key}}" or a literal value`,
        );
      else env[key] = value;
    }
    if (Object.keys(env).length) out.env = env;
    if (forwarded.length) out.env_vars = forwarded;
  }
  if (typeof config.url === "string") {
    out.url = config.url;
    const literal: Record<string, unknown> = {};
    const fromEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      (config.headers ?? {}) as Record<string, unknown>,
    )) {
      const bearer =
        typeof value === "string"
          ? /^Bearer \$\{([A-Z_][A-Z0-9_]*)\}$/.exec(value)
          : null;
      const match = typeof value === "string" ? envReference.exec(value) : null;
      if (bearer && key.toLowerCase() === "authorization")
        out.bearer_token_env_var = bearer[1];
      else if (match) fromEnv[key] = match[1]!;
      else if (typeof value === "string" && value.includes("${"))
        throw invalid(
          `header ${key} mixes text and an environment reference, which Codex cannot express`,
        );
      else literal[key] = value;
    }
    if (Object.keys(literal).length) out.http_headers = literal;
    if (Object.keys(fromEnv).length) out.env_http_headers = fromEnv;
  }
  for (const [key, value] of Object.entries(config))
    if (!portableKeys.has(key) && value !== undefined && value !== null)
      out[key] = value;
  if (!out.command && !out.url)
    throw invalid("MCP server has neither command nor URL");
  return out;
}

/** A Codex `mcp_servers` table as a portable configuration. */
export function fromCodexServer(
  table: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const rest = { ...table };
  const take = (key: string) => {
    const value = rest[key];
    delete rest[key];
    return value;
  };
  const command = take("command");
  const args = take("args");
  if (command !== undefined) out.command = command;
  if (args !== undefined) out.args = args;
  const env = { ...((take("env") ?? {}) as Record<string, unknown>) };
  const forwarded = rest.env_vars;
  if (
    Array.isArray(forwarded) &&
    forwarded.every((v) => typeof v === "string")
  ) {
    delete rest.env_vars;
    for (const name of forwarded) env[name] = `\${${name}}`;
  }
  if (Object.keys(env).length) out.env = env;
  const url = take("url");
  if (url !== undefined) {
    out.url = url;
    const headers: Record<string, unknown> = {
      ...((take("http_headers") ?? {}) as Record<string, unknown>),
    };
    for (const [key, name] of Object.entries(
      (take("env_http_headers") ?? {}) as Record<string, unknown>,
    ))
      headers[key] = `\${${String(name)}}`;
    const bearer = take("bearer_token_env_var");
    if (typeof bearer === "string")
      headers.Authorization = `Bearer \${${bearer}}`;
    if (Object.keys(headers).length) out.headers = headers;
  }
  return { ...out, ...rest };
}

async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}
async function names(path: string) {
  try {
    return await readdir(path);
  } catch (e) {
    if (
      (e as NodeJS.ErrnoException).code === "ENOENT" ||
      (e as NodeJS.ErrnoException).code === "ENOTDIR"
    )
      return [];
    throw e;
  }
}

/** Codex's default combined limit for project instructions (project_doc_max_bytes). */
export const CODEX_DOC_LIMIT = 32 * 1024;

export class CodexAdapter implements HarnessAdapter {
  readonly id = "codex" as const;
  readonly capabilities: ResourceType[] = ["skill", "mcp", "instructions"];
  private parts = new Map<string, string>();
  constructor(readonly context: Context) {}
  /** CODEX_HOME moves the user directory, unless a test or `--home` isolates it. */
  codexHome() {
    const env = process.env.CODEX_HOME;
    return env && resolve(this.context.home) === resolve(homedir())
      ? resolve(env)
      : join(this.context.home, ".codex");
  }
  paths() {
    return {
      global: this.codexHome(),
      project: join(this.context.root, ".codex"),
    };
  }
  /** `~/.agents` and `<project>/.agents`: the shared, agent-neutral skill store. */
  agentsBase(scope: Scope) {
    return scope === "global"
      ? join(this.context.home, ".agents")
      : join(this.context.root, ".agents");
  }
  adoptBase(scope: Scope, type: ResourceType) {
    return type === "skill" ? this.agentsBase(scope) : this.paths()[scope];
  }
  configPath(scope: Scope) {
    return join(this.paths()[scope], "config.toml");
  }
  instructionsPath(scope: Scope) {
    return scope === "global"
      ? join(this.codexHome(), "AGENTS.md")
      : join(this.context.root, "AGENTS.md");
  }
  sharedFiles() {
    return (["global", "project"] as const).flatMap((s) => [
      this.configPath(s),
      this.instructionsPath(s),
    ]);
  }
  lockPart(path: string) {
    return this.parts.get(resolve(path));
  }
  async detect() {
    return (
      (await exists(this.paths().global)) ||
      (await exists(this.paths().project))
    );
  }
  target(resource: Resource): { path: string; key?: string; section?: string } {
    if (!this.capabilities.includes(resource.type))
      throw new Error(`codex does not support ${resource.type}`);
    switch (resource.type) {
      case "skill": {
        const adopted = adoptedIn(resource, this.id);
        return {
          path: join(
            this.agentsBase(resource.scope),
            adopted ?? join("skills", slug(resource.id), "SKILL.md"),
          ),
        };
      }
      case "mcp":
        return {
          path: this.configPath(resource.scope),
          section: "mcp_servers",
          key: resource.name,
        };
      default:
        return {
          path: this.instructionsPath(resource.scope),
          section: "agents-md",
          key: resource.id,
        };
    }
  }
  async plan(desired: Resource[], previous: Resource[]) {
    const relevant = (r: Resource) =>
      r.harnesses.includes(this.id) &&
      r.enabled &&
      this.capabilities.includes(r.type);
    const wanted = desired.filter(relevant);
    const old = previous.filter(relevant);
    const targets = new Set<string>();
    for (const resource of wanted) {
      if (resource.type === "mcp" && resource.config.unsupportedReason)
        throw invalid(String(resource.config.unsupportedReason));
      const target = this.target(resource);
      const key = target.path + "#" + (target.key ?? "");
      if (targets.has(key)) throw new Error(`Target collision: ${key}`);
      targets.add(key);
    }
    const files = new Map<string, FileChange>();
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
      if (resource.type === "skill") {
        if (!removing && !resource.content?.trim())
          throw invalid(
            `inspect and materialize skill content before applying ${resource.id}`,
          );
        file.after = removing ? null : resource.content!;
        for (const asset of z
          .array(z.object({ path: z.string(), contents: z.string() }))
          .parse(resource.config.files ?? [])) {
          if (asset.path === "SKILL.md") continue;
          if (
            !asset.path ||
            asset.path.startsWith("/") ||
            asset.path.includes("\\") ||
            asset.path.includes(":") ||
            asset.path
              .split("/")
              .some((part) => part === ".." || part === "." || !part)
          )
            throw new Error("Invalid resource asset path");
          const extra = await obtain(join(dirname(target.path), asset.path));
          extra.after = removing ? null : asset.contents;
        }
      } else if (resource.type === "mcp") {
        const text = file.after ?? "";
        let doc: Record<string, unknown>;
        try {
          doc = text ? parseToml(text) : {};
        } catch (error) {
          throw new Error(`${target.path}: invalid TOML: ${String(error)}`);
        }
        const path = ["mcp_servers", resource.name];
        const existing = tomlGet(doc, path);
        if (removing) {
          if (existing !== undefined)
            file.after = setTomlTable(text, path, null);
        } else {
          const value = toCodexServer(resource.config);
          if (existing !== undefined) {
            const same = canonical(existing) === canonical(value);
            if (!(resource.config.adoptedBy === this.id && same))
              throw new Error(`Refusing unmanaged entry: ${resource.name}`);
            continue;
          }
          file.after = setTomlTable(text, path, value);
        }
        if (file.before === null && !file.after?.trim()) file.after = null;
      } else {
        if (!removing && !resource.content?.trim())
          throw invalid(`instructions ${resource.id} have no content`);
        file.after = setManagedBlock(
          file.after,
          resource.id,
          removing ? null : resource.content!,
        );
      }
    }
    // Shared files are digested by the parts Preflight owns, so a user's own
    // edits elsewhere in config.toml or AGENTS.md are not drift.
    this.parts.clear();
    for (const scope of ["global", "project"] as const) {
      const mine = wanted.filter((r) => r.scope === scope);
      const config = this.configPath(scope);
      if (files.has(config))
        this.parts.set(
          resolve(config),
          tomlPart(
            mine
              .filter((r) => r.type === "mcp")
              .map((r) => ["mcp_servers", r.name]),
          ),
        );
      const agents = this.instructionsPath(scope);
      if (files.has(agents))
        this.parts.set(
          resolve(agents),
          mdPart(
            mine.filter((r) => r.type === "instructions").map((r) => r.id),
          ),
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
  async read(): Promise<HarnessState> {
    const resources: Resource[] = [];
    const issues: string[] = [];
    const notes: HarnessNote[] = [];
    const settings: Record<string, unknown> = {};
    let instructionBytes = 0;
    let docLimit = CODEX_DOC_LIMIT;
    for (const scope of ["global", "project"] as const) {
      if (scope === "project" && this.context.globalOnly) continue;
      // Skills
      const skills = join(this.agentsBase(scope), "skills");
      for (const name of await names(skills)) {
        if (name.startsWith(".")) continue;
        const path = join(skills, name, "SKILL.md");
        try {
          const content = await readText(path);
          if (content === null) {
            if (await emptyDirectoryTree(dirname(path)).catch(() => false))
              continue;
            issues.push(`Broken or missing resource: ${path}`);
            continue;
          }
          const meta = frontmatter(content);
          resources.push(
            ResourceSchema.parse({
              id: `skill:codex:${scope}:${name.replace(/[^a-z0-9._-]/gi, "-")}`,
              type: "skill",
              name: typeof meta.name === "string" ? meta.name : name,
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
      // config.toml
      const configPath = this.configPath(scope);
      const raw = await readText(configPath);
      if (raw !== null) {
        let doc: Record<string, unknown> | null = null;
        try {
          doc = parseToml(raw);
        } catch (e) {
          issues.push(`${configPath}: invalid TOML: ${String(e)}`);
        }
        if (doc) {
          const servers = (doc.mcp_servers ?? {}) as Record<string, unknown>;
          for (const [name, table] of Object.entries(servers)) {
            if (!table || typeof table !== "object" || Array.isArray(table)) {
              issues.push(`${configPath}: mcp_servers.${name} is not a table`);
              continue;
            }
            const config = fromCodexServer(table as Record<string, unknown>);
            resources.push(
              ResourceSchema.parse({
                id: `mcp:codex:${scope}:${slug(name)}`,
                type: "mcp",
                name,
                source: `file://${configPath}`,
                scope,
                harnesses: [this.id],
                enabled: (table as Record<string, unknown>).enabled !== false,
                config,
              }),
            );
          }
          const profiles =
            doc.profiles && typeof doc.profiles === "object"
              ? Object.keys(doc.profiles as object)
              : [];
          settings[scope] = {
            path: configPath,
            ...(typeof doc.model === "string" ? { model: doc.model } : {}),
            ...(typeof doc.model_reasoning_effort === "string"
              ? { modelReasoningEffort: doc.model_reasoning_effort }
              : {}),
            ...(typeof doc.profile === "string"
              ? { profile: doc.profile }
              : {}),
            profiles,
          };
          if (typeof doc.project_doc_max_bytes === "number")
            docLimit = doc.project_doc_max_bytes;
          if (scope === "project")
            notes.push({
              code: "codex-project-config",
              severity: "info",
              message: `${configPath}: Codex reads project configuration only when you trust the project.`,
            });
        }
      }
      // Instructions
      const agentsPath = this.instructionsPath(scope);
      const agents = await readText(agentsPath);
      const override = await readText(
        join(dirname(agentsPath), "AGENTS.override.md"),
      );
      if (override?.trim()) {
        instructionBytes += Buffer.byteLength(override);
        notes.push({
          code: "codex-agents-override",
          severity: "warning",
          message: `${join(dirname(agentsPath), "AGENTS.override.md")} replaces ${basename(agentsPath)} at this level; Codex does not load ${agentsPath}${agents?.trim() ? ", including any Preflight-managed instructions in it" : ""}.`,
        });
      } else if (agents) instructionBytes += Buffer.byteLength(agents);
      if (agents !== null) {
        try {
          for (const block of managedBlocks(agents))
            resources.push(
              ResourceSchema.parse({
                id: `instructions:codex:${scope}:${block.id.replace(/[^a-z0-9._-]/gi, "-")}`,
                type: "instructions",
                name: block.id,
                source: `file://${agentsPath}`,
                scope,
                harnesses: [this.id],
                content: block.content,
                config: { block: block.id },
              }),
            );
          const own = unmanagedText(agents);
          if (own.trim())
            resources.push(
              ResourceSchema.parse({
                id: `instructions:codex:${scope}:agents-md`,
                type: "instructions",
                name: "AGENTS.md",
                description:
                  scope === "global"
                    ? "Codex global instructions"
                    : "Project instructions",
                source: `file://${agentsPath}`,
                scope,
                harnesses: [this.id],
                content: own,
                config: { block: "" },
              }),
            );
        } catch (e) {
          issues.push(`${agentsPath}: ${String(e)}`);
        }
      }
    }
    // Leftovers from older Codex versions.
    const legacySkills = (await names(join(this.codexHome(), "skills"))).filter(
      (n) => !n.startsWith("."),
    );
    if (legacySkills.length)
      notes.push({
        code: "codex-legacy-skills",
        severity: "warning",
        message: `${join(this.codexHome(), "skills")} holds ${legacySkills.length} skill folder(s); current Codex reads skills from ${join(this.agentsBase("global"), "skills")}. Move them there.`,
      });
    const prompts = (await names(join(this.codexHome(), "prompts"))).filter(
      (n) => n.endsWith(".md"),
    );
    if (prompts.length)
      notes.push({
        code: "codex-legacy-prompts",
        severity: "warning",
        message: `${join(this.codexHome(), "prompts")} holds ${prompts.length} custom prompt(s); Codex removed custom prompts in 0.117. Convert them to skills.`,
      });
    if (instructionBytes > docLimit)
      notes.push({
        code: "codex-instructions-truncated",
        severity: "warning",
        message: `Codex instructions total ${instructionBytes} bytes, over the ${docLimit}-byte project_doc_max_bytes limit; Codex stops adding files at the limit.`,
      });
    const profileFiles = (await names(this.codexHome())).filter((n) =>
      /^[^.].*\.config\.toml$/.test(n),
    );
    if (profileFiles.length)
      settings.profileFiles = profileFiles.map((n) =>
        n.replace(/\.config\.toml$/, ""),
      );
    return { resources, issues, notes, settings };
  }
}
