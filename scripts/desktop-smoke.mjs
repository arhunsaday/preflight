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
const bindings = {
  OWNER_ID: "smoke-owner",
  WRITE_TOKEN: "desktop-smoke-token",
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
let latestDeviceToken;
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
    if (req.url === "/api/auth/device/token" && response.ok)
      latestDeviceToken = (await response.clone().json()).access_token;
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const service = `http://127.0.0.1:${server.address().port}`;
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
let standardDatabase;
const errors = [];
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
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
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Discover resources", exact: true })
    .click();
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
  await page.getByRole("button", { name: /^Skills/ }).click();
  await page.getByRole("heading", { name: "ponytail", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Theme: system. Switch theme", exact: true })
    .click();
  await page.locator('html[data-theme="light"]').waitFor();
  assert.ok(
    (await page.locator('.nav-semantic-icon [opacity="0.2"]').count()) > 0,
    "Navigation uses real duotone layers",
  );
  assert.ok((await page.locator(".resource-glyph .semantic-icon").count()) > 0);
  assert.ok((await page.locator(".row-harnesses .harness-badge").count()) > 0);
  await page.screenshot({ path: join(temporary, "skills.png") });
  await page.screenshot({
    path: join(temporary, "duotone-light.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Theme: light. Switch theme", exact: true })
    .click();
  await page.locator('html[data-theme="dark"]').waitFor();
  await page.screenshot({
    path: join(temporary, "duotone-dark.png"),
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
  await page.getByRole("button", { name: "Profiles", exact: true }).click();
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
  await page.getByRole("button", { name: /^Doctor/ }).click();
  await page
    .getByRole("heading", { name: "Check your setup", exact: true })
    .waitFor();
  await page.screenshot({ path: join(temporary, "doctor.png") });
  await page.getByRole("button", { name: "Loadouts", exact: true }).click();
  await page.locator(".loadout-list button").first().click();
  await page
    .getByRole("button", { name: "Preview installation", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Command console", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Preflight command" }).fill("list");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  // Read-only console output stays inline instead of opening a dialog.
  await page.locator(".console-entry").first().waitFor();
  await page.getByRole("button", { name: "Benchmarks", exact: true }).click();
  await page.getByRole("heading", { name: "No benchmark runs yet" }).waitFor();
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByText("Offline roster", { exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Ada");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("ada@example.com");
  await page.getByRole("button", { name: "Add teammate", exact: true }).click();
  await page.getByRole("cell", { name: /Ada/ }).first().waitFor();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("heading", { name: "Your Preflight account" }).waitFor();
  await page.getByText("Legacy deployment token", { exact: true }).click();
  await page.getByRole("textbox", { name: "Service URL" }).fill(service);
  await page
    .getByRole("textbox", { name: "Owner token" })
    .fill("desktop-smoke-token");
  await page
    .getByRole("button", { name: "Connect service", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Connected as smoke-owner" })
    .waitFor();
  assert.equal(
    JSON.stringify(await page.evaluate(() => window.preflight.state())).includes(
      "desktop-smoke-token",
    ),
    false,
  );
  assert.equal(
    (await readFile(join(data, "workspace.json"), "utf8")).includes(
      "desktop-smoke-token",
    ),
    false,
  );
  await page.getByRole("button", { name: "Sharing", exact: true }).click();
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
  assert.equal(records.size, 1);
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
  assert.equal(records.size, 0);
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
  await page.getByRole("button", { name: /^Projects/ }).click();
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
  await page.getByRole("button", { name: /^MCP servers/ }).click();
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
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  assert.equal(
    JSON.parse(
      await readFile(join(home, ".preflight", "global", "preflight.config.json"), "utf8"),
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
  await page.getByRole("button", { name: "Overview", exact: true }).click();
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
  await page.getByRole("button", { name: "Context map", exact: true }).click();
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
  await page
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

  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Discover resources", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Bundled library", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Discover resources", exact: true })
    .click();
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
    shell.openExternal = async () => {};
  });
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  standardDatabase = await localD1();
  bindings.AUTH_DB = standardDatabase.database;
  bindings.BASE_URL = service;
  bindings.BETTER_AUTH_SECRET =
    "electron-test-only-secret-at-least-thirty-two-characters";
  bindings.AUTH_LOCAL_TEST = "1";
  const cloudCall = async (path, body, token) => {
    const response = await fetch(service + "/api/auth/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: service,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const signup = async (name, email) => {
    const account = await cloudCall("sign-up/email", {
      name,
      email,
      password: "safe-electron-test-password-123",
    });
    await bindings.AUTH_DB.prepare(
      "UPDATE user SET email_verified = 1 WHERE id = ?",
    )
      .bind(account.user.id)
      .run();
    return account;
  };
  const signIn = async (account) => {
    await page
      .getByRole("textbox", { name: "Backend URL", exact: true })
      .fill(service);
    await page
      .getByRole("button", { name: "Sign in with browser", exact: true })
      .click();
    const heading = page.getByRole("heading", { name: /Confirm code:/ });
    await heading.waitFor();
    const userCode = (await heading.textContent())
      .replace("Confirm code: ", "")
      .trim();
    await cloudCall(
      "device?user_code=" + encodeURIComponent(userCode),
      undefined,
      account.token,
    );
    await cloudCall("device/approve", { userCode }, account.token);
    await page
      .getByRole("heading", {
        name: "Connected as " + account.user.name,
        exact: true,
      })
      .waitFor();
  };
  const owner = await signup("Crew owner", "owner@example.com");
  const member = await signup("New member", "new-member@example.com");
  await signIn(owner);
  await page.screenshot({ path: join(temporary, "account-standard.png") });
  await page.getByRole("button", { name: "Team", exact: true }).click();
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
  const groups = await cloudCall("organization/list", undefined, owner.token);
  const pending = await cloudCall(
    "organization/list-invitations?organizationId=" + groups[0].id,
    undefined,
    owner.token,
  );
  const invitationPage = await fetch(service + "/invite/" + pending[0].id, {
    headers: { Authorization: `Bearer ${member.token}` },
  });
  assert.equal(invitationPage.status, 200);
  assert.match(await invitationPage.text(), /Accept invitation/);
  await page.screenshot({ path: join(temporary, "team-owner.png") });
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await signIn(member);
  await page.getByRole("button", { name: "Team", exact: true }).click();
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
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
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
  latestDeviceToken = undefined;
  await page
    .getByRole("button", { name: "Sign in with browser", exact: true })
    .click();
  const cancelling = page.getByRole("heading", { name: /Confirm code:/ });
  await cancelling.waitFor();
  const cancelledCode = (await cancelling.textContent())
    .replace("Confirm code: ", "")
    .trim();
  await cloudCall(
    "device?user_code=" + encodeURIComponent(cancelledCode),
    undefined,
    owner.token,
  );
  await cloudCall("device/approve", { userCode: cancelledCode }, owner.token);
  await Promise.race([
    reached,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error("Device redemption did not reach account verification"),
          ),
        12000,
      ),
    ),
  ]);
  const cancelledToken = latestDeviceToken;
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
  assert.ok(
    revoked,
    "Cancelling a redeemed device grant must revoke its session",
  );
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
  standardDatabase?.close();
}
