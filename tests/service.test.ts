import {
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { PreflightService } from "../src/service.js";
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
  const root = await mkdtemp(join(await realpath(tmpdir()), "preflight-service-"));
  return new PreflightService({ root, home: join(root, "home") });
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
      hooks: [{ type: "command", command: "echo preflight" }],
    },
  });
  await s.remove("hook:new");
  expect(JSON.parse(await readFile(path, "utf8")).hooks.PreToolUse).toEqual([
    human,
  ]);
});
it("does not report a moved skill as broken because of empty leftover directories", async () => {
  const s = await service();
  await s.init();
  const skill = ResourceSchema.parse({
    ...resource(),
    id: "skill:move",
    type: "skill",
    content: "---\nname: moved\ndescription: Move me\n---\nBody",
    config: { files: [{ path: "scripts/check.sh", contents: "echo check" }] },
  });
  await s.create(skill);
  await s.update(skill.id, { scope: "global" });
  expect(
    (await s.doctor()).filter((f) => f.code === "broken-resource"),
  ).toEqual([]);
});

it("adopts an installed skill where it lives, without rewriting its file", async () => {
  const s = await service();
  await s.init();
  const skill = join(
    s.context.home,
    ".claude",
    "skills",
    "already-here",
    "SKILL.md",
  );
  const body = "---\nname: already-here\ndescription: predates Preflight\n---\n\nBody.\n";
  await mkdir(dirname(skill), { recursive: true });
  await writeFile(skill, body);

  const found = await s.unmanaged();
  expect(found.map((entry) => entry.resource.name)).toEqual(["already-here"]);

  const preview = await s.adopt(found[0]!.resource.id, true);
  expect(preview.files.map((f) => f.path)).not.toContain(skill);
  expect(await s.list()).toHaveLength(0);

  await s.adopt(found[0]!.resource.id);
  const adopted = (await s.list())[0]!;
  expect(adopted.id).toBe("skill:already-here");
  expect(adopted.config.adoptedPath).toBe("skills/already-here/SKILL.md");
  expect(await readFile(skill, "utf8")).toBe(body);
  expect(await s.unmanaged()).toHaveLength(0);

  const lock = JSON.parse(await readFile(join(s.context.root, "preflight.lock.json"), "utf8"));
  expect(lock.files.map((f: { path: string }) => f.path)).toContain(skill);

  // Managing it keeps writing to the same file rather than a second copy.
  await s.update(adopted.id, { content: body.replace("Body.", "Edited.") });
  expect(await readFile(skill, "utf8")).toContain("Edited.");
  expect(await readdir(join(s.context.home, ".claude", "skills"))).toEqual([
    "already-here",
  ]);
  await s.remove(adopted.id);
  await expect(readFile(skill, "utf8")).rejects.toThrow();
  await s.rollback();
  expect(await readFile(skill, "utf8")).toContain("Edited.");
});

it("adopts a harness setting without duplicating the entry it found", async () => {
  const s = await service();
  await s.init();
  const settings = join(s.context.home, ".claude", "settings.json");
  await mkdir(dirname(settings), { recursive: true });
  await writeFile(
    settings,
    JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "true" }] },
        ],
      },
    }),
  );
  const hook = (await s.unmanaged()).find((e) => e.resource.type === "hook")!;
  await s.adopt(hook.resource.id);
  const written = JSON.parse(await readFile(settings, "utf8"));
  expect(written.hooks.PreToolUse).toHaveLength(1);
  expect(await s.unmanaged()).toHaveLength(0);
});

it("refuses to adopt a file linked from another tool's store", async () => {
  const s = await service();
  await s.init();
  const store = join(s.context.root, "store", "shared-skill");
  await mkdir(store, { recursive: true });
  await writeFile(join(store, "SKILL.md"), "---\nname: shared-skill\n---\nx\n");
  const skills = join(s.context.home, ".claude", "skills");
  await mkdir(skills, { recursive: true });
  await symlink(store, join(skills, "shared-skill"));
  const found = (await s.unmanaged()).find(
    (e) => e.resource.name === "shared-skill",
  )!;
  expect(found).toBeTruthy();
  await expect(s.adopt(found.resource.id)).rejects.toThrow(
    /link into another tool's store/,
  );
});

