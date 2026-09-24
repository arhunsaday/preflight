import { readdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { secretPaths, type Resource } from "./schema.js";
export interface Finding {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  resourceId?: string;
}
export function analyze(resources: Resource[]): Finding[] {
  const findings: Finding[] = [];
  const descriptions = new Map<string, string>();
  for (const r of resources) {
    const add = (
      code: string,
      severity: Finding["severity"],
      message: string,
    ) => findings.push({ code, severity, message, resourceId: r.id });
    if (secretPaths(r.config).length)
      add(
        "secret",
        "error",
        "Possible literal credential; use environment references.",
      );
    const serialized = JSON.stringify(r.config);
    if (
      /Bash\(\*\)|"\*"|bypassPermissions|dangerouslySkipPermissions/.test(
        serialized,
      )
    )
      add(
        "broad-permissions",
        "warning",
        "Broad execution permissions; denied file reads may still be reachable through shell.",
      );
    if (r.type === "skill") {
      const trigger = r.description.toLowerCase().trim();
      if (trigger && descriptions.has(trigger))
        add(
          "trigger-conflict",
          "warning",
          `Same description as ${descriptions.get(trigger)}`,
        );
      if (trigger) descriptions.set(trigger, r.id);
      add(
        "context-estimate",
        "info",
        `Approximately ${Math.ceil((r.content ?? r.description).length / 4)} tokens if loaded (character estimate, not tokenizer output).`,
      );
    }
    if (r.type === "plugin" && r.enabled)
      add(
        "plugin-unverified",
        "info",
        "Plugin is enabled in settings; use the native plugin installer to install its package.",
      );
    if (r.type === "mcp") {
      if (!r.config.command && !r.config.url)
        add("mcp-unwired", "error", "MCP server has neither command nor URL.");
      else
        add(
          "mcp-unverified",
          "info",
          "Configured; connection not tested. Running a server requires explicit verification.",
        );
    }
    if (r.type === "hook" && !r.config.entry && !r.config.hooks)
      add("hook-unwired", "error", "Hook has no executable entries.");
  }
  if (!resources.some((r) => r.type === "hook" && r.enabled))
    findings.push({
      code: "no-hooks",
      severity: "warning",
      message:
        "No hooks detected. Review whether blocking safeguards are needed.",
    });
  return findings;
}
export interface Usage {
  sessions: number;
  invocations: Record<string, number>;
  invalidLines: number;
  skillsUsed: number;
  skillsInstalled: number;
  utilization: number;
  prune: string[];
}
export async function measureUsage(
  directory: string,
  resources: Resource[],
): Promise<Usage> {
  const invocations: Record<string, number> = {};
  let sessions = 0,
    invalidLines = 0;
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        sessions++;
        const lines = createInterface({
          input: createReadStream(path),
          crlfDelay: Infinity,
        });
        for await (const line of lines) {
          if (!line.trim()) continue;
          try {
            visit(JSON.parse(line));
          } catch {
            invalidLines++;
          }
        }
      }
    }
  }
  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    if (obj.type === "tool_use" && typeof obj.name === "string") {
      const input = obj.input as Record<string, unknown> | undefined;
      const key =
        obj.name === "Skill" && typeof input?.skill === "string"
          ? `skill:${input.skill}`
          : obj.name;
      invocations[key] = (invocations[key] ?? 0) + 1;
    }
    Object.values(obj).forEach(visit);
  }
  await walk(directory);
  const skills = resources.filter((r) => r.type === "skill");
  const unused = skills.filter(
    (r) => !invocations[`skill:${r.name}`] && !invocations[r.id],
  );
  return {
    sessions,
    invocations,
    invalidLines,
    skillsUsed: skills.length - unused.length,
    skillsInstalled: skills.length,
    utilization: skills.length
      ? (skills.length - unused.length) / skills.length
      : 0,
    prune: sessions ? unused.map((r) => r.id) : [],
  };
}

export function analyzeSettings(input: unknown, path: string): Finding[] {
  const findings: Finding[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Expected settings object");
  const settings = input as Record<string, unknown>;
  const permissions = (settings.permissions ?? {}) as Record<string, unknown>;
  const allow = Array.isArray(permissions.allow)
    ? permissions.allow.filter(
        (rule): rule is string => typeof rule === "string",
      )
    : [];
  const deny = Array.isArray(permissions.deny)
    ? permissions.deny.filter(
        (rule): rule is string => typeof rule === "string",
      )
    : [];
  if (
    deny.some((rule) => /^Read(?:\(|$)/.test(rule)) &&
    allow.some((rule) => /^Bash(?:\(|$)/.test(rule))
  )
    findings.push({
      code: "shell-read-bypass",
      severity: "warning",
      message: `${path}: Read denials do not necessarily prevent permitted shell commands from reading the same files.`,
    });
  if (
    allow.some((rule) => ["*", "Bash", "Bash(*)"].includes(rule)) ||
    permissions.defaultMode === "bypassPermissions"
  )
    findings.push({
      code: "settings-broad-permissions",
      severity: "warning",
      message: `${path}: broad execution permissions are configured.`,
    });
  for (const location of secretPaths(settings))
    findings.push({
      code: "settings-secret",
      severity: "error",
      message: `${path}: possible credential at ${location}; use an environment reference.`,
    });
  return findings;
}
