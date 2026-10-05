import { expect, it } from "vitest";
import { ResourceSchema } from "../src/schema.js";
import { searchSources } from "../src/catalog.js";
import { materializeLoadout, resolveLoadout } from "../src/loadouts.js";
import { makeShare, shareCode, previewShare } from "../src/sharing.js";
import { analyze, measureUsage } from "../src/analysis.js";
import { execute } from "../src/commands.js";
import { mkdtemp, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const resource = ResourceSchema.parse({
  id: "skill:tests",
  type: "skill",
  name: "tests",
  source: "https://example.com",
  scope: "project",
  harnesses: ["claude-code"],
  description: "Use for tests",
});
it("isolates unavailable search sources and filters typed results", async () => {
  const result = await searchSources("test", [
    { id: "ok", search: async () => [resource] },
    {
      id: "bad",
      search: async () => {
        throw new Error("offline");
      },
    },
  ]);
  expect(result.resources).toHaveLength(1);
  expect(result.errors).toHaveLength(1);
});
it("resolves layered loadouts and rejects cycles", () => {
  const data = {
    loadouts: {
      base: { provides: { skills: [{ id: "tests", why: "base" }] } },
      web: {
        extends: "base",
        provides: { skills: [{ id: "tests", why: "web" }] },
      },
    },
    presets: { frontend: ["web"] },
  };
  expect(resolveLoadout(data, "frontend")[0]?.why).toBe("web");
  expect(() =>
    resolveLoadout({ loadouts: { a: { extends: "a" } } }, "a"),
  ).toThrow(/cycle/i);
});
it("names the upstream installer for a loadout skill the catalogue lacks", () => {
  const data = {
    loadouts: {
      base: {
        provides: {
          skills: [
            { id: "tests", scope: "project", why: "vendored" },
            {
              id: "elsewhere",
              scope: "global",
              why: "third party",
              external: "owner/repo",
            },
          ],
        },
      },
    },
  };
  const plan = materializeLoadout(data, "base", [resource]);
  expect(plan.resources.map((r) => r.id)).toEqual(["skill:tests"]);
  expect(plan.missing).toEqual([
    "skills/elsewhere (npx skills add owner/repo)",
  ]);
});
it("shares only validated resources and previews changes", () => {
  const payload = makeShare([resource], { ownerId: "test" });
  expect(shareCode()).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{16}$/);
  expect(previewShare(payload, [])[0]?.kind).toBe("add");
  expect(() =>
    makeShare([{ ...resource, config: { TOKEN: "literal" } }], {
      ownerId: "test",
    }),
  ).toThrow();
});
it("counts observed invocations without inventing usage from plain mentions", async () => {
  const dir = await mkdtemp(join(await realpath(tmpdir()), "adk-usage-"));
  await writeFile(
    join(dir, "session.jsonl"),
    [
      JSON.stringify({
        message: {
          content: [
            { type: "tool_use", name: "Skill", input: { skill: "tests" } },
          ],
        },
      }),
      JSON.stringify({ text: "Skill tests" }),
      "bad",
    ].join("\n"),
  );
  const usage = await measureUsage(dir, [resource]);
  expect(usage.skillsUsed).toBe(1);
  expect(usage.invocations["skill:tests"]).toBe(1);
  expect(usage.invalidLines).toBe(1);
  expect(
    analyze([{ ...resource, config: { "allowed-tools": "Bash(*)" } }]).some(
      (f) => f.code === "broad-permissions",
    ),
  ).toBe(true);
});

it("shares a loadout and a project drop-in, and refuses an empty selection", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-share-"));
  const context = { root, home: join(root, "home") };
  await execute(["init"], context);
  const project = ResourceSchema.parse({
    ...resource,
    id: "skill:project-only",
    name: "project-only",
    content: "---\nname: project-only\n---\nbody\n",
  });
  const global = ResourceSchema.parse({
    ...project,
    id: "skill:global-only",
    name: "global-only",
    scope: "global",
  });
  for (const r of [project, global])
    await execute(["create-json", JSON.stringify(r)], context);

  const drop = (await execute(
    ["share", "--scope", "project", "--dry-run"],
    context,
  )) as { resources: { id: string }[] };
  expect(drop.resources.map((r) => r.id)).toEqual(["skill:project-only"]);

  const loadout = (await execute(
    ["share", "--loadout", "base", "--dry-run"],
    context,
  )) as { resources: { id: string }[] };
  expect(loadout.resources.length).toBeGreaterThan(0);

  await expect(
    execute(["share", "--loadout", "junior", "--dry-run"], context),
  ).rejects.toThrow(/not shareable until it resolves/);
  await expect(
    execute(["share", "--id", "skill:project-only", "--scope", "global"], context),
  ).rejects.toThrow(/Nothing to share/);
});
