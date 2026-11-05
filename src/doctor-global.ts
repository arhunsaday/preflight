// Adapted from me-cedric/agent-compass engine/global.mjs (MIT, Copyright (c) 2026 CGI),
// commit 72d72711fa3d1941658b97755674e0204274a80d. See THIRD_PARTY_NOTICES.md.
// Changes: TypeScript, async reads, project settings and plugin listings,
// Preflight findings, and hook measurement in a temporary folder with a timeout.
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frontmatter, type Context } from "./adapters.js";
import { findingCatalog, type Finding } from "./analysis.js";
import { readText } from "./transaction.js";
import type { DoctorThresholds } from "./schema.js";

/** Hook events whose output goes into the context. */
export const INJECTING_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "SubagentStart",
  "PreCompact",
] as const;
export interface InjectingHook {
  event: string;
  matcher: string;
  /** "user settings", "project settings", "local settings" or a plugin id. */
  from: string;
  command: string;
  /** Plugin install folder, passed as CLAUDE_PLUGIN_ROOT. */
  root?: string;
}
export interface PluginInfo {
  id: string;
  installPath: string | null;
  /** Listing tokens of its model-invocable skills and agents. */
  listingTokens: number;
  skills: number;
  agents: number;
}
export interface GlobalSetup {
  plugins: PluginInfo[];
  mcp: { name: string; from: string }[];
  hooks: InjectingHook[];
  codex: { mcp: string[]; plugins: string[] };
  errors: string[];
}
type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json =>
  !!v && typeof v === "object" && !Array.isArray(v);

// A missing file is empty. A file that exists and does not parse is an error.
async function load(path: string, errors: string[]): Promise<Json> {
  const text = await readText(path).catch(() => null);
  if (text === null) return {};
  try {
    const value = JSON.parse(text);
    if (!isObj(value)) throw new Error("it is not a JSON object");
    return value;
  } catch (error) {
    errors.push(`${path} is not readable: ${(error as Error).message}`);
    return {};
  }
}

export function hooksOf(hooks: unknown, from: string, root?: string) {
  if (!isObj(hooks)) return [];
  return INJECTING_EVENTS.flatMap((event) =>
    (Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [])
      .flatMap((m) =>
        isObj(m) && Array.isArray(m.hooks)
          ? (m.hooks as unknown[]).map((h) => [String(m.matcher ?? ""), h] as const)
          : [],
      )
      .filter(
        (pair): pair is readonly [string, Json] =>
          isObj(pair[1]) &&
          pair[1].type === "command" &&
          typeof pair[1].command === "string",
      )
      .map(
        ([matcher, h]): InjectingHook => ({
          event,
          matcher,
          from,
          command: h.command as string,
          ...(root ? { root } : {}),
        }),
      ),
  );
}

// `[mcp_servers.<name>]` and `[plugins."<name>"]` tables. A sub-table such as
// `[mcp_servers.<name>.env]` is the same server.
export function codexOf(text: string) {
  const mcp = new Set<string>();
  const plugins: string[] = [];
  for (const table of text.split(/^\s*\[/m).slice(1)) {
    const m =
      /^(mcp_servers|plugins)\.("[^"]+"|[\w@.-]+?)(?:\.[\w-]+)?\]([\s\S]*)/.exec(
        table,
      );
    if (!m) continue;
    const name = m[2]!.replace(/"/g, "");
    if (m[1] === "mcp_servers") mcp.add(name);
    else if (!/^\s*enabled\s*=\s*false/m.test(m[3]!)) plugins.push(name);
  }
  return { mcp: [...mcp], plugins };
}

async function listing(dir: string) {
  let skills = 0,
    agents = 0,
    tokens = 0;
  const line = (text: string, fallback: string) => {
    const meta = (() => {
      try {
        return frontmatter(text);
      } catch {
        return {};
      }
    })();
    if (
      meta["disable-model-invocation"] === true ||
      meta["disable-model-invocation"] === "true"
    )
      return 0;
    const name = typeof meta.name === "string" ? meta.name : fallback;
    const description =
      typeof meta.description === "string" ? meta.description : "";
    return Math.ceil(`${name}\n${description}`.length / 4);
  };
  const names = async (path: string) =>
    readdir(path).catch(() => [] as string[]);
  for (const name of await names(join(dir, "skills"))) {
    const text = await readText(join(dir, "skills", name, "SKILL.md")).catch(
      () => null,
    );
    if (text === null) continue;
    skills++;
    tokens += line(text, name);
  }
  for (const name of await names(join(dir, "agents"))) {
    if (!name.endsWith(".md")) continue;
    const text = await readText(join(dir, "agents", name)).catch(() => null);
    if (text === null) continue;
    agents++;
    tokens += line(text, name.replace(/\.md$/, ""));
  }
  return { skills, agents, tokens };
}

/** Read the user-level and project Claude Code setup, and Codex's config. Files only. */
export async function readGlobalSetup(context: Context): Promise<GlobalSetup> {
  const errors: string[] = [];
  const claudeDir = join(context.home, ".claude");
  const settings = await load(join(claudeDir, "settings.json"), errors);
  const state = await load(join(context.home, ".claude.json"), errors);
  const registry = await load(
    join(claudeDir, "plugins", "installed_plugins.json"),
    errors,
  );
  const installed = isObj(registry.plugins) ? registry.plugins : {};
  const enabled = Object.entries(
    isObj(settings.enabledPlugins) ? settings.enabledPlugins : {},
  )
    .filter(([, on]) => on === true)
    .map(([id]) => id);
  const installPath = (id: string) => {
    const entries = (
      Array.isArray(installed[id]) ? (installed[id] as unknown[]) : []
    ).filter(isObj);
    const path = (entries.find((e) => e.scope === "user") ?? entries[0])
      ?.installPath;
    return typeof path === "string" ? path : null;
  };
  const mcp = Object.keys(isObj(state.mcpServers) ? state.mcpServers : {}).map(
    (name) => ({ name, from: "user" }),
  );
  const hooks = hooksOf(settings.hooks, "user settings");
  if (!context.globalOnly)
    for (const [name, from] of [
      ["settings.json", "project settings"],
      ["settings.local.json", "local settings"],
    ] as const)
      hooks.push(
        ...hooksOf(
          (await load(join(context.root, ".claude", name), errors)).hooks,
          from,
        ),
      );
  const plugins: PluginInfo[] = [];
  for (const id of enabled) {
    const dir = installPath(id);
    if (!dir) {
      plugins.push({ id, installPath: null, listingTokens: 0, skills: 0, agents: 0 });
      continue;
    }
    const file = await load(join(dir, ".mcp.json"), errors);
    mcp.push(
      ...Object.keys(isObj(file.mcpServers) ? file.mcpServers : file).map(
        (name) => ({ name, from: id }),
      ),
    );
    hooks.push(
      ...hooksOf(
        (await load(join(dir, "hooks", "hooks.json"), errors)).hooks,
        id,
        dir,
      ),
    );
    const listed = await listing(dir);
    plugins.push({
      id,
      installPath: dir,
      listingTokens: listed.tokens,
      skills: listed.skills,
      agents: listed.agents,
    });
  }
  const toml = join(context.home, ".codex", "config.toml");
  let codex = { mcp: [] as string[], plugins: [] as string[] };
  try {
    const text = await readText(toml);
    if (text !== null) codex = codexOf(text);
  } catch (error) {
    errors.push(`${toml}: ${(error as Error).message}`);
  }
  return { plugins, mcp, hooks, codex, errors };
}

export interface HookMeasurement {
  from: string;
  command: string;
  chars: number;
  tokens: number;
  error?: string;
}
/**
 * Run each distinct SessionStart hook once, as Claude Code does, in a new
 * empty temporary folder with a time limit. Only `--measure` calls this.
 */
export async function measureHooks(
  hooks: InjectingHook[],
  timeoutMs: number,
): Promise<HookMeasurement[]> {
  const unique = hooks.filter(
    (h, i, all) =>
      h.event === "SessionStart" &&
      all.findIndex(
        (x) => x.event === "SessionStart" && x.command === h.command,
      ) === i,
  );
  const results: HookMeasurement[] = [];
  for (const hook of unique) {
    const cwd = await mkdtemp(join(tmpdir(), "preflight-hook-"));
    try {
      results.push(await runHook(hook, cwd, timeoutMs));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
  return results;
}
function runHook(
  hook: InjectingHook,
  cwd: string,
  timeoutMs: number,
): Promise<HookMeasurement> {
  return new Promise((done) => {
    const limit = 1 << 20;
    let chars = 0,
      stderr = "",
      settled = false;
    const child = spawn(hook.command, {
      shell: true,
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        CLAUDE_PROJECT_DIR: cwd,
        ...(hook.root ? { CLAUDE_PLUGIN_ROOT: hook.root } : {}),
      },
    });
    const finish = (error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done({
        from: hook.from,
        command: hook.command,
        chars,
        tokens: Math.ceil(chars / 4),
        ...(error ? { error } : {}),
      });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(`timed out after ${timeoutMs} ms`);
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      chars += chunk.length;
      if (chars > limit) child.kill("SIGKILL");
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 4000) stderr += chunk;
    });
    child.on("error", (error) => finish(error.message));
    child.on("close", (code, signal) =>
      finish(
        code === 0
          ? undefined
          : stderr.trim().split("\n")[0] ||
              (code === null ? `signal ${signal}` : `exit code ${code}`),
      ),
    );
    // A hook that exits before reading stdin causes EPIPE; the exit code wins.
    child.stdin.on("error", () => {});
    child.stdin.end(
      JSON.stringify({
        hook_event_name: "SessionStart",
        source: "startup",
        session_id: "preflight-measure",
        cwd,
      }),
    );
  });
}

const audience = (event: string) =>
  event === "UserPromptSubmit"
    ? "every prompt"
    : event === "SubagentStart"
      ? "every subagent"
      : event === "PreCompact"
        ? "every compaction"
        : "every session";

/** Findings for the global setup, and for measured hooks when given. */
export function globalFindings(
  setup: GlobalSetup,
  limits: DoctorThresholds,
  measured?: HookMeasurement[],
): Finding[] {
  const findings: Finding[] = setup.errors.map((message) => ({
    code: "settings-invalid",
    severity: "error" as const,
    message,
  }));
  const tokens = new Map(measured?.map((m) => [m.command, m]) ?? []);
  for (const hook of setup.hooks) {
    const measurement = hook.event === "SessionStart" ? tokens.get(hook.command) : undefined;
    findings.push({
      code: "startup-injection",
      severity: "info",
      message: `${hook.event} hook from ${hook.from} adds its output to ${audience(hook.event)}: ${hook.command}`,
      explanation: findingCatalog["startup-injection"]!.explanation,
      ...(measurement && !measurement.error ? { tokens: measurement.tokens } : {}),
      fix:
        hook.event === "SessionStart" && !measured
          ? "Measure its output with `preflight doctor --measure`."
          : "Keep the output short; print only what changes, or move stable text into a skill.",
    });
  }
  const seen = new Map<string, number>();
  for (const h of setup.hooks) {
    const key = `${h.event}\0${h.matcher}\0${h.command}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, n] of seen)
    if (n > 1) {
      const [event, , command] = key.split("\0");
      findings.push({
        code: "hook-duplicate",
        severity: "warning",
        message: `The ${event} hook "${command}" is listed ${n} times; it runs ${n} times.`,
        explanation: findingCatalog["hook-duplicate"]!.explanation,
        fix: "Remove the extra entries from settings.json or disable the plugin that repeats it.",
      });
    }
  if (setup.plugins.length > limits.maxPlugins)
    findings.push({
      code: "plugins-many",
      severity: "warning",
      message: `${setup.plugins.length} enabled Claude Code plugins; the budget is ${limits.maxPlugins}.`,
      explanation: findingCatalog["plugins-many"]!.explanation,
      tokens: setup.plugins.reduce((t, p) => t + p.listingTokens, 0),
      fix: "Disable plugins you did not use this month: claude plugin disable <name@marketplace>.",
    });
  if (setup.mcp.length > limits.maxMcpServers)
    findings.push({
      code: "mcp-many",
      severity: "warning",
      message: `${setup.mcp.length} Claude Code MCP servers at user level; the budget is ${limits.maxMcpServers}.`,
      explanation: findingCatalog["mcp-many"]!.explanation,
      fix: "Move servers that one project uses to its .mcp.json; remove the others.",
    });
  if (setup.codex.mcp.length > limits.maxMcpServers)
    findings.push({
      code: "mcp-many",
      severity: "warning",
      message: `${setup.codex.mcp.length} Codex MCP servers in ~/.codex/config.toml; the budget is ${limits.maxMcpServers}.`,
      explanation: findingCatalog["mcp-many"]!.explanation,
      fix: "Remove unused [mcp_servers.*] tables from ~/.codex/config.toml.",
    });
  if (measured) {
    let total = 0;
    for (const m of measured) {
      if (m.error) {
        findings.push({
          code: "hook-failed",
          severity: "warning",
          message: `The SessionStart hook "${m.command}" (${m.from}) failed: ${m.error}`,
          explanation: findingCatalog["hook-failed"]!.explanation,
          fix: "Run the command by hand to see the error; fix or remove the hook.",
        });
        continue;
      }
      total += m.chars;
      if (m.chars > limits.hookOutputChars)
        findings.push({
          code: "startup-injection-large",
          severity: "warning",
          message: `The SessionStart hook "${m.command}" (${m.from}) printed ${m.chars} characters; the budget is ${limits.hookOutputChars}.`,
          explanation: findingCatalog["startup-injection-large"]!.explanation,
          tokens: m.tokens,
          fix: "Print a short summary and let the agent read details on demand.",
        });
    }
    if (total > limits.hookTotalChars)
      findings.push({
        code: "startup-injection-total",
        severity: "warning",
        message: `SessionStart hooks printed ${total} characters together; the budget is ${limits.hookTotalChars}.`,
        explanation: findingCatalog["startup-injection-total"]!.explanation,
        tokens: Math.ceil(total / 4),
        fix: "Remove or shorten the largest hooks listed above.",
      });
  }
  return findings;
}
