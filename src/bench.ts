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
    }),
  ),
});
export type BenchResult = z.infer<typeof BenchRun>;
export function compareRuns(a: BenchResult, b: BenchResult) {
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
  };
}
export async function runBench(
  root: string,
  name: string,
  configPath: string,
  tasksPath: string,
  dryRun = false,
) {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error("Invalid benchmark name");
  const taskText = await readFile(tasksPath, "utf8");
  const set = TaskSet.parse(JSON.parse(taskText));
  const configText = await readFile(configPath, "utf8");
  const config = PreflightConfigSchema.parse(JSON.parse(configText));
  if (dryRun) return { name, tasks: set, configDigest: digest(configText) };
  const workspace = await realpath(await mkdtemp(join(tmpdir(), "preflight-bench-")));
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
        HOME: home,
        PREFLIGHT_CONFIG: join(checkout, "preflight.config.json"),
        PREFLIGHT_METRICS: metricsPath,
      };
      const run = await runCommand(task.run, checkout, task.timeoutMs, env);
      const verification =
        run.code === 0
          ? await runCommand(task.verify, checkout, task.timeoutMs, env)
          : undefined;
      let metrics: { tokens: number | null; interventions: number | null } = {
        tokens: null,
        interventions: null,
      };
      const text = await readText(metricsPath);
      if (text)
        metrics = z
          .object({
            tokens: z.number().nonnegative(),
            interventions: z.number().nonnegative(),
          })
          .parse(JSON.parse(text));
      results.push({
        id: task.id,
        passed: run.code === 0 && verification?.code === 0,
        durationMs: run.durationMs + (verification?.durationMs ?? 0),
        ...metrics,
      });
      await writeFile(
        join(workspace, `output-${results.length}.txt`),
        run.stdout + run.stderr,
      );
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
  const result: BenchResult = {
    name,
    configDigest: digest(configText),
    taskDigest: digest(taskText),
    revision: set.revision,
    results,
  };
  const path = join(root, ".preflight", "bench", `${name}.json`);
  await applyFiles(
    root,
    [{ path, before: await readText(path), after: jsonText(result) }],
    { actor: process.env.USER ?? "local", source: "benchmark" },
  );
  return result;
}
