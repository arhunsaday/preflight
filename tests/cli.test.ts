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
