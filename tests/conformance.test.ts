import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createAdapters } from "../src/adapters.js";
import { applyFiles, rollback } from "../src/transaction.js";
import {
  HarnessIdSchema,
  ResourceSchema,
  type HarnessId,
  type Resource,
  type ResourceType,
} from "../src/schema.js";

/**
 * The conformance suite the plan asks for: every capability an adapter
 * declares must survive write, read back and rollback. A harness that grows a
 * capability without honouring the round trip fails here.
 */
function sample(type: ResourceType, harness: HarnessId): Resource {
  const base = {
    id: `${type}:conformance`,
    type,
    name: "conformance",
    description: "conformance probe",
    source: "local:owned",
    scope: "project" as const,
    harnesses: [harness],
  };
  switch (type) {
    case "skill":
      return ResourceSchema.parse({
        ...base,
        content: "---\nname: conformance\ndescription: probe\n---\n\nBody.\n",
      });
    case "subagent":
    case "command":
      return ResourceSchema.parse({
        ...base,
        content: "---\nname: conformance\n---\n\nDo the thing.\n",
      });
    case "mcp":
      return ResourceSchema.parse({
        ...base,
        config: { url: "https://example.com/mcp" },
      });
    case "hook":
      return ResourceSchema.parse({
        ...base,
        config: {
          event: "PreToolUse",
          matcher: "Bash",
          hooks: [{ type: "command", command: "true" }],
        },
      });
    case "statusline":
      return ResourceSchema.parse({
        ...base,
        scope: "global",
        config: { type: "command", command: "true", padding: 0 },
      });
    case "plugin":
      return ResourceSchema.parse({ ...base, name: "probe@marketplace" });
    default:
      return ResourceSchema.parse(base);
  }
}

async function workspace() {
  const root = await mkdtemp(join(await realpath(tmpdir()), "preflight-conformance-"));
  const home = join(root, "home");
  await mkdir(home);
  return { root, home };
}

for (const harness of HarnessIdSchema.options) {
  it(`${harness} declares capabilities it can actually round-trip`, async () => {
    const context = await workspace();
    const adapter = createAdapters(context).find((a) => a.id === harness)!;
    expect(adapter.capabilities.length).toBeGreaterThan(0);

    for (const type of adapter.capabilities) {
      const resource = sample(type, harness);
      const created = await adapter.plan([resource], []);
      expect(created.length).toBeGreaterThan(0);
      await applyFiles(context.root, created, { actor: "conformance" });

      // Settings-backed types carry no name of their own once written, so
      // conformance is counted by type rather than matched by name.
      const count = async () =>
        (await adapter.read()).resources.filter((r) => r.type === type).length;
      expect(
        await count(),
        `${harness} cannot read back the ${type} it wrote`,
      ).toBe(1);

      await applyFiles(context.root, await adapter.plan([], [resource]), {
        actor: "conformance",
      });
      expect(
        await count(),
        `${harness} leaves the ${type} behind after removal`,
      ).toBe(0);

      await rollback(context.root);
      expect(
        await count(),
        `${harness} cannot restore the ${type} on rollback`,
      ).toBe(1);

      // Leave the workspace clean for the next capability.
      await applyFiles(context.root, await adapter.plan([], [resource]), {
        actor: "conformance",
      });
    }
  });

  it(`${harness} refuses the types it does not claim`, async () => {
    const context = await workspace();
    const adapter = createAdapters(context).find((a) => a.id === harness)!;
    const unclaimed = (
      ["skill", "mcp", "subagent", "hook", "prompt", "tool", "plugin", "statusline", "command"] as ResourceType[]
    ).filter((type) => !adapter.capabilities.includes(type));
    expect(unclaimed.length).toBeGreaterThan(0);
    for (const type of unclaimed)
      expect(() => adapter.target(sample(type, harness))).toThrow();
  });
}
