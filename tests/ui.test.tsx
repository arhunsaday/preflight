import React from "react";
import { expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { App, ResourceList } from "../src/ui/index.js";
import { AdkService } from "../src/service.js";
import { ResourceSchema } from "../src/schema.js";

async function workspace() {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-ui-"));
  const context = { root, home: join(root, "home") };
  await mkdir(context.home);
  return context;
}

const spinning = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/;

// Ink subscribes input handlers in a React passive effect, scheduled on a
// macrotask, and the interface ignores keys while a command is running, so
// wait for both before sending a keystroke.
function driver(view: ReturnType<typeof render>) {
  const frame = () => view.lastFrame() ?? "";
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 20));
  return {
    frame,
    until: (text: string) =>
      vi.waitFor(() => expect(frame()).toContain(text), { timeout: 8000 }),
    untilGone: (text: string) =>
      vi.waitFor(() => expect(frame()).not.toContain(text), { timeout: 8000 }),
    press: async (keys: string) => {
      await vi.waitFor(() => expect(frame()).not.toMatch(spinning), {
        timeout: 8000,
      });
      await tick();
      view.stdin.write(keys);
      await tick();
    },
  };
}

it("renders a bounded viewport for 500 resources", () => {
  const resources = Array.from({ length: 500 }, (_, i) =>
    ResourceSchema.parse({
      id: `skill:${i}`,
      name: `Skill ${i}`,
      type: "skill",
      source: "local:test",
      scope: "project",
      harnesses: ["claude-code"],
    }),
  );
  const view = render(
    <ResourceList resources={resources} selected={250} height={10} />,
  );
  const frame = view.lastFrame()!;
  expect(frame).toContain("Skill 250");
  expect(frame).not.toContain("Skill 0 ");
  expect(frame.split("\n").length).toBeLessThanOrEqual(12);
  view.unmount();
});

it("shows views, the selected resource detail and its harness support", async () => {
  const context = await workspace();
  const service = new AdkService(context);
  await service.init();
  await service.create({
    id: "mcp:example",
    type: "mcp",
    name: "example",
    description: "Example server",
    source: "https://example.com/mcp",
    scope: "project",
    harnesses: ["claude-code", "cursor"],
    config: { url: "https://example.com/mcp" },
    tags: [],
    enabled: true,
  });
  const view = render(<App context={context} />);
  const ui = driver(view);
  try {
    await ui.until("Browse");
    await ui.until("example");
    expect(ui.frame()).toContain("Catalogue");
    expect(ui.frame()).toContain("Doctor");
    expect(ui.frame()).toContain("Profiles");
    // The detail pane names the resource and both wired harnesses.
    await ui.until("mcp:example");
    await ui.until("claude-code");
    expect(ui.frame()).toContain("cursor");
  } finally {
    view.unmount();
  }
}, 20000);

it("moves a resource between scopes only after the preview is confirmed", async () => {
  const context = await workspace();
  const service = new AdkService(context);
  await service.init();
  await service.create({
    id: "skill:scoped",
    type: "skill",
    name: "scoped",
    description: "",
    source: "local:owned",
    scope: "project",
    harnesses: ["claude-code"],
    content: "---\nname: scoped\n---\n",
    config: {},
    tags: [],
    enabled: true,
  });
  const view = render(<App context={context} />);
  const ui = driver(view);
  try {
    await ui.until("scoped");
    await ui.press("m");
    await ui.until("PREVIEW");
    expect(ui.frame()).toContain("adk move skill:scoped global");
    expect((await service.list())[0]!.scope).toBe("project");
    await ui.press("\u001b");
    await ui.until("Cancelled");
    expect((await service.list())[0]!.scope).toBe("project");
    await ui.press("m");
    await ui.until("PREVIEW");
    await ui.press("\r");
    await vi.waitFor(async () =>
      expect((await service.list())[0]!.scope).toBe("global"),
    );
  } finally {
    view.unmount();
  }
}, 20000);

it("searches the catalogue and adds the selected result only after preview confirmation", async () => {
  const context = await workspace();
  const service = new AdkService(context);
  await service.init();
  const view = render(<App context={context} />);
  const ui = driver(view);
  try {
    await ui.until("Browse");
    await ui.press("2");
    await ui.untilGone("loading the bundled catalogue");
    await ui.press("/");
    await ui.until("search ▸");
    await ui.press("ponytail");
    await ui.until("ponytail");
    await ui.press("\r");
    await ui.until('1 of 1  ·  query "ponytail"');
    await ui.press("a");
    await ui.until("PREVIEW");
    expect(await service.list()).toHaveLength(0);
    await ui.press("\r");
    await vi.waitFor(async () => expect(await service.list()).toHaveLength(1));
  } finally {
    view.unmount();
  }
}, 20000);

it("opens the action palette and filters it by typing", async () => {
  const context = await workspace();
  await new AdkService(context).init();
  const view = render(<App context={context} />);
  const ui = driver(view);
  try {
    await ui.until("Browse");
    await ui.press("\u000b"); // Ctrl+K
    await ui.until("Run any CLI command");
    await ui.press("rollback");
    await ui.until("Reverse the latest transaction");
    expect(ui.frame()).not.toContain("Run any CLI command");
    await ui.press("\u001b");
    await ui.until("Browse");
  } finally {
    view.unmount();
  }
}, 20000);

it("validates the resource form before previewing a write", async () => {
  const context = await workspace();
  const service = new AdkService(context);
  await service.init();
  const view = render(<App context={context} />);
  const ui = driver(view);
  try {
    await ui.until("Browse");
    await ui.press("n");
    await ui.until("NEW RESOURCE");
    expect(ui.frame()).toContain("harnesses");
    // The first field is a choice: Enter submits the still-empty form.
    await ui.press("\r");
    await ui.until("not valid yet");
    expect(await service.list()).toHaveLength(0);
    await ui.press("\u001b");
    await ui.until("Browse");
  } finally {
    view.unmount();
  }
}, 20000);

it("shows the keyboard reference with the command each action runs", async () => {
  const context = await workspace();
  await new AdkService(context).init();
  const view = render(<App context={context} />);
  const ui = driver(view);
  try {
    await ui.until("Browse");
    await ui.press("?");
    await ui.until("KEYBOARD REFERENCE");
    expect(ui.frame()).toContain("adk move <id> global --dry-run");
    await ui.press("\u001b");
    await ui.until("Browse");
  } finally {
    view.unmount();
  }
}, 20000);

it("guides an empty project to its first configuration", async () => {
  const context = await workspace();
  const view = render(<App context={context} />);
  const ui = driver(view);
  try {
    await ui.until("No configuration in this project");
    expect(ui.frame()).toContain("i creates adk.config.json");
    await ui.press("i");
    await ui.until("PREVIEW");
    await ui.press("\r");
    await ui.until("No resource in this profile");
  } finally {
    view.unmount();
  }
}, 20000);

it("keeps the resource id fixed while editing", async () => {
  const context = await workspace();
  const service = new AdkService(context);
  await service.init();
  await service.create({
    id: "prompt:draft",
    type: "prompt",
    name: "draft",
    description: "",
    source: "local:owned",
    scope: "project",
    harnesses: ["claude-code"],
    config: {},
    tags: [],
    enabled: true,
  });
  const view = render(<App context={context} />);
  const ui = driver(view);
  try {
    await ui.until("draft");
    await ui.press("e");
    await ui.until("EDIT prompt:draft");
    await ui.until("fixed; fork to rename");
    await ui.press("zz");
    expect(ui.frame()).not.toContain("prompt:draftzz");
    await ui.press("\u001b");
    await ui.until("Browse");
  } finally {
    view.unmount();
  }
}, 20000);

// A configuration edited outside ADK — pulled from git, or hand-edited — is
// desired state that has not reached the harness files yet.
it("marks desired resources as applied once they reach the harness files", async () => {
  const context = await workspace();
  const service = new AdkService(context);
  const config = await service.init();
  config.profiles.default!.resources.push(
    ResourceSchema.parse({
      id: "command:ship",
      type: "command",
      name: "ship",
      source: "local:owned",
      scope: "project",
      harnesses: ["claude-code"],
      content: "Run the checks.\n",
    }),
  );
  await service.store.write(config);
  const view = render(<App context={context} />);
  const ui = driver(view);
  try {
    await ui.until("not yet written");
    expect(ui.frame()).toContain("1 not applied");
    await ui.press("y");
    await ui.until("PREVIEW");
    await ui.press("\r");
    await ui.until("written to the harness files");
    expect(ui.frame()).not.toContain("not applied");
  } finally {
    view.unmount();
  }
}, 20000);
