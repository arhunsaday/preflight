import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { digest } from "./adapters.js";
import {
  Checklist,
  checklistCompare,
  cv,
  groupRuns,
  median,
  type ChecklistOptions,
} from "./bench-checklist.js";
import {
  BenchRun,
  fullSettings,
  runTasks,
  Settings,
  TaskSet,
  type BenchResult,
  type BenchSettings,
} from "./bench.js";
import { PreflightConfigSchema, type PreflightConfig } from "./schema.js";
import { applyFiles, jsonText, readText } from "./transaction.js";

export type Side = "left" | "right";
/** Run order: the first side swaps every round (A B, B A, A B, ...). */
export function arenaOrder(runs: number): Side[] {
  const order: Side[] = [];
  for (let i = 0; i < runs; i++)
    order.push(
      ...(i % 2 === 0
        ? (["left", "right"] as const)
        : (["right", "left"] as const)),
    );
  return order;
}
const Stat = z.object({
  median: z.number().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  cv: z.number().nullable(),
});
export type Stat = z.infer<typeof Stat>;
const stat = (values: number[]): Stat => ({
  median: median(values),
  min: values.length ? Math.min(...values) : null,
  max: values.length ? Math.max(...values) : null,
  cv: cv(values),
});
const SideReport = z.object({
  label: z.string(),
  configDigest: z.string(),
  runs: z.number(),
  successRate: z.number(),
  /** Per-run totals: duration in ms, tokens, cost in USD (null when unknown). */
  durationMs: Stat,
  tokens: Stat.nullable(),
  costUsd: Stat.nullable(),
});
export const ArenaReport = z.object({
  name: z.string(),
  task: z.string(),
  revision: z.string(),
  runs: z.number(),
  order: z.array(z.enum(["left", "right"])),
  settings: Settings,
  left: SideReport,
  right: SideReport,
  checklist: Checklist,
  winner: z.enum(["left", "right", "none"]),
  winnerLabel: z.string().nullable(),
  /** Why there is a winner, or why not. */
  verdict: z.string(),
  results: z.object({ left: BenchRun, right: BenchRun }),
});
export type ArenaReport = z.infer<typeof ArenaReport>;
export interface ArenaSide {
  label: string;
  config: PreflightConfig;
}
export interface ArenaOptions extends ChecklistOptions {
  name?: string;
  runs?: number;
  settings?: Partial<BenchSettings>;
  /** Replaces the real task run. Tests use it to avoid real agents. */
  runner?: (side: Side, run: number) => Promise<BenchResult["results"]>;
}
const total = (
  results: BenchResult["results"],
  pick: (r: BenchResult["results"][number]) => number | null,
) => {
  const groups = groupRuns(results).map((g) => {
    const values = g.map(pick);
    return values.every((v) => v !== null)
      ? values.reduce((s: number, v) => s + v!, 0)
      : null;
  });
  return groups.every((v) => v !== null) && groups.length
    ? (groups as number[])
    : null;
};
function sideReport(label: string, config: PreflightConfig, run: BenchResult) {
  const tokens = total(run.results, (r) => r.tokens);
  const cost = total(run.results, (r) => r.costUsd ?? null);
  return {
    label,
    configDigest: run.configDigest,
    runs: groupRuns(run.results).length,
    successRate: run.results.length
      ? run.results.filter((r) => r.verified ?? r.passed).length /
        run.results.length
      : 0,
    durationMs: stat(total(run.results, (r) => r.durationMs) ?? []),
    tokens: tokens ? stat(tokens) : null,
    costUsd: cost ? stat(cost) : null,
  };
}
/** Decide a winner. Only a checklist without a failing check can name one. */
export function decide(
  left: ReturnType<typeof sideReport>,
  right: ReturnType<typeof sideReport>,
  checklist: Checklist,
): { winner: Side | "none"; verdict: string } {
  if (!checklist.publishable)
    return {
      winner: "none",
      verdict: `No winner: ${checklist.note ?? "a check failed."}`,
    };
  if (left.successRate !== right.successRate) {
    const w = left.successRate > right.successRate ? "left" : "right";
    const [a, b] = w === "left" ? [left, right] : [right, left];
    return {
      winner: w,
      verdict: `${a.label} wins on success rate: ${(a.successRate * 100).toFixed(0)}% against ${(b.successRate * 100).toFixed(0)}%.`,
    };
  }
  const l = left.durationMs,
    r = right.durationMs;
  if (l.max !== null && r.max !== null && l.min !== null && r.min !== null) {
    if (l.max < r.min || r.max < l.min) {
      const w = l.max < r.min ? "left" : "right";
      const a = w === "left" ? left : right;
      return {
        winner: w,
        verdict: `${a.label} wins on duration: same success rate, and the run ranges do not overlap.`,
      };
    }
  }
  return {
    winner: "none",
    verdict:
      "No winner: success rate is equal and the duration ranges overlap.",
  };
}
export async function runArena(
  root: string,
  taskPath: string,
  left: ArenaSide,
  right: ArenaSide,
  dryRun = false,
  options: ArenaOptions = {},
): Promise<unknown> {
  const taskText = await readFile(taskPath, "utf8");
  const set = TaskSet.parse(JSON.parse(taskText));
  const runs = options.runs ?? 3;
  if (!Number.isInteger(runs) || runs < 1 || runs > 50)
    throw new Error("Runs must be a whole number from 1 to 50");
  if (left.label === right.label)
    throw new Error("Choose two different configurations");
  const name =
    options.name ??
    `${left.label}-vs-${right.label}`.replace(/[^a-z0-9_-]+/gi, "-");
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error("Invalid benchmark name");
  const settings = fullSettings(options.settings);
  const configs = {
    left: PreflightConfigSchema.parse(left.config),
    right: PreflightConfigSchema.parse(right.config),
  };
  const order = arenaOrder(runs);
  if (dryRun)
    return {
      name,
      tasks: set,
      runs,
      order,
      settings,
      left: {
        label: left.label,
        configDigest: digest(JSON.stringify(configs.left)),
      },
      right: {
        label: right.label,
        configDigest: digest(JSON.stringify(configs.right)),
      },
    };
  const runner =
    options.runner ??
    ((side: Side, run: number) =>
      runTasks(root, set, configs[side], run, settings));
  const collected: Record<Side, BenchResult["results"]> = {
    left: [],
    right: [],
  };
  const counter = { left: 0, right: 0 };
  for (const side of order) {
    const run = ++counter[side];
    collected[side].push(...(await runner(side, run)));
  }
  const labels = { left: left.label, right: right.label };
  const build = (side: Side): BenchResult => ({
    name: labels[side],
    configDigest: digest(JSON.stringify(configs[side])),
    taskDigest: digest(taskText),
    revision: set.revision,
    results: collected[side],
    settings,
  });
  const l = build("left"),
    r = build("right");
  const checklist = checklistCompare(l, r, options);
  const sl = sideReport(left.label, configs.left, l),
    sr = sideReport(right.label, configs.right, r);
  const decision = decide(sl, sr, checklist);
  const report: ArenaReport = {
    name,
    task: taskPath,
    revision: set.revision,
    runs,
    order,
    settings,
    left: sl,
    right: sr,
    checklist,
    winner: decision.winner,
    winnerLabel: decision.winner === "none" ? null : labels[decision.winner],
    verdict: decision.verdict,
    results: { left: l, right: r },
  };
  const path = join(root, ".preflight", "arena", `${name}.json`);
  await applyFiles(
    root,
    [{ path, before: await readText(path), after: jsonText(report) }],
    { actor: process.env.USER ?? "local", source: "arena" },
  );
  return report;
}
