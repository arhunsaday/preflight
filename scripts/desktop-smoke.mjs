import { localD1 } from "./local-d1.mjs";
import { _electron as electron } from "@playwright/test";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { build } from "esbuild";
import assert from "node:assert/strict";
import { packagedExecutable } from "./desktop-artifacts.mjs";
const temporary = await mkdtemp(
  join(await realpath(tmpdir()), "preflight-smoke-"),
);
const project = join(temporary, "project"),
  home = join(temporary, "home"),
  data = join(temporary, "app");
await Promise.all([mkdir(project), mkdir(home), mkdir(data)]);
// A Codex config the person wrote by hand, and one recent Claude transcript.
const codexConfig =
  '# hand-written\nmodel = "gpt-6.1-sol"\n\n[projects."/work"]\ntrust_level = "trusted"\n';
await mkdir(join(home, ".codex"), { recursive: true });
await writeFile(join(home, ".codex", "config.toml"), codexConfig);
await mkdir(join(home, ".claude", "projects", "-smoke"), { recursive: true });
await writeFile(
  join(home, ".claude", "projects", "-smoke", "smoke.jsonl"),
  JSON.stringify({
    type: "assistant",
    sessionId: "smoke-session",
    requestId: "r1",
    cwd: project,
    timestamp: new Date().toISOString(),
    message: {
      id: "m1",
      model: "claude-sonnet-4-6",
      content: [],
      usage: {
        input_tokens: 1200,
        output_tokens: 300,
        cache_read_input_tokens: 4800,
        cache_creation_input_tokens: 0,
      },
    },
  }) + "\n",
);
const fixtureSource = resolve("tests/fixtures/catalog");
const env = {
  ...process.env,
  PREFLIGHT_DESKTOP_TEST_ROOT: project,
  PREFLIGHT_DESKTOP_TEST_HOME: home,
  PREFLIGHT_DESKTOP_TEST_DATA: data,
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VERCEL_OIDC_TOKEN;
delete env.GITHUB_TOKEN;
await build({
  entryPoints: ["src/worker.ts"],
  outfile: join(temporary, "share-service.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  banner: {
    js: 'import {createRequire} from "node:module"; const require=createRequire(import.meta.url);',
  },
});
const worker = (
  await import(pathToFileURL(join(temporary, "share-service.mjs")).href)
).default;
const records = new Map();
const objects = new Map();
const shareCount = () =>
  [...records.keys()].filter((k) => !k.startsWith("__")).length;
const standardDatabase = await localD1();
const bindings = {
  DB: standardDatabase.database,
  PREFLIGHT_DEV_AUTH: "1",
  PREFLIGHT_DEV_AUTH_SECRET: "desktop-smoke-dev-secret",
  SHARES: {
    get: async (k) => records.get(k) ?? null,
    put: async (k, v) => records.set(k, v),
    delete: async (k) => records.delete(k),
  },
  PAYLOADS: {
    put: async (k, v) => objects.set(k, v),
    get: async (k) =>
      objects.has(k) ? { text: async () => objects.get(k) } : null,
    delete: async (k) => objects.delete(k),
  },
};
let accountGate;
let releasePendingAccount;
let latestIssuedToken;
const server = createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (req.url === "/api/account" && accountGate) {
      const gate = accountGate;
      accountGate = undefined;
      gate.started();
      await gate.wait;
    }
    const response = await worker.fetch(
      new Request(`${service}${req.url}`, {
        method: req.method,
        headers: { ...req.headers, "cf-connecting-ip": "127.0.0.1" },
        ...(body ? { body } : {}),
      }),
      bindings,
    );
    if (req.url === "/auth/token" && response.ok)
      latestIssuedToken = (await response.clone().json()).token;
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const service = `http://127.0.0.1:${server.address().port}`;
const api = async (path, body, token, method) => {
  const response = await fetch(service + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  assert.ok(response.ok, `${path}: HTTP ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
};
const devSession = (person) => api("/auth/dev/session", person);
/** What the browser sign-in page does after the person signs in. */
const completeBrowserSignIn = async (url, person) => {
  const query = new URL(url).searchParams;
  const { redirect } = await api("/auth/exchange", {
    session_token: (await devSession(person)).token,
    redirect_uri: query.get("redirect_uri"),
    state: query.get("state"),
    code_challenge: query.get("code_challenge"),
    code_challenge_method: query.get("code_challenge_method"),
    client: query.get("client"),
  });
  assert.equal((await fetch(redirect)).status, 200);
};
/** A Preflight API token for a person, as `preflight auth login` gets one. */
const apiToken = async (person) => {
  const verifier = randomBytes(32).toString("base64url");
  const redirectUri = "http://127.0.0.1:45999/callback";
  const { redirect } = await api("/auth/exchange", {
    session_token: (await devSession(person)).token,
    redirect_uri: redirectUri,
    state: "desktop-smoke-state-01",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    client: "cli",
  });
  return api("/auth/token", {
    code: new URL(redirect).searchParams.get("code"),
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });
};
const smokeOwner = { name: "Smoke owner", email: "smoke-owner@example.com" };
const smokeOwnerToken = (await apiToken(smokeOwner)).token;
const executable =
  process.env.PREFLIGHT_DESKTOP_EXECUTABLE ??
  (process.argv.includes("--packaged")
    ? await packagedExecutable()
    : undefined);
const app = await electron.launch({
  chromiumSandbox: process.platform !== "linux",
  ...(executable
    ? { executablePath: executable, args: [] }
    : { args: [resolve(".")] }),
  env,
});
const errors = [];
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  // Sidebar items share labels with buttons in the main view (the Overview's
  // "All resources", "Discover resources"…), so every navigation click is
  // scoped to the sidebar. A string label matches exactly; a RegExp also
  // matches an item with a count, such as "Skills 2".
  const sidebar = page.locator("aside.sidebar");
  const navigate = (label) =>
    sidebar
      .getByRole("button", {
        name: label,
        ...(typeof label === "string" ? { exact: true } : {}),
      })
      .click();
  const main = page.getByRole("main");
  page.on("pageerror", (e) => errors.push(e.message));
  assert.deepEqual(
    await page.evaluate(() => ({
      node: typeof window.require,
      process: typeof window.process,
    })),
    { node: "undefined", process: "undefined" },
  );
  await page.getByRole("button", { name: "Initialize project" }).click();
  await page.getByRole("heading", { name: "Review changes" }).waitFor();
  await assert.rejects(readFile(join(project, "preflight.config.json")));
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("heading", { name: "Operation result" }).waitFor();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    JSON.parse(await readFile(join(project, "preflight.config.json"), "utf8"))
      .activeProfile,
    "default",
  );
  // Preflight ships no catalogue: Discover explains how to add a source.
  await navigate("Discover resources");
  await page
    .getByRole("heading", { name: "No content source yet" })
    .waitFor();
  await page.getByRole("button", { name: "Add a source", exact: true }).click();
  await page.getByRole("heading", { name: "Content sources" }).waitFor();
  await page
    .getByRole("textbox", { name: "Source", exact: true })
    .fill(fixtureSource);
  await page
    .getByRole("button", { name: "Preview adding", exact: true })
    .click();
  await page.getByRole("heading", { name: "Review changes" }).waitFor();
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    JSON.parse(
      await readFile(join(home, ".preflight", "sources.json"), "utf8"),
    ).sources[0].path,
    fixtureSource,
  );
  await page.locator(".source-row").first().waitFor();
  await page.screenshot({ path: join(temporary, "sources.png") });
  await navigate("Discover resources");
  await page
    .getByRole("textbox", { name: "Search resources" })
    .fill("ponytail");
  await page
    .getByRole("button", { name: "Configure & add", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Configure resource before adding" })
    .waitFor();
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await page.getByRole("heading", { name: "Review changes" }).waitFor();
  assert.equal(
    JSON.parse(await readFile(join(project, "preflight.config.json"), "utf8"))
      .profiles.default.resources.length,
    0,
  );
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    JSON.parse(await readFile(join(project, "preflight.config.json"), "utf8"))
      .profiles.default.resources.length,
    1,
  );
  await navigate(/^Skills/);
  await page.getByRole("heading", { name: "ponytail", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Theme: system. Switch theme", exact: true })
    .click();
  await page.locator('html[data-theme="light"]').waitFor();
  assert.ok(
    (await page.locator(".nav-item svg.lucide.nav-semantic-icon").count()) > 0,
    "Navigation uses the monochrome Lucide set",
  );
  assert.ok((await page.locator(".resource-glyph .semantic-icon").count()) > 0);
  assert.ok((await page.locator(".row-harnesses .harness-badge").count()) > 0);
  await page.screenshot({ path: join(temporary, "skills.png") });
  await page.screenshot({
    path: join(temporary, "icons-light.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Theme: light. Switch theme", exact: true })
    .click();
  await page.locator('html[data-theme="dark"]').waitFor();
  await page.screenshot({
    path: join(temporary, "icons-dark.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Theme: dark. Switch theme", exact: true })
    .click();

  await page.getByRole("button", { name: "More resource actions" }).click();
  await page.getByRole("menuitem", { name: "Move to global" }).click();
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    JSON.parse(await readFile(join(project, "preflight.config.json"), "utf8"))
      .profiles.default.resources[0].scope,
    "global",
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("A verified desktop skill");
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    JSON.parse(await readFile(join(project, "preflight.config.json"), "utf8"))
      .profiles.default.resources[0].description,
    "A verified desktop skill",
  );
  await navigate("Profiles");
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("frontend");
  await page
    .getByRole("button", { name: "Create profile", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.ok(
    JSON.parse(await readFile(join(project, "preflight.config.json"), "utf8"))
      .profiles.frontend,
  );
  await navigate(/^Doctor/);
  await page
    .getByRole("heading", { name: "Check your setup", exact: true })
    .waitFor();
  await page.screenshot({ path: join(temporary, "doctor.png") });
  await navigate("Instructions");
  await page.getByRole("heading", { name: "What your agent reads every session" }).waitFor();
  await page
    .getByRole("button", { name: "Draft improvements", exact: true })
    .click();
  await page.getByRole("heading", { name: "Review changes" }).waitFor();
  await page.getByLabel("Proposed diff").waitFor();
  await assert.rejects(readFile(join(project, "CLAUDE.md")));
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.match(await readFile(join(project, "CLAUDE.md"), "utf8"), /## Secrets/);
  await page.getByRole("meter", { name: "Lines against the limit" }).waitFor();
  await page.screenshot({ path: join(temporary, "instructions.png") });
  await navigate("Loadouts");
  await page.locator(".loadout-list button").first().click();
  await page
    .getByRole("button", { name: "Preview installation", exact: true })
    .waitFor();
  await navigate("Command console");
  await page.getByRole("textbox", { name: "Preflight command" }).fill("list");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  // Read-only console output stays inline instead of opening a dialog.
  await page.locator(".console-entry").first().waitFor();
  await navigate("Benchmarks");
  await page.getByRole("heading", { name: "No benchmark runs yet" }).waitFor();
  await navigate("Team");
  await page.getByText("Offline roster", { exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Ada");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("ada@example.com");
  await page.getByRole("button", { name: "Add teammate", exact: true }).click();
  await page.getByRole("cell", { name: /Ada/ }).first().waitFor();
  await navigate("Account");
  await page.getByRole("heading", { name: "Your Preflight account" }).waitFor();
  await page.getByText("Use an API token", { exact: true }).click();
  await page.getByRole("textbox", { name: "Service URL" }).fill(service);
  await page.getByRole("textbox", { name: "API token" }).fill(smokeOwnerToken);
  await page
    .getByRole("button", { name: "Connect service", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Connected as Smoke owner" })
    .waitFor();
  assert.equal(
    JSON.stringify(await page.evaluate(() => window.preflight.state())).includes(
      smokeOwnerToken,
    ),
    false,
  );
  assert.equal(
    (await readFile(join(data, "workspace.json"), "utf8")).includes(
      smokeOwnerToken,
    ),
    false,
  );
  await navigate("Sharing");
  await page
    .getByRole("button", { name: "Preview publication", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("heading", { name: "Operation result" }).waitFor();
  const publication = JSON.parse(
    (await page.locator(".dialog .code").textContent()) ?? "",
  );
  assert.equal(publication.code.length, 16);
  assert.equal(shareCount(), 1);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Share URL, code or JSON file" })
    .fill(publication.code);
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview revocation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(shareCount(), 0);
  const secondProject = join(temporary, "other-project");
  await mkdir(secondProject);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, secondProject);
  await page
    .getByRole("button", { name: "Open project folder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Initialize project", exact: true })
    .waitFor();
  await assert.rejects(readFile(join(secondProject, "preflight.config.json")));
  await navigate(/^Projects/);
  await page
    .locator(".project-item")
    .filter({ hasText: project })
    .first()
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await page
    .locator(".toolbar-project")
    .filter({ hasText: /^project$/ })
    .waitFor({ state: "attached" });
  await page
    .getByRole("combobox", { name: "Configuration workspace" })
    .selectOption("global");
  await page
    .getByRole("button", {
      name: "Initialize global configuration",
      exact: true,
    })
    .click();
  await page.getByRole("heading", { name: "Review changes" }).waitFor();
  await assert.rejects(
    readFile(join(home, ".preflight", "global", "preflight.config.json")),
  );
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await navigate(/^MCP servers/);
  await page.getByRole("button", { name: "New resource", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("global-server");
  await page
    .getByRole("combobox", { name: "Connection type" })
    .selectOption("http");
  await page
    .getByRole("textbox", { name: "Server URL" })
    .fill("https://example.com/mcp");
  await page.getByRole("checkbox", { name: "Cursor", exact: true }).check();
  await page.getByRole("checkbox", { name: "Codex", exact: true }).check();
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  assert.equal(
    JSON.parse(
      await readFile(
        join(home, ".preflight", "global", "preflight.config.json"),
        "utf8",
      ),
    ).profiles.default.resources.length,
    0,
  );
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    JSON.parse(await readFile(join(home, ".claude.json"), "utf8")).mcpServers[
      "global-server"
    ].url,
    "https://example.com/mcp",
  );
  assert.equal(
    JSON.parse(await readFile(join(home, ".cursor", "mcp.json"), "utf8"))
      .mcpServers["global-server"].url,
    "https://example.com/mcp",
  );
  const codexWritten = await readFile(
    join(home, ".codex", "config.toml"),
    "utf8",
  );
  assert.ok(
    codexWritten.startsWith(codexConfig),
    "Codex config.toml keeps the hand-written part byte for byte",
  );
  assert.ok(
    codexWritten.includes(
      '[mcp_servers.global-server]\nurl = "https://example.com/mcp"',
    ),
  );
  await page
    .getByRole("heading", { name: "global-server", exact: true })
    .waitFor();
  await page.screenshot({ path: join(temporary, "global-mcp.png") });
  await page
    .getByRole("combobox", { name: "Configuration workspace" })
    .selectOption({ label: "project" });
  await page
    .getByRole("button", { name: "Edit in global configuration", exact: true })
    .waitFor();
  await navigate("Overview");
  await page
    .getByRole("heading", { name: "Inherited global configuration" })
    .waitFor();
  await page.screenshot({ path: join(temporary, "overview.png") });
  const contextConfigPath = join(project, "preflight.config.json");
  const contextConfigBefore = await readFile(contextConfigPath, "utf8");
  const contextConfig = JSON.parse(contextConfigBefore);
  contextConfig.profiles[contextConfig.activeProfile].resources.push(
    ...[
      ["skill", "Code review", 8000],
      ["prompt", "Project instructions", 4000],
      ["subagent", "Research agent", 2400],
      ["command", "Release checklist", 800],
    ].map(([type, name, characters]) => ({
      id: `${type}:context-smoke`,
      type,
      name,
      description: "Context map smoke fixture",
      source: "local:smoke",
      scope: "project",
      harnesses: ["claude-code"],
      enabled: true,
      config: {},
      tags: [],
      content: "x".repeat(characters),
    })),
  );
  await writeFile(contextConfigPath, JSON.stringify(contextConfig));
  await page
    .getByRole("button", { name: "Refresh workspace", exact: true })
    .click();
  await navigate("Context map");
  await page
    .getByRole("heading", { name: "See the weight of your setup" })
    .waitFor();
  await page
    .getByRole("button", { name: "global-server", exact: false })
    .click();
  await page
    .getByText("Tool schemas and responses are not available", { exact: false })
    .waitFor();
  await page
    .locator(".context-page")
    .evaluate((element) => (element.scrollTop = 0));
  await page.screenshot({ path: join(temporary, "context-map.png") });
  await page
    .locator(".context-group-title")
    .filter({ hasText: "Skills" })
    .click();
  assert.equal(await page.locator(".context-tree-group").count(), 1);
  await main
    .getByRole("button", { name: "All resources", exact: true })
    .click();
  assert.equal(await page.locator(".context-tree-group").count(), 4);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("columnheader", { name: "Estimated tokens", exact: true })
    .waitFor();
  await page
    .getByRole("combobox", { name: "Scenario", exact: true })
    .selectOption("catalogue");
  await page
    .getByRole("combobox", { name: "Scope", exact: true })
    .selectOption("project");
  await page
    .getByRole("button", { name: "Reset context filters", exact: true })
    .click();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.setViewportSize({ width: 900, height: 700 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Context map overflows at compact width");
  await page.screenshot({ path: join(temporary, "context-compact.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await writeFile(contextConfigPath, contextConfigBefore);
  await page
    .getByRole("button", { name: "Refresh workspace", exact: true })
    .click();

  await navigate("Usage");
  await page.getByText("Cache hit rate", { exact: true }).waitFor();
  assert.ok(
    (await page.locator(".usage-chart svg rect").count()) > 0,
    "Usage shows the daily bar chart",
  );
  await page.locator(".metrics strong", { hasText: "80%" }).waitFor();
  await page.screenshot({ path: join(temporary, "usage.png") });
  const transcripts = page.getByRole("checkbox", {
    name: /Read conversation transcripts/,
  });
  // The toggle saves the setting before it re-renders, so click and wait for
  // the result instead of asserting the state right after the click.
  await transcripts.click();
  await page.getByText("Transcript reading is off", { exact: true }).waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".usage-setting input")?.checked,
  );
  await transcripts.click();
  await page.getByText("Cache hit rate", { exact: true }).waitFor();
  await navigate("Discover resources");
  await page
    .getByRole("button", { name: "Search online", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Search source" })
    .selectOption("skills.sh");
  await page.getByRole("textbox", { name: "Search resources" }).fill("react");
  await page
    .getByRole("button", { name: "Search source", exact: true })
    .click();
  await page.getByText(/skills.sh: Error: Set VERCEL_OIDC_TOKEN/).waitFor();
  await page.screenshot({ path: join(temporary, "online-search.png") });
  // Install from a repository with no catalogue: scan, choose, preview, apply.
  await page.getByRole("button", { name: "From GitHub", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Repository to install from" })
    .fill(resolve("tests/fixtures/repo-install"));
  await page
    .getByRole("button", { name: "Scan repository", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Install pdf-tools" }).waitFor();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Install local-server" })
      .isDisabled(),
    true,
  );
  await page.getByText(/runs \.\/server\.js from the repository/).first().waitFor();
  await page.screenshot({ path: join(temporary, "install-from-github.png") });
  await page
    .getByRole("button", { name: /^Preview installation of \d+ resources$/ })
    .click();
  await page.getByRole("heading", { name: "Review changes" }).waitFor();
  await assert.rejects(readFile(join(project, ".mcp.json")));
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const installedRepo = JSON.parse(
    await readFile(join(project, "preflight.config.json"), "utf8"),
  );
  assert.deepEqual(
    installedRepo.profiles[installedRepo.activeProfile].resources.find(
      (r) => r.id === "skill:pdf-tools",
    ).origin,
    {
      kind: "local",
      root: resolve("tests/fixtures/repo-install"),
      path: "skills/pdf-tools/SKILL.md",
    },
  );
  assert.ok(
    JSON.parse(await readFile(join(project, ".mcp.json"), "utf8")).mcpServers
      .docs,
  );
  await page
    .getByRole("button", { name: "Your sources", exact: true })
    .click();
  await navigate("Discover resources");
  await page.getByRole("textbox", { name: "Search resources" }).fill("");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: join(temporary, "catalogue.png") });
  await page.setViewportSize({ width: 900, height: 700 });
  await page.screenshot({ path: join(temporary, "compact.png") });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 940 });
  await app.evaluate(({ shell }) => {
    globalThis.__opened = [];
    shell.openExternal = async (url) => {
      globalThis.__opened.push(url);
    };
  });
  const lastOpened = () => app.evaluate(() => globalThis.__opened.at(-1));
  await navigate("Account");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  // Disconnect revokes the token, then shows the sign-in form; wait for it.
  await page
    .getByRole("button", { name: "Sign in with browser", exact: true })
    .waitFor();
  // The pasted API token was revoked on disconnect.
  assert.equal(
    (
      await fetch(service + "/api/account", {
        headers: { Authorization: `Bearer ${smokeOwnerToken}` },
      })
    ).status,
    401,
  );
  const signIn = async (person) => {
    await page
      .getByRole("textbox", { name: "Backend URL", exact: true })
      .fill(service);
    await page
      .getByRole("button", { name: "Sign in with browser", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Finish signing in in your browser" })
      .waitFor();
    const url = new URL(await lastOpened());
    assert.equal(url.origin + url.pathname, service + "/auth/sign-in");
    assert.equal(url.searchParams.get("client"), "desktop");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.match(
      url.searchParams.get("redirect_uri"),
      /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
    );
    await completeBrowserSignIn(url.href, person);
    await page
      .getByRole("heading", { name: "Connected as " + person.name, exact: true })
      .waitFor();
    return latestIssuedToken;
  };
  const owner = { name: "Crew owner", email: "owner@example.com" };
  const member = { name: "New member", email: "new-member@example.com" };
  const ownerToken = await signIn(owner);
  await page.screenshot({ path: join(temporary, "account-standard.png") });
  await navigate("Team");
  await page.getByText("Create organization", { exact: true }).first().click();
  await page
    .locator(".team-create")
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Preflight crew");
  await page
    .locator(".team-create")
    .getByRole("textbox", { name: "Unique slug", exact: true })
    .fill("preflight-crew");
  await page
    .locator(".team-create")
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Preflight crew", exact: true })
    .waitFor();
  await page
    .locator(".team-invites")
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("new-member@example.com");
  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await page
    .locator(".team-invites")
    .getByRole("cell", { name: /new-member@example.com/ })
    .first()
    .waitFor();
  const groups = await api("/api/orgs", undefined, ownerToken);
  const pending = await api(
    `/api/orgs/${groups[0].id}/invitations`,
    undefined,
    ownerToken,
  );
  assert.equal(pending[0].email, "new-member@example.com");
  await page.screenshot({ path: join(temporary, "team-owner.png") });
  await navigate("Account");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await signIn(member);
  await navigate("Team");
  await page
    .getByRole("button", { name: "Review invitation", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await page
    .locator(".team-choice")
    .filter({ hasText: "Preflight crew" })
    .click();
  await page
    .getByRole("heading", { name: "Preflight crew", exact: true })
    .waitFor();
  await page
    .locator(".member-table")
    .getByRole("cell", { name: /New member/ })
    .waitFor();
  assert.equal(await page.locator(".member-table select").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Create invitation", exact: true })
      .count(),
    0,
  );
  await page.screenshot({ path: join(temporary, "team-member.png") });
  await page.setViewportSize({ width: 900, height: 700 });
  await page.screenshot({ path: join(temporary, "team-compact.png") });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 940 });
  await navigate("Account");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  // Cancelling after the code was redeemed must revoke the new token.
  let releaseAccount;
  let accountReached;
  const reached = new Promise((resolve) => {
    accountReached = resolve;
  });
  const wait = new Promise((resolve) => {
    releaseAccount = resolve;
  });
  accountGate = { started: accountReached, wait };
  releasePendingAccount = releaseAccount;
  latestIssuedToken = undefined;
  await page
    .getByRole("button", { name: "Sign in with browser", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Finish signing in in your browser" })
    .waitFor();
  await completeBrowserSignIn(await lastOpened(), owner);
  await Promise.race([
    reached,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(new Error("Code redemption did not reach account verification")),
        12000,
      ),
    ),
  ]);
  const cancelledToken = latestIssuedToken;
  assert.ok(cancelledToken);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  releaseAccount();
  await page
    .getByRole("button", { name: "Sign in with browser", exact: true })
    .waitFor();
  let revoked = false;
  for (let i = 0; i < 30; i++) {
    const response = await fetch(service + "/api/account", {
      headers: { Authorization: `Bearer ${cancelledToken}` },
    });
    if (response.status === 401) {
      revoked = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(revoked, "Cancelling a redeemed sign-in must revoke its token");
  assert.equal(
    await page.evaluate(
      async () => (await window.preflight.state()).account.connected,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, temporary, project, errors }));
} catch (error) {
  const p = await app.firstWindow();
  console.error((await p.locator("body").innerText()).slice(-4000));
  await p.screenshot({ path: join(temporary, "failure.png") });
  console.error(temporary);
  throw error;
} finally {
  releasePendingAccount?.();
  // A failure can leave an engine running; the app then refuses to close and
  // would hang the smoke instead of reporting the error.
  await Promise.race([
    app.close(),
    new Promise((resolve) => setTimeout(resolve, 10000)).then(() =>
      app.process().kill("SIGKILL"),
    ),
  ]);
  await new Promise((resolve) => server.close(resolve));
  standardDatabase.close();
}
