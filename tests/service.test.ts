import { mkdtemp, realpath, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AdkService } from "../src/service.js";
import { ResourceSchema } from "../src/schema.js";
const resource = () =>
  ResourceSchema.parse({
    id: "mcp:demo",
    type: "mcp",
    name: "demo",
    source: "https://example.com",
    scope: "project",
    harnesses: ["claude-code"],
    config: { url: "https://example.com/mcp" },
  });
async function service() {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-service-"));
  return new AdkService({ root, home: join(root, "home") });
}
it("previews CRUD, applies scope changes, and restores both state and harness files", async () => {
  const s = await service();
  await s.init();
  await s.create(resource(), true);
  expect(await s.list()).toHaveLength(0);
  await s.create(resource());
  expect(
    JSON.parse(await readFile(join(s.context.root, ".mcp.json"), "utf8"))
      .mcpServers.demo,
  ).toBeTruthy();
  await s.update("mcp:demo", { scope: "global" });
  expect(
    JSON.parse(await readFile(join(s.context.root, ".mcp.json"), "utf8"))
      .mcpServers.demo,
  ).toBeUndefined();
  await s.rollback();
  expect((await s.list())[0]?.scope).toBe("project");
});
it("refuses overwriting an unmanaged MCP entry and manual edits", async () => {
  const s = await service();
  await s.init();
  await writeFile(
    join(s.context.root, ".mcp.json"),
    JSON.stringify({ mcpServers: { demo: { command: "human" } } }),
  );
  await expect(s.create(resource())).rejects.toThrow(/unmanaged/i);
});
it("does not remove a healthy harness when another adapter fails", async () => {
  const s = await service();
  await s.init();
  await s.create(resource());
  expect(
    (await s.doctor()).find((i) => i.code === "mcp-unverified"),
  ).toBeTruthy();
});
it("preserves unmanaged neighbors and refuses takeover after acquiring a shared file", async () => {
  const s = await service();
  await s.init();
  await writeFile(
    join(s.context.root, ".mcp.json"),
    JSON.stringify({ mcpServers: { human: { command: "keep" } } }),
  );
  await s.create(resource());
  await expect(
    s.create({ ...resource(), id: "mcp:human", name: "human" }),
  ).rejects.toThrow(/unmanaged/i);
  expect(
    JSON.parse(await readFile(join(s.context.root, ".mcp.json"), "utf8"))
      .mcpServers.human.command,
  ).toBe("keep");
});
it("rejects two resources targeting the same MCP name", async () => {
  const s = await service();
  await s.init();
  await s.create(resource());
  await expect(
    s.create({ ...resource(), id: "mcp:duplicate" }),
  ).rejects.toThrow(/collision/i);
});
it("keeps healthy harness ownership when another harness is unavailable", async () => {
  const s = await service();
  await s.init();
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(s.context.root, ".cursor"));
  await writeFile(join(s.context.root, ".cursor", "mcp.json"), "{bad");
  await s.create({
    ...resource(),
    type: "hook",
    id: "hook:dual",
    name: "dual",
    harnesses: ["claude-code", "cursor"],
    config: {
      event: "PreToolUse",
      hooks: [{ type: "command", command: "echo test" }],
    },
  });
  await s.sync();
  expect(
    JSON.parse(
      await readFile(join(s.context.root, ".claude", "settings.json"), "utf8"),
    ).hooks.PreToolUse,
  ).toHaveLength(1);
});
it("releases deleted paths from drift tracking", async () => {
  const s = await service();
  await s.init();
  const skill = ResourceSchema.parse({
    ...resource(),
    id: "skill:temp",
    type: "skill",
    content: "---\nname: temp\ndescription: Temporary\n---\nTest",
  });
  const result = await s.create(skill);
  const path = result.files.find((f) => f.path.endsWith("SKILL.md"))!.path;
  await s.remove(skill.id);
  await writeFile(path, "new owner");
  await expect(s.sync()).resolves.toBeTruthy();
});
it("adds and removes a hook while preserving unmanaged hooks in the same event", async () => {
  const s = await service();
  await s.init();
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(s.context.root, ".claude"));
  const path = join(s.context.root, ".claude", "settings.json");
  const human = {
    matcher: "Read",
    hooks: [{ type: "command", command: "echo human" }],
  };
  await writeFile(path, JSON.stringify({ hooks: { PreToolUse: [human] } }));
  await s.create({
    ...resource(),
    id: "hook:new",
    type: "hook",
    config: {
      event: "PreToolUse",
      matcher: "Bash",
      hooks: [{ type: "command", command: "echo adk" }],
    },
  });
  await s.remove("hook:new");
  expect(JSON.parse(await readFile(path, "utf8")).hooks.PreToolUse).toEqual([
    human,
  ]);
});
