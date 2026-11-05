import { secretPaths, type Resource } from "./schema.js";
import { buildContextReport } from "./context-map.js";
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
      // Same estimate as the context map, so the two views never disagree.
      const [entry] = buildContextReport([r]).entries;
      const tokens = entry
        ? entry.catalogueTokens + (entry.bodyTokens ?? 0)
        : 0;
      add(
        "context-estimate",
        "info",
        `Approximately ${tokens} tokens if loaded (character estimate, not tokenizer output).`,
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
// Observed usage now comes from the token-aware transcript reader in usage.ts.
export { measureUsage, type Usage } from "./usage.js";

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
