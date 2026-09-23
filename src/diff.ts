import type { Resource } from "./schema.js";
export type DiffKind = "add" | "replace" | "unchanged" | "remove";
export interface DiffEntry {
  kind: DiffKind;
  resource: Resource;
  previous?: Resource;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

function comparable(resource: Resource): string {
  return JSON.stringify(canonical(resource));
}

export function diffResources(
  current: Resource[],
  desired: Resource[],
  prune = false,
): DiffEntry[] {
  const byId = new Map(current.map((resource) => [resource.id, resource]));
  const entries: DiffEntry[] = desired.map((resource) => {
    const previous = byId.get(resource.id);
    if (!previous) return { kind: "add", resource };
    return comparable(previous) === comparable(resource)
      ? { kind: "unchanged", resource, previous }
      : { kind: "replace", resource, previous };
  });
  if (prune) {
    const desiredIds = new Set(desired.map(({ id }) => id));
    entries.push(
      ...current
        .filter(({ id }) => !desiredIds.has(id))
        .map((resource) => ({
          kind: "remove" as const,
          resource,
          previous: resource,
        })),
    );
  }
  return entries;
}
