import type { Resource, Scope } from "../schema.js";


export type ViewId =
  | "browse"
  | "catalogue"
  | "detected"
  | "doctor"
  | "profiles";

export const views: { id: ViewId; label: string; key: string }[] = [
  { id: "browse", label: "Browse", key: "1" },
  { id: "catalogue", label: "Catalogue", key: "2" },
  { id: "detected", label: "Detected", key: "3" },
  { id: "doctor", label: "Doctor", key: "4" },
  { id: "profiles", label: "Profiles", key: "5" },
];

export type Intent =
  | "goto-browse"
  | "goto-catalogue"
  | "goto-detected"
  | "goto-doctor"
  | "goto-profiles"
  | "form-new"
  | "form-edit"
  | "prompt-fork"
  | "prompt-profile"
  | "prompt-command"
  | "catalogue-add"
  | "toggle-online"
  | "cycle-scope"
  | "cycle-type"
  | "filter"
  | "reveal-resource"
  | "raw-output"
  | "help"
  | "refresh"
  | "quit";

export interface ActionState {
  view: ViewId;
  resource?: Resource | undefined;
  profile?: string | undefined;
  activeProfile?: string | undefined;
  initialized: boolean;
  online: boolean;
}

export interface Action {
  id: string;
  label: string;
  group: string;
  /** Single key that runs the action from the current view. */
  key?: string;
  /** One or two words for the key hints along the bottom of the screen. */
  short?: string;
  /** CLI command path this action maps to; empty for interface-only actions. */
  cli?: string;
  /** Route the write through a dry-run preview before applying. */
  confirm?: boolean;
  /** Warn that the effect is outside Preflight's local rollback. */
  external?: boolean;
  /** Open the result pane: the output is the point of running it. */
  show?: boolean;
  intent?: Intent;
  build?: (state: ActionState) => string[];
  enabled?: (state: ActionState) => boolean;
}

const other = (scope: Scope): Scope => (scope === "global" ? "project" : "global");
const onBrowse = (state: ActionState) =>
  state.view === "browse" && !!state.resource;
const onCatalogue = (state: ActionState) =>
  state.view === "catalogue" && !!state.resource;
const onProfiles = (state: ActionState) =>
  state.view === "profiles" && !!state.profile;

export const actions: Action[] = [
  {
    id: "inspect",
    label: "Inspect resource",
    group: "Resource",
    show: true,
    cli: "inspect",
    build: (s) => ["inspect", s.resource!.id],
    enabled: onBrowse,
  },
  {
    id: "edit",
    label: "Edit resource",
    group: "Resource",
    key: "e",
    short: "edit",
    cli: "update-json",
    intent: "form-edit",
    enabled: onBrowse,
  },
  {
    id: "move",
    label: "Move to the other scope",
    group: "Resource",
    key: "m",
    short: "move scope",
    cli: "move",
    confirm: true,
    build: (s) => ["move", s.resource!.id, other(s.resource!.scope)],
    enabled: onBrowse,
  },
  {
    id: "fork",
    label: "Fork resource",
    group: "Resource",
    key: "f",
    short: "fork",
    cli: "fork",
    intent: "prompt-fork",
    enabled: onBrowse,
  },
  {
    id: "delete",
    label: "Delete resource",
    group: "Resource",
    key: "d",
    short: "delete",
    cli: "delete",
    confirm: true,
    build: (s) => ["delete", s.resource!.id],
    enabled: onBrowse,
  },
  {
    id: "verify",
    label: "Verify wiring",
    group: "Resource",
    key: "v",
    short: "verify",
    show: true,
    cli: "verify",
    build: (s) => ["verify", s.resource!.id],
    enabled: onBrowse,
  },
  {
    id: "verify-connect",
    label: "Verify by connecting to the MCP server",
    group: "Resource",
    show: true,
    cli: "verify",
    external: true,
    build: (s) => ["verify", s.resource!.id, "--connect"],
    enabled: (s) => onBrowse(s) && s.resource!.type === "mcp",
  },
  {
    id: "install-plan",
    label: "Show the delegated installation plan",
    group: "Resource",
    key: "i",
    short: "install",
    show: true,
    cli: "install",
    build: (s) => ["install", s.resource!.id],
    enabled: onBrowse,
  },
  {
    id: "install-execute",
    label: "Run the delegated installer",
    group: "Resource",
    show: true,
    cli: "install",
    confirm: true,
    external: true,
    build: (s) => ["install", s.resource!.id, "--execute"],
    enabled: onBrowse,
  },
  {
    id: "share-resource",
    label: "Build a share payload for this resource",
    group: "Resource",
    show: true,
    cli: "share",
    build: (s) => ["share", "--id", s.resource!.id],
    enabled: onBrowse,
  },
  {
    id: "adopt",
    label: "Manage this resource where it already lives",
    group: "Detected",
    key: "a",
    short: "adopt",
    cli: "adopt",
    confirm: true,
    build: (s) => ["adopt", s.resource!.id],
    enabled: (s) => s.view === "detected" && !!s.resource,
  },
  {
    id: "unmanaged",
    label: "List detected resources this profile does not manage",
    group: "Detected",
    show: true,
    cli: "unmanaged",
    build: () => ["unmanaged"],
  },
  {
    id: "catalogue-inspect",
    label: "Inspect catalogue result",
    group: "Catalogue",
    cli: "inspect-json",
    build: (s) => ["inspect-json", JSON.stringify(s.resource)],
    enabled: onCatalogue,
  },
  {
    id: "catalogue-add",
    label: "Add catalogue result to this profile",
    group: "Catalogue",
    key: "a",
    short: "add",
    cli: "create-json",
    intent: "catalogue-add",
    enabled: onCatalogue,
  },
  {
    id: "toggle-online",
    label: "Toggle remote sources for search",
    group: "Catalogue",
    key: "O",
    short: "remote",
    intent: "toggle-online",
    enabled: (s) => s.view === "catalogue",
  },
  {
    id: "new",
    label: "New resource",
    group: "Configuration",
    key: "n",
    short: "new",
    cli: "create-json",
    intent: "form-new",
    enabled: (s) => s.view === "browse",
  },
  {
    id: "init",
    label: "Create a project configuration",
    group: "Configuration",
    key: "i",
    short: "init",
    cli: "init",
    confirm: true,
    build: () => ["init"],
    enabled: (s) => !s.initialized,
  },
  {
    id: "sync",
    label: "Reconcile desired state to harness files",
    group: "Configuration",
    key: "y",
    short: "sync",
    cli: "sync",
    confirm: true,
    build: () => ["sync"],
  },
  {
    id: "rollback",
    label: "Reverse the latest transaction",
    group: "Configuration",
    cli: "rollback",
    confirm: true,
    build: () => ["rollback"],
  },
  {
    id: "recover",
    label: "Recover an interrupted transaction",
    group: "Configuration",
    cli: "recover",
    confirm: true,
    build: () => ["recover"],
  },
  {
    id: "retrofit",
    label: "Generate a project contract from the detected stack",
    group: "Configuration",
    cli: "retrofit",
    confirm: true,
    build: () => ["retrofit"],
  },
  {
    id: "share-config",
    label: "Build a share payload for this profile",
    group: "Configuration",
    show: true,
    cli: "share",
    build: () => ["share"],
  },
  {
    id: "git-status",
    label: "Git status",
    group: "Configuration",
    show: true,
    cli: "git",
    build: () => ["git", "status"],
  },
  {
    id: "audit",
    label: "Show the local change history",
    group: "Configuration",
    show: true,
    cli: "audit",
    build: () => ["audit"],
  },
  {
    id: "doctor",
    label: "Re-run doctor",
    group: "Analysis",
    cli: "doctor",
    build: () => ["doctor"],
  },
  {
    id: "doctor-connect",
    label: "Re-run doctor, connecting to each MCP server",
    group: "Analysis",
    show: true,
    external: true,
    cli: "doctor",
    build: () => ["doctor", "--connect"],
  },
  {
    id: "usage",
    label: "Measured skill and tool invocations",
    group: "Analysis",
    show: true,
    cli: "usage",
    build: () => ["usage"],
  },
  {
    id: "prune",
    label: "Propose unused skills",
    group: "Analysis",
    show: true,
    cli: "prune",
    build: () => ["prune"],
  },
  {
    id: "loadouts",
    label: "List loadouts",
    group: "Analysis",
    show: true,
    cli: "loadouts",
    build: () => ["loadouts", "list"],
  },
  {
    id: "profile-switch",
    label: "Switch to the selected profile",
    group: "Profiles",
    cli: "profiles switch",
    confirm: true,
    build: (s) => ["profiles", "switch", s.profile!],
    enabled: onProfiles,
  },
  {
    id: "profile-create",
    label: "Create a profile",
    group: "Profiles",
    key: "n",
    short: "new",
    cli: "profiles create",
    intent: "prompt-profile",
    enabled: (s) => s.view === "profiles",
  },
  {
    id: "profile-diff",
    label: "Diff the selected profile against the active one",
    group: "Profiles",
    key: "d",
    short: "diff",
    show: true,
    cli: "profiles diff",
    build: (s) => ["profiles", "diff", s.activeProfile ?? "default", s.profile!],
    enabled: (s) => onProfiles(s) && s.profile !== s.activeProfile,
  },
  ...views.map((tab) => ({
    id: `goto-${tab.id}`,
    label: `Go to ${tab.label}`,
    group: "Interface",
    key: tab.key,
    intent: `goto-${tab.id}` as Intent,
  })),
  {
    id: "command",
    label: "Run any CLI command",
    group: "Interface",
    key: ":",
    short: "command",
    intent: "prompt-command",
  },
  {
    id: "filter",
    label: "Filter the list",
    group: "Interface",
    key: "/",
    short: "filter",
    intent: "filter",
  },
  {
    id: "cycle-scope",
    label: "Cycle the scope filter",
    group: "Interface",
    key: "s",
    short: "scope",
    intent: "cycle-scope",
    enabled: (s) => s.view === "browse",
  },
  {
    id: "cycle-type",
    label: "Cycle the type filter",
    group: "Interface",
    key: "t",
    short: "type",
    intent: "cycle-type",
    enabled: (s) =>
      s.view === "browse" || s.view === "catalogue" || s.view === "detected",
  },
  {
    id: "raw-output",
    label: "Show the raw result",
    group: "Interface",
    key: "o",
    short: "output",
    intent: "raw-output",
  },
  {
    id: "refresh",
    label: "Reload configuration and analysis",
    group: "Interface",
    key: "r",
    short: "reload",
    intent: "refresh",
  },
  {
    id: "help",
    label: "Keyboard reference",
    group: "Interface",
    key: "?",
    short: "help",
    intent: "help",
  },
  {
    id: "quit",
    label: "Quit",
    group: "Interface",
    key: "q",
    short: "quit",
    intent: "quit",
  },
];

export const available = (state: ActionState) =>
  actions.filter((action) => !action.enabled || action.enabled(state));

export function byKey(key: string, state: ActionState): Action | undefined {
  return available(state).find((action) => action.key === key);
}

const placeholder: Resource = {
  id: "<id>",
  type: "skill",
  name: "<name>",
  description: "",
  source: "local:owned",
  scope: "project",
  harnesses: ["claude-code"],
  enabled: true,
  config: {},
  tags: [],
};

/** Fills in placeholders so every action can be shown in the reference. */
export function referenceState(state: ActionState): ActionState {
  return {
    ...state,
    resource: state.resource ?? placeholder,
    profile: state.profile ?? state.activeProfile ?? "<profile>",
  };
}

export function commandLine(action: Action, state: ActionState): string {
  const fallback = action.cli ? `preflight ${action.cli}` : "";
  if (!action.build) return fallback;
  let argv: string[];
  try {
    argv = action.build(state);
  } catch {
    return fallback;
  }
  return (
    "preflight " +
    argv
      .map((argument) =>
        argument.length > 48 ? argument.slice(0, 47) + "…" : argument,
      )
      .map((argument) =>
        /\s/.test(argument) ? JSON.stringify(argument) : argument,
      )
      .join(" ") +
    (action.confirm ? " --dry-run" : "")
  );
}
