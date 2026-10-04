import { _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
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
const app = await electron.launch({ args: [resolve(".")], env });
const errors = [];
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
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
  console.log("team");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Ada");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("ada@example.com");
  await page.getByRole("button", { name: "Add teammate", exact: true }).click();
  console.log("team clicked");
  await page.getByRole("cell", { name: /Ada/ }).first().waitFor();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page
    .getByRole("heading", { name: "Connect your share service" })
    .waitFor();
  await page.getByRole("button", { name: "Catalogue", exact: true }).click();
  await page.getByRole("textbox", { name: "Search resources" }).fill("");
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
}
