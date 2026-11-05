// Screenshots of the desktop app on a realistic setup, for design review and
// release notes. The fixture is this repository's own Claude Code kit
// (claude-code/): its skills, agents, commands and MCP template, copied into a
// disposable HOME, plus a project with its own CLAUDE.md. Nothing is invented.
//
//   npm run desktop:build && xvfb-run -a node scripts/desktop-captures.mjs [out-dir]
import { _electron as electron } from "@playwright/test";
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

const out = resolve(process.argv[2] ?? "desktop-captures");
const temporary = await mkdtemp(
  join(await realpath(tmpdir()), "preflight-captures-"),
);
const project = join(temporary, "home", "Repos", "my-app"),
  home = join(temporary, "home"),
  data = join(temporary, "app");
await mkdir(project, { recursive: true });
await Promise.all([mkdir(data), mkdir(out, { recursive: true })]);

// Global Claude Code setup: the kit's skills (flattened), agents and commands.
const kit = resolve("claude-code");
const claude = join(home, ".claude");
await mkdir(join(claude, "skills"), { recursive: true });
for (const group of await readdir(join(kit, "skills"), { withFileTypes: true })) {
  if (!group.isDirectory()) continue;
  for (const skill of await readdir(join(kit, "skills", group.name), {
    withFileTypes: true,
  }))
    if (skill.isDirectory())
      await cp(
        join(kit, "skills", group.name, skill.name),
        join(claude, "skills", skill.name),
        { recursive: true },
      );
}
await cp(join(kit, "agents"), join(claude, "agents"), { recursive: true });
await cp(join(kit, "commands"), join(claude, "commands"), { recursive: true });
await cp(join(kit, "CLAUDE.md"), join(claude, "CLAUDE.md"));
await cp(join(kit, "settings.json"), join(claude, "settings.json"));
const mcp = JSON.parse(await readFile(join(kit, "mcp.json"), "utf8"));
delete mcp.$comment;
await writeFile(join(home, ".claude.json"), JSON.stringify(mcp, null, 2));
// The project: its own instructions and one project skill.
await mkdir(join(project, ".claude", "skills"), { recursive: true });
await cp(resolve("agent-instructions/AGENTS.md"), join(project, "CLAUDE.md"));
await cp(
  join(kit, "skills", "quality", "verify-change"),
  join(project, ".claude", "skills", "verify-change"),
  { recursive: true },
);

const env = {
  ...process.env,
  PREFLIGHT_DESKTOP_TEST_ROOT: project,
  PREFLIGHT_DESKTOP_TEST_HOME: home,
  PREFLIGHT_DESKTOP_TEST_DATA: data,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  chromiumSandbox: process.platform !== "linux",
  args: [resolve(".")],
  env,
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Initialize project" }).click();
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  for (const dismiss of await page
    .getByRole("button", { name: "Dismiss notification" })
    .all())
    await dismiss.click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const views = [
    ["overview", "Overview"],
    ["resources", "Detected"],
    ["doctor", "Doctor"],
    ["context-map", "Context map"],
  ];
  const shots = [];
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const [file, label] of views) {
      await nav.getByRole("button", { name: new RegExp(`^${label}`) }).click();
      await page.waitForTimeout(600);
      const path = join(out, `${file}-${theme}.png`);
      await page.screenshot({ path, animations: "disabled" });
      shots.push(path);
    }
  }
  console.log(JSON.stringify({ out, shots }, null, 2));
} finally {
  await Promise.race([
    app.close(),
    new Promise((r) => setTimeout(r, 10000)).then(() =>
      app.process().kill("SIGKILL"),
    ),
  ]);
}
