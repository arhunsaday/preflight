import { z } from "zod";
import type { Resource } from "./schema.js";
const Item = z
  .object({
    id: z.string(),
    why: z.string().min(1),
    scope: z.enum(["global", "project"]).optional(),
    needs: z.array(z.string()).optional(),
    blocking: z.boolean().optional(),
  })
  .passthrough();
const Data = z.object({
  loadouts: z.record(
    z.string(),
    z.object({
      extends: z.string().optional(),
      description: z.string().optional(),
      provides: z.record(z.string(), z.array(Item)).optional(),
    }),
  ),
  presets: z.record(z.string(), z.array(z.string())).optional(),
});
export function resolveLoadout(input: unknown, target: string) {
  const data = Data.parse(input);
  const items = new Map<
    string,
    z.infer<typeof Item> & { kind: string; from: string }
  >();
  function layer(name: string, chain: string[]) {
    if (chain.includes(name))
      throw new Error(`Loadout cycle: ${[...chain, name].join(" -> ")}`);
    const entry = data.loadouts[name];
    if (!entry) throw new Error(`Unknown loadout: ${name}`);
    if (entry.extends) layer(entry.extends, [...chain, name]);
    for (const [kind, values] of Object.entries(entry.provides ?? {}))
      for (const item of values) {
        const key = `${kind}:${item.id}`;
        items.set(key, { ...items.get(key), ...item, kind, from: name });
      }
  }
  for (const name of data.presets?.[target] ?? [target]) layer(name, []);
  return [...items.values()];
}
export function materializeLoadout(
  input: unknown,
  target: string,
  catalog: Resource[],
) {
  const missing: string[] = [];
  const resources: Resource[] = [];
  const types: Record<string, string> = {
    skills: "skill",
    subagents: "subagent",
    hooks: "hook",
    mcp: "mcp",
    instincts: "prompt",
    workflows: "prompt",
    tools: "tool",
  };
  for (const item of resolveLoadout(input, target)) {
    const resource = catalog.find(
      (r) =>
        r.type === types[item.kind] &&
        (r.name === item.id || r.id === `${types[item.kind]}:${item.id}`),
    );
    if (!resource) {
      missing.push(`${item.kind}/${item.id}`);
      continue;
    }
    for (const need of item.needs ?? [])
      if (!process.env[need]) missing.push(`prerequisite:${need}`);
    resources.push({
      ...resource,
      scope: item.scope ?? resource.scope,
      description: `${resource.description}\nLoadout: ${item.why}`,
    });
  }
  return { resources, missing };
}
