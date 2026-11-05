import { expect, it } from "vitest";
import { mkdtemp, writeFile, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checklistCompare, checklistFor } from "../src/bench-checklist.js";
import { arenaOrder, runArena, type ArenaReport } from "../src/bench-arena.js";
import { compareRuns, type BenchResult } from "../src/bench.js";
import { defaultConfig } from "../src/schema.js";
import { runCommand } from "../src/operations.js";

type R = BenchResult["results"][number];
const task = (run: number, over: Partial<R> = {}): R => ({
  id: "t",
  passed: true,
  verified: true,
  durationMs: 1000,
  tokens: 100,
  interventions: 0,
  run,
  exitCode: 0,
  limiter: null,
  ...over,
});
const side = (
  name: string,
  durations: number[],
  over: Partial<R> = {},
  settings: BenchResult["settings"] | null = {
    model: "m",
    effort: "high",
    budget: 5,
  },
): BenchResult => ({
  name,
  configDigest: name,
  taskDigest: "same",
  revision: "r",
  ...(settings ? { settings } : {}),
  results: durations.map((d, i) => task(i + 1, { durationMs: d, ...over })),
});
const status = (c: { checks: { id: string; status: string }[] }, id: string) =>
  c.checks.find((x) => x.id === id)!.status;

it("passes a clean three-run compare", () => {
  const c = checklistCompare(
    side("a", [1000, 1050, 980]),
    side("b", [900, 920, 880]),
  );
  expect(c.verdict).toBe("pass");
  expect(c.publishable).toBe(true);
  expect(c.checks.map((x) => x.id)).toEqual([
    "repetitions",
    "spread",
    "limiter",
    "task-done",
    "same-setup",
  ]);
});
it("flags too few repetitions, with a configurable minimum", () => {
  expect(status(checklistFor(side("a", [1000])), "repetitions")).toBe("fail");
  expect(status(checklistFor(side("a", [1000, 1000])), "repetitions")).toBe(
    "warn",
  );
  expect(
    status(
      checklistFor(side("a", [1000, 1000]), { minRuns: 2 }),
      "repetitions",
    ),
  ).toBe("pass");
});
it("flags noise above the coefficient-of-variation threshold", () => {
  const noisy = side("a", [300, 1700, 1000]);
  expect(status(checklistFor(noisy), "spread")).toBe("fail");
  expect(status(checklistFor(noisy, { maxCv: 0.8 }), "spread")).toBe("pass");
  expect(status(checklistFor(side("a", [1000, 1300, 700])), "spread")).toBe(
    "warn",
  );
});
it("fails when any run hit a budget, timeout or turn cap", () => {
  const s = side("a", [1000, 1000, 1000]);
  s.results[1]!.limiter = "budget";
  expect(status(checklistFor(s), "limiter")).toBe("fail");
  const t = side("a", [1000, 1000, 1000]);
  t.results[0]!.exitCode = 124;
  expect(status(checklistFor(t), "limiter")).toBe("fail");
});
it("checks the success check, not only the exit code", () => {
  const s = side("a", [1000, 1000, 1000]);
  s.results[2] = task(3, { passed: false, verified: false, exitCode: 0 });
  const c = checklistFor(s);
  expect(status(c, "task-done")).toBe("warn");
  expect(c.checks.find((x) => x.id === "task-done")!.message).toMatch(/2 of 3/);
  const none = side("a", [1, 1, 1], { passed: false, verified: false });
  expect(status(checklistFor(none), "task-done")).toBe("fail");
});
it("requires the same model, effort and budget on both sides", () => {
  const diff = checklistCompare(
    side("a", [1, 1, 1]),
    side("b", [1, 1, 1], {}, { model: "other", effort: "high", budget: 5 }),
  );
  expect(status(diff, "same-setup")).toBe("fail");
  expect(diff.publishable).toBe(false);
  expect(diff.note).toMatch(/Do not publish/);
  const unknown = checklistCompare(
    side("a", [1, 1, 1], {}, null),
    side("b", [1, 1, 1], {}, null),
  );
  expect(status(unknown, "same-setup")).toBe("warn");
});
it("puts the checklist in compare results", () => {
  const out = compareRuns(side("a", [1000]), side("b", [900]));
  expect(out.checklist.publishable).toBe(false);
});
it("alternates the run order", () => {
  expect(arenaOrder(3)).toEqual([
    "left",
    "right",
    "right",
    "left",
    "left",
    "right",
  ]);
});

async function workspace() {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "preflight-arena-"),
  );
  const tasks = join(root, "tasks.json");
  await writeFile(
    tasks,
    JSON.stringify({
      version: 1,
      repo: root,
      revision: "a".repeat(40),
      tasks: [
        {
          id: "t",
          run: { command: "true" },
          verify: { command: "true" },
        },
      ],
    }),
  );
  return { root, tasks };
}
const sides = {
  left: { label: "lean", config: defaultConfig() },
  right: { label: "full", config: defaultConfig() },
};
it("runs both sides in alternating order and reports a winner", async () => {
  const { root, tasks } = await workspace();
  const calls: string[] = [];
  const report = (await runArena(root, tasks, sides.left, sides.right, false, {
    runs: 3,
    settings: { model: "m", effort: "high", budget: 5 },
    runner: async (s, run) => {
      calls.push(`${s}${run}`);
      const slow = s === "right";
      return [
        task(run, {
          durationMs: slow ? 2000 + run : 1000 + run,
          tokens: slow ? 200 : 100,
          costUsd: slow ? 0.2 : 0.1,
          verified: s === "left" || run !== 3,
          passed: s === "left" || run !== 3,
        }),
      ];
    },
  })) as ArenaReport;
  expect(calls).toEqual([
    "left1",
    "right1",
    "right2",
    "left2",
    "left3",
    "right3",
  ]);
  expect(report.left.successRate).toBe(1);
  expect(report.right.successRate).toBeCloseTo(2 / 3);
  expect(report.left.durationMs.median).toBe(1002);
  expect(report.left.tokens!.median).toBe(100);
  expect(report.right.costUsd!.median).toBeCloseTo(0.2);
  expect(report.checklist.publishable).toBe(true);
  expect(report.winner).toBe("left");
  expect(report.winnerLabel).toBe("lean");
});
it("withholds the winner when a check fails", async () => {
  const { root, tasks } = await workspace();
  const report = (await runArena(root, tasks, sides.left, sides.right, false, {
    runs: 3,
    settings: { model: "m" },
    runner: async (s, run) => [
      task(run, { limiter: s === "right" && run === 2 ? "budget" : null }),
    ],
  })) as ArenaReport;
  expect(status(report.checklist, "limiter")).toBe("fail");
  expect(report.winner).toBe("none");
  expect(report.verdict).toMatch(/No winner/);
});
it("withholds the winner with too few runs, and only previews on dry run", async () => {
  const { root, tasks } = await workspace();
  const runner = async (_s: string, run: number) => [task(run)];
  const one = (await runArena(root, tasks, sides.left, sides.right, false, {
    runs: 1,
    settings: { model: "m" },
    runner,
  })) as ArenaReport;
  expect(one.winner).toBe("none");
  let called = 0;
  const preview = (await runArena(root, tasks, sides.left, sides.right, true, {
    runs: 2,
    runner: async () => {
      called++;
      return [];
    },
  })) as { order: string[] };
  expect(called).toBe(0);
  expect(preview.order).toHaveLength(4);
  await expect(
    runArena(root, tasks, sides.left, sides.left, true),
  ).rejects.toThrow(/different/);
});
it("runs a fake agent in disposable clones through the real runner", async () => {
  const { root } = await workspace();
  const repo = join(root, "repo");
  await mkdir(repo);
  await runCommand({ command: "git", args: ["init"] }, repo);
  await writeFile(join(repo, "f.txt"), "x");
  await runCommand({ command: "git", args: ["add", "."] }, repo);
  await runCommand(
    {
      command: "git",
      args: [
        "-c",
        "user.name=T",
        "-c",
        "user.email=t@example.com",
        "commit",
        "-m",
        "x",
      ],
    },
    repo,
  );
  const revision = (
    await runCommand({ command: "git", args: ["rev-parse", "HEAD"] }, repo)
  ).stdout.trim();
  const tasks = join(root, "real-tasks.json");
  await writeFile(
    tasks,
    JSON.stringify({
      version: 1,
      repo,
      revision,
      tasks: [
        {
          id: "one",
          run: {
            command: process.execPath,
            args: [
              "-e",
              'require("fs").writeFileSync(process.env.PREFLIGHT_METRICS,JSON.stringify({tokens:7,interventions:0,costUsd:0.01,model:process.env.PREFLIGHT_BENCH_MODEL}))',
            ],
          },
          verify: {
            command: process.execPath,
            args: ["-e", "process.exit(0)"],
          },
        },
      ],
    }),
  );
  const report = (await runArena(root, tasks, sides.left, sides.right, false, {
    runs: 3,
    settings: { model: "fake-model", effort: "low", budget: 1 },
  })) as ArenaReport;
  expect(report.left.successRate).toBe(1);
  expect(report.left.tokens!.median).toBe(21 / 3);
  expect(report.results.left.results[0]!.model).toBe("fake-model");
  expect(status(report.checklist, "same-setup")).toBe("pass");
});
