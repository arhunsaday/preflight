import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Hand, Power, PowerOff } from "lucide-react";
import { modelInvocable } from "../../../src/context-map";
import type { Resource } from "../../../src/schema";

export type SwitchState = "on" | "off" | "manual";
const types = ["skill", "mcp", "plugin", "hook", "subagent", "command"];
/** Only on-disk resources that Preflight does not manage can be switched here. */
export const switchable = (r: Resource) => types.includes(r.type);
export const switchState = (r: Resource): SwitchState =>
  !r.enabled
    ? "off"
    : r.type === "skill" && !modelInvocable(r)
      ? "manual"
      : "on";
/** The command that moves a resource from its state to another one. */
export function switchArgs(r: Resource, to: SwitchState): string[] | null {
  const from = switchState(r);
  if (from === to) return null;
  if (to === "off") return ["disable", r.id, "--apply"];
  if (from === "off") return to === "on" ? ["enable", r.id, "--apply"] : null;
  return ["skill", to === "manual" ? "manual" : "auto", r.id, "--apply"];
}
const listed = (r: Resource) =>
  r.type === "skill" || r.type === "subagent"
    ? Math.ceil(`${r.name}\n${r.description}`.length / 4)
    : null;
/** What the current state costs, in words. */
export function switchCost(r: Resource) {
  const tokens = listed(r);
  const state = switchState(r);
  if (tokens === null) return "Token cost not measured";
  if (state === "on")
    return `~${tokens.toLocaleString()} tokens listed every session`;
  if (state === "manual")
    return `0 tokens listed; call it as /${r.name} (${tokens.toLocaleString()} when On)`;
  return `0 tokens; ~${tokens.toLocaleString()} when On`;
}
export function ResourceSwitch({
  resource,
  disabled,
  onChange,
}: {
  resource: Resource;
  disabled?: boolean;
  onChange: (args: string[]) => void;
}) {
  const state = switchState(resource);
  const skill = resource.type === "skill";
  const option = (to: SwitchState, label: string, Icon: typeof Power) => {
    const args = switchArgs(resource, to);
    return (
      <ToggleGroupItem
        value={to}
        disabled={disabled || (state !== to && !args)}
        title={
          to === "manual" && state === "off"
            ? "Switch On first, then make it manual"
            : undefined
        }
      >
        <Icon size={13} aria-hidden /> {label}
      </ToggleGroupItem>
    );
  };
  return (
    <div
      className="resource-switch"
      role="group"
      aria-label={`Switch for ${resource.name}`}
    >
      <ToggleGroup
        type="single"
        value={state}
        onValueChange={(to) => {
          const args = to ? switchArgs(resource, to as SwitchState) : null;
          if (args) onChange(args);
        }}
      >
        {option("on", "On", Power)}
        {skill && option("manual", "Manual", Hand)}
        {option("off", "Off", PowerOff)}
      </ToggleGroup>
      <small>
        <b>{state === "on" ? "On" : state === "off" ? "Off" : "Manual"}</b> ·{" "}
        {switchCost(resource)}
      </small>
    </div>
  );
}
