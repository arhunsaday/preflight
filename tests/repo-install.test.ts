import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { execute } from "../src/commands.js";
import { isRepositorySpec, parseRepoSpec } from "../src/repo-install.js";

const fixture = resolve(import.meta.dirname, "fixtures/repo-install");

async function workspace(agents: string[] = [".claude", ".codex"]) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "preflight-install-")),
  );
  const context = { root: join(root, "project"), home: join(root, "home") };
  await mkdir(context.root);
  for (const dir of agents) await mkdir(join(context.home, dir), { recursive: true });
  if (!agents.length) await mkdir(context.home);
  await execute(["init"], context);
  return context;
}
const read = (path: string) => readFile(path, "utf8");
afterEach(() => vi.unstubAllGlobals());

interface Report {
  repository: Record<string, unknown>;
  detected: string[];
  harnesses: string[];
  found: Record<
    string,
    { id: string; supports: string[]; reasons: Record<string, string> }[]
  >;
  install: { id: string; harnesses: string[] }[];
  skipped: { id: string; harness?: string; reason: string }[];
  files: { path: string; after: string | null }[];
  dryRun: boolean;
  hint?: string;
}

it("tells repository arguments from resource ids", () => {
  expect(isRepositorySpec("anthropics/skills")).toBe(true);
  expect(isRepositorySpec("anthropics/skills@v1")).toBe(true);
  expect(isRepositorySpec("github:anthropics/skills@main/skills/pdf")).toBe(
    true,
  );
  expect(isRepositorySpec("https://github.com/anthropics/skills")).toBe(true);
  expect(isRepositorySpec("./repo")).toBe(true);
  expect(isRepositorySpec("skill:pdf")).toBe(false);
  expect(isRepositorySpec("plugin:a/b")).toBe(false);
  expect(parseRepoSpec("github:a/b@v2/skills/pdf", "/x")).toEqual({
    kind: "github",
    repo: "a/b",
    ref: "v2",
    subdir: "skills/pdf",
  });
  expect(
    parseRepoSpec("https://github.com/a/b.git/tree/main/tools", "/x"),
  ).toEqual({ kind: "github", repo: "a/b", ref: "main", subdir: "tools" });
  expect(parseRepoSpec("a/b", "/x")).toEqual({ kind: "github", repo: "a/b" });
  expect(parseRepoSpec("./kit", "/work")).toEqual({
    kind: "local",
    path: "/work/kit",
  });
  expect(() => parseRepoSpec("a/b@-x", "/x")).toThrow(/Invalid ref/);
  expect(() => parseRepoSpec("a/b@v1/../etc", "/x")).toThrow(/Invalid folder/);
});

it("scans a repository and previews without writing", async () => {
  const context = await workspace();
  const config = await read(join(context.root, "preflight.config.json"));
  const report = (await execute(["install", fixture], context)) as Report;
  expect(report.dryRun).toBe(true);
  expect(report.detected).toEqual(["claude-code", "codex"]);
  expect(Object.keys(report.found).sort()).toEqual([
    "command",
    "mcp",
    "plugin",
    "skill",
    "subagent",
  ]);
  expect(report.found.skill!.map((s) => s.id)).toEqual([
    "skill:pdf-tools",
    "skill:helper",
  ]);
  const events = report.found.mcp!.find((m) => m.id === "mcp:events")!;
  expect(events.supports).toEqual(["claude-code", "cursor"]);
  expect(events.reasons.codex).toMatch(/not SSE/);
  expect(report.found.mcp!.find((m) => m.id === "mcp:local-server")).toMatchObject({
    supports: [],
    reasons: { "claude-code": expect.stringMatching(/runs \.\/server\.js/) },
  });
  expect(report.found.subagent![0]!.reasons.codex).toMatch(/no subagent/);
  expect(report.hint).toMatch(/--select/);
  expect(report.files.length).toBeGreaterThan(0);
  // Nothing was written: the configuration is unchanged and no agent file exists.
  expect(await read(join(context.root, "preflight.config.json"))).toBe(config);
  await expect(readdir(join(context.root, ".claude"))).rejects.toThrow();
  await expect(read(join(context.root, ".mcp.json"))).rejects.toThrow();
  await expect(
    execute(["install", fixture, "--apply"], context),
  ).rejects.toThrow(/--select <id,...> or --all/);
});

it("installs for Claude Code and Codex, records the origin, and removes", async () => {
  const context = await workspace();
  const report = (await execute(
    ["install", fixture, "--all", "--apply"],
    context,
  )) as Report;
  expect(report.dryRun).toBe(false);
  const installed = Object.fromEntries(
    report.install.map((r) => [r.id, r.harnesses]),
  );
  expect(installed).toEqual({
    "skill:pdf-tools": ["claude-code", "codex"],
    "plugin:helper": ["claude-code"],
    "skill:helper": ["codex"],
    "subagent:code-reviewer": ["claude-code"],
    "command:ship": ["claude-code"],
    "mcp:docs": ["claude-code", "codex"],
    "mcp:events": ["claude-code"],
  });
  const reasons = report.skipped.map(
    (s) => `${s.id} ${s.harness ?? ""}: ${s.reason}`,
  );
  expect(reasons).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^skill:helper claude-code: Comes with plugin:helper/),
      expect.stringMatching(/^command:ship codex: .*custom prompts/),
      expect.stringMatching(/^mcp:events codex: .*SSE/),
      expect.stringMatching(/^mcp:local-server claude-code: .*server\.js/),
      expect.stringMatching(/^plugin:helper codex: Plugins are a Claude Code format/),
    ]),
  );
  const skills = await readdir(join(context.root, ".claude", "skills"));
  expect(skills).toHaveLength(1);
  const skillDir = join(context.root, ".claude", "skills", skills[0]!);
  expect(await read(join(skillDir, "SKILL.md"))).toMatch(/name: pdf-tools/);
  expect(await read(join(skillDir, "reference.md"))).toMatch(/Form fields/);
  expect(await readdir(join(context.root, ".agents", "skills"))).toHaveLength(2);
  expect(
    (await readdir(join(context.root, ".claude", "agents")))[0],
  ).toMatch(/^subagent-code-reviewer/);
  const mcp = JSON.parse(await read(join(context.root, ".mcp.json")));
  expect(Object.keys(mcp.mcpServers).sort()).toEqual(["docs", "events"]);
  const toml = await read(join(context.root, ".codex", "config.toml"));
  expect(toml).toMatch(/\[mcp_servers\.docs\]/);
  expect(toml).not.toMatch(/events/);
  const settings = JSON.parse(
    await read(join(context.root, ".claude", "settings.json")),
  );
  expect(settings.enabledPlugins).toEqual({ "helper@fixture-tools": true });
  expect(settings.extraKnownMarketplaces["fixture-tools"].source).toEqual({
    source: "directory",
    path: fixture,
  });

  const list = (await execute(["list"], context)) as {
    id: string;
    origin?: unknown;
  }[];
  expect(list.find((r) => r.id === "skill:pdf-tools")?.origin).toEqual({
    kind: "local",
    root: fixture,
    path: "skills/pdf-tools/SKILL.md",
  });

  // A managed file edited by hand is drift.
  await writeFile(join(skillDir, "SKILL.md"), "changed\n");
  const findings = (await execute(
    ["doctor", "--no-transcripts"],
    context,
  )) as { code: string; message: string }[];
  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "drift",
        message: expect.stringContaining("SKILL.md"),
      }),
    ]),
  );
  await writeFile(
    join(skillDir, "SKILL.md"),
    await read(join(fixture, "skills/pdf-tools/SKILL.md")),
  );

  // Installing again from the same repository replaces, not duplicates.
  const again = (await execute(
    ["install", fixture, "--select", "pdf-tools", "--apply"],
    context,
  )) as Report;
  expect(again.install.map((r) => r.id)).toEqual(["skill:pdf-tools"]);

  await execute(["delete", "skill:pdf-tools"], context);
  await execute(["delete", "mcp:docs"], context);
  await expect(read(join(skillDir, "SKILL.md"))).rejects.toThrow();
  await expect(read(join(skillDir, "reference.md"))).rejects.toThrow();
  expect(
    Object.keys(
      JSON.parse(await read(join(context.root, ".mcp.json"))).mcpServers,
    ),
  ).toEqual(["events"]);
  expect(
    await read(join(context.root, ".codex", "config.toml")),
  ).not.toMatch(/docs/);
});

it("skips an id that another source owns and an agent that is not here", async () => {
  const context = await workspace([]);
  const none = (await execute(
    ["install", fixture, "--select", "skill:pdf-tools"],
    context,
  )) as Report;
  expect(none.detected).toEqual([]);
  expect(none.install).toEqual([]);
  expect(none.skipped[0]!.reason).toMatch(/No supported agent was detected/);
  await execute(
    [
      "create-json",
      JSON.stringify({
        id: "skill:pdf-tools",
        type: "skill",
        name: "pdf-tools",
        source: "local",
        scope: "project",
        harnesses: ["claude-code"],
        content: "---\nname: pdf-tools\n---\nMine.\n",
      }),
    ],
    context,
  );
  const taken = (await execute(
    ["install", fixture, "--select", "pdf-tools", "--harness", "claude-code"],
    context,
  )) as Report;
  expect(taken.install).toEqual([]);
  expect(taken.skipped[0]!.reason).toMatch(/exists and does not come from/);
});

it("fetches a GitHub repository at a pinned commit", async () => {
  const context = await workspace([".claude"]);
  const sha = "c".repeat(40);
  const staging = join(context.home, "..", "staging");
  await mkdir(staging);
  await cp(fixture, join(staging, `tools-${sha}`), { recursive: true });
  const archive = join(context.home, "..", "tools.tgz");
  execFileSync("tar", ["-czf", archive, "-C", staging, "."]);
  const bytes = await readFile(archive);
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url === "https://api.github.com/repos/acme/tools/commits/HEAD")
        return new Response(sha);
      if (url === `https://codeload.github.com/acme/tools/tar.gz/${sha}`)
        return new Response(bytes);
      return new Response("not found", { status: 404 });
    }),
  );
  const report = (await execute(
    ["install", "acme/tools", "--select", "pdf-tools,helper@fixture-tools", "--apply"],
    context,
  )) as Report;
  expect(report.repository).toEqual({
    kind: "github",
    repo: "acme/tools",
    commit: sha,
  });
  expect(report.install.map((r) => r.id)).toEqual([
    "skill:pdf-tools",
    "plugin:helper",
  ]);
  const [skill, plugin] = (await execute(["list"], context)) as {
    source: string;
    origin: unknown;
  }[];
  expect(skill).toMatchObject({
    source: `https://github.com/acme/tools/blob/${sha}/skills/pdf-tools/SKILL.md`,
    origin: {
      kind: "github",
      repo: "acme/tools",
      commit: sha,
      path: "skills/pdf-tools/SKILL.md",
    },
  });
  expect(plugin).toMatchObject({
    origin: { path: "plugins/helper" },
  });
  const settings = JSON.parse(
    await read(join(context.root, ".claude", "settings.json")),
  );
  expect(settings.extraKnownMarketplaces["fixture-tools"].source).toEqual({
    source: "github",
    repo: "acme/tools",
  });
  expect(
    await readdir(
      join(context.home, ".preflight", "sources", "_install", "acme", "tools"),
    ),
  ).toEqual([sha]);
  // A folder inside the repository is scanned on its own; the commit is cached.
  const folder = (await execute(
    ["install", `github:acme/tools@${sha}/skills/pdf-tools`],
    context,
  )) as Report;
  expect(folder.found.skill![0]).toMatchObject({
    id: "skill:pdf-tools",
    path: "skills/pdf-tools/SKILL.md",
  });
  expect(calls.filter((c) => c.includes("codeload"))).toHaveLength(1);
}, 15000);

it("scans as a read in the desktop and installs only after confirmation", async () => {
  const { DesktopController } = await import("../desktop/main/controller.js");
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "preflight-install-desktop-")),
  );
  const controller = new DesktopController(
    join(root, "desktop-state.json"),
    root,
    async (args, context) => execute(args, context),
  );
  await controller.load();
  await controller.addProject(root);
  await controller.confirm((await controller.prepare(["init"])).receipt!);
  const scan = await controller.prepare(["install", fixture]);
  expect(scan.kind).toBe("result");
  expect(scan.receipt).toBeUndefined();
  const args = [
    "install",
    fixture,
    "--select",
    "mcp:docs",
    "--harness",
    "claude-code",
    "--apply",
  ];
  const preview = await controller.prepare(args);
  expect(preview.kind).toBe("preview");
  expect(preview.note).toBeUndefined();
  await expect(read(join(root, ".mcp.json"))).rejects.toThrow();
  await controller.confirm(preview.receipt!);
  expect(
    JSON.parse(await read(join(root, ".mcp.json"))).mcpServers.docs,
  ).toEqual({ command: "npx", args: ["-y", "docs-mcp"] });
});
