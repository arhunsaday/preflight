import { execFileSync } from "node:child_process";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { execute } from "../src/commands.js";
import { buildCatalog } from "../src/catalog-build.js";
import { installationPlan } from "../src/operations.js";
import { parseSourceSpec } from "../src/sources.js";
import { PreflightService } from "../src/service.js";
import { ResourceSchema } from "../src/schema.js";
import { fixtureCatalog } from "./support/sources.js";

async function workspace() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "preflight-sources-")),
  );
  const context = { root, home: join(root, "home") };
  await mkdir(context.home);
  return context;
}
afterEach(() => vi.unstubAllGlobals());

it("parses GitHub and local source specs", () => {
  expect(parseSourceSpec("github:arhunsaday/agent-kit@v1.2.0", "/x")).toEqual({
    kind: "github",
    repo: "arhunsaday/agent-kit",
    ref: "v1.2.0",
    name: "agent-kit",
  });
  expect(
    parseSourceSpec("https://github.com/arhunsaday/agent-kit", "/x"),
  ).toMatchObject({ kind: "github", repo: "arhunsaday/agent-kit" });
  expect(parseSourceSpec("./kit", "/work")).toEqual({
    kind: "local",
    path: "/work/kit",
    name: "kit",
  });
  expect(() => parseSourceSpec("agent-kit", "/x")).toThrow(/Unrecognised/);
  expect(() => parseSourceSpec("github:a/b@-x", "/x")).toThrow(/Invalid ref/);
});

it("ships no catalogue and says how to add a source", async () => {
  const context = await workspace();
  const search = (await execute(["search", "ponytail"], context)) as {
    resources: unknown[];
    hint?: string;
  };
  expect(search.resources).toEqual([]);
  expect(search.hint).toMatch(
    /preflight source add github:arhunsaday\/agent-kit/,
  );
  expect(await execute(["loadouts", "list"], context)).toMatchObject({
    loadouts: [],
    hint: expect.stringContaining("source add"),
  });
});

it("adds a local source, searches it with the source shown, and removes it", async () => {
  const context = await workspace();
  expect(
    await execute(["source", "add", fixtureCatalog, "--dry-run"], context),
  ).toMatchObject({
    action: "add",
    source: { name: "catalog", kind: "local" },
  });
  await expect(
    readFile(join(context.home, ".preflight", "sources.json"), "utf8"),
  ).rejects.toThrow();
  expect(
    await execute(
      ["source", "add", fixtureCatalog, "--name", "fixture"],
      context,
    ),
  ).toMatchObject({ action: "added", resources: 5, loadouts: 2 });
  const found = (await execute(["search", "ponytail"], context)) as {
    resources: { name: string; tags: string[] }[];
  };
  expect(found.resources[0]).toMatchObject({ name: "ponytail" });
  expect(found.resources[0]!.tags).toContain("source:fixture");
  expect(await execute(["loadouts", "list"], context)).toMatchObject({
    loadouts: ["base", "junior"],
    presets: { "junior-web": ["junior"] },
    details: { base: { source: "fixture", description: "Everyone" } },
  });
  expect(
    (await execute(["loadouts", "show", "fixture/base"], context)) as unknown[],
  ).toHaveLength(3);
  expect(await execute(["source", "list"], context)).toMatchObject({
    sources: [{ name: "fixture", resources: 5, loadouts: 2 }],
  });
  await execute(["source", "remove", "fixture"], context);
  expect(await execute(["source", "list"], context)).toMatchObject({
    sources: [],
  });
});

it("builds a typed catalogue index from a content repository", async () => {
  const index = await buildCatalog(fixtureCatalog, {
    repo: "arhunsaday/agent-kit",
    ref: "v1",
  });
  const types = Object.fromEntries(
    index.resources.map((r) => {
      const resource = ResourceSchema.parse(r);
      return [resource.id, resource.type];
    }),
  );
  expect(types).toEqual({
    "skill:ponytail": "skill",
    "subagent:reviewer": "subagent",
    "hook:protect-files": "hook",
    "instructions:claude-global": "instructions",
    "plugin:hello": "plugin",
  });
}, 10000);

it("writes catalog/index.json with catalog build and checks it is current", async () => {
  const context = await workspace();
  const kit = join(context.root, "kit");
  await cp(fixtureCatalog, kit, { recursive: true });
  const built = (await execute(
    ["catalog", "build", kit, "--repo", "arhunsaday/agent-kit"],
    context,
  )) as { resources: number; byType: Record<string, number> };
  expect(built.byType).toMatchObject({ skill: 1, plugin: 1, instructions: 1 });
  const index = JSON.parse(
    await readFile(join(kit, "catalog", "index.json"), "utf8"),
  );
  expect(index).toMatchObject({ schema: 1, name: "agent-kit" });
  const plugin = index.resources.find(
    (r: { id: string }) => r.id === "plugin:hello",
  );
  expect(plugin).toMatchObject({
    name: "hello@fixture-plugins",
    config: {
      marketplace: {
        name: "fixture-plugins",
        source: { source: "github", repo: "arhunsaday/agent-kit" },
      },
      version: "1.0.0",
    },
  });
  await execute(
    ["catalog", "build", kit, "--repo", "arhunsaday/agent-kit", "--check"],
    context,
  );
  await writeFile(join(kit, "claude", "CLAUDE.md"), "# Changed\n");
  await expect(
    execute(
      ["catalog", "build", kit, "--repo", "arhunsaday/agent-kit", "--check"],
      context,
    ),
  ).rejects.toThrow(/out of date/);
});

it("pins a GitHub source to a commit and caches its tarball", async () => {
  const context = await workspace();
  const sha = "a".repeat(40);
  const next = "b".repeat(40);
  const staging = join(context.root, "staging");
  await mkdir(staging);
  await cp(fixtureCatalog, join(staging, `agent-kit-${sha}`), {
    recursive: true,
  });
  execFileSync("tar", [
    "-czf",
    join(context.root, "kit.tgz"),
    "-C",
    staging,
    ".",
  ]);
  const archive = await readFile(join(context.root, "kit.tgz"));
  const calls: string[] = [];
  let head = sha;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (
        url.startsWith(
          "https://api.github.com/repos/arhunsaday/agent-kit/commits/",
        )
      )
        return new Response(head);
      if (
        url.startsWith(
          "https://codeload.github.com/arhunsaday/agent-kit/tar.gz/",
        )
      )
        return new Response(archive);
      return new Response("not found", { status: 404 });
    }),
  );
  const added = (await execute(
    ["source", "add", "github:arhunsaday/agent-kit@main"],
    context,
  )) as { source: { commit: string; ref: string }; resources: number };
  expect(added.source).toMatchObject({ commit: sha, ref: "main" });
  expect(added.resources).toBe(5);
  const cache = join(context.home, ".preflight", "sources", "agent-kit");
  expect(await readdir(cache)).toEqual([sha]);
  const found = (await execute(
    ["search", "hello", "--type", "plugin"],
    context,
  )) as {
    resources: { name: string; config: { marketplace: unknown } }[];
  };
  expect(found.resources[0]).toMatchObject({
    name: "hello@fixture-plugins",
    config: {
      marketplace: {
        source: { source: "github", repo: "arhunsaday/agent-kit" },
      },
    },
  });
  expect(await execute(["source", "update"], context)).toMatchObject({
    sources: [{ name: "agent-kit", status: "up to date" }],
  });
  head = next;
  expect(
    await execute(["source", "update", "agent-kit"], context),
  ).toMatchObject({
    sources: [{ status: "updated", from: sha, commit: next }],
  });
  expect(await readdir(cache)).toEqual([next]);
  expect(calls.filter((c) => c.includes("codeload"))).toHaveLength(2);
  await execute(["source", "remove", "agent-kit"], context);
  await expect(readdir(cache)).rejects.toThrow();
}, 15000);

it("installs a plugin from a source: marketplace first, then the plugin (ASA-345)", async () => {
  const context = await workspace();
  await execute(
    ["source", "add", fixtureCatalog, "--name", "fixture"],
    context,
  );
  await execute(["--global", "init"], context);
  await execute(["--global", "catalog-add", "plugin:hello"], context);
  const settings = JSON.parse(
    await readFile(join(context.home, ".claude", "settings.json"), "utf8"),
  );
  expect(settings).toEqual({
    enabledPlugins: { "hello@fixture-plugins": true },
    extraKnownMarketplaces: {
      "fixture-plugins": {
        source: { source: "directory", path: fixtureCatalog },
      },
    },
  });
  const plugin = await new PreflightService({
    root: join(context.home, ".preflight", "global"),
    home: context.home,
    globalOnly: true,
  }).inspect("plugin:hello");
  expect(installationPlan(plugin)).toEqual({
    command: "claude",
    args: ["plugin", "install", "hello@fixture-plugins", "--scope", "user"],
    before: [
      {
        command: "claude",
        args: [
          "plugin",
          "marketplace",
          "add",
          fixtureCatalog,
          "--scope",
          "user",
        ],
      },
    ],
  });

  // A stand-in `claude` records what Preflight runs and in which home.
  const bin = join(context.root, "bin");
  await mkdir(bin);
  const log = join(context.root, "claude.log");
  await writeFile(
    join(bin, "claude"),
    `#!/bin/sh\necho "$CLAUDE_CONFIG_DIR $*" >> '${log}'\n`,
  );
  await chmod(join(bin, "claude"), 0o755);
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    await execute(
      ["--global", "install", "plugin:hello", "--execute"],
      context,
    );
  } finally {
    process.env.PATH = path;
  }
  const config = join(context.home, ".claude");
  expect((await readFile(log, "utf8")).trim().split("\n")).toEqual([
    `${config} plugin marketplace add ${fixtureCatalog} --scope user`,
    `${config} plugin install hello@fixture-plugins --scope user`,
  ]);

  await execute(["--global", "delete", "plugin:hello"], context);
  expect(
    JSON.parse(
      await readFile(join(context.home, ".claude", "settings.json"), "utf8"),
    ),
  ).toEqual({ enabledPlugins: {} });
}, 15000);

// Runs the real Claude Code CLI against the fixture marketplace in a
// disposable home. Opt in with PREFLIGHT_REAL_CLAUDE=1.
it.runIf(process.env.PREFLIGHT_REAL_CLAUDE === "1")(
  "installs the fixture plugin with the real claude CLI",
  async () => {
    const context = await workspace();
    await execute(
      ["source", "add", fixtureCatalog, "--name", "fixture"],
      context,
    );
    await execute(["--global", "init"], context);
    await execute(["--global", "catalog-add", "plugin:hello"], context);
    await execute(
      ["--global", "install", "plugin:hello", "--execute"],
      context,
    );
    const installed = JSON.parse(
      await readFile(
        join(context.home, ".claude", "plugins", "installed_plugins.json"),
        "utf8",
      ),
    );
    expect(JSON.stringify(installed)).toContain("hello@fixture-plugins");
  },
  120000,
);
