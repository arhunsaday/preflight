import { join } from "node:path";
import type { Context } from "../adapters.js";
import { measureUsage, type Finding, type Usage } from "../analysis.js";
import { buildContextReport } from "../context-map.js";
import type {
  HarnessId,
  PreflightConfig,
  Resource,
  ResourceType,
} from "../schema.js";
import type { PreflightService } from "../service.js";

export type SectionId =
  | "overview"
  | "skills"
  | "mcp"
  | "subagents"
  | "hooks"
  | "plugins"
  | "instructions"
  | "profiles"
  | "doctor"
  | "usage";

export const sections: { id: SectionId; label: string; type?: ResourceType }[] =
  [
    { id: "overview", label: "Overview" },
    { id: "skills", label: "Skills", type: "skill" },
    { id: "mcp", label: "MCP", type: "mcp" },
    { id: "subagents", label: "Subagents", type: "subagent" },
    { id: "hooks", label: "Hooks", type: "hook" },
    { id: "plugins", label: "Plugins", type: "plugin" },
    { id: "instructions", label: "Instructions", type: "instructions" },
    { id: "profiles", label: "Profiles" },
    { id: "doctor", label: "Doctor" },
    { id: "usage", label: "Usage" },
  ];

export type TabId = "all" | HarnessId;

export const harnessLabel: Record<HarnessId, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};

export interface Snapshot {
  config: PreflightConfig | null;
  /** Harnesses found on this machine, with what each one holds. */
  harnesses: { id: HarnessId; resources: Resource[] }[];
  findings: Finding[];
  usage: Usage | null;
  /** Findings of the doctor that had no resource, such as a broken file. */
  error?: string;
}

export async function loadSnapshot(
  service: PreflightService,
  context: Context,
): Promise<Snapshot> {
  const config = await service.store.read().catch(() => null);
  const states = await service.detect();
  const found = states.filter((state) => state.detected);
  const findings = await service.doctor();
  const usage = await measureUsage(
    join(context.home, ".claude", "projects"),
    found.flatMap((state) => state.resources),
  ).catch(() => null);
  return {
    config,
    harnesses: found.map((state) => ({
      id: state.id,
      resources: state.resources,
    })),
    findings,
    usage,
  };
}

/** Tabs: All, then one per detected harness. */
export const tabs = (snapshot: Snapshot): TabId[] => [
  "all",
  ...snapshot.harnesses.map((harness) => harness.id),
];

export function resourcesOf(snapshot: Snapshot, tab: TabId): Resource[] {
  const all = snapshot.harnesses
    .filter((harness) => tab === "all" || harness.id === tab)
    .flatMap((harness) => harness.resources);
  return [...new Map(all.map((r) => [`${r.id}`, r])).values()];
}

export function findingsOf(snapshot: Snapshot, tab: TabId): Finding[] {
  const ids = new Set(resourcesOf(snapshot, tab).map((r) => r.id));
  return snapshot.findings.filter(
    (finding) =>
      tab === "all" ||
      (finding.resourceId ? ids.has(finding.resourceId) : false) ||
      finding.message.startsWith(`${tab}:`),
  );
}

export function itemsOf(
  snapshot: Snapshot,
  tab: TabId,
  section: SectionId,
): Resource[] {
  const type = sections.find((entry) => entry.id === section)?.type;
  return type ? resourcesOf(snapshot, tab).filter((r) => r.type === type) : [];
}

export interface Overview {
  counts: { section: SectionId; label: string; count: number }[];
  profile: string | null;
  errors: number;
  warnings: number;
  infos: number;
  contextTokens: number;
}

export function overviewOf(snapshot: Snapshot, tab: TabId): Overview {
  const resources = resourcesOf(snapshot, tab);
  const findings = findingsOf(snapshot, tab);
  const level = (severity: Finding["severity"]) =>
    findings.filter((finding) => finding.severity === severity).length;
  return {
    counts: sections
      .filter((entry) => entry.type)
      .map((entry) => ({
        section: entry.id,
        label: entry.label,
        count: resources.filter((r) => r.type === entry.type).length,
      })),
    profile: snapshot.config?.activeProfile ?? null,
    errors: level("error"),
    warnings: level("warning"),
    infos: level("info"),
    contextTokens: buildContextReport(resources).estimatedTokens,
  };
}

/** Case-insensitive match over the words a person sees in a row. */
export const matches = (text: string, filter: string) =>
  text.toLowerCase().includes(filter.trim().toLowerCase());
