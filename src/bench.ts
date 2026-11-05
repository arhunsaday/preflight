import {
  mkdtemp,
  realpath,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { digest } from "./adapters.js";
import { runCommand } from "./operations.js";
import { PreflightConfigSchema } from "./schema.js";
import { PreflightService } from "./service.js";
import {
  checklistCompare,
  checklistFor,
  type ChecklistOptions,
} from "./bench-checklist.js";
import { applyFiles, readText, jsonText } from "./transaction.js";
const Command = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
});
export const TaskSet = z
  .object({
    version: z.literal(1),
    repo: z.string(),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    tasks: z
      .array(
        z.object({
          id: z.string(),
          run: Command,
          verify: Command,
          timeoutMs: z.number().int().positive().max(600000).default(120000),
        }),
      )
      .min(1),
  })
  .superRefine((v, c) => {
    if (new Set(v.tasks.map((t) => t.id)).size !== v.tasks.length)
      c.addIssue({ code: "custom", message: "Duplicate task ID" });
  });
export const Limiter = z.enum(["budget", "timeout", "turns"]);
/** Model, effort and budget a run used. Each one stays configurable. */
export const Settings = z.object({
  model: z.string().nullable().default(null),
  effort: z.string().nullable().default(null),
  budget: z.number().nonnegative().nullable().default(null),
});
export type BenchSettings = z.infer<typeof Settings>;
export const BenchRun = z.object({
  name: z.string(),
  configDigest: z.string(),
  taskDigest: z.string(),
  revision: z.string(),
  results: z.array(
    z.object({
      id: z.string(),
      passed: z.boolean(),
      durationMs: z.number(),
      tokens: z.number().nonnegative().nullable(),
      interventions: z.number().nonnegative().nullable(),
      /** Repetition number, from 1. Older files have none. */
      run: z.number().int().positive().optional(),
      /** Did the success check (the verify command) pass? */
      verified: z.boolean().optional(),
      exitCode: z.number().int().optional(),
      costUsd: z.number().nonnegative().nullable().optional(),
      limiter: Limiter.nullable().optional(),
      model: z.string().nullable().optional(),
    }),
  ),
  settings: Settings.optional(),
});
export type BenchResult = z.infer<typeof BenchRun>;
export function compareRuns(
  a: BenchResult,
  b: BenchResult,
  options: ChecklistOptions = {},
) {
  a = BenchRun.parse(a);
  b = BenchRun.parse(b);
  if (a.taskDigest !== b.taskDigest || a.revision !== b.revision)
    throw new Error("Cannot compare different task sets or revisions");
  const metrics = (run: BenchResult) => ({
    passRate: run.results.length
      ? run.results.filter((r) => r.passed).length / run.results.length
      : 0,
    durationMs: run.results.reduce((s, r) => s + r.durationMs, 0),
    tokens: run.results.every((r) => r.tokens !== null)
      ? run.results.reduce((s, r) => s + r.tokens!, 0)
      : null,
    interventions: run.results.every((r) => r.interventions !== null)
      ? run.results.reduce((s, r) => s + r.interventions!, 0)
      : null,
  });
  const left = metrics(a),
    right = metrics(b);
  return {
    left,
    right,
    passRateDelta: right.passRate - left.passRate,
    durationDeltaMs: right.durationMs - left.durationMs,
    checklist: checklistCompare(a, b, options),
  };
}
const Metrics = z.object({
  tokens: z.number().nonnegative(),
  interventions: z.number().nonnegative(),
  costUsd: z.number().nonnegative().optional(),
  limiter: Limiter.optional(),
  model: z.string().optional(),
});
export interface RunOptions {
  settings?: Partial<BenchSettings>;
  /** Repetitions of the whole task set. */
  runs?: number;
  minRuns?: number;
  maxCv?: number;
}
export function settingsEnv(settings: BenchSettings): NodeJS.ProcessEnv {
  return {
    ...(settings.model
      ? {
          PREFLIGHT_BENCH_MODEL: settings.model,
          ANTHROPIC_MODEL: settings.model,
        }
      : {}),
    ...(settings.effort ? { PREFLIGHT_BENCH_EFFORT: settings.effort } : {}),
    ...(settings.budget !== null
      ? { PREFLIGHT_BENCH_BUDGET_USD: String(settings.budget) }
      : {}),
  };
}
/**
 * One pass over the task set. Every task gets its own clone of the pinned
 * revision and its own empty HOME; both vanish when the pass ends.
 */
export async function runTasks(
  root: string,
  set: z.infer<typeof TaskSet>,
  config: z.infer<typeof PreflightConfigSchema>,
  run: number,
  settings: BenchSettings,
): Promise<BenchResult["results"]> {
  const workspace = await realpath(
    await mkdtemp(join(tmpdir(), "preflight-bench-")),
  );
  const results: BenchResult["results"] = [];
  try {
    for (const task of set.tasks) {
      const checkout = join(workspace, `task-${results.length}`);
      const clone = await runCommand(
        {
          command: "git",
          args: ["clone", "--no-hardlinks", "--", resolve(set.repo), checkout],
        },
        root,
      );
      if (clone.code) throw new Error(clone.stderr);
      const pinned = await runCommand(
        { command: "git", args: ["checkout", "--detach", set.revision] },
        checkout,
      );
      if (pinned.code) throw new Error(pinned.stderr);
      const home = join(workspace, `home-${results.length}`);
      await mkdir(home);
      const service = new PreflightService({ root: checkout, home });
      await service.init();
      const applied = await service.change((c) => Object.assign(c, config));
      if (applied.warnings.length)
        throw new Error(
          `Benchmark configuration could not be fully applied: ${applied.warnings.join("; ")}`,
        );
      const metricsPath = join(checkout, ".preflight", "bench-metrics.json");
      const env = {
        ...process.env,
        ...settingsEnv(settings),
        HOME: home,
        PREFLIGHT_CONFIG: join(checkout, "preflight.config.json"),
        PREFLIGHT_METRICS: metricsPath,
      };
      const ran = await runCommand(task.run, checkout, task.timeoutMs, env);
      const verification =
        ran.code === 0
          ? await runCommand(task.verify, checkout, task.timeoutMs, env)
          : undefined;
      let metrics: z.infer<typeof Metrics> | undefined;
      const text = await readText(metricsPath);
      if (text) metrics = Metrics.parse(JSON.parse(text));
      results.push({
        id: task.id,
        passed: ran.code === 0 && verification?.code === 0,
        durationMs: ran.durationMs + (verification?.durationMs ?? 0),
        tokens: metrics?.tokens ?? null,
        interventions: metrics?.interventions ?? null,
        run,
        verified: verification?.code === 0,
        exitCode: ran.code,
        costUsd: metrics?.costUsd ?? null,
        limiter: metrics?.limiter ?? (ran.code === 124 ? "timeout" : null),
        model: metrics?.model ?? null,
      });
      await writeFile(
        join(workspace, `output-${results.length}.txt`),
        ran.stdout + ran.stderr,
      );
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
  return results;
}
export const fullSettings = (s: Partial<BenchSettings> = {}): BenchSettings =>
  Settings.parse(s);
export async function runBench(
  root: string,
  name: string,
  configPath: string,
  tasksPath: string,
  dryRun = false,
  options: RunOptions = {},
) {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error("Invalid benchmark name");
  const taskText = await readFile(tasksPath, "utf8");
  const set = TaskSet.parse(JSON.parse(taskText));
  const configText = await readFile(configPath, "utf8");
  const config = PreflightConfigSchema.parse(JSON.parse(configText));
  const settings = fullSettings(options.settings);
  const runs = options.runs ?? 1;
  if (!Number.isInteger(runs) || runs < 1 || runs > 50)
    throw new Error("Runs must be a whole number from 1 to 50");
  if (dryRun)
    return {
      name,
      tasks: set,
      configDigest: digest(configText),
      runs,
      settings,
    };
  const results: BenchResult["results"] = [];
  for (let i = 1; i <= runs; i++)
    results.push(...(await runTasks(root, set, config, i, settings)));
  const result: BenchResult = {
    name,
    configDigest: digest(configText),
    taskDigest: digest(taskText),
    revision: set.revision,
    results,
    settings,
  };
  const path = join(root, ".preflight", "bench", `${name}.json`);
  await applyFiles(
    root,
    [{ path, before: await readText(path), after: jsonText(result) }],
    { actor: process.env.USER ?? "local", source: "benchmark" },
  );
  return { ...result, checklist: checklistFor(result, options) };
}
