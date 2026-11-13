import type { Finding } from "../analysis.js";
import type { ResourceType, Scope } from "../schema.js";

export const color = {
  accent: "blueBright",
  success: "green",
  warning: "yellow",
  danger: "red",
  info: "blue",
  muted: "gray",
} as const;

export const glyph = {
  selected: "▸",
  dot: "·",
  on: "●",
  off: "○",
  ok: "✔",
  warning: "▲",
  error: "✖",
  info: "•",
  add: "+",
  remove: "−",
  replace: "~",
  scrollUp: "↑",
  scrollDown: "↓",
  locked: "⌁",
} as const;

export const typeLabel: Record<ResourceType, string> = {
  skill: "skill",
  mcp: "mcp",
  subagent: "agent",
  hook: "hook",
  prompt: "prompt",
  tool: "tool",
  plugin: "plugin",
  statusline: "status",
  command: "cmd",
  instructions: "rules",
};

export const typeColor: Record<ResourceType, string> = {
  skill: "blueBright",
  mcp: "magenta",
  subagent: "blue",
  hook: "yellow",
  prompt: "green",
  tool: "white",
  plugin: "magentaBright",
  statusline: "blueBright",
  command: "whiteBright",
  instructions: "greenBright",
};

export const scopeColor: Record<Scope, string> = {
  global: "yellow",
  project: "blueBright",
};

export const severity: Record<
  Finding["severity"],
  { color: string; glyph: string }
> = {
  error: { color: color.danger, glyph: glyph.error },
  warning: { color: color.warning, glyph: glyph.warning },
  info: { color: color.info, glyph: glyph.info },
};

export const severityRank: Record<Finding["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export const diffColor: Record<string, string> = {
  add: color.success,
  replace: color.warning,
  remove: color.danger,
  unchanged: color.muted,
};

export const diffGlyph: Record<string, string> = {
  add: glyph.add,
  replace: glyph.replace,
  remove: glyph.remove,
  unchanged: glyph.dot,
};
