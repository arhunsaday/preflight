import { expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "../src/commands.js";
import {
  descriptionTokens,
  jaccard,
  skillClusters,
  unusedContext,
  type Finding,
} from "../src/analysis.js";
import { codexOf } from "../src/doctor-global.js";
import { formatDoctor } from "../src/doctor.js";
import { parseImports, unifiedDiff } from "../src/instructions.js";
import { mcpProcesses, parsePs } from "../src/mcp-footprint.js";
import { PreflightConfigSchema, defaultConfig, type Resource } from "../src/schema.js";
import { PreflightService } from "../src/service.js";

async function fixture() {
  const base = await mkdtemp(join(await realpath(tmpdir()), "preflight-doctor2-"));
  const root = join(base, "project"),
    home = join(base, "home");
  await mkdir(root, { recursive: true });
  await mkdir(join(home, ".claude", "projects", "p"), { recursive: true });
  const write = async (path: string, text: string) => {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, text);
  };
  const skill = (name: string, description: string, body = "Body", extra = "") =>
    write(
      join(home, ".claude", "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n${extra}---\n${body}\n`,
    );
  const transcript = (rows: object[]) =>
    write(
      join(home, ".claude", "projects", "p", "session.jsonl"),
      rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
  return { base, root, home, context: { root, home }, write, skill, transcript };
}
const codes = (findings: Finding[]) => findings.map((f) => f.code);
const at = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60000).toISOString();

it("reports skills, agents and MCP servers unused in the window with recoverable tokens", async () => {
  const f = await fixture();
  await f.skill("deploy", "Deploy the application to production");
  await f.skill("lint-fix", "Fix lint errors across the repository");
  await f.skill("manual", "Only by hand", "Body", "disable-model-invocation: true\n");
  await f.write(
    join(f.home, ".claude", "agents", "scout.md"),
    "---\nname: scout\ndescription: Search files\nmodel: haiku\n---\nFind.\n",
  );
  await f.write(
    join(f.home, ".claude.json"),
    JSON.stringify({ mcpServers: { grafana: { command: "npx" }, idle: { command: "npx" } } }),
  );
  await f.transcript([
    // Outside the 30-day window: does not count as use.
    { type: "assistant", sessionId: "old", timestamp: at(60 * 24 * 40), message: { model: "m", content: [{ type: "tool_use", name: "Skill", input: { skill: "lint-fix" } }] } },
    { type: "user", sessionId: "s", cwd: f.root, timestamp: at(3), message: { content: "go" } },
    { type: "assistant", sessionId: "s", cwd: f.root, timestamp: at(2), message: { model: "m", content: [
      { type: "tool_use", name: "Skill", input: { skill: "deploy" } },
      { type: "tool_use", name: "Task", input: { subagent_type: "scout" } },
      { type: "tool_use", name: "mcp__grafana__query", input: {} },
    ] } },
  ]);
  const findings = await new PreflightService(f.context).doctor();
  const unused = findings.filter((x) => x.code === "unused-context");
  expect(unused.map((x) => x.message.split(" was")[0])).toEqual(
    expect.arrayContaining(["MCP server idle"]),
  );
  // An unused skill gets the manual-skill finding instead of the generic one.
  expect(unused.some((x) => /lint-fix/.test(x.message))).toBe(false);
  expect(
    findings.find((x) => x.code === "skill-manual-candidate" && /lint-fix/.test(x.message))?.fix,
  ).toMatch(/preflight skill manual lint-fix/);
  expect(unused.some((x) => /deploy|scout|grafana|manual/.test(x.message))).toBe(false);
  const lint = findings.find((x) => x.code === "skill-manual-candidate" && x.message.includes("lint-fix"))!;
  expect(lint.tokens).toBe(Math.ceil("lint-fix\nFix lint errors across the repository".length / 4));
  expect(lint.fix).toMatch(/disable-model-invocation: true/);
  // Single-project global server, and the window is configurable.
  expect(codes(findings)).toContain("mcp-global-single-project");
  const wide = await execute(["doctor", "--days", "60"], f.context) as Finding[];
  // One use in the wider window: still rare, but no longer unused.
  expect(wide.find((x) => x.code === "skill-manual-candidate" && x.message.includes("lint-fix"))?.message).toMatch(/used 1 time/);
});

it("accepts the usage counts of measureUsage for unused-context", () => {
  const skill: Resource = {
    id: "skill:a", type: "skill", name: "a", description: "Does a thing", source: "x",
    scope: "global", harnesses: ["claude-code"], enabled: true, config: {}, tags: [],
  };
  expect(unusedContext([skill], { sessions: 0, invocations: {} }, 30)).toEqual([]);
  expect(unusedContext([skill], { sessions: 2, invocations: { "skill:a": 1 } }, 30)).toEqual([]);
  expect(codes(unusedContext([skill], { sessions: 2, invocations: {} }, 30))).toEqual(["unused-context"]);
});

it("flags high default effort, unpinned subagents, and gives subagent advice", async () => {
  const f = await fixture();
  await f.write(join(f.home, ".claude", "settings.json"), JSON.stringify({ effortLevel: "xhigh" }));
  await f.write(join(f.root, ".claude", "agents", "finder.md"), "---\nname: finder\ndescription: Explore the codebase\n---\nGo.\n");
  const findings = await new PreflightService(f.context).doctor();
  expect(findings.find((x) => x.code === "effort-default-high")?.severity).toBe("warning");
  const agent = findings.find((x) => x.code === "agent-no-model")!;
  expect(agent.fix).toMatch(/model: haiku/);
  expect(codes(findings)).toContain("subagent-model-advice");
  await f.write(join(f.home, ".claude", "settings.json"), JSON.stringify({ effortLevel: "high" }));
  expect(codes(await new PreflightService(f.context).doctor())).not.toContain("effort-default-high");
});

it("clusters overlapping skills by Jaccard similarity with a configurable threshold", async () => {
  expect(jaccard(descriptionTokens("Grill me on my plan"), descriptionTokens("grill my plans"))).toBe(1);
  const f = await fixture();
  await f.skill("grill-me", "Interview the user relentlessly about a plan or design until shared understanding");
  await f.skill("grill-plan", "Interview the user relentlessly about their plan or design to reach shared understanding");
  await f.skill("grill-design", "Relentless interview about a design until understanding is shared");
  await f.skill("deploy", "Deploy the application to production with the release checklist");
  const findings = await new PreflightService(f.context).doctor();
  const clusters = findings.filter((x) => x.code === "skill-cluster");
  expect(clusters).toHaveLength(1);
  expect(clusters[0]!.message).toMatch(/3 claude-code skills overlap/);
  expect(clusters[0]!.fix).toMatch(/disable-model-invocation: true/);
  expect(findings.find((x) => x.code === "skill-count")?.message).toMatch(/^4 model-invocable global skills; the target is 60-80/);
  // Threshold from preflight.config.json.
  const config = { ...defaultConfig(), doctor: { skillSimilarity: 0.99, skillTarget: { min: 1, max: 2 } } };
  await writeFile(join(f.root, "preflight.config.json"), JSON.stringify(config));
  const strict = await new PreflightService(f.context).doctor();
  expect(codes(strict)).not.toContain("skill-cluster");
  expect(strict.find((x) => x.code === "skill-count")?.severity).toBe("warning");
  const direct = skillClusters([], 0.5);
  expect(direct).toEqual([]);
});

it("validates doctor thresholds in the configuration", () => {
  expect(PreflightConfigSchema.parse({ ...defaultConfig(), doctor: { unusedDays: 14 } }).doctor).toEqual({ unusedDays: 14 });
  expect(() => PreflightConfigSchema.parse({ ...defaultConfig(), doctor: { unknown: 1 } })).toThrow();
});

it("lints instruction files: length, broken imports, skill duplicates and secrets", async () => {
  const f = await fixture();
  const rule = "Ask one question at a time and wait for the answer before the next.";
  await f.skill("grill", "Interview about a plan", rule);
  await f.write(join(f.home, ".claude", "rules.md"), "Imported rule\n");
  await f.write(
    join(f.home, ".claude", "CLAUDE.md"),
    [...Array.from({ length: 205 }, (_, i) => `- rule ${i}`), "@./rules.md", "@./missing.md", "email me@example.com", `- ${rule}`, "```", "@./in-code.md", "```"].join("\n"),
  );
  await f.write(join(f.root, "CLAUDE.md"), "token = sk-abcdefghijklmnopqrstuvwxyz\n");
  const report = (await execute(["instructions", "lint"], f.context)) as {
    files: { path: string; lines: number; totalTokens: number; tokens: number; imports: { spec: string; exists: boolean }[] }[];
    findings: Finding[];
  };
  const global = report.files.find((x) => x.path.endsWith(".claude/CLAUDE.md"))!;
  expect(global.lines).toBe(212);
  expect(global.imports.map((i) => [i.spec, i.exists])).toEqual([["./rules.md", true], ["./missing.md", false]]);
  expect(global.totalTokens).toBeGreaterThan(global.tokens);
  expect(codes(report.findings).sort()).toEqual(
    ["claude-md-broken-import", "claude-md-duplicates-skill", "claude-md-long", "claude-md-secret"],
  );
  expect(JSON.stringify(report)).not.toContain("sk-abcdefghijklmnopqrstuvwxyz\"");
  const one = (await execute(["instructions", "lint", "CLAUDE.md"], f.context)) as { files: unknown[] };
  expect(one.files).toHaveLength(1);
  expect(await execute(["instructions", "lint", "--text"], f.context)).toMatch(/212\/200 lines/);
  expect(parseImports("see @types/node and @AGENTS.md")).toEqual([{ spec: "AGENTS.md", line: 1 }]);
});

it("drafts concise instructions as a diff and writes only with --write", async () => {
  const f = await fixture();
  const rule = "Ask one question at a time and wait for the answer before the next.";
  await f.skill("grill", "Interview about a plan", rule);
  const original = ["# Mine", "", "- Always use pnpm in my projects.", "- Always use pnpm in my projects.", `- ${rule}`, "@./gone.md", ""].join("\n");
  const path = join(f.home, ".claude", "CLAUDE.md");
  await f.write(path, original);
  const draft = (await execute(["instructions", "draft"], f.context)) as {
    path: string; after: string; patch: string; notes: string[]; lines: { after: number };
  };
  expect(draft.path).toBe(path);
  expect(draft.after).toContain("- Always use pnpm in my projects.");
  expect(draft.after.match(/Always use pnpm/g)).toHaveLength(1);
  expect(draft.after).not.toContain(rule);
  expect(draft.after).not.toContain("@./gone.md");
  for (const heading of ["## Style", "## Verification", "## Subagents", "## Secrets"])
    expect(draft.after).toContain(heading);
  expect(draft.lines.after).toBeLessThan(60);
  expect(draft.patch).toMatch(/^--- .*CLAUDE\.md\n\+\+\+ /);
  expect(await readFile(path, "utf8")).toBe(original);
  const preview = (await execute(["--dry-run", "instructions", "draft", "--write"], f.context)) as {
    dryRun: boolean; files: { path: string; before: string; after: string }[];
  };
  expect(preview.dryRun).toBe(true);
  expect(preview.files[0]).toMatchObject({ path, before: original });
  expect(await readFile(path, "utf8")).toBe(original);
  await execute(["instructions", "draft", "--write"], f.context);
  expect(await readFile(path, "utf8")).toBe(draft.after);
  await execute(["rollback"], f.context);
  expect(await readFile(path, "utf8")).toBe(original);
  // Codex project file and detected verification commands.
  await writeFile(join(f.root, "package.json"), JSON.stringify({ scripts: { check: "x", test: "y" } }));
  const codex = (await execute(["instructions", "draft", "--scope", "project", "--agent", "codex"], f.context)) as { path: string; after: string };
  expect(codex.path).toBe(join(f.root, "AGENTS.md"));
  expect(codex.after).toContain("`npm run check`");
  expect(codex.after).not.toContain("## Subagents");
});

it("lists injecting hooks and measures SessionStart output only when asked, in a temporary folder", async () => {
  const f = await fixture();
  const marker = join(f.base, "ran");
  await f.write(
    join(f.home, ".claude", "settings.json"),
    JSON.stringify({
      hooks: {
        SessionStart: [
          { matcher: "", hooks: [{ type: "command", command: `pwd; touch '${marker}'; printf '%0.sx' $(seq 1 1500)` }] },
          { matcher: "", hooks: [{ type: "command", command: "sleep 5" }] },
        ],
        UserPromptSubmit: [{ hooks: [{ type: "command", command: "date" }] }],
      },
    }),
  );
  await writeFile(join(f.root, "preflight.config.json"), JSON.stringify({ ...defaultConfig(), doctor: { hookTimeoutMs: 300 } }));
  const quiet = (await execute(["doctor"], f.context)) as Finding[];
  expect(quiet.filter((x) => x.code === "startup-injection")).toHaveLength(3);
  expect(existsSync(marker)).toBe(false);
  await execute(["--dry-run", "doctor", "--measure"], f.context);
  expect(existsSync(marker)).toBe(false);
  const measured = (await execute(["doctor", "--measure"], f.context)) as Finding[];
  expect(existsSync(marker)).toBe(true);
  expect(measured.find((x) => x.code === "startup-injection-large")?.tokens).toBeGreaterThan(300);
  expect(measured.find((x) => x.code === "hook-failed")?.message).toMatch(/timed out/);
  expect(JSON.stringify(measured)).not.toContain(f.root + "\n");
});

it("counts MCP processes under Claude Code from ps output, and skips without ps", async () => {
  const rows = parsePs(
    [
      "  10     1  50000 /usr/local/bin/claude --resume",
      "  11    10  20480 npm exec @grafana/mcp-server",
      "  12    11  10240 node /cache/@grafana/mcp-server/index.js",
      "  13    10   1000 /bin/zsh -c ls",
      "  20     1  30000 node other-mcp-server.js",
    ].join("\n"),
  );
  const report = mcpProcesses(rows, [
    { id: "mcp:g", type: "mcp", name: "grafana", description: "", source: "x", scope: "global", harnesses: ["claude-code"], enabled: true, config: { command: "npx", args: ["-y", "@grafana/mcp-server"] }, tags: [] },
  ]);
  expect(report.sessions).toBe(1);
  expect(report.processes.map((p) => p.pid)).toEqual([11, 12]);
  expect(report.rssKb).toBe(30720);
  const f = await fixture();
  const service = new PreflightService(f.context);
  const skipped = await service.doctorReport({ processes: true, processTable: async () => null });
  expect(skipped.skipped.some((s) => s.check === "mcp-processes")).toBe(true);
  const counted = await service.doctorReport({ processes: true, processTable: async () => "10 1 1024 claude\n11 10 2048 node mcp-x\n" });
  expect(counted.findings.find((x) => x.code === "mcp-processes")?.message).toMatch(/^1 MCP server processes under 1 Claude Code sessions use 2 MB/);
});

it("reports prompt cache heuristics only when transcripts exist", async () => {
  const f = await fixture();
  const service = new PreflightService(f.context);
  const none = await service.doctorReport();
  expect(codes(none.findings).filter((c) => c.startsWith("cache-"))).toEqual([]);
  expect(none.skipped.some((s) => /cache hygiene/.test(s.check))).toBe(true);
  const assistant = (model: string, minutes: number, id: string) => ({ type: "assistant", sessionId: "s", timestamp: at(minutes), message: { id, model, content: [], usage: { input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 } } });
  const prompt = (minutes: number, hook: string) => ({ type: "user", sessionId: "s", timestamp: at(minutes), message: { content: `<user-prompt-submit-hook>${hook}</user-prompt-submit-hook> hi` } });
  await f.transcript([
    prompt(60, "a"), assistant("opus", 59, "1"), assistant("opus", 59, "1"),
    prompt(30, "b"), assistant("sonnet", 29, "2"),
    { ...assistant("haiku", 29, "3"), isSidechain: true },
  ]);
  const report = await service.doctorReport();
  expect(codes(report.findings)).toEqual(expect.arrayContaining(["cache-model-switch", "cache-ttl-gap", "cache-variable-prompt-hook"]));
  const switched = report.findings.find((x) => x.code === "cache-model-switch")!;
  expect(switched.message).toMatch(/\(1 switches\)\. Cache hit rate over the window: 90%/);
});

it("prints findings grouped by severity with an icon and a word, and no score", async () => {
  const text = formatDoctor(
    [
      { code: "skill-count", severity: "info", message: "n" },
      { code: "secret", severity: "error", message: "e", fix: "remove it" },
      { code: "unused-context", severity: "warning", message: "w", tokens: 12 },
    ],
    [{ check: "mcp-processes", reason: "no ps" }],
  );
  expect(text.indexOf("✖ Error")).toBeLessThan(text.indexOf("▲ Warning"));
  expect(text.indexOf("▲ Warning")).toBeLessThan(text.indexOf("● Note"));
  expect(text).toContain("~12 tokens/session");
  expect(text).toContain("Fix: remove it");
  expect(text).toContain("○ skipped  mcp-processes: no ps");
  expect(text).not.toMatch(/score|%/i);
});

it("reads Codex MCP servers and plugins from config.toml", () => {
  expect(
    codexOf('[mcp_servers.a]\ncommand="x"\n[mcp_servers.a.env]\nK="v"\n[mcp_servers."b.c"]\n[plugins."p"]\nenabled = false\n[plugins.q]\n'),
  ).toEqual({ mcp: ["a", "b.c"], plugins: ["q"] });
});

it("produces a unified diff with hunks", () => {
  const diff = unifiedDiff("a\nb\nc\n", "a\nB\nc\nd\n", "f.md");
  expect(diff).toBe("--- f.md\n+++ f.md\n@@ -1,3 +1,4 @@\n a\n-b\n+B\n c\n+d\n");
  expect(unifiedDiff("same", "same", "f")).toBe("");
});

it("keeps Preflight-managed AGENTS.md blocks byte for byte in a codex draft", async () => {
  const f = await fixture();
  const block =
    "<!-- preflight:begin instructions:review -->\nAlways review the diff before you commit.\nAlways review the diff before you commit.\n<!-- preflight:end instructions:review -->";
  await f.write(
    join(f.root, "AGENTS.md"),
    `# Notes\nUse pnpm for every install step.\nUse pnpm for every install step.\n\n${block}\n`,
  );
  const draft = (await execute(
    ["instructions", "draft", "--scope", "project", "--agent", "codex"],
    f.context,
  )) as { after: string; notes: string[] };
  expect(draft.after).toContain(block);
  expect(draft.after.match(/Use pnpm for every install step\./g)).toHaveLength(1);
  expect(draft.notes.join(" ")).toContain("Kept 1 Preflight-managed block");
});

it("skips the transcript checks with a reason when transcript reading is off", async () => {
  const f = await fixture();
  await f.skill("deploy", "Deploy the application to production");
  await f.transcript([
    { type: "user", timestamp: at(5), cwd: f.root, message: { content: "hi" } },
  ]);
  const service = new PreflightService(f.context);
  const report = await service.doctorReport({ readTranscripts: false });
  expect(codes(report.findings)).not.toContain("unused-context");
  expect(report.skipped.map((s) => s.reason)).toContain(
    "reading conversation transcripts is turned off",
  );
  expect(report.facts.usage).toBeNull();
  const text = (await execute(["doctor", "--no-transcripts", "--text"], f.context)) as string;
  expect(text).toContain("reading conversation transcripts is turned off");
});

it("does not report codex-only resources as unused from Claude Code transcripts", async () => {
  const f = await fixture();
  await f.write(
    join(f.home, ".codex", "config.toml"),
    '[mcp_servers.codexonly]\ncommand = "npx"\n',
  );
  await f.write(join(f.home, ".codex", "AGENTS.md"), "# Codex\nKeep answers short.\n");
  await f.transcript([
    { type: "user", timestamp: at(5), cwd: f.root, message: { content: "hi" } },
  ]);
  const findings = (await execute(["doctor"], f.context)) as Finding[];
  expect(
    findings.filter((x) => x.code === "unused-context" && /codexonly/.test(x.message)),
  ).toHaveLength(0);
  const lint = (await execute(["instructions", "lint"], f.context)) as {
    files: { agent: string; path: string }[];
  };
  expect(lint.files.some((x) => x.agent === "codex")).toBe(true);
});
