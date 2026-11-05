import { PreflightService } from "./service.js";
import { createAdapters, type Context } from "./adapters.js";
import type { HarnessId, Resource, ResourceType } from "./schema.js";

/** Counted resource kinds, in column order. */
export const STATUS_KINDS = [
  ["skills", "skill"],
  ["mcp", "mcp"],
  ["subagents", "subagent"],
  ["plugins", "plugin"],
  ["hooks", "hook"],
  ["instructions", "instructions"],
] as const satisfies readonly (readonly [string, ResourceType])[];
export type StatusCounts = Record<(typeof STATUS_KINDS)[number][0], number>;
export interface Severities {
  error: number;
  warning: number;
  info: number;
}
export interface HarnessStatus {
  harness: HarnessId;
  name: string;
  installed: boolean;
  config: { global: string; project: string };
  profile: string | null;
  global: StatusCounts;
  project: StatusCounts;
  doctor: Severities;
  error?: string;
}
export interface StatusReport {
  profile: string | null;
  harnesses: HarnessStatus[];
  /** Every doctor finding, also those that belong to no single harness. */
  doctor: Severities;
}
const NAMES: Record<HarnessId, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};
const zero = (): StatusCounts => ({
  skills: 0,
  mcp: 0,
  subagents: 0,
  plugins: 0,
  hooks: 0,
  instructions: 0,
});
const noFindings = (): Severities => ({ error: 0, warning: 0, info: 0 });

/**
 * One row per harness. It reads configuration files only: no transcripts,
 * no MCP server starts, no hook runs.
 */
export async function buildStatus(context: Context): Promise<StatusReport> {
  const service = new PreflightService(context);
  const paths = new Map(
    createAdapters(context).map((a) => [a.id, a.paths()] as const),
  );
  const [states, report, config] = await Promise.all([
    service.detect(),
    service.doctorReport({ readTranscripts: false }),
    service.store.read().catch(() => null),
  ]);
  const owners = new Map<string, Set<HarnessId>>();
  const rows = states.map((state): HarnessStatus => {
    const row: HarnessStatus = {
      harness: state.id,
      name: NAMES[state.id],
      installed: state.detected,
      config: paths.get(state.id)!,
      profile: config?.activeProfile ?? null,
      global: zero(),
      project: zero(),
      doctor: noFindings(),
      ...(state.error ? { error: state.error } : {}),
    };
    for (const r of state.resources as Resource[]) {
      const kind = STATUS_KINDS.find(([, type]) => type === r.type);
      if (kind) row[r.scope][kind[0]]++;
      owners.set(r.id, (owners.get(r.id) ?? new Set()).add(state.id));
    }
    return row;
  });
  const total = noFindings();
  for (const f of report.findings) {
    total[f.severity]++;
    for (const id of owners.get(f.resourceId ?? "") ?? [])
      rows.find((r) => r.harness === id)!.doctor[f.severity]++;
  }
  return {
    profile: config?.activeProfile ?? null,
    harnesses: rows,
    doctor: total,
  };
}
