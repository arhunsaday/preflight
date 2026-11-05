/**
 * Result checklist for benchmark runs.
 * The questions come from the pstack "benchmark-checklist" skill
 * (cursor/plugins, MIT licence, see THIRD_PARTY_NOTICES.md). Preflight keeps
 * the checks that its own run data can answer.
 */
import { z } from "zod";
import type { BenchResult } from "./bench.js";

export const DEFAULT_MIN_RUNS = 3;
export const DEFAULT_MAX_CV = 0.25;

export const CheckStatus = z.enum(["pass", "warn", "fail"]);
export const Check = z.object({
  id: z.enum(["repetitions", "spread", "limiter", "task-done", "same-setup"]),
  label: z.string(),
  status: CheckStatus,
  message: z.string(),
});
export const Checklist = z.object({
  checks: z.array(Check),
  verdict: CheckStatus,
  publishable: z.boolean(),
  note: z.string().optional(),
});
export type Check = z.infer<typeof Check>;
export type Checklist = z.infer<typeof Checklist>;
export interface ChecklistOptions {
  minRuns?: number;
  maxCv?: number;
}
type Results = BenchResult["results"];

export const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
/** Coefficient of variation: standard deviation divided by the mean. */
export function cv(values: number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / mean;
}
/** Results grouped by repetition. Older files have no `run`: they count as one. */
export function groupRuns(results: Results): Results[] {
  const groups = new Map<number, Results>();
  for (const r of results) {
    const key = r.run ?? 1;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
}
export const runDurations = (results: Results) =>
  groupRuns(results).map((g) => g.reduce((s, r) => s + r.durationMs, 0));

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const worst = (statuses: Check["status"][]): Check["status"] =>
  statuses.includes("fail")
    ? "fail"
    : statuses.includes("warn")
      ? "warn"
      : "pass";

function sideChecks(
  run: BenchResult,
  prefix: string,
  options: Required<ChecklistOptions>,
): Check[] {
  const groups = groupRuns(run.results);
  const n = groups.length;
  const checks: Check[] = [];
  checks.push({
    id: "repetitions",
    label: "Enough repetitions",
    status: n >= options.minRuns ? "pass" : n >= 2 ? "warn" : "fail",
    message:
      n >= options.minRuns
        ? `${prefix}${n} runs, at least ${options.minRuns} needed.`
        : `${prefix}${n} run${n === 1 ? "" : "s"}; at least ${options.minRuns} needed.`,
  });
  const durations = runDurations(run.results);
  const spread = cv(durations);
  checks.push({
    id: "spread",
    label: "Spread between runs",
    status:
      spread === null
        ? "warn"
        : spread > options.maxCv * 2
          ? "fail"
          : spread > options.maxCv
            ? "warn"
            : "pass",
    message:
      spread === null
        ? `${prefix}Spread needs at least 2 runs.`
        : spread > options.maxCv
          ? `${prefix}Duration varies by ${pct(spread)} between runs (limit ${pct(options.maxCv)}); the result is noisy.`
          : `${prefix}Duration varies by ${pct(spread)} between runs (limit ${pct(options.maxCv)}).`,
  });
  const limited = run.results.filter((r) => r.limiter || r.exitCode === 124);
  const kinds = [...new Set(limited.map((r) => r.limiter ?? "timeout"))].join(
    ", ",
  );
  checks.push({
    id: "limiter",
    label: "No limit reached",
    status: limited.length ? "fail" : "pass",
    message: limited.length
      ? `${prefix}${limited.length} of ${run.results.length} task runs hit a limit (${kinds}); the agent did not finish freely.`
      : `${prefix}No run hit a budget, timeout or turn cap.`,
  });
  const done = run.results.filter((r) => r.verified ?? r.passed).length;
  const total = run.results.length;
  checks.push({
    id: "task-done",
    label: "Task done",
    status: done === total && total ? "pass" : done === 0 ? "fail" : "warn",
    message:
      done === total && total
        ? `${prefix}The success check passed in all ${total} task runs.`
        : done === 0
          ? `${prefix}The success check never passed; the timings measure work that did not finish.`
          : `${prefix}The success check passed in ${done} of ${total} task runs (${pct(done / total)}); compare success rate before time.`,
  });
  return checks;
}
/** Merge the same check from several sides into one row. */
function merge(rows: Check[][]): Check[] {
  const ids = rows[0]!.map((c) => c.id);
  return ids.map((id) => {
    const parts = rows.map((r) => r.find((c) => c.id === id)!);
    return {
      id,
      label: parts[0]!.label,
      status: worst(parts.map((p) => p.status)),
      message: parts.map((p) => p.message).join(" "),
    };
  });
}
const describeSettings = (s: NonNullable<BenchResult["settings"]>) =>
  `model ${s.model ?? "default"}, effort ${s.effort ?? "default"}, budget ${s.budget ?? "none"}`;
function sameSetup(a: BenchResult, b: BenchResult): Check {
  const sa = a.settings,
    sb = b.settings;
  const models = (r: BenchResult) =>
    [...new Set(r.results.map((t) => t.model).filter(Boolean))].sort();
  const ma = models(a),
    mb = models(b);
  const base = {
    id: "same-setup" as const,
    label: "Same model, effort and budget",
  };
  if (!sa || !sb)
    return {
      ...base,
      status: "warn",
      message:
        "Model, effort and budget were not recorded for both sides; run again with a current Preflight to record them.",
    };
  if (
    sa.model !== sb.model ||
    sa.effort !== sb.effort ||
    sa.budget !== sb.budget
  )
    return {
      ...base,
      status: "fail",
      message: `The sides differ: ${a.name} used ${describeSettings(sa)}; ${b.name} used ${describeSettings(sb)}.`,
    };
  if (ma.join() !== mb.join())
    return {
      ...base,
      status: "fail",
      message: `The agents reported different models: ${ma.join(", ") || "none"} and ${mb.join(", ") || "none"}.`,
    };
  return {
    ...base,
    status: "pass",
    message: `Both sides used ${describeSettings(sa)}.`,
  };
}
function finish(checks: Check[], compare: boolean): Checklist {
  const verdict = worst(checks.map((c) => c.status));
  const failing = checks.filter((c) => c.status === "fail");
  return {
    checks,
    verdict,
    publishable: verdict !== "fail",
    ...(failing.length
      ? {
          note: `${compare ? "Do not publish this result" : "Do not rely on this run"}: ${failing.map((c) => c.label.toLowerCase()).join("; ")}.`,
        }
      : {}),
  };
}
/** Checks for one run set (`bench run`). */
export function checklistFor(
  run: BenchResult,
  options: ChecklistOptions = {},
): Checklist {
  const o = resolve(options);
  return finish(sideChecks(run, "", o), false);
}
/** Checks for two sides (`bench compare`, `bench arena`). */
export function checklistCompare(
  left: BenchResult,
  right: BenchResult,
  options: ChecklistOptions = {},
): Checklist {
  const o = resolve(options);
  const checks = merge([
    sideChecks(left, `${left.name}: `, o),
    sideChecks(right, `${right.name}: `, o),
  ]);
  checks.push(sameSetup(left, right));
  return finish(checks, true);
}
function resolve(o: ChecklistOptions): Required<ChecklistOptions> {
  return {
    minRuns: o.minRuns ?? DEFAULT_MIN_RUNS,
    maxCv: o.maxCv ?? DEFAULT_MAX_CV,
  };
}
