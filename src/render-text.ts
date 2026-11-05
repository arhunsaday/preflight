import { homedir } from "node:os";
import { STATUS_KINDS, type StatusReport } from "./status.js";

type Row = Record<string, unknown>;
const isObject = (v: unknown): v is Row =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const MAX_CELL = 60;

const short = (s: string, max = MAX_CELL) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;
const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string") return short(v.replace(/\s+/g, " "));
  if (Array.isArray(v))
    return short(
      v
        .map((x) => (isObject(x) || Array.isArray(x) ? "{…}" : cell(x)))
        .join(","),
    );
  if (isObject(v)) return short(JSON.stringify(v));
  return String(v);
};
const tilde = (path: string) => {
  const home = homedir();
  return path === home || path.startsWith(`${home}/`)
    ? `~${path.slice(home.length)}`
    : path;
};

/** Aligned columns. Columns listed in `right` align to the right. */
export function table(
  columns: string[],
  rows: unknown[][],
  right: number[] = [],
): string {
  const text = rows.map((r) => r.map(cell));
  const widths = columns.map((c, i) =>
    Math.max(c.length, ...text.map((r) => (r[i] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((c, i) =>
        right.includes(i) ? c.padStart(widths[i]!) : c.padEnd(widths[i]!),
      )
      .join("  ")
      .trimEnd();
  return [line(columns), ...text.map(line)].join("\n");
}

const tableOfObjects = (rows: Row[]): string => {
  const columns = [
    ...new Set(
      rows.flatMap((r) =>
        Object.entries(r)
          .filter(([, v]) => !isObject(v) || Object.keys(v).length <= 4)
          .map(([k]) => k),
      ),
    ),
  ];
  const numeric = columns
    .map((c, i) => (rows.every((r) => typeof r[c] === "number") ? i : -1))
    .filter((i) => i >= 0);
  return table(
    columns,
    rows.map((r) => columns.map((c) => r[c])),
    numeric,
  );
};

/** Readable form of any JSON value: key: value, arrays of objects as tables. */
export function genericText(value: unknown, indent = ""): string {
  if (value === null || value === undefined) return `${indent}-`;
  if (typeof value !== "object") return `${indent}${cell(value)}`;
  if (Array.isArray(value)) {
    if (!value.length) return `${indent}(none)`;
    if (value.every(isObject))
      return tableOfObjects(value as Row[])
        .split("\n")
        .map((l) => indent + l)
        .join("\n");
    return value
      .map((v) =>
        isObject(v) || Array.isArray(v)
          ? `${indent}-\n${genericText(v, `${indent}  `)}`
          : `${indent}- ${cell(v)}`,
      )
      .join("\n");
  }
  const entries = Object.entries(value);
  if (!entries.length) return `${indent}(empty)`;
  const width = Math.max(...entries.map(([k]) => k.length));
  return entries
    .map(([k, v]) => {
      const label = `${indent}${k}:`.padEnd(indent.length + width + 2);
      if (Array.isArray(v))
        return !v.length
          ? `${label}(none)`
          : v.every((x) => typeof x !== "object" || x === null)
            ? `${label}${cell(v)}`
            : `${indent}${k}:\n${genericText(v, `${indent}  `)}`;
      if (isObject(v))
        return Object.keys(v).length
          ? `${indent}${k}:\n${genericText(v, `${indent}  `)}`
          : `${label}(empty)`;
      return `${label}${cell(v)}`;
    })
    .join("\n");
}

const sev = (s: { error: number; warning: number; info: number }) =>
  `${s.error}E ${s.warning}W ${s.info}I`;

export function formatStatus(report: StatusReport): string {
  const columns = [
    "harness",
    "installed",
    "profile",
    ...STATUS_KINDS.map(([label]) => label),
    "doctor",
    "config",
  ];
  const rows = report.harnesses.map((h) => [
    h.name,
    h.installed ? "yes" : "no",
    h.installed ? (h.profile ?? "-") : "-",
    ...STATUS_KINDS.map(([label]) => `${h.global[label]}/${h.project[label]}`),
    h.installed ? sev(h.doctor) : "-",
    `${tilde(h.config.global)} | ${tilde(h.config.project)}`,
  ]);
  const notes = report.harnesses
    .filter((h) => h.error)
    .map((h) => `${h.name}: ${h.error}`);
  return [
    table(columns, rows),
    "",
    "Counts are global/project. Doctor: E errors, W warnings, I info.",
    `All findings: ${sev(report.doctor)}. Details: preflight doctor`,
    ...notes,
  ].join("\n");
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const renderers: Record<string, (v: any) => string | undefined> = {
  status: (v: StatusReport) => formatStatus(v),
  list: (v: Row[]) =>
    v.length
      ? table(
          ["id", "type", "scope", "harnesses", "enabled"],
          v.map((r) => [r.id, r.type, r.scope, r.harnesses, r.enabled]),
        )
      : "No resources. Run preflight detect to see what is installed.",
  detect: (v: Row[]) =>
    v
      .map((s) => {
        const resources = (s.resources as Row[]) ?? [];
        return [
          `${s.id}: ${s.detected ? "installed" : "not installed"}, ${resources.length} resources${s.error ? ` (${s.error})` : ""}`,
          ...(resources.length
            ? [
                table(
                  ["id", "type", "scope", "enabled"],
                  resources.map((r) => [r.id, r.type, r.scope, r.enabled]),
                )
                  .split("\n")
                  .map((l) => `  ${l}`)
                  .join("\n"),
              ]
            : []),
          ...((s.issues as string[]) ?? []).map((i) => `  issue: ${i}`),
        ].join("\n");
      })
      .join("\n\n"),
  search: (v: { resources: Row[]; errors: string[]; hint?: string }) =>
    [
      v.resources.length
        ? table(
            ["id", "type", "name", "source"],
            v.resources.map((r) => [r.id, r.type, r.name, r.source]),
          )
        : "No match.",
      ...(v.errors ?? []).map((e) => `error: ${e}`),
      ...(v.hint ? [v.hint] : []),
    ].join("\n"),
  "source list": (v: { sources: Row[]; errors: string[]; hint?: string }) =>
    [
      v.sources.length
        ? table(
            ["name", "kind", "from", "resources", "loadouts"],
            v.sources.map((s) => [
              s.name,
              s.kind,
              s.repo ? `${s.repo}${s.ref ? `@${s.ref}` : ""}` : s.path,
              s.resources,
              s.loadouts,
            ]),
            [3, 4],
          )
        : "No source.",
      ...(v.errors ?? []).map((e) => `error: ${e}`),
      ...(v.hint ? [v.hint] : []),
    ].join("\n"),
  "profiles list": (v: {
    activeProfile: string;
    profiles: Record<string, { description?: string; resources: unknown[] }>;
  }) =>
    table(
      ["profile", "active", "resources", "description"],
      Object.entries(v.profiles).map(([name, p]) => [
        name,
        name === v.activeProfile ? "*" : "",
        p.resources.length,
        p.description ?? "",
      ]),
      [2],
    ),
  "loadouts list": (v: {
    loadouts: string[];
    presets: Record<string, string[]>;
    details: Record<
      string,
      { source?: string; description?: string; extends?: string }
    >;
    hint?: string;
  }) =>
    [
      v.loadouts.length
        ? table(
            ["loadout", "source", "extends", "description"],
            v.loadouts.map((n) => [
              n,
              v.details[n]?.source,
              v.details[n]?.extends,
              v.details[n]?.description,
            ]),
          )
        : "No loadout.",
      ...(Object.keys(v.presets).length
        ? [
            "",
            table(
              ["preset", "loadouts"],
              Object.entries(v.presets).map(([n, l]) => [n, l]),
            ),
          ]
        : []),
      ...(v.hint ? [v.hint] : []),
    ].join("\n"),
  usage: (v: Row) => {
    const totals = v.totals as Row | undefined;
    if (!totals) return undefined;
    const cost = v.costEstimate as { usd: number; complete: boolean };
    const head = genericText({
      window: v.window,
      sessions: v.sessions,
      cacheHitRate: `${Math.round(Number(v.cacheHitRate) * 100)}%`,
      cost: `$${cost.usd.toFixed(2)}${cost.complete ? "" : " (partial)"}`,
      ...totals,
    });
    const rows = (v.rows ?? v.byAgent) as Row[] | undefined;
    return rows?.length ? `${head}\n\n${tableOfObjects(rows)}` : head;
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Human rendering of a command result. `key` is the command path, such as
 * "status" or "source list". A command without a renderer, or a result with an
 * unexpected shape, falls back to the generic rendering.
 */
export function renderText(key: string[], result: unknown): string {
  if (typeof result === "string") return result;
  for (let n = Math.min(2, key.length); n > 0; n--) {
    const render = renderers[key.slice(0, n).join(" ")];
    if (!render) continue;
    try {
      const text = render(result);
      if (text !== undefined) return `${text}\n`;
    } catch {
      break;
    }
  }
  return `${genericText(result)}\n`;
}
