import type { HarnessId, Resource, ResourceType, Scope } from "./schema.js";
export interface ContextEntry {
  id: string;
  name: string;
  type: ResourceType;
  scope: Scope;
  harnesses: HarnessId[];
  enabled: boolean;
  source: string;
  catalogueTokens: number;
  bodyTokens: number | null;
  tokens: number | null;
  reason: string;
}
export interface ContextOptions {
  mode?: "potential" | "catalogue";
  harness?: HarnessId;
  scope?: Scope;
}
/** Local character estimate only. No runtime loading, tokenizer, or MCP execution. */
export function buildContextReport(
  resources: Resource[],
  options: ContextOptions = {},
) {
  const mode = options.mode ?? "potential";
  const entries: ContextEntry[] = [
    ...new Map(resources.map((r) => [r.id, r])).values(),
  ]
    .filter(
      (r) =>
        (!options.harness || r.harnesses.includes(options.harness)) &&
        (!options.scope || r.scope === options.scope),
    )
    .map((r) => {
      const textual = [
        "skill",
        "prompt",
        "subagent",
        "command",
        "instructions",
      ].includes(r.type);
      const catalogueTokens =
        r.type === "skill"
          ? Math.ceil(`${r.name}\n${r.description}`.length / 4)
          : 0;
      const bodyTokens =
        textual && r.content !== undefined
          ? Math.ceil(r.content.length / 4)
          : null;
      const tokens = !r.enabled
        ? 0
        : !textual
          ? null
          : mode === "catalogue" && r.type !== "instructions"
            ? catalogueTokens
            : bodyTokens === null
              ? null
              : catalogueTokens + bodyTokens;
      const reason = !r.enabled
        ? "Disabled; excluded from this scenario."
        : r.type === "mcp"
          ? "Tool schemas and responses are not available in local transport configuration. Not measured; no server was started."
          : !textual
            ? "Runtime contributions are not available locally. Configuration bytes are not model context."
            : mode === "catalogue" && r.type !== "instructions"
              ? "Skill names and descriptions only. Prompt, command and agent bodies are excluded. Actual catalogue exposure depends on the agent."
              : bodyTokens === null
                ? "Instruction body unavailable. Its contribution is unknown, not zero."
                : r.type === "instructions"
                  ? "Instruction file text the agent adds to every session in this scope."
                  : r.type === "skill"
                  ? "Skill catalogue plus full body if invoked. Available content is not proof that it is loaded."
                  : "Full instruction body if loaded. Activation depends on the agent and session.";
      return {
        id: r.id,
        name: r.name,
        type: r.type,
        scope: r.scope,
        harnesses: r.harnesses,
        enabled: r.enabled,
        source: r.source,
        catalogueTokens,
        bodyTokens,
        tokens,
        reason,
      };
    })
    .sort(
      (a, b) => (b.tokens ?? -1) - (a.tokens ?? -1) || a.id.localeCompare(b.id),
    );
  return {
    mode,
    method:
      "ceil(characters / 4); scenario estimate, not tokenizer output or live session usage",
    estimatedTokens: entries.reduce(
      (total, entry) => total + (entry.tokens ?? 0),
      0,
    ),
    unknownCount: entries.filter(
      (e) =>
        e.enabled &&
        (e.tokens === null ||
          ["mcp", "tool", "plugin", "hook", "statusline"].includes(e.type)),
    ).length,
    entries,
  };
}
export interface TreemapTile {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Balanced spatial partition. Areas remain proportional, including tiny resources. */
export function layoutTreemap(
  items: { id: string; value: number }[],
  width: number,
  height: number,
): TreemapTile[] {
  if (!(width > 0 && height > 0) || !Number.isFinite(width + height)) return [];
  const values = items
    .filter((i) => i.value > 0 && Number.isFinite(i.value))
    .sort((a, b) => b.value - a.value);
  const result: TreemapTile[] = [];
  function split(
    list: typeof values,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    if (!list.length) return;
    if (list.length === 1) {
      result.push({ id: list[0]!.id, x, y, width: w, height: h });
      return;
    }
    const total = list.reduce((sum, item) => sum + item.value, 0);
    let index = 1,
      first = list[0]!.value;
    while (
      index < list.length - 1 &&
      Math.abs(first + list[index]!.value - total / 2) <
        Math.abs(first - total / 2)
    )
      first += list[index++]!.value;
    const fraction = first / total;
    if (w >= h) {
      split(list.slice(0, index), x, y, w * fraction, h);
      split(list.slice(index), x + w * fraction, y, w * (1 - fraction), h);
    } else {
      split(list.slice(0, index), x, y, w, h * fraction);
      split(list.slice(index), x, y + h * fraction, w, h * (1 - fraction));
    }
  }
  split(values, 0, 0, width, height);
  return result;
}

/** Match snapshot inheritance: managed global resources replace their detected copies. */
export function contextResources(
  detected: Resource[],
  inherited: Resource[],
  owned: Resource[],
) {
  return [
    ...detected.filter(
      (r) =>
        !inherited.some(
          (g) =>
            r.scope === "global" &&
            r.name === g.name &&
            r.type === g.type &&
            r.harnesses.some((h) => g.harnesses.includes(h)),
        ),
    ),
    ...inherited,
    ...owned,
  ];
}
