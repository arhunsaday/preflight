import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Dashboard } from "../src/ui/index.js";
import { PreflightService } from "../src/service.js";

async function workspace() {
  const root = await mkdtemp(join(await realpath(tmpdir()), "preflight-dash-"));
  const context = { root, home: join(root, "home") };
  await mkdir(join(context.home, ".claude", "skills", "alpha"), {
    recursive: true,
  });
  await writeFile(
    join(context.home, ".claude", "skills", "alpha", "SKILL.md"),
    "---\nname: alpha\ndescription: Alpha skill for tests\n---\nBody\n",
  );
  await mkdir(join(context.home, ".codex"), { recursive: true });
  return context;
}

let view: ReturnType<typeof render> | undefined;
afterEach(() => {
  view?.unmount();
  view = undefined;
  delete process.env["NO_COLOR"];
});

function start(context: Awaited<ReturnType<typeof workspace>>) {
  view = render(<Dashboard context={context} />);
  const frame = () => view!.lastFrame() ?? "";
  const tick = () => new Promise<void>((r) => setTimeout(r, 30));
  return {
    frame,
    until: (text: string) =>
      vi.waitFor(() => expect(frame()).toContain(text), { timeout: 8000 }),
    press: async (keys: string) => {
      await vi.waitFor(() => expect(frame()).not.toContain("…"), {
        timeout: 8000,
      });
      await tick();
      view!.stdin.write(keys);
      await tick();
    },
  };
}

it("shows tabs, sections, counts and the footer keys", async () => {
  const context = await workspace();
  await new PreflightService(context).init();
  const ui = start(context);
  await ui.until("Context cost");
  const text = ui.frame();
  expect(text).toContain("All");
  expect(text).toContain("Claude Code");
  expect(text).toContain("Codex");
  expect(text).not.toContain("Cursor");
  for (const name of ["Overview", "Skills", "MCP", "Subagents", "Hooks", "Plugins", "Instructions", "Profiles", "Doctor", "Usage"])
    expect(text).toContain(name);
  expect(text).toContain("profile default");
  expect(text).toMatch(/Skills\s+1/);
  expect(text).toContain("q quit");
});

it("moves between sections and harness tabs", async () => {
  const context = await workspace();
  await new PreflightService(context).init();
  const ui = start(context);
  await ui.until("Context cost");
  await ui.press("j");
  await ui.until("Skills · 1");
  expect(ui.frame()).toContain("alpha");
  expect(ui.frame()).toContain("● enabled");
  await ui.press("\t");
  await ui.until("▸Claude Code");
  await ui.press("\t");
  await ui.until("▸Codex");
  await ui.until("Skills · 0");
});

it("filters with / and clears with Escape", async () => {
  const context = await workspace();
  await new PreflightService(context).init();
  const ui = start(context);
  await ui.until("Context cost");
  await ui.press("j");
  await ui.until("alpha");
  await ui.press("/");
  await ui.press("zzz");
  await ui.until("Nothing matches.");
  await ui.press("\u001b");
  await ui.until("alpha");
});

it("previews a profile switch and applies it only after confirmation", async () => {
  const context = await workspace();
  const service = new PreflightService(context);
  await service.init();
  await service.profileCreate("work");
  const ui = start(context);
  await ui.until("profile default");
  await ui.press("p");
  await ui.until("Switch profile");
  await ui.press("j");
  await ui.press("\r");
  await ui.until("Preview only. Nothing is written yet.");
  expect((await service.store.read()).activeProfile).toBe("default");
  await ui.press("\r");
  await ui.until("profile work");
  await vi.waitFor(async () =>
    expect(JSON.parse(await readFile(service.store.configPath, "utf8")).activeProfile).toBe("work"),
  );
});

it("cancels a profile switch with Escape", async () => {
  const context = await workspace();
  const service = new PreflightService(context);
  await service.init();
  await service.profileCreate("work");
  const ui = start(context);
  await ui.until("profile default");
  await ui.press("p");
  await ui.press("j");
  await ui.press("\r");
  await ui.until("Preview only");
  await ui.press("\u001b");
  await ui.until("Context cost");
  expect((await service.store.read()).activeProfile).toBe("default");
});

it("runs the doctor with d and shows help with ?", async () => {
  const context = await workspace();
  await new PreflightService(context).init();
  const ui = start(context);
  await ui.until("Context cost");
  await ui.press("d");
  await ui.until("Doctor ·");
  await ui.press("?");
  await ui.until("Press any key to close.");
});

it("fits 80x24 and drops colour with NO_COLOR", async () => {
  process.env["NO_COLOR"] = "1";
  const context = await workspace();
  await new PreflightService(context).init();
  const ui = start(context);
  await ui.until("Context cost");
  const lines = ui.frame().split("\n");
  expect(lines.length).toBeLessThanOrEqual(30);
  // eslint-disable-next-line no-control-regex
  expect(ui.frame()).not.toMatch(/\u001b\[(3[0-7]|38)/);
});
