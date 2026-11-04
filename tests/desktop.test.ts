import { it, expect } from "vitest";
import { mkdtemp, realpath, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DesktopController,
  validateCommand,
} from "../desktop/main/controller.js";
import { execute } from "../src/commands.js";

const setup = async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-desktop-"));
  const controller = new DesktopController(
    join(root, "desktop-state.json"),
    root,
    async (args, context) => execute(args, context),
  );
  await controller.load();
  return { root, controller };
};
it("rejects renderer overrides and unknown operations", () => {
  expect(() => validateCommand(["list", "--root", "/"])).toThrow();
  expect(() => validateCommand(["list", "--home=/"])).toThrow();
  expect(() => validateCommand(["shell", "rm"])).toThrow();
  expect(() => validateCommand(["--root", "/", "list"])).toThrow();
});
it("remembers explicitly selected canonical project paths without initializing them", async () => {
  const { root, controller } = await setup();
  const state = await controller.addProject(root);
  expect(state.projects).toHaveLength(1);
  await expect(readFile(join(root, "adk.config.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  const second = new DesktopController(
    join(root, "desktop-state.json"),
    root,
    async (args, ctx) => execute(args, ctx),
  );
  expect((await second.load()).activeProjectId).toBe(state.activeProjectId);
});
it("uses project-bound one-use confirmation receipts and previews without writes", async () => {
  const { root, controller } = await setup();
  await controller.addProject(root);
  const preview = await controller.prepare(["init"]);
  expect(preview.kind).toBe("preview");
  await expect(readFile(join(root, "adk.config.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  await controller.confirm(preview.receipt!);
  await expect(controller.confirm(preview.receipt!)).rejects.toThrow();
  expect(
    JSON.parse(await readFile(join(root, "adk.config.json"), "utf8"))
      .activeProfile,
  ).toBe("default");
  const next = await controller.prepare(["profiles", "create", "other"]);
  const other = await mkdtemp(join(await realpath(tmpdir()), "adk-other-"));
  await controller.addProject(other);
  await expect(controller.confirm(next.receipt!)).rejects.toThrow(/project/i);
});
it("refuses confirmation if desired state changed since the preview", async () => {
  const { root, controller } = await setup();
  await controller.addProject(root);
  await controller.confirm((await controller.prepare(["init"])).receipt!);
  const preview = await controller.prepare(["profiles", "create", "next"]);
  await execute(["profiles", "create", "outside"], { root, home: root });
  await expect(controller.confirm(preview.receipt!)).rejects.toThrow(
    /changed/i,
  );
});
it("never exposes stored auth ciphertext through its public state and persists the local roster", async () => {
  const { controller } = await setup();
  await controller.updateTeam({
    name: "Platform",
    members: [{ name: "Ada", email: "ada@example.com", role: "owner" }],
  });
  expect(controller.publicState().team.members[0]?.name).toBe("Ada");
  expect(JSON.stringify(controller.publicState())).not.toContain(
    "encryptedToken",
  );
});

it("does not forward an account token to a renderer-supplied service", async () => {
  const { root, controller } = await setup();
  await controller.addProject(root);
  await controller.setAccount(
    {
      service: "https://trusted.example",
      ownerId: "owner",
      token: "account-secret",
    },
    "ciphertext",
  );
  await expect(
    controller.prepare(["share", "--service", "https://other.example"]),
  ).rejects.toThrow(/account/i);
  expect(JSON.stringify(controller.publicState())).not.toContain(
    "account-secret",
  );
  expect(await readFile(controller.path, "utf8")).not.toContain(
    "account-secret",
  );
});
it("expires old receipts and treats connected verification as an explicit operation", async () => {
  const { root, controller } = await setup();
  await controller.addProject(root);
  const preview = await controller.prepare(["init"]);
  const { vi } = await import("vitest");
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60000);
  try {
    await expect(controller.confirm(preview.receipt!)).rejects.toThrow(
      /expired/i,
    );
  } finally {
    clock.mockRestore();
  }
});

it("never gives installer commands access to the connected share token", async () => {
  const { root, controller } = await setup();
  await controller.addProject(root);
  const seen: unknown[] = [];
  const protectedController = new DesktopController(
    join(root, "protected.json"),
    root,
    async (args, _context, auth) => {
      seen.push(auth);
      return { args };
    },
  );
  await protectedController.load();
  await protectedController.addProject(root);
  await protectedController.setAccount(
    {
      service: "https://trusted.example",
      ownerId: "owner",
      token: "share-secret",
    },
    "cipher",
  );
  await protectedController.confirm(
    (await protectedController.prepare(["install", "tool:test", "--execute"]))
      .receipt!,
  );
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.every((value) => value === undefined)).toBe(true);
});
it("refuses switching project while a slow preview is being prepared", async () => {
  const { root } = await setup();
  let release: () => void = () => {};
  const slow = new DesktopController(
    join(root, "slow.json"),
    root,
    async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {};
    },
  );
  await slow.load();
  const state = await slow.addProject(root);
  const other = await mkdtemp(join(await realpath(tmpdir()), "adk-context-"));
  await slow.addProject(other);
  await slow.selectProject(state.projects[0]!.id);
  const preparing = slow.prepare(["init"]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await expect(
    slow.selectProject(slow.publicState().projects[1]!.id),
  ).rejects.toThrow(/running/i);
  release();
  await preparing;
});
it("invalidates confirmations when the connected account changes", async () => {
  const { root, controller } = await setup();
  await controller.addProject(root);
  const preview = await controller.prepare(["init"]);
  await controller.setAccount(
    { service: "https://trusted.example", ownerId: "owner", token: "secret" },
    "cipher",
  );
  await expect(controller.confirm(preview.receipt!)).rejects.toThrow();
});

it("requires another preview when an imported resource file changes", async () => {
  const { root, controller } = await setup();
  await controller.addProject(root);
  await controller.confirm((await controller.prepare(["init"])).receipt!);
  const { writeFile } = await import("node:fs/promises");
  const resource = {
    id: "mcp:test",
    name: "test",
    type: "mcp",
    source: "local:test",
    scope: "project",
    harnesses: ["claude-code"],
    config: { url: "https://original.example/mcp" },
  };
  const path = join(root, "incoming.json");
  await writeFile(path, JSON.stringify(resource));
  const preview = await controller.prepare(["create", path]);
  resource.config.url = "https://changed.example/mcp";
  await writeFile(path, JSON.stringify(resource));
  await expect(controller.confirm(preview.receipt!)).rejects.toThrow(
    /changed/i,
  );
  expect(
    JSON.parse(await readFile(join(root, "adk.config.json"), "utf8")).profiles
      .default.resources,
  ).toHaveLength(0);
});

it("strips managed and inherited share tokens before running a real MCP subprocess", async () => {
  const { root } = await setup();
  const context = { root, home: root };
  await execute(["init"], context);
  const { writeFile } = await import("node:fs/promises");
  const { build } = await import("esbuild");
  const { spawn } = await import("node:child_process");
  const observed = join(root, "observed-token.txt"),
    server = join(root, "server.cjs"),
    worker = join(root, "worker.mjs");
  await writeFile(
    server,
    `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(observed)},process.env.ADK_SHARE_TOKEN??'absent');let text='';process.stdin.on('data',chunk=>{text+=chunk;let at;while((at=text.indexOf('\\n'))!==-1){const line=text.slice(0,at);text=text.slice(at+1);if(!line)continue;const q=JSON.parse(line);if(q.id===undefined)continue;let result=q.method==='initialize'?{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'test',version:'1'}}:{tools:[]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');}});`,
  );
  await execute(
    [
      "create-json",
      JSON.stringify({
        id: "mcp:probe",
        name: "probe",
        type: "mcp",
        source: "local:test",
        scope: "project",
        harnesses: ["claude-code"],
        config: { command: process.execPath, args: [server] },
      }),
    ],
    context,
  );
  await build({
    entryPoints: ["desktop/worker.ts"],
    outfile: worker,
    bundle: true,
    platform: "node",
    format: "esm",
    banner: {
      js: 'import {createRequire} from "node:module";const require=createRequire(import.meta.url);',
    },
  });
  const reply = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [worker], {
      env: { ...process.env, ADK_SHARE_TOKEN: "inherited-secret" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      error = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (error += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(output) : reject(new Error(error || output)),
    );
    child.stdin.end(
      JSON.stringify({
        args: ["verify", "mcp:probe", "--connect"],
        context,
        auth: {
          service: "https://example.com",
          ownerId: "owner",
          token: "managed-secret",
        },
      }),
    );
  });
  expect(JSON.parse(reply).value.connected).toBe(true);
  expect(await readFile(observed, "utf8")).toBe("absent");
}, 15000);

it("previews export overwrites and rejects a changed destination", async () => {
  const { writeFile } = await import("node:fs/promises");
  const { root, controller } = await setup();
  await controller.addProject(root);
  await controller.confirm((await controller.prepare(["init"])).receipt!);
  await execute(
    [
      "create-json",
      JSON.stringify({
        id: "skill:export-test",
        name: "export-test",
        type: "skill",
        source: "local:test",
        scope: "project",
        harnesses: ["claude-code"],
        content: "# Export test",
      }),
    ],
    { root, home: root },
  );
  const path = join(root, "payload.json");
  await writeFile(path, "original contents");
  const preview = await controller.prepare(["share", "--out", path]);
  expect(preview.value).toMatchObject({
    dryRun: true,
    files: [{ path, before: "original contents" }],
  });
  expect(await readFile(path, "utf8")).toBe("original contents");
  await writeFile(path, "external edit");
  await expect(controller.confirm(preview.receipt!)).rejects.toThrow(
    /changed/i,
  );
  expect(await readFile(path, "utf8")).toBe("external edit");
});

it("manages global resources without a project and isolates the desired configuration", async () => {
  const { root, controller } = await setup();
  await controller
    .prepare(["init"])
    .then((p) => controller.confirm(p.receipt!));
  const resource = {
    id: "mcp:global-test",
    name: "global-test",
    type: "mcp",
    source: "local:test",
    scope: "global",
    harnesses: ["claude-code"],
    config: { url: "https://example.com/mcp" },
  };
  await controller
    .prepare(["create-json", JSON.stringify(resource)])
    .then((p) => controller.confirm(p.receipt!));
  const globalConfig = join(root, ".adk", "global", "adk.config.json");
  expect(
    JSON.parse(await readFile(globalConfig, "utf8")).profiles.default
      .resources[0].scope,
  ).toBe("global");
  await expect(readFile(join(root, "adk.config.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(
    controller.prepare([
      "create-json",
      JSON.stringify({ ...resource, id: "mcp:project", scope: "project" }),
    ]),
  ).rejects.toThrow(/global/i);
});

it("CLI global configuration shares the desktop store and preserves project config", async () => {
  const { root } = await setup();
  await execute(["init", "--global"], { root, home: root });
  expect(
    JSON.parse(
      await readFile(join(root, ".adk", "global", "adk.config.json"), "utf8"),
    ).activeProfile,
  ).toBe("default");
  await expect(readFile(join(root, "adk.config.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it("invalidates previews between global and project workspaces and returns to global after forgetting the last project", async () => {
  const { root, controller } = await setup();
  await controller
    .prepare(["init"])
    .then((p) => controller.confirm(p.receipt!));
  const pending = await controller.prepare([
    "profiles",
    "create",
    "global-next",
  ]);
  const state = await controller.addProject(root);
  await expect(controller.confirm(pending.receipt!)).rejects.toThrow();
  expect((await controller.selectGlobal()).workspace).toBe("global");
  await controller.selectProject(state.activeProjectId!);
  expect(
    (await controller.forgetProject(state.activeProjectId!)).workspace,
  ).toBe("global");
  expect(controller.context().root).toBe(join(root, ".adk", "global"));
});

it("projects show inherited global resources without offering them for adoption again", async () => {
  const { root } = await setup();
  await execute(["init", "--global"], { root, home: root });
  await execute(
    [
      "create-json",
      JSON.stringify({
        id: "mcp:shared",
        name: "shared",
        type: "mcp",
        source: "local:test",
        scope: "global",
        harnesses: ["claude-code"],
        config: { url: "https://example.com/mcp" },
      }),
      "--global",
    ],
    { root, home: root },
  );
  await execute(["init"], { root, home: root });
  const { snapshot } = await import("../desktop/engine.js");
  const result = await snapshot({ root, home: root });
  expect(result.inherited).toHaveLength(1);
  expect(result.inherited[0]?.id).toBe("mcp:shared");
  expect(result.detected.filter((r) => r.name === "shared")).toHaveLength(0);
});
