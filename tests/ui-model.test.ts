import { expect, it } from "vitest";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  actions,
  available,
  byKey,
  commandLine,
  cycle,
  emptyForm,
  formFields,
  fromResource,
  fuzzyScore,
  jsonSegments,
  lineDelta,
  observed,
  outputLines,
  summarize,
  toggle,
  tokenize,
  truncate,
  truncateStart,
  validate,
  wrapWords,
  writes,
  type ActionState,
} from "../src/ui/index.js";
import { execute } from "../src/commands.js";
import { ResourceSchema } from "../src/schema.js";
import { measureUsage } from "../src/usage.js";

const state: ActionState = {
  view: "browse",
  resource: ResourceSchema.parse({
    id: "skill:example",
    type: "skill",
    name: "example",
    source: "local:owned",
    scope: "project",
    harnesses: ["claude-code"],
  }),
  initialized: true,
  online: false,
};

it("wraps long inspection text into scrollable terminal lines", () => {
  const lines = outputLines("x".repeat(500), 40);
  expect(lines).toHaveLength(13);
  expect(lines.every((line) => line.length <= 40)).toBe(true);
  expect(lines.join("")).toBe("x".repeat(500));
});

it("truncates with an ellipsis and tokenizes quoted command input", () => {
  expect(truncate("configuration", 6)).toBe("confi…");
  expect(truncate("short", 20)).toBe("short");
  expect(tokenize("create-json '{\"a\": 1}'")).toEqual([
    "create-json",
    '{"a": 1}',
  ]);
  expect(() => tokenize("unterminated '")).toThrow();
});

it("wraps prose on word boundaries", () => {
  expect(wrapWords("the quick brown fox jumps", 10)).toEqual([
    "the quick",
    "brown fox",
    "jumps",
  ]);
  expect(wrapWords("supercalifragilistic", 8)).toEqual([
    "supercal",
    "ifragili",
    "stic",
  ]);
  expect(wrapWords("first\nsecond", 20)).toEqual(["first", "second"]);
});

it("ranks contiguous and early fuzzy matches first", () => {
  const early = fuzzyScore("roll", "Reverse the latest transaction rollback")!;
  const exact = fuzzyScore("roll", "rollback")!;
  expect(exact).toBeLessThan(early);
  expect(fuzzyScore("zz", "rollback")).toBeNull();
});

it("exposes every interface action as a real CLI command", async () => {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "preflight-parity-"),
  );
  const context = { root, home: root };
  const names = [
    ...new Set(actions.map((action) => action.cli).filter(Boolean)),
  ] as string[];
  expect(names.length).toBeGreaterThan(12);
  for (const name of names)
    await expect(
      execute([...name.split(" "), "--help"], context),
    ).resolves.toBeDefined();
});

it("offers resource actions only when a resource is selected", () => {
  const ids = (s: ActionState) => available(s).map((action) => action.id);
  expect(ids(state)).toContain("delete");
  expect(ids({ ...state, resource: undefined })).not.toContain("delete");
  expect(ids({ ...state, view: "profiles" })).not.toContain("delete");
  expect(byKey("d", state)?.id).toBe("delete");
  expect(
    byKey("d", { ...state, view: "profiles", profile: "minimal" })?.id,
  ).toBe("profile-diff");
});

it("shows the command a confirmed action previews first", () => {
  const move = actions.find((action) => action.id === "move")!;
  expect(commandLine(move, state)).toBe(
    "preflight move skill:example global --dry-run",
  );
});

it("reports the field that makes a resource invalid", () => {
  const invalid = validate({ ...emptyForm(), id: "x", name: "x" });
  expect(invalid.ok).toBe(false);
  if (!invalid.ok) expect(invalid.issues.id).toBeTruthy();

  const badConfig = validate({
    ...emptyForm(),
    id: "skill:ok",
    name: "ok",
    config: "{",
  });
  expect(badConfig.ok).toBe(false);
  if (!badConfig.ok) expect(badConfig.issues.config).toBeTruthy();

  const valid = validate({
    ...emptyForm(),
    id: "skill:ok",
    name: "ok",
    tags: "one, two",
    content: "first\\nsecond",
    config: '{"key":"value"}',
  });
  expect(valid.ok).toBe(true);
  if (valid.ok) {
    expect(valid.resource.tags).toEqual(["one", "two"]);
    expect(valid.resource.content).toBe("first\nsecond");
    expect(valid.resource.config).toEqual({ key: "value" });
  }
});

it("cycles choice fields and toggles harnesses", () => {
  const type = formFields.find((field) => field.name === "type")!;
  const harnesses = formFields.find((field) => field.name === "harnesses")!;
  const form = emptyForm();
  expect(cycle(form, type, 1).type).not.toBe(form.type);
  expect(cycle(cycle(form, type, 1), type, -1).type).toBe(form.type);
  expect(toggle(form, harnesses, "cursor").harnesses).toEqual([
    "claude-code",
    "cursor",
  ]);
  expect(toggle(form, harnesses, "claude-code").harnesses).toEqual([]);
});

it("round-trips a resource through the form", () => {
  const resource = ResourceSchema.parse({
    id: "skill:round",
    type: "skill",
    name: "round",
    source: "local:owned",
    scope: "global",
    harnesses: ["claude-code", "cursor"],
    content: "line one\nline two",
    tags: ["a", "b"],
  });
  const result = validate(fromResource(resource), resource);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.resource).toEqual(resource);
});

it("previews only the commands that change state", () => {
  expect(writes(["delete", "skill:a"])).toBe(true);
  expect(writes(["profiles", "switch", "minimal"])).toBe(true);
  expect(writes(["profiles", "diff", "a", "b"])).toBe(false);
  expect(writes(["loadouts", "list"])).toBe(false);
  expect(writes(["loadouts", "install", "junior"])).toBe(true);
  expect(writes(["install", "tool:trivy"])).toBe(false);
  expect(writes(["install", "tool:trivy", "--execute"])).toBe(true);
  expect(writes(["share"])).toBe(false);
  expect(writes(["share", "--out", "payload.json"])).toBe(true);
  expect(writes(["adopt", "skill:x"])).toBe(true);
  expect(writes(["catalog-add", "skill:x"])).toBe(true);
  expect(writes(["git", "status"])).toBe(false);
  expect(writes(["git", "push"])).toBe(true);
  expect(writes(["doctor"])).toBe(false);
  expect(writes(["doctor", "--measure"])).toBe(true);
  expect(writes(["instructions", "lint"])).toBe(false);
  expect(writes(["instructions", "draft", "--write"])).toBe(true);
  expect(writes(["unmanaged"])).toBe(false);
  expect(writes([])).toBe(false);
});

it("counts observed invocations per resource without double counting", async () => {
  const nothing = await measureUsage(
    join(await realpath(tmpdir()), "preflight-no-transcripts"),
    [],
  );
  const usage = {
    ...nothing,
    sessions: 3,
    invocations: {
      "skill:example": 2,
      mcp__grafana__search: 4,
      mcp__grafana__query: 1,
      grafana: 9,
    },
    invalidLines: 0,
    skillsUsed: 1,
    skillsInstalled: 1,
    utilization: 1,
    prune: [],
  };
  const server = ResourceSchema.parse({
    id: "mcp:grafana",
    type: "mcp",
    name: "grafana",
    source: "https://grafana.example.com/mcp",
    scope: "global",
    harnesses: ["claude-code"],
  });
  expect(observed(state.resource!, usage)).toBe(2);
  expect(observed(server, usage)).toBe(5);
  expect(observed(server, { ...usage, sessions: 0 })).toBeNull();
  expect(observed(server, null)).toBeNull();
});

it("counts the lines a transaction adds and removes", () => {
  expect(lineDelta(null, "a\nb")).toEqual({ added: 2, removed: 0 });
  expect(lineDelta("a\nb", null)).toEqual({ added: 0, removed: 2 });
  expect(lineDelta("a\nb", "a\nc")).toEqual({ added: 1, removed: 1 });
  expect(lineDelta("same", "same")).toEqual({ added: 0, removed: 0 });
});

it("summarizes a dry-run transaction into files, changes and warnings", () => {
  const summary = summarize({
    dryRun: true,
    warnings: ["cursor: hook is catalogued only"],
    files: [
      { path: "/tmp/preflight.config.json", before: "{}", after: "{\n}" },
      { path: "/tmp/new.json", before: null, after: "{}" },
    ],
    diff: [
      {
        kind: "add",
        resource: { id: "skill:a", name: "a", type: "skill" },
      },
      {
        kind: "unchanged",
        resource: { id: "skill:b", name: "b", type: "skill" },
      },
    ],
  })!;
  expect(summary.dryRun).toBe(true);
  expect(summary.files.map((file) => file.status)).toEqual([
    "modified",
    "created",
  ]);
  expect(summary.changes.map((change) => change.id)).toEqual(["skill:a"]);
  expect(summary.warnings).toHaveLength(1);
  expect(summarize({ note: "no transaction" })).toBeNull();
});

it("keeps the tail of a machine-generated identifier", () => {
  expect(truncateStart("mcp:claude-code:global:grafana-cace491b", 16)).toBe(
    "…rafana-cace491b",
  );
  expect(truncateStart("short", 16)).toBe("short");
});

it("colours a pretty-printed JSON line by token", () => {
  const cells = jsonSegments('  "count": 12,');
  expect(cells.map((cell) => cell.text)).toEqual([
    "  ",
    '"count":',
    " ",
    "12",
    ",",
  ]);
  expect(cells[1]!.color).not.toBe(cells[3]!.color);
  expect(jsonSegments("plain text").map((cell) => cell.text)).toEqual([
    "plain text",
  ]);
});
