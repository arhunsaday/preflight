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
