import { expect, it } from "vitest";
import { mkdtemp, realpath, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "../src/commands.js";
it("scripts the core loop using JSON outputs and dry-run", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-cli-"));
  const context = { root, home: join(root, "home") };
  await execute(["init"], context);
  const file = join(root, "prompt.json");
  await writeFile(
    file,
    JSON.stringify({
      id: "prompt:hello",
      type: "prompt",
      name: "Hello",
      source: "local:hello",
      scope: "project",
      harnesses: ["claude-code"],
      content: "Hello world",
    }),
  );
  await execute(["create", file, "--dry-run"], context);
  expect(await execute(["list"], context)).toEqual([]);
  await execute(["create", file], context);
  expect(await execute(["inspect", "prompt:hello"], context)).toMatchObject({
    name: "Hello",
  });
  await execute(["move", "prompt:hello", "global"], context);
  expect(
    JSON.parse(await readFile(join(root, "adk.config.json"), "utf8")).profiles
      .default.resources[0].scope,
  ).toBe("global");
  await execute(["rollback"], context);
  expect(await execute(["inspect", "prompt:hello"], context)).toMatchObject({
    scope: "project",
  });
});
it("context report works before initialization and includes inherited global instructions", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-context-"));
  const context = { root, home: join(root, "home") };
  expect(await execute(["context"], context)).toMatchObject({
    estimatedTokens: 0,
    entries: [],
  });
  await execute(["--global", "init"], context);
  const file = join(root, "skill.json");
  await writeFile(
    file,
    JSON.stringify({
      id: "skill:global",
      type: "skill",
      name: "Global",
      description: "On demand",
      source: "local:global",
      scope: "global",
      harnesses: ["claude-code"],
      content: "x".repeat(400),
    }),
  );
  await execute(["--global", "create", file], context);
  expect(
    await execute(
      ["context", "--scope", "global", "--agent", "claude-code"],
      context,
    ),
  ).toMatchObject({ entries: [{ id: "skill:global", bodyTokens: 100 }] });
  expect(
    await execute(["context", "--agent", "cursor"], context),
  ).toMatchObject({ entries: [] });
  await expect(
    execute(["context", "--mode", "live"], context),
  ).rejects.toThrow();
});
