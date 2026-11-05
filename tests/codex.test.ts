import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PreflightService } from "../src/service.js";
import { ResourceSchema } from "../src/schema.js";
import {
  CodexAdapter,
  fromCodexServer,
  toCodexServer,
} from "../src/adapters/codex.js";
import { buildContextReport } from "../src/context-map.js";

async function workspace() {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "preflight-codex-"),
  );
  const home = join(root, "home");
  await mkdir(join(home, ".codex"), { recursive: true });
  return { service: new PreflightService({ root, home }), root, home };
}

const userConfig = `# my Codex setup
model = "gpt-6.1-sol"
model_reasoning_effort = "high"   # thinking

[profiles.quick]
model = "gpt-6.1-mini"

[mcp_servers.mine]
command = "my-server"

[projects."/work"]
trust_level = "trusted"
`;

const mcp = (over: Record<string, unknown> = {}) =>
  ResourceSchema.parse({
    id: "mcp:docs",
    type: "mcp",
    name: "docs",
    source: "local:owned",
    scope: "global",
    harnesses: ["codex"],
    config: {
      url: "https://docs.example.com/mcp",
      headers: { Authorization: "Bearer ${DOCS_TOKEN}" },
    },
    ...over,
  });

it("translates portable MCP configuration to Codex tables and back", () => {
  const portable = {
    command: "npx",
    args: ["-y", "pkg"],
    env: { API_KEY: "${API_KEY}", LEVEL: "debug" },
    startup_timeout_sec: 20,
  };
  const table = toCodexServer(portable);
  expect(table).toEqual({
    command: "npx",
    args: ["-y", "pkg"],
    env: { LEVEL: "debug" },
    env_vars: ["API_KEY"],
    startup_timeout_sec: 20,
  });
  expect(fromCodexServer(table)).toEqual(portable);
  const http = toCodexServer({
    type: "http",
    url: "https://x/mcp",
    headers: {
      Authorization: "Bearer ${TOKEN}",
      "X-Team": "${TEAM}",
      "X-Fixed": "a",
    },
  });
  expect(http).toEqual({
    url: "https://x/mcp",
    bearer_token_env_var: "TOKEN",
    http_headers: { "X-Fixed": "a" },
    env_http_headers: { "X-Team": "TEAM" },
  });
  expect(() => toCodexServer({ type: "sse", url: "https://x" })).toThrow(/SSE/);
  expect(() => toCodexServer({ command: "x", env: { A: "${B}" } })).toThrow(
    /by name/,
  );
});

it("adds and removes its own MCP table, keeping the user's config.toml byte for byte", async () => {
  const { service, home } = await workspace();
  const path = join(home, ".codex", "config.toml");
  await writeFile(path, userConfig);
  await service.init();
  await service.create(mcp());
  const written = await readFile(path, "utf8");
  expect(
    written.startsWith(userConfig.slice(0, userConfig.indexOf("[projects"))),
  ).toBe(true);
  expect(written).toContain(
    '[mcp_servers.docs]\nurl = "https://docs.example.com/mcp"\nbearer_token_env_var = "DOCS_TOKEN"\n',
  );
  expect(written).toContain('[projects."/work"]');

  // A user edit elsewhere in the file is not drift...
  await writeFile(path, written.replace('"gpt-6.1-sol"', '"gpt-6.1-pro"'));
  expect((await service.doctor()).filter((f) => f.code === "drift")).toEqual(
    [],
  );
  // ...and the next change still applies around it.
  await service.remove("mcp:docs");
  expect(await readFile(path, "utf8")).toBe(
    userConfig.replace('"gpt-6.1-sol"', '"gpt-6.1-pro"'),
  );
});

it("reports drift in an owned table and refuses unmanaged ones", async () => {
  const { service, home } = await workspace();
  const path = join(home, ".codex", "config.toml");
  await writeFile(path, userConfig);
  await service.init();
  await expect(
    service.create(mcp({ id: "mcp:mine", name: "mine" })),
  ).rejects.toThrow(/unmanaged/i);
  await service.create(mcp());
  await writeFile(
    path,
    (await readFile(path, "utf8")).replace("DOCS_TOKEN", "OTHER_TOKEN"),
  );
  expect((await service.doctor()).some((f) => f.code === "drift")).toBe(true);
});

it("inventories skills, MCP servers, instructions and settings, and adopts a server in place", async () => {
  const { service, home, root } = await workspace();
  await writeFile(join(home, ".codex", "config.toml"), userConfig);
  await mkdir(join(home, ".agents", "skills", "review"), { recursive: true });
  await writeFile(
    join(home, ".agents", "skills", "review", "SKILL.md"),
    "---\nname: review\ndescription: Review code\n---\n\nReview it.\n",
  );
  await writeFile(join(home, ".codex", "AGENTS.md"), "Be brief.\n");
  await mkdir(join(home, ".codex", "prompts"));
  await writeFile(join(home, ".codex", "prompts", "old.md"), "old prompt");
  const state = await new CodexAdapter({ root, home }).read();
  expect(state.resources.map((r) => `${r.type}:${r.name}`).sort()).toEqual([
    "instructions:AGENTS.md",
    "mcp:mine",
    "skill:review",
  ]);
  expect(state.settings?.global).toMatchObject({
    model: "gpt-6.1-sol",
    modelReasoningEffort: "high",
    profiles: ["quick"],
  });
  expect(state.notes?.map((n) => n.code)).toContain("codex-legacy-prompts");
  const doctor = await service.doctor();
  expect(doctor.some((f) => f.code === "codex-legacy-prompts")).toBe(true);

  await service.init();
  const detected = await service.unmanaged();
  const mine = detected.find(
    (d) => d.harness === "codex" && d.resource.name === "mine",
  )!;
  const before = await readFile(join(home, ".codex", "config.toml"), "utf8");
  await service.adopt(mine.resource.id);
  expect(await readFile(join(home, ".codex", "config.toml"), "utf8")).toBe(
    before,
  );
  const skill = detected.find(
    (d) => d.harness === "codex" && d.resource.type === "skill",
  )!;
  await service.adopt(skill.resource.id);
  expect((await service.list()).map((r) => r.id).sort()).toEqual([
    "mcp:mine",
    "skill:review",
  ]);
});

it("writes skills to the shared ~/.agents store and instructions as a managed AGENTS.md block", async () => {
  const { service, home, root } = await workspace();
  await writeFile(join(root, "AGENTS.md"), "# Project rules\n\nUse pnpm.\n");
  await service.init();
  await service.import([
    ResourceSchema.parse({
      id: "skill:tidy",
      type: "skill",
      name: "tidy",
      source: "local:owned",
      scope: "global",
      harnesses: ["codex"],
      content: "---\nname: tidy\ndescription: Tidy up\n---\n\nTidy.\n",
    }),
    ResourceSchema.parse({
      id: "instructions:tests",
      type: "instructions",
      name: "tests",
      source: "local:owned",
      scope: "project",
      harnesses: ["codex"],
      content: "Run the tests before committing.",
    }),
  ]);
  const agents = await readFile(join(root, "AGENTS.md"), "utf8");
  expect(agents).toBe(
    "# Project rules\n\nUse pnpm.\n\n<!-- preflight:begin instructions:tests -->\nRun the tests before committing.\n<!-- preflight:end instructions:tests -->\n",
  );
  const adapter = new CodexAdapter({ root, home });
  const state = await adapter.read();
  const skill = state.resources.find((r) => r.type === "skill")!;
  expect(skill.source).toContain(join(home, ".agents", "skills"));
  const report = buildContextReport(state.resources, { harness: "codex" });
  expect(report.entries.filter((e) => e.type === "instructions")).toHaveLength(
    2,
  );
  expect(await service.unmanaged()).toHaveLength(1); // only the user's own AGENTS.md text
  await writeFile(
    join(root, "AGENTS.md"),
    agents.replace("Use pnpm.", "Use npm."),
  );
  expect((await service.doctor()).filter((f) => f.code === "drift")).toEqual(
    [],
  );
  await service.remove("instructions:tests");
  expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(
    "# Project rules\n\nUse npm.\n",
  );
});
