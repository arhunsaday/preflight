import {
  mkdtemp,
  realpath,
  readFile,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { diffResources } from "../src/state.js";
import { ResourceSchema, SharePayloadSchema } from "../src/schema.js";
import { createAdapters, detectAll } from "../src/adapters.js";
import { applyFiles, rollback } from "../src/transaction.js";
export const sample = () =>
  ResourceSchema.parse({
    id: "skill:test",
    name: "test",
    type: "skill",
    source: "file:///test",
    scope: "project",
    harnesses: ["claude-code"],
    content: "---\nname: test\ndescription: Test first\n---\nUse tests.",
  });
it("detects nested configuration changes", () => {
  const a = sample();
  expect(
    diffResources(
      [{ ...a, config: { env: { VALUE: "one" } } }],
      [{ ...a, config: { env: { VALUE: "two" } } }],
    )[0]?.kind,
  ).toBe("replace");
});
it("rejects secrets buried in arrays", () =>
  expect(() =>
    SharePayloadSchema.parse({
      version: 1,
      ownerId: "local",
      visibility: "unlisted",
      createdAt: new Date().toISOString(),
      resources: [
        { ...sample(), config: { args: ["sk-abcdefghijklmnopqrstuv"] } },
      ],
    }),
  ).toThrow(/secret/i));
for (const id of ["claude-code", "cursor"] as const)
  it(`${id} writes and reads skills, preserves unrelated MCP settings`, async () => {
    const root = await mkdtemp(join(await realpath(tmpdir()), "adk-adapter-"));
    const home = join(root, "home");
    await mkdir(home);
    const adapter = createAdapters({ root, home }).find((a) => a.id === id)!;
    const resource = { ...sample(), harnesses: [id] };
    const files = await adapter.plan([resource], []);
    await applyFiles(root, files, { actor: "test" });
    expect(
      (await adapter.read()).resources.some((r) => r.name === "test"),
    ).toBe(true);
    expect((await adapter.plan([resource], []))[0]?.after).toContain(
      "Use tests",
    );
    await rollback(root);
    expect((await adapter.read()).resources).toHaveLength(0);
  });
it("dry run writes nothing and rollback refuses to destroy later edits", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-tx-"));
  const path = join(root, "file");
  await applyFiles(root, [{ path, before: null, after: "new" }], {
    actor: "test",
    dryRun: true,
  });
  await expect(readFile(path)).rejects.toThrow();
  await applyFiles(root, [{ path, before: null, after: "new" }], {
    actor: "test",
  });
  await writeFile(path, "human edit");
  await expect(rollback(root)).rejects.toThrow(/changed/i);
});
it("isolates a broken adapter", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-detect-"));
  await mkdir(join(root, ".cursor"));
  await writeFile(join(root, ".cursor", "mcp.json"), "{broken");
  const results = await detectAll(
    createAdapters({ root, home: join(root, "home") }),
  );
  expect(results.find((r) => r.id === "cursor")?.error).toBeTruthy();
  expect(results.find((r) => r.id === "claude-code")?.error).toBeUndefined();
});
it("refuses unresolved skills and installs their supporting files transactionally", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-assets-"));
  const adapter = createAdapters({ root, home: join(root, "home") })[0]!;
  const unresolved = { ...sample(), content: undefined };
  await expect(adapter.plan([unresolved], [])).rejects.toThrow(/content/i);
  const resource = {
    ...sample(),
    config: { files: [{ path: "scripts/check.sh", contents: "echo check" }] },
  };
  const files = await adapter.plan([resource], []);
  expect(
    files.some(
      (f) => f.path.endsWith("/scripts/check.sh") && f.after === "echo check",
    ),
  ).toBe(true);
  await expect(
    adapter.plan(
      [
        {
          ...sample(),
          config: { files: [{ path: "../../escape", contents: "bad" }] },
        },
      ],
      [],
    ),
  ).rejects.toThrow(/path/i);
});
it("rolls back earlier files if a later write fails", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-failure-"));
  const first = join(root, "first");
  await writeFile(first, "old");
  const blocker = join(root, "blocker");
  await writeFile(blocker, "not a directory");
  await expect(
    applyFiles(
      root,
      [
        { path: first, before: "old", after: "new" },
        { path: join(blocker, "child"), before: null, after: "fail" },
      ],
      { actor: "test" },
    ),
  ).rejects.toThrow();
  expect(await readFile(first, "utf8")).toBe("old");
});
it("wires bundled hook scripts without executing them and removes them on delete", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-hook-"));
  const adapter = createAdapters({ root, home: join(root, "home") })[0]!;
  const hook = {
    ...sample(),
    id: "hook:script",
    type: "hook" as const,
    content: "echo safe",
    config: { event: "PreToolUse", matcher: "Bash", script: true },
  };
  const files = await adapter.plan([hook], []);
  expect(
    files.some((f) => f.path.endsWith(".sh") && f.after === "echo safe"),
  ).toBe(true);
  await applyFiles(root, files, { actor: "test" });
  const settings = JSON.parse(
    await readFile(join(root, ".claude", "settings.json"), "utf8"),
  );
  expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain("bash ");
  expect(
    (await adapter.plan([], [hook])).some(
      (f) => f.path.endsWith(".sh") && f.after === null,
    ),
  ).toBe(true);
});
it("recovers a pending transaction without overwriting later human edits", async () => {
  const { recover } = await import("../src/transaction.js");
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-recover-"));
  const path = join(root, "file");
  await writeFile(path, "half-written");
  await mkdir(join(root, ".adk", "transactions"), { recursive: true });
  const id = "11111111-1111-1111-1111-111111111111";
  await writeFile(
    join(root, ".adk", "transactions", `${id}.json`),
    JSON.stringify({
      id,
      actor: "test",
      at: new Date().toISOString(),
      status: "pending",
      files: [{ path, before: "original", after: "half-written" }],
    }),
  );
  await recover(root);
  expect(await readFile(path, "utf8")).toBe("original");
});

it("writes a status line script and takes it back on rollback", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-status-"));
  const home = join(root, "home");
  await mkdir(home);
  const adapter = createAdapters({ root, home }).find(
    (a) => a.id === "claude-code",
  )!;
  const resource = ResourceSchema.parse({
    id: "statusline:gradient",
    type: "statusline",
    name: "gradient",
    source: "local:owned",
    scope: "global",
    harnesses: ["claude-code"],
    content: "#!/usr/bin/env bash\necho hello\n",
    config: { script: true, padding: 0 },
  });
  const files = await adapter.plan([resource], []);
  await applyFiles(root, files, { actor: "test" });
  const settings = JSON.parse(
    (await readFile(join(home, ".claude", "settings.json"), "utf8")) as string,
  );
  expect(settings.statusLine.type).toBe("command");
  expect(settings.statusLine.padding).toBe(0);
  expect(settings.statusLine.script).toBeUndefined();
  const script = settings.statusLine.command.replace(/^bash '|'$/g, "");
  expect(await readFile(script, "utf8")).toContain("echo hello");
  await applyFiles(root, await adapter.plan([], [resource]), { actor: "test" });
  await expect(readFile(script, "utf8")).rejects.toThrow();
  expect(
    JSON.parse(
      (await readFile(join(home, ".claude", "settings.json"), "utf8")) as string,
    ).statusLine,
  ).toBeUndefined();
});

it("ignores an adopted path that tries to leave the harness directory", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-adopt-"));
  const home = join(root, "home");
  await mkdir(home);
  const adapter = createAdapters({ root, home }).find(
    (a) => a.id === "claude-code",
  )!;
  const escaping = ResourceSchema.parse({
    id: "skill:escaping",
    type: "skill",
    name: "escaping",
    source: "local:owned",
    scope: "global",
    harnesses: ["claude-code"],
    content: "---\nname: escaping\n---\nbody\n",
    config: { adoptedBy: "claude-code", adoptedPath: "../../../etc/passwd" },
  });
  expect(adapter.target(escaping).path).toBe(
    join(home, ".claude", "skills", "skill-escaping-8716add6", "SKILL.md"),
  );
  const honest = ResourceSchema.parse({
    ...escaping,
    config: { adoptedBy: "claude-code", adoptedPath: "skills/here/SKILL.md" },
  });
  expect(adapter.target(honest).path).toBe(
    join(home, ".claude", "skills", "here", "SKILL.md"),
  );
});
