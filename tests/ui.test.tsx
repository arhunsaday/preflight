import React from "react";
import { expect, it } from "vitest";
import { render } from "ink-testing-library";
import { ResourceList } from "../src/ui.js";
import { ResourceSchema } from "../src/schema.js";
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
it("wraps long inspection text into scrollable terminal lines", async () => {
  const { outputLines } = await import("../src/ui.js");
  const lines = outputLines("x".repeat(500), 40);
  expect(lines).toHaveLength(13);
  expect(lines.every((line) => line.length <= 40)).toBe(true);
  expect(lines.join("")).toBe("x".repeat(500));
});
it("searches the catalogue and adds the selected result only after preview confirmation", async () => {
  const { vi } = await import("vitest");
  const { mkdtemp, realpath, mkdir } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { AdkService } = await import("../src/service.js");
  const { App } = await import("../src/ui.js");
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-ui-"));
  const context = { root, home: join(root, "home") };
  await mkdir(context.home);
  const service = new AdkService(context);
  await service.init();
  const view = render(<App context={context} />);
  try {
    await vi.waitFor(() =>
      expect(view.lastFrame()).toContain("Select a resource"),
    );
    view.stdin.write("\t");
    await vi.waitFor(() => expect(view.lastFrame()).toContain("adk ›"));
    view.stdin.write("search ponytail");
    await vi.waitFor(() =>
      expect(view.lastFrame()).toContain("adk › search ponytail"),
    );
    view.stdin.write("\r");
    await vi.waitFor(() =>
      expect(view.lastFrame()).toContain("catalogue / all / 1 resources"),
    );
    view.stdin.write("add");
    await vi.waitFor(() => expect(view.lastFrame()).toContain("adk › add"));
    view.stdin.write("\r");
    await vi.waitFor(() => expect(view.lastFrame()).toContain("Preview only"));
    expect(await service.list()).toHaveLength(0);
    view.stdin.write("confirm");
    await vi.waitFor(() => expect(view.lastFrame()).toContain("adk › confirm"));
    view.stdin.write("\r");
    await vi.waitFor(async () => expect(await service.list()).toHaveLength(1));
  } finally {
    view.unmount();
  }
});
