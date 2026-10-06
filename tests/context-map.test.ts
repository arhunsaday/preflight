import { expect, it } from "vitest";
import { ResourceSchema } from "../src/schema.js";
import { buildContextReport, layoutTreemap } from "../src/context-map.js";
const resource = (id: string, values = {}) =>
  ResourceSchema.parse({
    id,
    name: id,
    type: "skill",
    scope: "global",
    source: "local",
    harnesses: ["claude-code"],
    ...values,
  });
it("counts available skill metadata separately from its optional body", () => {
  const r = resource("skill:a", {
    name: "Test",
    description: "abcdefgh",
    content: "x".repeat(400),
  });
  const report = buildContextReport([r]);
  expect(report.entries[0]?.bodyTokens).toBe(100);
  expect(report.entries[0]?.catalogueTokens).toBeGreaterThan(0);
  expect(report.estimatedTokens).toBe(100 + report.entries[0]!.catalogueTokens);
  expect(buildContextReport([r], { mode: "catalogue" }).estimatedTokens).toBe(
    report.entries[0]!.catalogueTokens,
  );
});
it("never treats MCP credentials or transport config as tool schema tokens", () => {
  const report = buildContextReport([
    resource("mcp:a", {
      type: "mcp",
      config: { command: "npx", env: { TOKEN: "secret" } },
    }),
  ]);
  expect(report.estimatedTokens).toBe(0);
  expect(report.unknownCount).toBe(1);
  expect(report.entries[0]?.tokens).toBeNull();
  expect(JSON.stringify(report)).not.toContain("secret");
});
it("project overrides an inherited id and disabled resources never inflate totals", () => {
  const report = buildContextReport([
    resource("skill:a", { content: "x".repeat(800) }),
    resource("skill:a", { scope: "project", content: "xxxx" }),
    resource("skill:b", { enabled: false, content: "x".repeat(10000) }),
  ]);
  expect(report.entries).toHaveLength(2);
  expect(report.entries.find((e) => e.id === "skill:a")?.scope).toBe("project");
  expect(report.entries.find((e) => e.id === "skill:b")?.tokens).toBe(0);
  expect(report.estimatedTokens).toBeLessThan(20);
});
it("filters agents and scope without duplicating a resource shared by two agents", () => {
  const a = resource("skill:a", {
    content: "abcd",
    harnesses: ["claude-code", "cursor"],
  });
  const b = resource("prompt:b", {
    type: "prompt",
    scope: "project",
    content: "abcdefgh",
    harnesses: ["cursor"],
  });
  expect(
    buildContextReport([a, b], { harness: "claude-code" }).entries,
  ).toHaveLength(1);
  expect(
    buildContextReport([a, b], { scope: "project" }).entries.map((e) => e.id),
  ).toEqual(["prompt:b"]);
  expect(buildContextReport([a]).entries).toHaveLength(1);
});
it("missing prompt bodies stay unknown; catalogue mode does not invent prompt costs", () => {
  const r = resource("prompt:a", {
    type: "prompt",
    description: "not the prompt itself",
  });
  expect(buildContextReport([r]).unknownCount).toBe(1);
  expect(buildContextReport([r], { mode: "catalogue" }).estimatedTokens).toBe(
    0,
  );
});
it("treemap fills its bounds proportionally without overlap or NaN", () => {
  const tiles = layoutTreemap(
    [
      { id: "a", value: 60 },
      { id: "b", value: 30 },
      { id: "c", value: 10 },
      { id: "zero", value: 0 },
    ],
    1000,
    600,
  );
  expect(tiles).toHaveLength(3);
  for (const tile of tiles) {
    expect(tile.width * tile.height).toBeCloseTo(
      (tile.id === "a" ? 0.6 : tile.id === "b" ? 0.3 : 0.1) * 600000,
    );
    expect(tile.x + tile.width).toBeLessThanOrEqual(1000);
    expect(tile.y + tile.height).toBeLessThanOrEqual(600);
    for (const other of tiles.filter((t) => t.id !== tile.id))
      expect(
        Math.min(tile.x + tile.width, other.x + other.width) <=
          Math.max(tile.x, other.x) ||
          Math.min(tile.y + tile.height, other.y + other.height) <=
            Math.max(tile.y, other.y),
      ).toBe(true);
  }
  expect(layoutTreemap([], 0, 0)).toEqual([]);
});
it("preserves a known empty body and rejects unusable treemap dimensions", () => {
  expect(
    buildContextReport([
      resource("prompt:empty", { type: "prompt", content: "" }),
    ]),
  ).toMatchObject({ estimatedTokens: 0, unknownCount: 0 });
  expect(layoutTreemap([{ id: "bad", value: NaN }], 100, 100)).toEqual([]);
  expect(layoutTreemap([{ id: "a", value: 1 }], Infinity, 100)).toEqual([]);
});
