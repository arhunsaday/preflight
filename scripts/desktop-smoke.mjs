import { _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, readFile, realpath } from "node:fs/promises";
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
  ADK_DESKTOP_TEST_ROOT: project,
  ADK_DESKTOP_TEST_HOME: home,
  ADK_DESKTOP_TEST_DATA: data,
};
delete env.ELECTRON_RUN_AS_NODE;
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
const server = createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) body += chunk;
    const response = await worker.fetch(
      new Request(`${service}${req.url}`, {
        method: req.method,
        headers: req.headers,
        ...(body ? { body } : {}),
      }),
      bindings,
    );
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
  process.env.ADK_DESKTOP_EXECUTABLE ??
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
  await assert.rejects(readFile(join(project, "adk.config.json")));
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("heading", { name: "Operation result" }).waitFor();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    JSON.parse(await readFile(join(project, "adk.config.json"), "utf8"))
      .activeProfile,
    "default",
  );
  await page.getByRole("button", { name: "Catalogue", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search resources" })
    .fill("ponytail");
  await page
    .getByRole("button", { name: "Add to project", exact: true })
    .click();
  await page.getByRole("heading", { name: "Review changes" }).waitFor();
  assert.equal(
    JSON.parse(await readFile(join(project, "adk.config.json"), "utf8"))
      .profiles.default.resources.length,
    0,
  );
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    JSON.parse(await readFile(join(project, "adk.config.json"), "utf8"))
      .profiles.default.resources.length,
    1,
  );
  await page.getByRole("button", { name: /^Skills/ }).click();
  await page.getByRole("heading", { name: "ponytail", exact: true }).waitFor();
  await page.screenshot({ path: join(temporary, "skills.png") });
  await page.getByRole("button", { name: "More resource actions" }).click();
  await page.getByRole("button", { name: "Move to global" }).click();
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    JSON.parse(await readFile(join(project, "adk.config.json"), "utf8"))
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
    JSON.parse(await readFile(join(project, "adk.config.json"), "utf8"))
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
    JSON.parse(await readFile(join(project, "adk.config.json"), "utf8"))
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
  await page.getByRole("textbox", { name: "ADK command" }).fill("list");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Benchmarks", exact: true }).click();
  await page.getByRole("heading", { name: "No benchmark runs yet" }).waitFor();
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Ada");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("ada@example.com");
  await page.getByRole("button", { name: "Add teammate", exact: true }).click();
  await page.getByRole("cell", { name: /Ada/ }).first().waitFor();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page
    .getByRole("heading", { name: "Connect your share service" })
    .waitFor();
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
    JSON.stringify(await page.evaluate(() => window.adk.state())).includes(
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
    await page.locator(".dialog .code").innerText(),
  );
  assert.equal(publication.code.length, 6);
  assert.equal(records.size, 1);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Share code or JSON file" })
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
  await assert.rejects(readFile(join(secondProject, "adk.config.json")));
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
  await page.getByRole("button", { name: "Catalogue", exact: true }).click();
  await page.getByRole("textbox", { name: "Search resources" }).fill("");
  await page.locator("nav").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: join(temporary, "catalogue.png") });
  await page.setViewportSize({ width: 900, height: 700 });
  await page.screenshot({ path: join(temporary, "compact.png") });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
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
  await app.close();
  await new Promise((resolve) => server.close(resolve));
}
