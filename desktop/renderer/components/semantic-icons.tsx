import { StackIcon } from "@phosphor-icons/react/dist/csr/Stack";
import { PlugsConnectedIcon } from "@phosphor-icons/react/dist/csr/PlugsConnected";
import { RobotIcon } from "@phosphor-icons/react/dist/csr/Robot";
import { LightningIcon } from "@phosphor-icons/react/dist/csr/Lightning";
import { TextAlignLeftIcon } from "@phosphor-icons/react/dist/csr/TextAlignLeft";
import { TerminalWindowIcon } from "@phosphor-icons/react/dist/csr/TerminalWindow";
import { PuzzlePieceIcon } from "@phosphor-icons/react/dist/csr/PuzzlePiece";
import { GaugeIcon } from "@phosphor-icons/react/dist/csr/Gauge";
import { WrenchIcon } from "@phosphor-icons/react/dist/csr/Wrench";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { HouseIcon } from "@phosphor-icons/react/dist/csr/House";
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { CompassIcon } from "@phosphor-icons/react/dist/csr/Compass";
import { FlaskIcon } from "@phosphor-icons/react/dist/csr/Flask";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { ChartLineIcon } from "@phosphor-icons/react/dist/csr/ChartLine";
import { MapTrifoldIcon } from "@phosphor-icons/react/dist/csr/MapTrifold";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/csr/UsersThree";
import { ShareNetworkIcon } from "@phosphor-icons/react/dist/csr/ShareNetwork";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { CloudArrowDownIcon } from "@phosphor-icons/react/dist/csr/CloudArrowDown";
import { CodeIcon } from "@phosphor-icons/react/dist/csr/Code";
import { AsteriskIcon } from "@phosphor-icons/react/dist/csr/Asterisk";
import type { ResourceType, HarnessId } from "../../../src/schema";
import type { LucideIcon } from "lucide-react";
export const resourceAppearance = {
  skill: { icon: StackIcon, tone: "blue" },
  mcp: { icon: PlugsConnectedIcon, tone: "teal" },
  subagent: { icon: RobotIcon, tone: "violet" },
  hook: { icon: LightningIcon, tone: "amber" },
  prompt: { icon: TextAlignLeftIcon, tone: "rose" },
  command: { icon: TerminalWindowIcon, tone: "violet" },
  tool: { icon: WrenchIcon, tone: "teal" },
  plugin: { icon: PuzzlePieceIcon, tone: "green" },
  statusline: { icon: GaugeIcon, tone: "amber" },
} satisfies Record<ResourceType, { icon: typeof StackIcon; tone: string }>;
const navigationAppearance = {
  overview: { icon: HouseIcon, tone: "blue" },
  skills: resourceAppearance.skill,
  mcp: resourceAppearance.mcp,
  resources: { icon: SquaresFourIcon, tone: "blue" },
  detected: { icon: CloudArrowDownIcon, tone: "amber" },
  projects: { icon: FolderOpenIcon, tone: "amber" },
  catalogue: { icon: CompassIcon, tone: "teal" },
  loadouts: { icon: StackIcon, tone: "violet" },
  benchmarks: { icon: FlaskIcon, tone: "rose" },
  doctor: { icon: ShieldCheckIcon, tone: "green" },
  usage: { icon: ChartLineIcon, tone: "teal" },
  context: { icon: MapTrifoldIcon, tone: "violet" },
  instructions: resourceAppearance.prompt,
  profiles: { icon: SlidersHorizontalIcon, tone: "blue" },
  team: { icon: UsersThreeIcon, tone: "violet" },
  collaboration: { icon: ShareNetworkIcon, tone: "teal" },
  activity: { icon: ClockCounterClockwiseIcon, tone: "amber" },
  console: { icon: TerminalWindowIcon, tone: "blue" },
};
export function ResourceIcon({
  type,
  size = 20,
}: {
  type: ResourceType;
  size?: number;
}) {
  const { icon: Icon, tone } = resourceAppearance[type];
  return (
    <Icon
      size={size}
      weight="duotone"
      className="semantic-icon"
      data-tone={tone}
      aria-hidden="true"
    />
  );
}
export function NavigationIcon({
  id,
  fallback: Fallback,
}: {
  id: string;
  fallback: LucideIcon;
}) {
  const appearance =
    navigationAppearance[id as keyof typeof navigationAppearance];
  if (!appearance) return <Fallback size={18} aria-hidden="true" />;
  const Icon = appearance.icon;
  return (
    <Icon
      size={19}
      weight="duotone"
      className="semantic-icon nav-semantic-icon"
      data-tone={appearance.tone}
      aria-hidden="true"
    />
  );
}
export function ResourceBadge({ type }: { type: ResourceType }) {
  return (
    <span
      className="badge semantic-badge"
      data-tone={resourceAppearance[type].tone}
    >
      <ResourceIcon type={type} size={13} />
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
  const claude = harness === "claude-code";
  const Icon = claude ? AsteriskIcon : CodeIcon;
  return (
    <span
      className={`badge semantic-badge harness-badge ${compact ? "compact" : ""}`}
      data-tone={claude ? "amber" : "violet"}
      title={claude ? "Claude Code" : "Cursor"}
    >
      <Icon size={compact ? 13 : 14} weight="duotone" aria-hidden="true" />
      <span>{claude ? (compact ? "Claude" : "Claude Code") : "Cursor"}</span>
    </span>
  );
}
