import {
  Layers,
  Plug,
  Bot,
  Zap,
  AlignLeft,
  SquareTerminal,
  Wrench,
  Puzzle,
  Gauge,
  Asterisk,
  MousePointer2,
  Hexagon,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ResourceType, HarnessId } from "../../../src/schema";

/**
 * One monochrome Lucide glyph per resource type. Icons inherit the text
 * colour; a type is told apart by its glyph and its word, never by a hue.
 * `tone` is kept for views that tag elements with it (data-tone); the
 * stylesheet no longer gives tones a colour.
 */
export const resourceAppearance = {
  skill: { icon: Layers, tone: "skill" },
  mcp: { icon: Plug, tone: "mcp" },
  subagent: { icon: Bot, tone: "subagent" },
  hook: { icon: Zap, tone: "hook" },
  prompt: { icon: AlignLeft, tone: "prompt" },
  command: { icon: SquareTerminal, tone: "command" },
  tool: { icon: Wrench, tone: "tool" },
  plugin: { icon: Puzzle, tone: "plugin" },
  statusline: { icon: Gauge, tone: "statusline" },
  instructions: { icon: FileText, tone: "instructions" },
} satisfies Record<ResourceType, { icon: LucideIcon; tone: string }>;

const stroke = 1.75;

export function ResourceIcon({
  type,
  size = 16,
}: {
  type: ResourceType;
  size?: number;
}) {
  const Icon = resourceAppearance[type].icon;
  return (
    <Icon
      size={size}
      strokeWidth={stroke}
      className="semantic-icon"
      aria-hidden="true"
    />
  );
}
/** A navigation glyph: the item's own Lucide icon at the rail's size. */
export function NavigationIcon({
  fallback: Icon,
}: {
  id: string;
  fallback: LucideIcon;
}) {
  return (
    <Icon
      size={16}
      strokeWidth={stroke}
      className="semantic-icon nav-semantic-icon"
      aria-hidden="true"
    />
  );
}
export function ResourceBadge({ type }: { type: ResourceType }) {
  return (
    <span className="badge semantic-badge">
      <ResourceIcon type={type} size={12} />
      {type}
    </span>
  );
}
export function HarnessBadge({
  harness,
  compact = false,
}: {
  harness: HarnessId;
  compact?: boolean;
}) {
  const meta = {
    "claude-code": { Icon: Asterisk, name: "Claude Code", short: "Claude", weight: 2.25 },
    codex: { Icon: Hexagon, name: "Codex", short: "Codex", weight: stroke },
    cursor: { Icon: MousePointer2, name: "Cursor", short: "Cursor", weight: stroke },
  }[harness];
  const Icon = meta.Icon;
  return (
    <span
      className={`badge semantic-badge harness-badge ${compact ? "compact" : ""}`}
      title={meta.name}
    >
      <Icon
        size={compact ? 11 : 12}
        strokeWidth={meta.weight}
        aria-hidden="true"
      />
      <span>{compact ? meta.short : meta.name}</span>
    </span>
  );
}
