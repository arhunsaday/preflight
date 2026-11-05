import { readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { findingCatalog, type Finding, type UsageCounts } from "./analysis.js";

/**
 * What the doctor reads from session transcripts, for one time window.
 *
 * `sessions` and `invocations` have the shape of `Usage` from
 * `measureUsage`, so a more precise usage engine can fill them instead:
 * keys are `skill:<name>`, `agent:<subagent_type>` and raw tool names such as
 * `mcp__<server>__<tool>`.
 */
export interface UsageEvidence extends UsageCounts {
  days: number;
  since: string;
  /** Invocation keys per project directory (the session's `cwd`). */
  byProject: Record<string, Record<string, number>>;
  /** Per-session signals for the prompt cache heuristics. */
  sessionSignals: SessionSignal[];
  invalidLines: number;
}
export interface SessionSignal {
  session: string;
  project: string | null;
  models: string[];
  modelSwitches: number;
  /** User prompts sent after more than the cache gap since the last reply. */
  longGaps: number;
  prompts: number;
  /** Distinct UserPromptSubmit hook outputs, and how many were seen. */
  promptHookOutputs: number;
  promptHookVariants: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
}

const text = (value: unknown): string =>
  typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value.map(text).join("\n")
      : value && typeof value === "object"
        ? text(
            (value as Record<string, unknown>).text ??
              (value as Record<string, unknown>).content ??
              "",
          )
        : "";
const hookTag =
  /<user-prompt-submit-hook>([\s\S]*?)<\/user-prompt-submit-hook>/g;
const commandTag = /<command-name>\/?([^<\s]+)<\/command-name>/g;

/**
 * Stream every `.jsonl` transcript under `directory` modified in the last
 * `days` days. Lines with a timestamp before the window are ignored. A
 * missing directory gives an empty result, never an error.
 */
export async function collectUsageEvidence(
  directory: string,
  options: { days: number; gapMinutes: number; now?: Date },
): Promise<UsageEvidence> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - options.days * 86400000);
  const gap = options.gapMinutes * 60000;
  const invocations: Record<string, number> = {};
  const byProject: Record<string, Record<string, number>> = {};
  const signals = new Map<string, SessionSignal & { hooks: Set<string> }>();
  let invalidLines = 0;
  const count = (key: string, project: string | null) => {
    invocations[key] = (invocations[key] ?? 0) + 1;
    if (project) {
      const bucket = (byProject[project] ??= {});
      bucket[key] = (bucket[key] ?? 0) + 1;
    }
  };
  async function file(path: string, fallback: string) {
    const seenUsage = new Map<string, number[]>();
    let lastModel: string | null = null;
    let lastReply = 0;
    const lines = createInterface({
      input: createReadStream(path),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      if (!line.trim()) continue;
      let row: Record<string, unknown>;
      try {
        row = JSON.parse(line);
      } catch {
        invalidLines++;
        continue;
      }
      if (!row || typeof row !== "object") continue;
      const at = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
      if (Number.isFinite(at) && at < since.getTime()) continue;
      const id = typeof row.sessionId === "string" ? row.sessionId : fallback;
      let signal = signals.get(id);
      if (!signal) {
        signal = {
          session: id,
          project: null,
          models: [],
          modelSwitches: 0,
          longGaps: 0,
          prompts: 0,
          promptHookOutputs: 0,
          promptHookVariants: 0,
          input: 0,
          cacheRead: 0,
          cacheWrite: 0,
          hooks: new Set(),
        };
        signals.set(id, signal);
      }
      if (!signal.project && typeof row.cwd === "string")
        signal.project = row.cwd;
      const project = signal.project;
      const message = (row.message ?? {}) as Record<string, unknown>;
      const content = Array.isArray(message.content) ? message.content : [];
      const hook = (output: string) => {
        signal!.promptHookOutputs++;
        signal!.hooks.add(createHash("sha1").update(output).digest("hex"));
      };
      // UserPromptSubmit output: a hook attachment, or the legacy tag.
      const attachment = row.attachment as Record<string, unknown> | undefined;
      const event = [
        row.hookEvent,
        row.hookEventName,
        attachment?.hookEvent,
        attachment?.hookEventName,
        attachment?.hookName,
      ].find((v) => typeof v === "string") as string | undefined;
      if (event && /UserPromptSubmit/.test(event))
        hook(text(attachment?.content ?? row.content ?? attachment ?? ""));
      // A subagent writes into its parent's session; its model and timing
      // are not the main conversation's cache.
      const main = row.isSidechain !== true;
      if (row.type === "assistant") {
        const model = typeof message.model === "string" ? message.model : "";
        if (main && model && model !== "<synthetic>") {
          if (!signal.models.includes(model)) signal.models.push(model);
          if (lastModel && lastModel !== model) signal.modelSwitches++;
          lastModel = model;
        }
        if (main && Number.isFinite(at)) lastReply = at;
        const usage = message.usage as Record<string, unknown> | undefined;
        if (main && usage) {
          // Streaming writes one line per block; count a request once.
          const key = `${String(message.id ?? "")}:${String(row.requestId ?? "")}`;
          const values = [
            Number(usage.input_tokens) || 0,
            Number(usage.cache_read_input_tokens) || 0,
            Number(usage.cache_creation_input_tokens) || 0,
          ];
          const previous = seenUsage.get(key);
          if (key === ":" || !previous) {
            if (key !== ":") seenUsage.set(key, values);
            signal.input += values[0]!;
            signal.cacheRead += values[1]!;
            signal.cacheWrite += values[2]!;
          }
        }
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          const item = block as Record<string, unknown>;
          if (item.type !== "tool_use" || typeof item.name !== "string") continue;
          const input = (item.input ?? {}) as Record<string, unknown>;
          if (item.name === "Skill" && typeof input.skill === "string")
            count(`skill:${input.skill}`, project);
          else if (
            (item.name === "Task" || item.name === "Agent") &&
            typeof input.subagent_type === "string"
          ) {
            count(`agent:${input.subagent_type}`, project);
            count(item.name, project);
          } else count(item.name, project);
        }
      } else if (row.type === "user" && !row.isMeta) {
        const body = typeof message.content === "string" ? message.content : text(content);
        for (const match of body.matchAll(commandTag))
          count(`skill:${match[1]}`, project);
        for (const match of body.matchAll(hookTag)) hook(match[1]!);
        const isPrompt =
          typeof message.content === "string" ||
          (content.length > 0 &&
            content.every(
              (b) =>
                b && typeof b === "object" &&
                (b as Record<string, unknown>).type !== "tool_result",
            ));
        if (main && isPrompt) {
          signal.prompts++;
          if (lastReply && Number.isFinite(at) && at - lastReply > gap)
            signal.longGaps++;
        }
      }
    }
  }
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (["ENOENT", "ENOTDIR"].includes(String((e as NodeJS.ErrnoException).code)))
        return;
      throw e;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        if ((await stat(path)).mtime < since) continue;
        await file(path, path);
      }
    }
  }
  await walk(directory);
  const sessionSignals = [...signals.values()]
    .filter((s) => s.models.length || s.prompts)
    .map(({ hooks, ...rest }) => ({ ...rest, promptHookVariants: hooks.size }));
  return {
    days: options.days,
    since: since.toISOString(),
    sessions: sessionSignals.length,
    invocations,
    byProject,
    sessionSignals,
    invalidLines,
  };
}

/**
 * Prompt cache heuristics from session signals. Returns nothing when no
 * session was observed: no transcripts means no claim either way.
 */
export function cacheFindings(
  evidence: UsageEvidence,
  gapMinutes: number,
): Finding[] {
  const sessions = evidence.sessionSignals;
  if (!sessions.length) return [];
  const findings: Finding[] = [];
  const read = sessions.reduce((t, s) => t + s.cacheRead, 0);
  const total = sessions.reduce(
    (t, s) => t + s.input + s.cacheRead + s.cacheWrite,
    0,
  );
  const rate = total ? ` Cache hit rate over the window: ${Math.round((read / total) * 100)}%.` : "";
  const switched = sessions.filter((s) => s.modelSwitches > 0);
  if (switched.length)
    findings.push({
      code: "cache-model-switch",
      severity: switched.length / sessions.length > 0.2 ? "warning" : "info",
      message: `${switched.length} of ${sessions.length} sessions in the last ${evidence.days} days switched model mid-session (${switched.reduce((t, s) => t + s.modelSwitches, 0)} switches).${rate}`,
      explanation: findingCatalog["cache-model-switch"]!.explanation,
      fix: "Choose the model at the start of a session; delegate a different-model step to a subagent instead of /model.",
    });
  const gaps = sessions.reduce((t, s) => t + s.longGaps, 0);
  const prompts = sessions.reduce((t, s) => t + s.prompts, 0);
  if (gaps)
    findings.push({
      code: "cache-ttl-gap",
      severity: prompts && gaps / prompts > 0.25 ? "warning" : "info",
      message: `${gaps} of ${prompts} prompts came more than ${gapMinutes} minutes after the previous reply, so the cached prefix had expired.${rate}`,
      explanation: findingCatalog["cache-ttl-gap"]!.explanation,
      fix: "Batch follow-up prompts, or start a new session (/clear) after a long break instead of continuing a large one.",
    });
  const variable = sessions.filter(
    (s) => s.promptHookOutputs >= 2 && s.promptHookVariants > 1,
  );
  if (variable.length)
    findings.push({
      code: "cache-variable-prompt-hook",
      severity: "info",
      message: `In ${variable.length} sessions a UserPromptSubmit hook added different text to each prompt.`,
      explanation: findingCatalog["cache-variable-prompt-hook"]!.explanation,
      fix: "Make the hook print only when something changed, or move stable text to CLAUDE.md where it is cached.",
    });
  return findings;
}
