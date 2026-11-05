import { execFile } from "node:child_process";
import { basename } from "node:path";
import { findingCatalog, mcpToolPrefix, type Finding } from "./analysis.js";
import type { Resource } from "./schema.js";
import type { UsageEvidence } from "./usage-evidence.js";

/**
 * Global Claude Code MCP servers whose tools were called from exactly one
 * project in the window: they belong in that project's `.mcp.json`.
 */
export function mcpScopeFindings(
  resources: Resource[],
  evidence: Pick<UsageEvidence, "byProject" | "days" | "sessions">,
): Finding[] {
  if (!evidence.sessions) return [];
  const findings: Finding[] = [];
  for (const r of resources) {
    if (
      r.type !== "mcp" ||
      !r.enabled ||
      r.scope !== "global" ||
      !r.harnesses.includes("claude-code")
    )
      continue;
    const prefix = mcpToolPrefix(r.name);
    const projects = Object.entries(evidence.byProject)
      .map(([project, keys]) => ({
        project,
        calls: Object.entries(keys)
          .filter(([k]) => k.startsWith(prefix))
          .reduce((t, [, n]) => t + n, 0),
      }))
      .filter((p) => p.calls > 0);
    if (projects.length !== 1) continue;
    const [only] = projects as [{ project: string; calls: number }];
    findings.push({
      code: "mcp-global-single-project",
      severity: "warning",
      message: `MCP server ${r.name} is global but was only called from ${only.project} in the last ${evidence.days} days (${only.calls} calls).`,
      resourceId: r.id,
      explanation: findingCatalog["mcp-global-single-project"]!.explanation,
      fix: `In ${only.project}: claude mcp add-json ${r.name} '<its JSON from ~/.claude.json>' -s project, then claude mcp remove ${r.name} -s user.`,
    });
  }
  return findings;
}

export interface ProcessRow {
  pid: number;
  ppid: number;
  rssKb: number;
  args: string;
}
/** Parse `ps -eo pid=,ppid=,rss=,args=` output. */
export function parsePs(text: string): ProcessRow[] {
  return text
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      rssKb: Number(m[3]),
      args: m[4]!.trim(),
    }));
}
const claudeProcess = (args: string) =>
  /(?:^|\/)claude(?:\s|$)/.test(args) ||
  /@anthropic-ai\/claude-code|claude-code\/cli\.js/.test(args);

export interface McpProcessReport {
  sessions: number;
  processes: { pid: number; rssKb: number; server: string | null; args: string }[];
  rssKb: number;
}
/**
 * Descendants of Claude Code processes that look like MCP servers: they
 * match a configured server command, or mention "mcp".
 */
export function mcpProcesses(
  rows: ProcessRow[],
  servers: Resource[],
): McpProcessReport {
  const roots = rows.filter((r) => claudeProcess(r.args));
  const children = new Map<number, ProcessRow[]>();
  for (const row of rows)
    children.set(row.ppid, [...(children.get(row.ppid) ?? []), row]);
  const signatures = servers
    .filter((s) => s.type === "mcp" && typeof s.config.command === "string")
    .map((s) => {
      const args = Array.isArray(s.config.args)
        ? s.config.args.filter((a): a is string => typeof a === "string")
        : [];
      const command = basename(s.config.command as string);
      const pkg = args.find((a) => !a.startsWith("-")) ?? "";
      return { name: s.name, command, pkg };
    });
  const found = new Map<number, McpProcessReport["processes"][number]>();
  const rootIds = new Set(roots.map((r) => r.pid));
  const queue = roots.flatMap((r) => children.get(r.pid) ?? []);
  while (queue.length) {
    const row = queue.shift()!;
    if (rootIds.has(row.pid) || found.has(row.pid)) continue;
    queue.push(...(children.get(row.pid) ?? []));
    if (claudeProcess(row.args)) continue;
    const match = signatures.find(
      (s) =>
        row.args.includes(s.command) && (!s.pkg || row.args.includes(s.pkg)),
    );
    if (match || /mcp/i.test(row.args))
      found.set(row.pid, {
        pid: row.pid,
        rssKb: row.rssKb,
        server: match?.name ?? null,
        args: row.args.slice(0, 200),
      });
  }
  const processes = [...found.values()];
  return {
    sessions: roots.length,
    processes,
    rssKb: processes.reduce((t, p) => t + p.rssKb, 0),
  };
}

/** `ps` output on macOS and Linux; null elsewhere or when ps fails. */
export function readProcessTable(
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  if (platform !== "darwin" && platform !== "linux")
    return Promise.resolve(null);
  return new Promise((done) =>
    execFile(
      "ps",
      ["-eo", "pid=,ppid=,rss=,args="],
      { timeout: 5000, maxBuffer: 16 << 20 },
      (error, stdout) => done(error ? null : stdout),
    ),
  );
}

export function processFindings(
  report: McpProcessReport,
  memoryMb: number,
): Finding[] {
  const mb = Math.round(report.rssKb / 1024);
  const names = [
    ...new Set(report.processes.map((p) => p.server ?? "unnamed")),
  ];
  return [
    {
      code: "mcp-processes",
      severity: mb > memoryMb ? "warning" : "info",
      message: `${report.processes.length} MCP server processes under ${report.sessions} Claude Code sessions use ${mb} MB resident memory${names.length ? ` (${names.join(", ")})` : ""}.`,
      explanation: findingCatalog["mcp-processes"]!.explanation,
      ...(mb > memoryMb
        ? {
            fix: "Close idle Claude Code sessions, and move servers that one project uses into its .mcp.json.",
          }
        : {}),
    },
  ];
}
