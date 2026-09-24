import { z } from "zod";

export interface FilePreview {
  path: string;
  status: "created" | "modified" | "deleted";
  added: number;
  removed: number;
}

export interface ChangePreview {
  kind: string;
  id: string;
  name: string;
  type: string;
}

export interface PreviewSummary {
  files: FilePreview[];
  changes: ChangePreview[];
  warnings: string[];
  dryRun: boolean;
}

const ResultShape = z.object({
  files: z
    .array(
      z.object({
        path: z.string(),
        before: z.string().nullable(),
        after: z.string().nullable(),
      }),
    )
    .optional(),
  dryRun: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
  diff: z
    .array(
      z.object({
        kind: z.string(),
        resource: z.object({
          id: z.string(),
          name: z.string(),
          type: z.string(),
        }),
      }),
    )
    .optional(),
});

const lines = (text: string | null) => (text === null ? [] : text.split("\n"));

// Multiset line difference: a line present on both sides counts as unchanged
// even when it moved. Enough for a change summary, not a positional diff.
export function lineDelta(before: string | null, after: string | null) {
  const count = (values: string[]) => {
    const totals = new Map<string, number>();
    for (const line of values) totals.set(line, (totals.get(line) ?? 0) + 1);
    return totals;
  };
  const left = count(lines(before));
  const right = count(lines(after));
  let added = 0,
    removed = 0;
  for (const [line, total] of right)
    added += Math.max(0, total - (left.get(line) ?? 0));
  for (const [line, total] of left)
    removed += Math.max(0, total - (right.get(line) ?? 0));
  return { added, removed };
}

export function summarize(result: unknown): PreviewSummary | null {
  const parsed = ResultShape.safeParse(result);
  if (!parsed.success) return null;
  const { files, diff, warnings, dryRun } = parsed.data;
  if (!files && !diff) return null;
  return {
    dryRun: dryRun ?? false,
    warnings: warnings ?? [],
    files: (files ?? []).map((file) => ({
      path: file.path,
      status:
        file.before === null
          ? ("created" as const)
          : file.after === null
            ? ("deleted" as const)
            : ("modified" as const),
      ...lineDelta(file.before, file.after),
    })),
    changes: (diff ?? [])
      .filter((entry) => entry.kind !== "unchanged")
      .map((entry) => ({
        kind: entry.kind,
        id: entry.resource.id,
        name: entry.resource.name,
        type: entry.resource.type,
      })),
  };
}

export function shortPath(path: string, home: string, root: string): string {
  if (root && path.startsWith(root + "/")) return "." + path.slice(root.length);
  if (home && path.startsWith(home + "/")) return "~" + path.slice(home.length);
  return path;
}
