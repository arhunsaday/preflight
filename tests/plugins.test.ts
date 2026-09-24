import {
  mkdtemp,
  realpath,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect } from "vitest";
import { AdkService } from "../src/service.js";
import { ResourceSchema } from "../src/schema.js";
import { installationPlan } from "../src/operations.js";
async function setup() {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-plugin-"));
  return new AdkService({ root, home: join(root, "home") });
}
const plugin = () =>
  ResourceSchema.parse({
    id: "plugin:formatter",
    type: "plugin",
    name: "formatter@team",
    source: "https://github.com/example/plugins",
    scope: "project",
    harnesses: ["claude-code"],
  });
it("manages plugin enable/disable and scope without changing other settings", async () => {
  const s = await setup();
  await s.init();
  await mkdir(join(s.context.root, ".claude"));
  await writeFile(
    join(s.context.root, ".claude", "settings.json"),
    JSON.stringify({
      enabledPlugins: { "human@team": true },
      permissions: { deny: ["Read(.env)"] },
    }),
  );
  await s.create(plugin());
  await s.update(plugin().id, { enabled: false });
  let config = JSON.parse(
    await readFile(join(s.context.root, ".claude", "settings.json"), "utf8"),
  );
  expect(config.enabledPlugins).toEqual({
    "human@team": true,
    "formatter@team": false,
  });
  expect(config.permissions).toEqual({ deny: ["Read(.env)"] });
  expect(
    (await s.detect())[0]?.resources.find((r) => r.name === "formatter@team"),
  ).toMatchObject({ enabled: false, type: "plugin" });
  await s.update(plugin().id, { scope: "global", enabled: true });
  config = JSON.parse(
    await readFile(join(s.context.root, ".claude", "settings.json"), "utf8"),
  );
  expect(config.enabledPlugins).toEqual({ "human@team": true });
  expect(
    JSON.parse(
      await readFile(join(s.context.home, ".claude", "settings.json"), "utf8"),
    ).enabledPlugins["formatter@team"],
  ).toBe(true);
  await s.rollback();
  expect((await s.inspect(plugin().id)).scope).toBe("project");
});
it("delegates plugin installation with a scope and rejects option-like names", () => {
  expect(installationPlan(plugin())).toEqual({
    command: "claude",
    args: ["plugin", "install", "formatter@team", "--scope", "project"],
  });
  expect(installationPlan({ ...plugin(), scope: "global" }).args.at(-1)).toBe(
    "user",
  );
  expect(() => installationPlan({ ...plugin(), name: "--help" })).toThrow();
});
it("reports read denial bypass risks and secrets from harness settings", async () => {
  const s = await setup();
  await mkdir(join(s.context.root, ".claude"), { recursive: true });
  await writeFile(
    join(s.context.root, ".claude", "settings.local.json"),
    JSON.stringify({
      permissions: { allow: ["Bash(cat:*)"], deny: ["Read(.env)"] },
      env: { API_TOKEN: "literal" },
    }),
  );
  const findings = await s.doctor();
  expect(findings.some((f) => f.code === "shell-read-bypass")).toBe(true);
  expect(findings.some((f) => f.code === "settings-secret")).toBe(true);
  expect(JSON.stringify(findings)).not.toContain("literal");
});
