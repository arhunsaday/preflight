import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigStore, diffResources } from "../src/state.js";
import type { Resource } from "../src/schema.js";

const skill = (overrides: Partial<Resource> = {}): Resource => ({
  id: "skill:tdd",
  type: "skill",
  name: "TDD",
  description: "",
  source: "https://example.test/tdd",
  scope: "global",
  harnesses: ["claude-code"],
  enabled: true,
  config: {},
  tags: [],
  ...overrides,
});

describe("ConfigStore", () => {
  it("supports create, update, scope move, and delete without losing the previous file", async () => {
    const root = await mkdtemp(join(tmpdir(), "adk-state-"));
    const store = new ConfigStore(root);
    await store.init();
    await store.create(skill());
    await store.update("skill:tdd", { description: "Test first" });
    await store.move("skill:tdd", "project");
    expect((await store.get("skill:tdd")).scope).toBe("project");
    expect((await store.get("skill:tdd")).description).toBe("Test first");
    await store.remove("skill:tdd");
    await expect(store.get("skill:tdd")).rejects.toThrow(/not found/i);
    expect(
      JSON.parse(await readFile(join(root, "adk.config.json.bak"), "utf8")),
    ).toBeTruthy();
  });

  it("never overwrites an invalid config", async () => {
    const root = await mkdtemp(join(tmpdir(), "adk-invalid-"));
    await writeFile(join(root, "adk.config.json"), "{bad json");
    const store = new ConfigStore(root);
    await expect(store.init()).rejects.toThrow();
    expect(await readFile(join(root, "adk.config.json"), "utf8")).toBe(
      "{bad json",
    );
  });
});

describe("diffResources", () => {
  it("classifies additions, replacements, unchanged entries, and removals", () => {
    const current = [
      skill(),
      skill({ id: "prompt:old", type: "prompt", name: "Old" }),
    ];
    const desired = [
      skill(),
      skill({ id: "prompt:old", type: "prompt", name: "Updated" }),
      skill({ id: "tool:new", type: "tool", name: "New" }),
    ];
    const diff = diffResources(current, desired);
    expect(diff.map((entry) => entry.kind)).toEqual([
      "unchanged",
      "replace",
      "add",
    ]);
    expect(diffResources(current, [], true).map((entry) => entry.kind)).toEqual(
      ["remove", "remove"],
    );
  });
});
