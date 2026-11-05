import { readdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { secretPaths, type Resource } from "./schema.js";
import { buildContextReport, listingTokens } from "./context-map.js";
export type Severity = "info" | "warning" | "error";
/**
 * One doctor result. `code` is stable and documented; `explanation`, `fix`
 * and `tokens` are filled for the checks that know them.
 */
export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  resourceId?: string;
  /** Why this matters, in one or two sentences. */
  explanation?: string;
  /** The smallest change that resolves it. */
  fix?: string;
  /** Estimated tokens per session it costs, or recovers when fixed. */
  tokens?: number;
  /** The file it is about, when there is one. */
  path?: string;
}
export function analyze(resources: Resource[]): Finding[] {
  const findings: Finding[] = [];
  const descriptions = new Map<string, string>();
  for (const r of resources) {
    const add = (
      code: string,
      severity: Finding["severity"],
      message: string,
    ) => findings.push({ code, severity, message, resourceId: r.id });
    if (secretPaths(r.config).length)
      add(
        "secret",
        "error",
        "Possible literal credential; use environment references.",
      );
    const serialized = JSON.stringify(r.config);
    if (
      /Bash\(\*\)|"\*"|bypassPermissions|dangerouslySkipPermissions/.test(
        serialized,
      )
    )
      add(
        "broad-permissions",
        "warning",
        "Broad execution permissions; denied file reads may still be reachable through shell.",
      );
    if (r.type === "skill") {
      const trigger = r.description.toLowerCase().trim();
      if (trigger && descriptions.has(trigger))
        add(
          "trigger-conflict",
          "warning",
          `Same description as ${descriptions.get(trigger)}`,
        );
      if (trigger) descriptions.set(trigger, r.id);
      // Same estimate as the context map, so the two views never disagree.
      const [entry] = buildContextReport([r]).entries;
      const tokens = entry
        ? entry.catalogueTokens + (entry.bodyTokens ?? 0)
        : 0;
      add(
        "context-estimate",
        "info",
        `Approximately ${tokens} tokens if loaded (character estimate, not tokenizer output).`,
      );
    }
    if (r.type === "plugin" && r.enabled)
      add(
        "plugin-unverified",
        "info",
        "Plugin is enabled in settings; use the native plugin installer to install its package.",
      );
    if (r.type === "mcp") {
      if (!r.config.command && !r.config.url)
        add("mcp-unwired", "error", "MCP server has neither command nor URL.");
      else
        add(
          "mcp-unverified",
          "info",
          "Configured; connection not tested. Running a server requires explicit verification.",
        );
    }
    if (r.type === "hook" && !r.config.entry && !r.config.hooks)
      add("hook-unwired", "error", "Hook has no executable entries.");
  }
  if (!resources.some((r) => r.type === "hook" && r.enabled))
    findings.push({
      code: "no-hooks",
      severity: "warning",
      message:
        "No hooks detected. Review whether blocking safeguards are needed.",
    });
  return findings;
}
export interface Usage {
  sessions: number;
  invocations: Record<string, number>;
  invalidLines: number;
  skillsUsed: number;
  skillsInstalled: number;
  utilization: number;
  prune: string[];
}
export async function measureUsage(
  directory: string,
  resources: Resource[],
): Promise<Usage> {
  const invocations: Record<string, number> = {};
  let sessions = 0,
    invalidLines = 0;
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        sessions++;
        const lines = createInterface({
          input: createReadStream(path),
          crlfDelay: Infinity,
        });
        for await (const line of lines) {
          if (!line.trim()) continue;
          try {
            visit(JSON.parse(line));
          } catch {
            invalidLines++;
          }
        }
      }
    }
  }
  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    if (obj.type === "tool_use" && typeof obj.name === "string") {
      const input = obj.input as Record<string, unknown> | undefined;
      const key =
        obj.name === "Skill" && typeof input?.skill === "string"
          ? `skill:${input.skill}`
          : obj.name;
      invocations[key] = (invocations[key] ?? 0) + 1;
    }
    Object.values(obj).forEach(visit);
  }
  await walk(directory);
  const skills = resources.filter((r) => r.type === "skill");
  const unused = skills.filter(
    (r) => !invocations[`skill:${r.name}`] && !invocations[r.id],
  );
  return {
    sessions,
    invocations,
    invalidLines,
    skillsUsed: skills.length - unused.length,
    skillsInstalled: skills.length,
    utilization: skills.length
      ? (skills.length - unused.length) / skills.length
      : 0,
    prune: sessions ? unused.map((r) => r.id) : [],
  };
}

export function analyzeSettings(input: unknown, path: string): Finding[] {
  const findings: Finding[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Expected settings object");
  const settings = input as Record<string, unknown>;
  const permissions = (settings.permissions ?? {}) as Record<string, unknown>;
  const allow = Array.isArray(permissions.allow)
    ? permissions.allow.filter(
        (rule): rule is string => typeof rule === "string",
      )
    : [];
  const deny = Array.isArray(permissions.deny)
    ? permissions.deny.filter(
        (rule): rule is string => typeof rule === "string",
      )
    : [];
  if (
    deny.some((rule) => /^Read(?:\(|$)/.test(rule)) &&
    allow.some((rule) => /^Bash(?:\(|$)/.test(rule))
  )
    findings.push({
      code: "shell-read-bypass",
      severity: "warning",
      message: `${path}: Read denials do not necessarily prevent permitted shell commands from reading the same files.`,
    });
  if (
    allow.some((rule) => ["*", "Bash", "Bash(*)"].includes(rule)) ||
    permissions.defaultMode === "bypassPermissions"
  )
    findings.push({
      code: "settings-broad-permissions",
      severity: "warning",
      message: `${path}: broad execution permissions are configured.`,
    });
  for (const location of secretPaths(settings))
    findings.push({
      code: "settings-secret",
      severity: "error",
      message: `${path}: possible credential at ${location}; use an environment reference.`,
    });
  findings.push(...effortFindings(settings, path));
  return findings;
}

/** Stable finding codes with a title and the reason they matter. */
export const findingCatalog: Record<
  string,
  { title: string; explanation: string }
> = {
  secret: {
    title: "Literal credential",
    explanation: "A credential in configuration is copied, shared and logged with it.",
  },
  "broad-permissions": {
    title: "Broad permissions",
    explanation: "The agent may run any command without asking.",
  },
  "trigger-conflict": {
    title: "Identical skill descriptions",
    explanation: "Two skills with the same description compete for the same requests.",
  },
  "context-estimate": {
    title: "Context estimate",
    explanation: "Character estimate of the skill's listing and body (characters / 4).",
  },
  "plugin-unverified": {
    title: "Plugin not verified",
    explanation: "Preflight sees the setting, not the installed package.",
  },
  "mcp-unwired": {
    title: "MCP server not wired",
    explanation: "Without a command or URL the server cannot start.",
  },
  "mcp-unverified": {
    title: "MCP server not tested",
    explanation: "The static doctor never starts a server; use --connect to test it.",
  },
  "mcp-connected": { title: "MCP server connected", explanation: "The server answered and listed its tools." },
  "mcp-unreachable": { title: "MCP server unreachable", explanation: "The server did not start or answer." },
  "hook-unwired": { title: "Hook not wired", explanation: "The hook has no command to run." },
  "no-hooks": {
    title: "No hooks",
    explanation: "Hooks are the only deterministic safeguards; instructions can be ignored.",
  },
  "shell-read-bypass": {
    title: "Read denial bypass",
    explanation: "A denied Read can still happen through an allowed shell command.",
  },
  "settings-broad-permissions": {
    title: "Broad permissions in settings",
    explanation: "The agent may run any command without asking.",
  },
  "settings-secret": {
    title: "Credential in settings",
    explanation: "Settings files are often committed or shared.",
  },
  "settings-invalid": { title: "Unreadable settings", explanation: "The file does not parse; the agent may ignore it." },
  "doctor-config-invalid": {
    title: "Invalid doctor thresholds",
    explanation: "The defaults are used instead of the invalid values.",
  },
  drift: { title: "Managed file changed", explanation: "A file Preflight wrote was edited outside Preflight." },
  "adapter-unavailable": { title: "Agent unreadable", explanation: "Preflight could not read this agent's files." },
  "broken-resource": { title: "Broken resource", explanation: "A resource file is missing or does not parse." },
  "unused-context": {
    title: "Unused context",
    explanation:
      "Listed on every session but not invoked in the measured window. Its listing tokens are paid each time and buy nothing.",
  },
  "effort-default-high": {
    title: "High default effort",
    explanation:
      "Every prompt, even a lookup, runs with a large reasoning budget. This is slower and costs more; raise effort for the hard task instead.",
  },
  "agent-no-model": {
    title: "Subagent without model",
    explanation:
      "Without `model:` the subagent runs on the default subagent model, usually the main session model. Search and lookups rarely need it.",
  },
  "subagent-model-advice": {
    title: "Subagent models",
    explanation:
      "Built-in Explore runs on a small model; general-purpose and Plan inherit the main model. Pin a model in your own agents and delegations.",
  },
  "mcp-global-single-project": {
    title: "Global MCP server used by one project",
    explanation:
      "A user-scope server starts in every session of every project. Project scope keeps its tools out of the others.",
  },
  "mcp-processes": {
    title: "MCP processes",
    explanation:
      "Each Claude Code session starts its own stdio MCP servers. Their memory adds up with open sessions.",
  },
  "claude-md-long": {
    title: "Long instructions file",
    explanation:
      "The whole file, with its imports, is loaded on every session. Long files cost tokens and dilute the rules that matter.",
  },
  "claude-md-broken-import": {
    title: "Broken @import",
    explanation:
      "The imported file does not exist, so its rules are silently missing.",
  },
  "claude-md-duplicates-skill": {
    title: "Instructions repeat a skill",
    explanation:
      "The same text is paid twice: always in the instructions, and again when the skill loads.",
  },
  "claude-md-secret": {
    title: "Credential in instructions",
    explanation:
      "Instructions are sent to the model on every session and are often shared. A literal credential there leaks.",
  },
  "skill-cluster": {
    title: "Overlapping skills",
    explanation:
      "Skills with near-identical descriptions compete for the same requests, and each costs a listing line.",
  },
  "skill-count": {
    title: "Global skill count",
    explanation:
      "Every model-invocable global skill adds a listing line to every session. A set of 60-80 keeps the listing useful.",
  },
  "startup-injection": {
    title: "Hook injects context",
    explanation:
      "Output of SessionStart, UserPromptSubmit, SubagentStart and PreCompact hooks goes into the context.",
  },
  "startup-injection-large": {
    title: "Large hook output",
    explanation:
      "A SessionStart hook printed more than the budget; that text opens every session.",
  },
  "startup-injection-total": {
    title: "Large startup output",
    explanation:
      "All SessionStart hooks together printed more than the budget.",
  },
  "hook-failed": {
    title: "Hook failed",
    explanation: "A measured SessionStart hook exited with an error or timed out.",
  },
  "hook-duplicate": {
    title: "Duplicated hook",
    explanation: "The same command is listed several times and runs each time.",
  },
  "plugins-many": {
    title: "Many plugins",
    explanation:
      "Each enabled plugin can add skills, agents, hooks and MCP servers to every session.",
  },
  "mcp-many": {
    title: "Many MCP servers",
    explanation:
      "Each user-level server adds its tool definitions to every session and may start a process.",
  },
  "cache-model-switch": {
    title: "Model switched mid-session",
    explanation:
      "The prompt cache is per model. A switch re-sends the whole conversation uncached.",
  },
  "cache-ttl-gap": {
    title: "Prompt cache expired between prompts",
    explanation:
      "After the cache lifetime (5 minutes by default) the next prompt rewrites the whole cached prefix.",
  },
  "cache-variable-prompt-hook": {
    title: "Variable UserPromptSubmit output",
    explanation:
      "A hook adds different text on every prompt. It is never reused from the cache and adds fresh input each turn.",
  },
};
export const findingTitle = (code: string) =>
  findingCatalog[code]?.title ??
  code.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

const filePath = (r: Resource) =>
  r.source.startsWith("file://") ? r.source.slice("file://".length) : undefined;

const stopwords = new Set(
  (
    "a an and are as at be by can do does for from has have how i if in into is it its me my of on or our that the their them then there these this to use used uses using via was we what when where which while who why will with you your skill skills user users asks ask asked wants want need needs task tasks trigger triggers triggered also any all about should must"
  ).split(" "),
);
/** Lower-case description words without stopwords, lightly stemmed. */
export function descriptionTokens(text: string) {
  return new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
      .filter((w) => w.length > 2 && !stopwords.has(w))
      .map((w) =>
        w.length > 5
          ? w.replace(/(?:ing|ed|es|s)$/, "")
          : w.length > 3
            ? w.replace(/s$/, "")
            : w,
      ),
  );
}
export function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size && !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Model-invocable skills whose descriptions overlap, grouped by connected
 * components of the "similarity >= threshold" graph, per agent.
 */
export function skillClusters(
  resources: Resource[],
  threshold: number,
  invocations: Record<string, number> = {},
): Finding[] {
  const findings: Finding[] = [];
  const skills = resources.filter(
    (r) => r.type === "skill" && r.enabled && modelInvocableSkill(r),
  );
  for (const harness of ["claude-code", "cursor"] as const) {
    const list = skills
      .filter((r) => r.harnesses.includes(harness))
      .map((r) => ({ r, words: descriptionTokens(r.description) }))
      .filter((s) => s.words.size >= 3);
    const parent = list.map((_, i) => i);
    const find = (i: number): number =>
      parent[i] === i ? i : (parent[i] = find(parent[i]!));
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (jaccard(list[i]!.words, list[j]!.words) >= threshold)
          parent[find(i)] = find(j);
    const groups = new Map<number, Resource[]>();
    list.forEach((s, i) =>
      groups.set(find(i), [...(groups.get(find(i)) ?? []), s.r]),
    );
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const used = (r: Resource) => invocations[`skill:${r.name}`] ?? 0;
      const sorted = [...group].sort(
        (a, b) => used(b) - used(a) || a.name.localeCompare(b.name),
      );
      const [keep, ...others] = sorted as [Resource, ...Resource[]];
      findings.push({
        code: "skill-cluster",
        severity: "warning",
        message: `${group.length} ${harness} skills overlap: ${sorted.map((r) => r.name).join(", ")}.`,
        resourceId: keep.id,
        explanation: findingCatalog["skill-cluster"]!.explanation,
        fix: `Keep ${keep.name}; add \`disable-model-invocation: true\` to the frontmatter of ${others.map((r) => r.name).join(", ")} (they stay callable by name).`,
        tokens: others.reduce((sum, r) => sum + listingTokens(r), 0),
      });
    }
  }
  return findings;
}
const modelInvocableSkill = (r: Resource) => listingTokens(r) > 0;

/** Count of listed global skills against the configured target range. */
export function skillCount(
  resources: Resource[],
  target: { min: number; max: number },
): Finding[] {
  const global = resources.filter(
    (r) =>
      r.type === "skill" &&
      r.enabled &&
      r.scope === "global" &&
      modelInvocableSkill(r),
  );
  const tokens = global.reduce((sum, r) => sum + listingTokens(r), 0);
  const over = global.length > target.max;
  return [
    {
      code: "skill-count",
      severity: over ? "warning" : "info",
      message: `${global.length} model-invocable global skills; the target is ${target.min}-${target.max}.`,
      explanation: findingCatalog["skill-count"]!.explanation,
      tokens,
      ...(over
        ? {
            fix: `Set \`disable-model-invocation: true\` on ${global.length - target.max} rarely used skills, or move project-specific ones into their project.`,
          }
        : {}),
    },
  ];
}

const searchAgent = /explor|search|scout|find|lookup|look up|research|grep|locat/i;
/** Custom subagents without a pinned model, plus the built-in advice. */
export function agentModels(resources: Resource[]): Finding[] {
  const agents = resources.filter((r) => r.type === "subagent" && r.enabled);
  const unpinned = agents.filter(
    (r) => typeof r.config.model !== "string" || !r.config.model.trim(),
  );
  const findings: Finding[] = unpinned.map((r) => {
    const path = filePath(r);
    const model = searchAgent.test(`${r.name} ${r.description}`)
      ? "haiku"
      : "sonnet";
    return {
      code: "agent-no-model",
      severity: "warning",
      message: `Subagent ${r.name} has no \`model:\` in its frontmatter.`,
      resourceId: r.id,
      explanation: findingCatalog["agent-no-model"]!.explanation,
      fix: `Add \`model: ${model}\` to the frontmatter${path ? ` of ${path}` : ""} (haiku for search and lookups, sonnet for implementation, inherit only when it needs the main model).`,
      ...(path ? { path } : {}),
    };
  });
  if (unpinned.length || !agents.length)
    findings.push({
      code: "subagent-model-advice",
      severity: "info",
      message:
        "Built-in Explore uses a small model; general-purpose and Plan inherit the main session model.",
      explanation: findingCatalog["subagent-model-advice"]!.explanation,
      fix: 'Ask for the model in the delegation ("use a haiku subagent to find …"), or define agents in ~/.claude/agents/*.md with `model: haiku` or `model: sonnet`.',
    });
  return findings;
}

/** `effortLevel` set to xhigh or max as the default. */
export function effortFindings(input: unknown, path: string): Finding[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const settings = input as Record<string, unknown>;
  const env = (settings.env ?? {}) as Record<string, unknown>;
  const level = [settings.effortLevel, env.CLAUDE_CODE_EFFORT_LEVEL].find(
    (v): v is string => typeof v === "string",
  );
  if (!level || !["xhigh", "max"].includes(level.toLowerCase())) return [];
  return [
    {
      code: "effort-default-high",
      severity: "warning",
      message: `${path}: default effort is ${level}.`,
      explanation: findingCatalog["effort-default-high"]!.explanation,
      fix: `Set "effortLevel": "high" (or remove it) in ${path}; use /effort ${level} or "ultrathink" for the task that needs it.`,
      path,
    },
  ];
}

/** What the unused-context check needs from usage measurement (a `Usage` fits). */
export type UsageCounts = Pick<Usage, "sessions" | "invocations">;
/** Claude Code writes `mcp__<server>__<tool>` with unsafe characters replaced. */
export const mcpToolPrefix = (server: string) =>
  `mcp__${server.replace(/[^a-zA-Z0-9_-]/g, "_")}__`;
/** Whether a resource appears in the observed invocations. */
export function wasUsed(r: Resource, invocations: Record<string, number>) {
  const keys = Object.keys(invocations).filter((k) => invocations[k]! > 0);
  switch (r.type) {
    case "skill":
    case "command":
      return keys.some(
        (k) => k === `skill:${r.name}` || k.endsWith(`:${r.name}`) || k === r.id,
      );
    case "subagent":
      return keys.some(
        (k) => k === `agent:${r.name}` || k.endsWith(`:${r.name}`),
      );
    case "mcp": {
      const prefix = mcpToolPrefix(r.name);
      return keys.some((k) => k.startsWith(prefix));
    }
    case "plugin": {
      const name = r.name.split("@")[0]!;
      const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_");
      return keys.some(
        (k) =>
          k === `plugin:${name}` ||
          k.startsWith(`skill:${name}:`) ||
          k.startsWith(`agent:${name}:`) ||
          k.startsWith(`mcp__plugin_${safe}_`),
      );
    }
    default:
      return true;
  }
}
/**
 * Resources listed every session but not used in the measured window, with
 * the tokens recoverable per session when known (context-map estimates;
 * plugin totals come from `pluginTokens`).
 */
export function unusedContext(
  resources: Resource[],
  usage: UsageCounts,
  days: number,
  pluginTokens: Record<string, number> = {},
): Finding[] {
  if (!usage.sessions) return [];
  const findings: Finding[] = [];
  for (const r of resources) {
    if (!r.enabled || !["skill", "subagent", "mcp", "plugin"].includes(r.type))
      continue;
    if ((r.type === "skill" || r.type === "subagent") && !listingTokens(r))
      continue;
    if (wasUsed(r, usage.invocations)) continue;
    const tokens =
      r.type === "plugin"
        ? pluginTokens[r.name]
        : r.type === "mcp"
          ? undefined
          : listingTokens(r);
    const path = filePath(r);
    const fix =
      r.type === "skill"
        ? `Add \`disable-model-invocation: true\` to its frontmatter${path ? ` (${path})` : ""}; it stays callable as /${r.name}. Or remove it.`
        : r.type === "subagent"
          ? `Move ${path ?? r.name} out of the agents folder, or delete it.`
          : r.type === "plugin"
            ? `claude plugin disable ${r.name}`
            : r.scope === "global"
              ? `claude mcp remove ${r.name} -s user`
              : `Remove "${r.name}" from ${path ?? ".mcp.json"}.`;
    findings.push({
      code: "unused-context",
      severity: "warning",
      message: `${r.type === "subagent" ? "Agent" : r.type === "mcp" ? "MCP server" : r.type === "plugin" ? "Plugin" : "Skill"} ${r.name} was not used in the last ${days} days (${usage.sessions} session${usage.sessions === 1 ? "" : "s"}).${r.type === "mcp" ? " Tool definitions are not measured locally." : ""}`,
      resourceId: r.id,
      explanation: findingCatalog["unused-context"]!.explanation,
      fix,
      ...(tokens !== undefined ? { tokens } : {}),
      ...(path ? { path } : {}),
    });
  }
  return findings.sort((a, b) => (b.tokens ?? -1) - (a.tokens ?? -1));
}
