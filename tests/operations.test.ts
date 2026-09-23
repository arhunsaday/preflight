import { expect, it } from "vitest";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installationPlan, runCommand } from "../src/operations.js";
import { detectStack } from "../src/retrofit.js";
import { compareRuns } from "../src/bench.js";
import { ResourceSchema } from "../src/schema.js";
it("delegates installs as argv without a shell", () => {
  const r = ResourceSchema.parse({
    id: "tool:trivy",
    type: "tool",
    name: "trivy",
    source: "https://github.com/aquasecurity/trivy",
    scope: "global",
    harnesses: ["claude-code"],
    config: { manager: "brew", package: "trivy" },
  });
  expect(installationPlan(r)).toEqual({
    command: "brew",
    args: ["install", "trivy"],
  });
  expect(() =>
    installationPlan({
      ...r,
      config: { manager: "npm", package: "--ignore-scripts=false" },
    }),
  ).toThrow();
});
it("runs a bounded subprocess and reports failure", async () => {
  expect(
    (
      await runCommand(
        { command: process.execPath, args: ["-e", "process.exit(7)"] },
        process.cwd(),
        1000,
      )
    ).code,
  ).toBe(7);
});
it("detects stack from manifests without running repo code", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-retrofit-"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      dependencies: { react: "19", typescript: "5" },
      scripts: { test: "vitest", build: "tsc" },
    }),
  );
  const result = await detectStack(root);
  expect(result.stack).toContain("react");
  expect(result.commands.test).toBe("npm run test");
});
it("compares matching benchmarks and rejects different task sets", () => {
  const base = {
    name: "a",
    configDigest: "a",
    taskDigest: "same",
    revision: "abc",
    results: [
      {
        id: "one",
        passed: true,
        durationMs: 100,
        tokens: 10,
        interventions: 0,
      },
    ],
  };
  expect(
    compareRuns(base, {
      ...base,
      name: "b",
      results: [
        {
          id: "one",
          passed: false,
          durationMs: 200,
          tokens: 20,
          interventions: 1,
        },
      ],
    }).passRateDelta,
  ).toBe(-1);
  expect(() => compareRuns(base, { ...base, taskDigest: "different" })).toThrow(
    /task/i,
  );
});
it("benchmarks a pinned local repository in isolated checkouts", async () => {
  const { mkdir } = await import("node:fs/promises");
  const { runBench } = await import("../src/bench.js");
  const { defaultConfig } = await import("../src/schema.js");
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-bench-test-"));
  const repo = join(root, "repo");
  await mkdir(repo);
  await runCommand({ command: "git", args: ["init"] }, repo);
  await writeFile(join(repo, "fixture.txt"), "pinned");
  await runCommand({ command: "git", args: ["add", "."] }, repo);
  await runCommand(
    {
      command: "git",
      args: [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "-m",
        "fixture",
      ],
    },
    repo,
  );
  const revision = (
    await runCommand({ command: "git", args: ["rev-parse", "HEAD"] }, repo)
  ).stdout.trim();
  const tasks = join(root, "tasks.json");
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
              'require("fs").writeFileSync(process.env.ADK_METRICS,JSON.stringify({tokens:5,interventions:0}))',
            ],
          },
          verify: {
            command: process.execPath,
            args: [
              "-e",
              'if(require("fs").readFileSync("fixture.txt","utf8")!=="pinned")process.exit(1)',
            ],
          },
        },
      ],
    }),
  );
  const config = join(root, "adk.config.json");
  await writeFile(config, JSON.stringify(defaultConfig()));
  const result = await runBench(root, "test", config, tasks);
  expect(result).toMatchObject({ results: [{ passed: true, tokens: 5 }] });
});
