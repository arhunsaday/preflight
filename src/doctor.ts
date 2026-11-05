import { join } from "node:path";
import type { Context } from "./adapters.js";
import {
  agentModels,
  findingCatalog,
  findingTitle,
  skillClusters,
  skillCount,
  unusedContext,
  type Finding,
  type Severity,
} from "./analysis.js";
import {
  globalFindings,
  measureHooks,
  readGlobalSetup,
  type GlobalSetup,
} from "./doctor-global.js";
import { lintFiles, readAllInstructions } from "./instructions.js";
import {
  mcpProcesses,
  mcpScopeFindings,
  parsePs,
  processFindings,
  readProcessTable,
} from "./mcp-footprint.js";
import {
  DoctorSettingsSchema,
  doctorDefaults,
  type DoctorThresholds,
  type Resource,
} from "./schema.js";
import { readText } from "./transaction.js";
import {
  cacheFindings,
  collectUsageEvidence,
  type UsageEvidence,
} from "./usage-evidence.js";

export interface DoctorOptions {
  /** Window for unused-context and usage-based checks; overrides the config. */
  days?: number;
  /** Transcript folder; default HOME/.claude/projects. */
  transcripts?: string;
  /** False when the person turned transcript reading off: usage checks are skipped. */
  readTranscripts?: boolean;
  /** Count running MCP server processes with `ps`. */
  processes?: boolean;
  /** Run SessionStart hooks once to measure their output. */
  measure?: boolean;
  /** With `measure`: list what would run instead of running it. */
  dryRun?: boolean;
  now?: Date;
  /** Test seam: the `ps` output, or null when unavailable. */
  processTable?: () => Promise<string | null>;
}
export interface DoctorExtras {
  findings: Finding[];
  skipped: { check: string; reason: string }[];
  facts: {
    thresholds: DoctorThresholds;
    globalSkills: number;
    usage: { days: number; sessions: number } | null;
    hooks: number;
    measured: boolean;
  };
}

/** Defaults, then the global configuration, then the project configuration. */
export async function loadThresholds(context: Context) {
  const problems: Finding[] = [];
  let thresholds: DoctorThresholds = structuredClone(doctorDefaults);
  const files = [
    join(context.home, ".preflight", "global", "preflight.config.json"),
    ...(context.globalOnly ? [] : [join(context.root, "preflight.config.json")]),
  ];
  for (const path of [...new Set(files)]) {
    const text = await readText(path).catch(() => null);
    if (text === null) continue;
    try {
      const doctor = DoctorSettingsSchema.parse(
        (JSON.parse(text) as { doctor?: unknown }).doctor ?? {},
      );
      thresholds = { ...thresholds, ...doctor } as DoctorThresholds;
    } catch (error) {
      problems.push({
        code: "doctor-config-invalid",
        severity: "error",
        message: `${path}: the "doctor" thresholds are invalid: ${(error as Error).message.split("\n")[0]}`,
        path,
      });
    }
  }
  return { thresholds, problems };
}

const skip = (check: string, reason: string) => ({ check, reason });

/**
 * The checks that read the whole setup: usage, instructions, global hooks,
 * skill overlap, subagent models. `resources` are the detected resources.
 */
export async function extendedChecks(
  context: Context,
  resources: Resource[],
  options: DoctorOptions = {},
): Promise<DoctorExtras> {
  const { thresholds, problems } = await loadThresholds(context);
  const days = options.days ?? thresholds.unusedDays;
  const findings: Finding[] = [...problems];
  const skipped: DoctorExtras["skipped"] = [];
  const directory =
    options.transcripts ?? join(context.home, ".claude", "projects");
  let evidence: UsageEvidence | null = null;
  if (options.readTranscripts === false)
    skipped.push(
      skip(
        "unused-context, mcp-global-single-project, cache hygiene",
        "reading conversation transcripts is turned off",
      ),
    );
  else
    try {
      evidence = await collectUsageEvidence(directory, {
        days,
        gapMinutes: thresholds.cacheGapMinutes,
        ...(options.now ? { now: options.now } : {}),
      });
    } catch (error) {
      skipped.push(skip("usage", `transcripts unreadable: ${String(error)}`));
    }
  let setup: GlobalSetup | null = null;
  try {
    setup = await readGlobalSetup(context);
  } catch (error) {
    skipped.push(skip("global setup", String(error)));
  }
  const pluginTokens = Object.fromEntries(
    (setup?.plugins ?? [])
      .filter((p) => p.installPath)
      .map((p) => [p.id, p.listingTokens]),
  );
  if (evidence?.sessions) {
    findings.push(
      ...unusedContext(resources, evidence, days, pluginTokens),
      ...mcpScopeFindings(resources, evidence),
      ...cacheFindings(evidence, thresholds.cacheGapMinutes),
    );
  } else if (evidence)
    skipped.push(
      skip(
        "unused-context, mcp-global-single-project, cache hygiene",
        `no sessions in ${directory} in the last ${days} days`,
      ),
    );
  findings.push(
    ...skillClusters(
      resources,
      thresholds.skillSimilarity,
      evidence?.invocations,
    ),
    ...skillCount(resources, thresholds.skillTarget),
    ...agentModels(resources),
  );
  const files = await readAllInstructions(context);
  findings.push(...lintFiles(files, resources, thresholds));
  let measured = false;
  if (setup) {
    if (options.measure && options.dryRun) {
      const count = new Set(
        setup.hooks
          .filter((h) => h.event === "SessionStart")
          .map((h) => h.command),
      ).size;
      findings.push(...globalFindings(setup, thresholds));
      skipped.push(
        skip(
          "measure",
          `preview: ${count} SessionStart hook${count === 1 ? "" : "s"} would run once each in a temporary folder (time limit ${thresholds.hookTimeoutMs} ms)`,
        ),
      );
    } else if (options.measure) {
      measured = true;
      findings.push(
        ...globalFindings(
          setup,
          thresholds,
          await measureHooks(setup.hooks, thresholds.hookTimeoutMs),
        ),
      );
    } else findings.push(...globalFindings(setup, thresholds));
  }
  if (options.processes) {
    const table = await (options.processTable ?? readProcessTable)();
    if (table === null)
      skipped.push(
        skip("mcp-processes", `ps is not available on ${process.platform}`),
      );
    else
      findings.push(
        ...processFindings(
          mcpProcesses(parsePs(table), resources),
          thresholds.mcpProcessMemoryMb,
        ),
      );
  }
  for (const finding of findings)
    if (!finding.explanation && findingCatalog[finding.code])
      finding.explanation = findingCatalog[finding.code]!.explanation;
  return {
    findings,
    skipped,
    facts: {
      thresholds,
      globalSkills: resources.filter(
        (r) =>
          r.type === "skill" &&
          r.enabled &&
          r.scope === "global" &&
          r.config["disable-model-invocation"] !== true &&
          r.config["disable-model-invocation"] !== "true",
      ).length,
      usage: evidence ? { days, sessions: evidence.sessions } : null,
      hooks: setup?.hooks.length ?? 0,
      measured,
    },
  };
}

const order: Severity[] = ["error", "warning", "info"];
export const severityLabel: Record<Severity, { icon: string; word: string }> = {
  error: { icon: "✖", word: "Error" },
  warning: { icon: "▲", word: "Warning" },
  info: { icon: "●", word: "Note" },
};
export function sortFindings(findings: Finding[]) {
  return [...findings].sort(
    (a, b) =>
      order.indexOf(a.severity) - order.indexOf(b.severity) ||
      (b.tokens ?? -1) - (a.tokens ?? -1),
  );
}
/** Human-readable doctor output: grouped by severity, no score. */
export function formatDoctor(
  findings: Finding[],
  skipped: DoctorExtras["skipped"] = [],
) {
  const lines: string[] = [];
  const counts = order.map(
    (s) => `${findings.filter((f) => f.severity === s).length} ${severityLabel[s].word.toLowerCase()}${findings.filter((f) => f.severity === s).length === 1 ? "" : "s"}`,
  );
  lines.push(`preflight doctor · ${counts.join(" · ")}`);
  for (const severity of order) {
    const group = sortFindings(findings).filter((f) => f.severity === severity);
    if (!group.length) continue;
    const { icon, word } = severityLabel[severity];
    lines.push("", `${icon} ${word} (${group.length})`);
    for (const f of group) {
      const cost = f.tokens !== undefined ? ` · ~${f.tokens} tokens/session` : "";
      lines.push(`  ${icon} ${word.toLowerCase()}  ${findingTitle(f.code)} [${f.code}]${cost}`);
      lines.push(`      ${f.message}`);
      if (f.fix) lines.push(`      Fix: ${f.fix}`);
    }
  }
  if (skipped.length) {
    lines.push("", "○ Skipped");
    for (const s of skipped) lines.push(`  ○ skipped  ${s.check}: ${s.reason}`);
  }
  return lines.join("\n") + "\n";
}
