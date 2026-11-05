import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PreflightService } from "../src/service.js";
import { ResourceSchema } from "../src/schema.js";
import { managedBlocks } from "../src/agents-md.js";

async function setup() {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "preflight-instr-"),
  );
  const home = join(root, "home");
  await mkdir(join(home, ".claude"), { recursive: true });
  const service = new PreflightService({ root, home });
  await service.init();
  return service;
}
const instruction = (patch: Record<string, unknown> = {}) =>
  ResourceSchema.parse({
    id: "instructions:global-claude",
    type: "instructions",
    name: "global-claude",
    source: "github:arhunsaday/agent-kit@main#claude/CLAUDE.md",
    scope: "global",
    harnesses: ["claude-code", "codex"],
    content: "# How we work\n\nAsk before deleting.\n",
    ...patch,
  });

it("writes a marked block and keeps the text a person wrote around it", async () => {
  const s = await setup();
  const path = join(s.context.home, ".claude", "CLAUDE.md");
  await writeFile(path, "# Mine\n\nUse pnpm.\n");
  await s.create(instruction());
  let text = await readFile(path, "utf8");
  expect(
    text.startsWith(
      "# Mine\n\nUse pnpm.\n\n<!-- preflight:begin instructions:global-claude -->",
    ),
  ).toBe(true);
  expect(managedBlocks(text)[0]?.content).toBe(
    "# How we work\n\nAsk before deleting.",
  );
  const agents = await readFile(
    join(s.context.home, ".codex", "AGENTS.md"),
    "utf8",
  );
  expect(agents).toContain("Ask before deleting.");

  // Editing your own text around the block is not drift.
  await writeFile(path, text.replace("Use pnpm.", "Use pnpm, always."));
  await s.update(instruction().id, {
    content: "# How we work\n\nAsk before deleting anything.\n",
  });
  text = await readFile(path, "utf8");
  expect(text).toContain("Use pnpm, always.");
  expect(text).toContain("Ask before deleting anything.");
  expect(text.match(/preflight:begin/g)).toHaveLength(1);

  // A managed block is not reported as unmanaged.
  expect(
    (await s.unmanaged()).filter((u) => u.resource.type === "instructions"),
  ).toEqual([]);

  await s.remove(instruction().id);
  expect(await readFile(path, "utf8")).toBe("# Mine\n\nUse pnpm, always.\n");
});

it("writes project instructions to CLAUDE.md and Cursor rules files", async () => {
  const s = await setup();
  await s.create(
    instruction({
      id: "instructions:project",
      scope: "project",
      harnesses: ["claude-code", "cursor"],
    }),
  );
  const rules = join(s.context.root, ".cursor", "rules");
  const files = await (await import("node:fs/promises")).readdir(rules);
  expect(files).toHaveLength(1);
  const rule = await readFile(join(rules, files[0]!), "utf8");
  expect(rule).toContain("alwaysApply: true");
  expect(await readFile(join(s.context.root, "CLAUDE.md"), "utf8")).toContain(
    "<!-- preflight:end instructions:project -->",
  );
  await expect(
    s.create(
      instruction({ id: "instructions:cursor-global", harnesses: ["cursor"] }),
    ),
  ).rejects.toThrow(/Cursor keeps user rules/);
});
