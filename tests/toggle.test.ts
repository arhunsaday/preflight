import { expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "../src/commands.js";
import { setSkillMode } from "../src/toggle.js";
import { skillManualCandidates } from "../src/analysis.js";
import { PreflightService } from "../src/service.js";
import type { Resource } from "../src/schema.js";

async function fixture() {
  const base = await mkdtemp(
    join(await realpath(tmpdir()), "preflight-toggle-"),
  );
  const root = join(base, "project"),
    home = join(base, "home");
  await mkdir(root, { recursive: true });
  await mkdir(home, { recursive: true });
  const write = async (path: string, text: string) => {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, text);
  };
  const run = (args: string[]) =>
    execute(args, { root, home }) as Promise<Result>;
  return { root, home, write, run, read: (p: string) => readFile(p, "utf8") };
}
interface Result {
  dryRun: boolean;
  tokens: number;
  items: { id: string; method: string; type: string }[];
}
const SKILL = "---\nname: deploy\ndescription: Deploy it\n---\nBody\n";

it("sets and clears disable-model-invocation and keeps every other byte", () => {
  expect(setSkillMode(SKILL, true)).toBe(
    "---\nname: deploy\ndescription: Deploy it\ndisable-model-invocation: true\n---\nBody\n",
  );
  const crlf =
    '---\r\nname: a\r\ndescription: "x: y"  # note\r\n---\r\n\r\nBody  \r\n';
  const manual = setSkillMode(crlf, true);
  expect(manual).toBe(
    '---\r\nname: a\r\ndescription: "x: y"  # note\r\ndisable-model-invocation: true\r\n---\r\n\r\nBody  \r\n',
  );
  expect(setSkillMode(manual, false)).toBe(crlf);
  expect(setSkillMode(manual, true)).toBe(manual);
  const off = "---\nname: a\ndisable-model-invocation: false\nx: 1\n---\nB";
  expect(setSkillMode(off, true)).toBe(
    "---\nname: a\ndisable-model-invocation: true\nx: 1\n---\nB",
  );
  expect(setSkillMode(off, false)).toBe("---\nname: a\nx: 1\n---\nB");
  expect(setSkillMode(SKILL, false)).toBe(SKILL);
  expect(() => setSkillMode("no frontmatter", true)).toThrow(/frontmatter/);
});

it("finds rarely used skills, with the tokens saved", () => {
  const skill = (name: string, config = {}): Resource => ({
    id: `skill:${name}`,
    type: "skill",
    name,
    description: "Does a thing",
    source: "file:///x/SKILL.md",
    scope: "global",
    harnesses: ["claude-code"],
    enabled: true,
    config,
    tags: [],
  });
  const found = skillManualCandidates(
    [
      skill("idle"),
      skill("rare"),
      skill("busy"),
      skill("manual", { "disable-model-invocation": true }),
    ],
    { sessions: 3, invocations: { "skill:rare": 1, "skill:busy": 4 } },
    30,
  );
  expect(found.map((f) => f.resourceId).sort()).toEqual([
    "skill:idle",
    "skill:rare",
  ]);
  expect(found).toHaveLength(2);
  expect(found[0]!.tokens).toBe(Math.ceil("idle\nDoes a thing".length / 4));
  expect(
    skillManualCandidates(
      [skill("idle")],
      { sessions: 0, invocations: {} },
      30,
    ),
  ).toEqual([]);
});

it("previews skill manual, then writes only the frontmatter line with --apply", async () => {
  const f = await fixture();
  const path = join(f.home, ".claude", "skills", "deploy", "SKILL.md");
  await f.write(path, SKILL);
  const preview = await f.run(["skill", "manual", "deploy"]);
  expect(preview.dryRun).toBe(true);
  expect(preview.tokens).toBe(Math.ceil("deploy\nDeploy it".length / 4));
  expect(await f.read(path)).toBe(SKILL);
  const done = await f.run(["skill", "manual", "deploy", "--apply"]);
  expect(done.dryRun).toBe(false);
  expect(await f.read(path)).toBe(
    SKILL.replace("---\nBody", "disable-model-invocation: true\n---\nBody"),
  );
  await f.run(["skill", "auto", "deploy", "--apply"]);
  expect(await f.read(path)).toBe(SKILL);
  await expect(f.run(["skill", "manual", "nope"])).rejects.toThrow(/not found/);
});

it("switches a plugin with the native flag", async () => {
  const f = await fixture();
  const settings = join(f.home, ".claude", "settings.json");
  await f.write(
    settings,
    JSON.stringify({ model: "x", enabledPlugins: { "p@m": true } }, null, 2) +
      "\n",
  );
  const preview = await f.run(["disable", "p@m"]);
  expect(preview.items[0]).toMatchObject({ method: "native", type: "plugin" });
  expect(JSON.parse(await f.read(settings)).enabledPlugins["p@m"]).toBe(true);
  await f.run(["disable", "p@m", "--apply"]);
  expect(JSON.parse(await f.read(settings))).toEqual({
    model: "x",
    enabledPlugins: { "p@m": false },
  });
  await expect(f.run(["disable", "p@m"])).rejects.toThrow(/already off/);
  await f.run(["enable", "p@m", "--apply"]);
  expect(JSON.parse(await f.read(settings)).enabledPlugins["p@m"]).toBe(true);
});

it("switches a project MCP server with disabledMcpjsonServers and a global one through the store", async () => {
  const f = await fixture();
  await f.write(
    join(f.root, ".mcp.json"),
    JSON.stringify({ mcpServers: { local: { command: "a" } } }),
  );
  await f.run(["disable", "local", "--apply"]);
  const local = join(f.root, ".claude", "settings.local.json");
  expect(JSON.parse(await f.read(local))).toEqual({
    disabledMcpjsonServers: ["local"],
  });
  expect(
    JSON.parse(await f.read(join(f.root, ".mcp.json"))).mcpServers.local,
  ).toBeTruthy();
  const states = await new PreflightService({
    root: f.root,
    home: f.home,
  }).detect();
  expect(
    states.flatMap((s) => s.resources).find((r) => r.name === "local")?.enabled,
  ).toBe(false);
  await f.run(["enable", "local", "--apply"]);
  expect(JSON.parse(await f.read(local))).toEqual({});

  const claude = join(f.home, ".claude.json");
  await f.write(
    claude,
    JSON.stringify(
      { mcpServers: { grafana: { command: "g" }, keep: { command: "k" } } },
      null,
      2,
    ) + "\n",
  );
  await f.run(["disable", "mcp:grafana", "--apply"]);
  expect(Object.keys(JSON.parse(await f.read(claude)).mcpServers)).toEqual([
    "keep",
  ]);
  expect(
    existsSync(join(f.home, ".preflight", "disabled", "entries.json")),
  ).toBe(true);
  await f.run(["enable", "grafana", "--apply"]);
  expect(JSON.parse(await f.read(claude)).mcpServers.grafana).toEqual({
    command: "g",
  });
  expect(
    existsSync(join(f.home, ".preflight", "disabled", "entries.json")),
  ).toBe(false);
});

it("switches a Codex MCP server with enabled = false and keeps the rest of the file", async () => {
  const f = await fixture();
  const toml = `# mine\nmodel = "gpt"\n\n[mcp_servers.docs]\ncommand = "npx"\nargs = ["a"]\n\n[other]\nx = 1\n`;
  const path = join(f.home, ".codex", "config.toml");
  await f.write(path, toml);
  await f.run(["disable", "docs", "--apply"]);
  const off = await f.read(path);
  expect(off).toContain("enabled = false");
  expect(off).toContain("# mine");
  expect(off).toContain("[other]\nx = 1");
  await f.run(["enable", "docs", "--apply"]);
  expect(await f.read(path)).not.toContain("enabled");
});

it("moves a skill folder, a subagent and a command to the store and restores them byte for byte", async () => {
  const f = await fixture();
  const skill = join(f.home, ".claude", "skills", "deploy");
  await f.write(join(skill, "SKILL.md"), SKILL);
  await f.write(join(skill, "ref", "notes.md"), "notes\n");
  const agent = join(f.home, ".claude", "agents", "scout.md");
  await f.write(agent, "---\nname: scout\ndescription: Find\n---\nGo\n");
  const preview = await f.run(["disable", "deploy", "scout"]);
  expect(preview.dryRun).toBe(true);
  expect(existsSync(join(skill, "SKILL.md"))).toBe(true);
  expect(preview.tokens).toBe(
    Math.ceil("deploy\nDeploy it".length / 4) +
      Math.ceil("scout\nFind".length / 4),
  );
  await f.run(["disable", "deploy", "scout", "--apply"]);
  expect(existsSync(join(skill, "SKILL.md"))).toBe(false);
  expect(existsSync(agent)).toBe(false);
  expect(
    existsSync(
      join(
        f.home,
        ".preflight",
        "disabled",
        "files",
        ".claude",
        "skills",
        "deploy",
        "ref",
        "notes.md",
      ),
    ),
  ).toBe(true);
  await f.run(["enable", "deploy", "scout", "--apply"]);
  expect(await f.read(join(skill, "SKILL.md"))).toBe(SKILL);
  expect(await f.read(join(skill, "ref", "notes.md"))).toBe("notes\n");
  expect(await f.read(agent)).toBe(
    "---\nname: scout\ndescription: Find\n---\nGo\n",
  );
});

it("moves a hook out of settings and puts it back", async () => {
  const f = await fixture();
  const settings = join(f.home, ".claude", "settings.json");
  const a = { hooks: [{ type: "command", command: "echo a" }] };
  const b = { hooks: [{ type: "command", command: "echo b" }] };
  await f.write(
    settings,
    JSON.stringify({ theme: "x", hooks: { PreToolUse: [a, b] } }, null, 2) +
      "\n",
  );
  await f.run(["disable", "hook:global:PreToolUse:0", "--apply"]);
  expect(JSON.parse(await f.read(settings)).hooks.PreToolUse).toEqual([b]);
  await f.run(["disable", "hook:global:PreToolUse:0", "--apply"]);
  expect(JSON.parse(await f.read(settings))).toEqual({ theme: "x" });
  const ids = (
    await f.run(["enable", "hook:global:PreToolUse:off0"])
  ).items.map((i) => i.id);
  expect(ids).toEqual(["hook:global:PreToolUse:off0"]);
  await f.run([
    "enable",
    "hook:global:PreToolUse:off0",
    "hook:global:PreToolUse:off1",
    "--apply",
  ]);
  expect(JSON.parse(await f.read(settings)).hooks.PreToolUse).toHaveLength(2);
});
