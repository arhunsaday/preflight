// Adapted from me-cedric/agent-compass engine/usage.mjs (MIT)
// Copyright 2026 CGI. See THIRD_PARTY_NOTICES.md.
//
// Token, cache and cost usage from local agent transcripts:
// - Claude Code: <home>/.claude/projects/**/*.jsonl. Streaming writes one line
//   per content block, so a message counts once per "<message.id>:<requestId>",
//   from the line with the largest output count.
// - Codex: <codex home>/sessions/**/rollout-*.jsonl[.zst] (and archived_sessions).
//   token_count events carry cumulative totals; each change is one step, dated
//   by its own line, so a long session spreads over the days it ran.
// Transcripts are read locally. Nothing is sent anywhere.
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { zstdDecompressSync } from "node:zlib";
import prices from "./data/prices.json" with { type: "json" };
import type { Resource } from "./schema.js";

export type UsageAgent = "claude-code" | "codex";
export const usageGroupings = [
  "session",
  "skill",
  "project",
  "model",
  "day",
  "agent",
] as const;
export type UsageGrouping = (typeof usageGroupings)[number];

export interface Tokens {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  tokens: number;
  /** USD at list price for the priced part. */
  cost: number;
  /** Tokens of models without a price; their cost is unknown, not zero. */
  unpricedTokens: number;
  messages: number;
}
export interface SessionUsage extends Tokens {
  session: string;
  agent: UsageAgent;
  project: string;
  model: string;
  first: string;
  last: string;
  cacheHitRate: number;
}
export interface SkillUsage extends Tokens {
  skill: string;
  calls: number;
}
export interface UsageReport {
  window: { since: string | null; until: string };
  totals: Tokens;
  /** cache reads / (input + cache writes + cache reads). */
  cacheHitRate: number;
  costEstimate: {
    usd: number;
    complete: boolean;
    unpricedModels: string[];
    prices: { source: string; retrieved: string };
  };
  byAgent: (Tokens & { agent: UsageAgent })[];
  byDay: (Tokens & { day: string })[];
  byModel: (Tokens & { model: string })[];
  byProject: (Tokens & { project: string })[];
  bySession: SessionUsage[];
  bySkill: SkillUsage[];
  /** Tool calls seen, one per tool_use id; skills as `skill:<name>`. */
  invocations: Record<string, number>;
  /** Distinct sessions with usage or tool calls in the window. */
  sessions: number;
  files: number;
  lines: number;
  invalidLines: number;
  sources: { agent: UsageAgent; directory: string; files: number }[];
}
export interface UsageOptions {
  home?: string;
  /** Claude Code transcripts; default <home>/.claude/projects. */
  claudeDir?: string;
  /** Codex home; default CODEX_HOME or <home>/.codex. */
  codexHome?: string;
  agent?: UsageAgent | "all";
  /** Inclusive local day (YYYY-MM-DD) or a relative window such as 30d. */
  since?: string;
  until?: string;
  /** Only sessions of this repository root. */
  project?: string;
  /** How many sessions bySession keeps (largest first). Default 50. */
  sessionLimit?: number;
  now?: Date;
}

interface PriceRow {
  input: number;
  output: number;
  cacheRead: number;
  longPrompt?: {
    above: number;
    input: number;
    output: number;
    cacheRead: number;
  };
}
const priceTable = prices.models as Record<string, PriceRow>;
const prefixes = Object.keys(priceTable).sort((a, b) => b.length - a.length);
export const priceFor = (model: string) => {
  const key = prefixes.find((p) => model.startsWith(p));
  return key ? priceTable[key]! : undefined;
};
export const priceSource = {
  source: prices.source,
  retrieved: prices.retrieved,
};

const pad = (n: number) => String(n).padStart(2, "0");
export const localDay = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayStart = (day: string) => new Date(`${day}T00:00:00`).getTime();

/** `30d`, `12w`, `6m` or `YYYY-MM-DD` as a local day. */
export function parseSince(value: string, now = new Date()): string {
  const relative = /^(\d{1,4})([dwm])$/.exec(value.trim());
  if (relative) {
    const count = Number(relative[1]);
    const d = new Date(now);
    if (relative[2] === "m") d.setMonth(d.getMonth() - count);
    else d.setDate(d.getDate() - count * (relative[2] === "w" ? 7 : 1) + 1);
    return localDay(d);
  }
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    localDay(new Date(`${value}T00:00:00`)) === value
  )
    return value;
  throw new Error(
    `Expected a window such as 30d or a date as YYYY-MM-DD: ${value}`,
  );
}

const blank = (): Tokens => ({
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
  tokens: 0,
  cost: 0,
  unpricedTokens: 0,
  messages: 0,
});
const tokenKeys = Object.keys(blank()) as (keyof Tokens)[];
const add = (a: Tokens, b: Tokens) => {
  for (const key of tokenKeys) a[key] += b[key];
  return a;
};
const bump = <K>(map: Map<K, Tokens>, key: K, s: Tokens) =>
  add(map.get(key) ?? map.set(key, blank()).get(key)!, s);
const hitRate = (s: Tokens) => {
  const reads = s.input + s.cacheWrite + s.cacheRead;
  return reads ? s.cacheRead / reads : 0;
};
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

interface RawUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation?: {
    ephemeral_5m_input_tokens?: unknown;
    ephemeral_1h_input_tokens?: unknown;
  };
  speed?: unknown;
}

/** Tokens and list-price cost of one message. */
export function priceUsage(u: RawUsage, model: string, messages = 1): Tokens {
  const e5 = num(u.cache_creation?.ephemeral_5m_input_tokens);
  const e1 = num(u.cache_creation?.ephemeral_1h_input_tokens);
  const cacheWrite = num(u.cache_creation_input_tokens) || e5 + e1;
  const input = num(u.input_tokens);
  const output = num(u.output_tokens);
  const cacheRead = num(u.cache_read_input_tokens);
  const tokens = input + output + cacheWrite + cacheRead;
  const base = priceFor(model);
  if (!base)
    return {
      input,
      output,
      cacheWrite,
      cacheRead,
      tokens,
      cost: 0,
      unpricedTokens: tokens,
      messages,
    };
  const tier =
    base.longPrompt && input + cacheRead + cacheWrite > base.longPrompt.above
      ? base.longPrompt
      : base;
  const writes =
    e5 + e1
      ? e5 * prices.cacheWrite["5m"] + e1 * prices.cacheWrite["1h"]
      : cacheWrite * prices.cacheWrite["5m"];
  const cost =
    ((input * tier.input +
      output * tier.output +
      cacheRead * tier.cacheRead +
      writes * tier.input) /
      1e6) *
    (u.speed === "fast" ? prices.fastMultiplier : 1);
  return {
    input,
    output,
    cacheWrite,
    cacheRead,
    tokens,
    cost,
    unpricedTokens: 0,
    messages,
  };
}

/**
 * The repository root of a working directory, without running git: a Claude
 * worktree folder is cut, a linked worktree resolves to its main checkout.
 */
export function repoRoot(
  cwd: string,
  cache = new Map<string, string>(),
): string {
  const hit = cache.get(cwd);
  if (hit) return hit;
  let result = cwd;
  const cut = cwd.search(/[\\/]\.claude[\\/]worktrees[\\/]/);
  if (cut >= 0) result = cwd.slice(0, cut);
  else
    for (let dir = resolve(cwd); ; dir = dirname(dir)) {
      const git = join(dir, ".git");
      try {
        if (existsSync(git)) {
          if (statSync(git).isFile()) {
            const target = /^gitdir:\s*(.+)$/m
              .exec(readFileSync(git, "utf8"))?.[1]
              ?.trim();
            const at = target
              ? resolve(dir, target).indexOf(`${sep}.git${sep}worktrees${sep}`)
              : -1;
            result =
              target && at >= 0 ? resolve(dir, target).slice(0, at) : dir;
          } else result = dir;
          break;
        }
      } catch {
        break;
      }
      if (dirname(dir) === dir) break;
    }
  cache.set(cwd, result);
  return result;
}

export async function walk(
  dir: string,
  match: (name: string) => boolean,
  after: number,
) {
  const found: string[] = [];
  const visit = async (path: string) => {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR" || code === "EACCES") return;
      throw e;
    }
    for (const entry of entries) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && match(entry.name))
        if (!after || (await stat(full)).mtimeMs >= after) found.push(full);
    }
  };
  await visit(dir);
  return found.sort();
}

interface Row {
  agent: UsageAgent;
  t: number;
  day: string;
  session: string;
  cwd: string;
  model: string;
  s: Tokens;
}
interface Mark {
  t: number;
  kind: "skill" | "prompt";
  skill?: string;
}

const parse = (line: string): Record<string, unknown> | null => {
  try {
    const value = JSON.parse(line) as unknown;
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

class Collector {
  rows: Row[] = [];
  marks = new Map<string, Mark[]>();
  invocations: Record<string, number> = {};
  seenTools = new Set<string>();
  sessionsWithTools = new Set<string>();
  lines = 0;
  invalidLines = 0;
  files = 0;
  tool(session: string, name: string, id: unknown) {
    if (typeof id === "string" && id) {
      if (this.seenTools.has(`${session}\0${id}`)) return false;
      this.seenTools.add(`${session}\0${id}`);
    }
    this.invocations[name] = (this.invocations[name] ?? 0) + 1;
    this.sessionsWithTools.add(session);
    return true;
  }
  mark(session: string, mark: Mark) {
    (this.marks.get(session) ?? this.marks.set(session, []).get(session)!).push(
      mark,
    );
  }
}

async function readClaude(dir: string, after: number, c: Collector) {
  const files = await walk(dir, (n) => n.endsWith(".jsonl"), after);
  const best = new Map<string, { row: Row; output: number }>();
  for (const file of files) {
    c.files++;
    const lines = createInterface({
      input: createReadStream(file),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      if (!line.trim()) continue;
      c.lines++;
      const d = parse(line);
      if (!d) {
        c.invalidLines++;
        continue;
      }
      const message = d.message as
        | { id?: unknown; model?: unknown; usage?: RawUsage; content?: unknown }
        | undefined;
      const session = typeof d.sessionId === "string" ? d.sessionId : file;
      const at = new Date(String(d.timestamp));
      const t = at.getTime();
      const content = Array.isArray(message?.content)
        ? (message.content as unknown[])
        : [];
      for (const block of content) {
        const b = block as {
          type?: unknown;
          name?: unknown;
          id?: unknown;
          input?: { skill?: unknown };
        };
        if (b?.type !== "tool_use" || typeof b.name !== "string") continue;
        const skill =
          b.name === "Skill" && typeof b.input?.skill === "string"
            ? b.input.skill
            : null;
        if (
          c.tool(session, skill ? `skill:${skill}` : b.name, b.id) &&
          skill &&
          !Number.isNaN(t)
        )
          c.mark(session, { t, kind: "skill", skill });
      }
      if (
        d.type === "user" &&
        !d.isMeta &&
        !d.isSidechain &&
        !Number.isNaN(t) &&
        (typeof message?.content === "string" ||
          content.some((x) => (x as { type?: unknown })?.type === "text"))
      )
        c.mark(session, { t, kind: "prompt" });
      const model = typeof message?.model === "string" ? message.model : null;
      if (
        !message?.usage ||
        !model ||
        model === "<synthetic>" ||
        Number.isNaN(t)
      )
        continue;
      const row: Row = {
        agent: "claude-code",
        t,
        day: localDay(at),
        session,
        cwd: typeof d.cwd === "string" ? d.cwd : "(unknown)",
        model,
        s: priceUsage(message.usage, model),
      };
      const key =
        typeof message.id === "string" && typeof d.requestId === "string"
          ? `${message.id}:${d.requestId}`
          : null;
      const output = num(message.usage.output_tokens);
      if (!key) c.rows.push(row);
      else if ((best.get(key)?.output ?? -1) < output)
        best.set(key, { row, output });
    }
  }
  c.rows.push(...[...best.values()].map((b) => b.row));
  return files.length;
}

interface CodexTotals {
  input_tokens?: unknown;
  cached_input_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
}

async function readCodex(home: string, after: number, c: Collector) {
  const files = (
    await Promise.all(
      ["sessions", "archived_sessions"].map((d) =>
        walk(
          join(home, d),
          (n) => /^rollout-.*\.jsonl(?:\.zst)?$/.test(n),
          after,
        ),
      ),
    )
  ).flat();
  const seenSessions = new Set<string>();
  for (const file of files) {
    let text: string;
    try {
      const buffer = await readFile(file);
      text = file.endsWith(".zst")
        ? zstdDecompressSync(buffer).toString("utf8")
        : buffer.toString("utf8");
    } catch {
      c.invalidLines++;
      continue;
    }
    c.files++;
    let session = file;
    let cwd = "(unknown)";
    let model = "(unknown)";
    let previous: CodexTotals | null = null;
    let fallbackTime = NaN;
    const rows: Row[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      c.lines++;
      const d = parse(line);
      if (!d) {
        c.invalidLines++;
        continue;
      }
      const payload = (d.payload ?? {}) as Record<string, unknown>;
      const t = new Date(String(d.timestamp ?? payload.timestamp)).getTime();
      if (!Number.isNaN(t)) fallbackTime = t;
      if (d.type === "session_meta") {
        if (typeof payload.id === "string") session = payload.id;
        if (typeof payload.cwd === "string") cwd = payload.cwd;
      } else if (d.type === "turn_context") {
        if (typeof payload.model === "string" && payload.model)
          model = payload.model;
        if (typeof payload.cwd === "string") cwd = payload.cwd;
      } else if (d.type === "response_item") {
        const name = payload.name;
        if (
          (payload.type === "function_call" ||
            payload.type === "custom_tool_call") &&
          typeof name === "string"
        )
          c.tool(session, name, payload.call_id);
      } else if (d.type === "event_msg" && payload.type === "token_count") {
        const info = payload.info as
          { total_token_usage?: CodexTotals } | null | undefined;
        const total: CodexTotals | undefined =
          info?.total_token_usage ??
          (payload.input_tokens !== undefined
            ? (payload as CodexTotals)
            : undefined);
        if (!total || num(total.total_tokens) === num(previous?.total_tokens))
          continue;
        // A drop means the counter restarted (for example after a resume).
        const restarted =
          previous && num(total.total_tokens) < num(previous.total_tokens);
        const base = restarted || !previous ? {} : previous;
        const delta = (k: keyof CodexTotals) =>
          Math.max(0, num(total[k]) - num(base[k]));
        previous = total;
        const input = delta("input_tokens");
        const cached = Math.min(input, delta("cached_input_tokens"));
        const output = delta("output_tokens");
        const extra = Math.max(0, delta("total_tokens") - input - output);
        const when = Number.isNaN(t) ? fallbackTime : t;
        if (Number.isNaN(when)) continue;
        rows.push({
          agent: "codex",
          t: when,
          day: localDay(new Date(when)),
          session,
          cwd,
          model,
          s: priceUsage(
            {
              input_tokens: input - cached + extra,
              output_tokens: output,
              cache_read_input_tokens: cached,
            },
            model,
          ),
        });
      }
    }
    // A resumed or copied rollout repeats its session; count it once.
    if (seenSessions.has(session)) continue;
    seenSessions.add(session);
    c.rows.push(
      ...rows.map((r) => ({
        ...r,
        session,
        cwd: r.cwd === "(unknown)" ? cwd : r.cwd,
      })),
    );
  }
  return files.length;
}

const ranked = <K extends string, T extends Tokens>(
  map: Map<string, T>,
  name: K,
) =>
  [...map]
    .map(([key, s]) => ({ [name]: key, ...s }) as T & Record<K, string>)
    .sort((a, b) => b.tokens - a.tokens);

export function codexHomeFor(home: string) {
  return process.env.CODEX_HOME && resolve(home) === resolve(homedir())
    ? resolve(process.env.CODEX_HOME)
    : join(home, ".codex");
}

export async function readUsage(
  options: UsageOptions = {},
): Promise<UsageReport> {
  const now = options.now ?? new Date();
  const home = options.home ?? homedir();
  const since = options.since ? parseSince(options.since, now) : null;
  const until = options.until ? parseSince(options.until, now) : localDay(now);
  const after = since ? dayStart(since) : 0;
  const agent = options.agent ?? "all";
  const c = new Collector();
  const sources: UsageReport["sources"] = [];
  if (agent !== "codex") {
    const directory = options.claudeDir ?? join(home, ".claude", "projects");
    sources.push({
      agent: "claude-code",
      directory,
      files: await readClaude(directory, after, c),
    });
  }
  if (agent !== "claude-code") {
    const directory = options.codexHome ?? codexHomeFor(home);
    sources.push({
      agent: "codex",
      directory,
      files: await readCodex(directory, after, c),
    });
  }
  const repos = new Map<string, string>();
  const only = options.project ? resolve(options.project) : null;
  const totals = blank();
  const days = new Map<string, Tokens>();
  const models = new Map<string, Tokens>();
  const projects = new Map<string, Tokens>();
  const agents = new Map<string, Tokens>();
  const sessions = new Map<
    string,
    Omit<SessionUsage, "cacheHitRate"> & { models: Map<string, number> }
  >();
  const unpriced = new Set<string>();
  const kept: Row[] = [];
  for (const row of c.rows) {
    if ((since && row.day < since) || row.day > until) continue;
    const project =
      row.cwd === "(unknown)" ? row.cwd : repoRoot(row.cwd, repos);
    if (only && project !== only) continue;
    kept.push(row);
    add(totals, row.s);
    if (row.s.unpricedTokens) unpriced.add(row.model);
    bump(days, row.day, row.s);
    bump(models, row.model, row.s);
    bump(projects, project, row.s);
    bump(agents, row.agent, row.s);
    const key = `${row.agent}:${row.session}`;
    let entry = sessions.get(key);
    if (!entry) {
      entry = {
        ...blank(),
        session: row.session,
        agent: row.agent,
        project,
        model: row.model,
        first: row.day,
        last: row.day,
        models: new Map(),
      };
      sessions.set(key, entry);
    }
    add(entry, row.s);
    entry.models.set(
      row.model,
      (entry.models.get(row.model) ?? 0) + row.s.tokens,
    );
    if (row.day < entry.first) entry.first = row.day;
    if (row.day > entry.last) entry.last = row.day;
  }
  // A skill's tokens run from its Skill call to the next user prompt.
  const skills = new Map<string, SkillUsage>();
  const bySession = new Map<string, Row[]>();
  for (const row of kept.filter((r) => r.agent === "claude-code"))
    (
      bySession.get(row.session) ??
      bySession.set(row.session, []).get(row.session)!
    ).push(row);
  for (const [session, marks] of c.marks) {
    const inWindow = marks.filter((m) => {
      const day = localDay(new Date(m.t));
      return !(since && day < since) && day <= until;
    });
    for (const m of inWindow)
      if (m.kind === "skill") {
        const s = skills.get(m.skill!) ?? {
          ...blank(),
          skill: m.skill!,
          calls: 0,
        };
        s.calls++;
        skills.set(m.skill!, s);
      }
    const rows = (bySession.get(session) ?? []).sort((a, b) => a.t - b.t);
    const ordered = [...marks].sort((a, b) => a.t - b.t);
    let i = 0;
    let active: string | null = null;
    for (const row of rows) {
      for (; i < ordered.length && ordered[i]!.t < row.t; i++)
        active = ordered[i]!.kind === "skill" ? ordered[i]!.skill! : null;
      if (active)
        add(
          skills.get(active) ??
            skills
              .set(active, { ...blank(), skill: active, calls: 0 })
              .get(active)!,
          row.s,
        );
    }
  }
  const sessionRows: SessionUsage[] = [...sessions.values()]
    .map(({ models: used, ...s }) => ({
      ...s,
      model: [...used].sort((a, b) => b[1] - a[1])[0]?.[0] ?? s.model,
      cacheHitRate: hitRate(s),
    }))
    .sort((a, b) => b.tokens - a.tokens);
  const sessionIds = new Set([...sessions.values()].map((s) => s.session));
  for (const id of c.sessionsWithTools) sessionIds.add(id);
  return {
    window: { since, until },
    totals,
    cacheHitRate: hitRate(totals),
    costEstimate: {
      usd: totals.cost,
      complete: unpriced.size === 0,
      unpricedModels: [...unpriced].sort(),
      prices: priceSource,
    },
    byAgent: ranked(agents, "agent") as UsageReport["byAgent"],
    byDay: ranked(days, "day").sort((a, b) => (a.day < b.day ? -1 : 1)),
    byModel: ranked(models, "model"),
    byProject: ranked(projects, "project"),
    bySession: sessionRows.slice(0, options.sessionLimit ?? 50),
    bySkill: [...skills.values()].sort(
      (a, b) => b.tokens - a.tokens || b.calls - a.calls,
    ),
    invocations: c.invocations,
    sessions: sessionIds.size,
    files: c.files,
    lines: c.lines,
    invalidLines: c.invalidLines,
    sources,
  };
}

/** Usage plus the skill utilisation the doctor and prune rely on. */
export interface Usage extends UsageReport {
  skillsUsed: number;
  skillsInstalled: number;
  utilization: number;
  /** Installed skills with no observed call; empty when nothing was read. */
  prune: string[];
}

export function skillUtilization(
  report: UsageReport,
  resources: Resource[],
): Usage {
  const called = new Set(
    Object.keys(report.invocations)
      .filter((k) => k.startsWith("skill:"))
      .flatMap((k) => {
        const name = k.slice("skill:".length);
        // A plugin skill is called as plugin:name.
        return [name, name.split(":").at(-1)!];
      }),
  );
  const skills = resources.filter((r) => r.type === "skill");
  const unused = skills.filter(
    (r) => !called.has(r.name) && !report.invocations[r.id],
  );
  return {
    ...report,
    skillsUsed: skills.length - unused.length,
    skillsInstalled: skills.length,
    utilization: skills.length
      ? (skills.length - unused.length) / skills.length
      : 0,
    prune: report.sessions ? unused.map((r) => r.id) : [],
  };
}

/**
 * Observed usage of the installed resources. `directory` is the Claude Code
 * transcript folder (kept for the existing `--transcripts` option).
 */
export async function measureUsage(
  directory: string,
  resources: Resource[],
  options: UsageOptions = {},
): Promise<Usage> {
  return skillUtilization(
    await readUsage({
      // Without a home or Codex folder, only the given Claude folder is read.
      agent:
        options.agent ??
        (options.home || options.codexHome ? "all" : "claude-code"),
      ...options,
      claudeDir: directory,
    }),
    resources,
  );
}
