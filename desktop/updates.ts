/**
 * Auto-update state shared by the main process and the renderer. Pure data and
 * a reducer, so it is tested without Electron.
 */
export type UpdateState =
  | { status: "idle" }
  | { status: "disabled"; reason: string; manual: boolean }
  | { status: "checking"; manual: boolean }
  | { status: "available"; version: string }
  | { status: "downloading"; version: string; percent: number }
  | { status: "ready"; version: string }
  | { status: "current"; manual: boolean }
  | { status: "error"; message: string; manual: boolean };

export type UpdateEvent =
  | { type: "checking"; manual: boolean }
  | { type: "available"; version: string }
  | { type: "not-available" }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string }
  | { type: "disable"; reason: string; manual: boolean }
  | { type: "dismiss" };

export const initialUpdateState: UpdateState = { status: "idle" };

export function reduceUpdate(
  state: UpdateState,
  event: UpdateEvent,
): UpdateState {
  // A build that cannot update stays that way; a ready update is never lost
  // to a later background check.
  if (
    state.status === "disabled" &&
    event.type !== "dismiss" &&
    event.type !== "disable"
  )
    return state;
  switch (event.type) {
    case "disable":
      return {
        status: "disabled",
        reason: event.reason,
        manual: event.manual,
      };
    case "checking":
      if (state.status === "ready" || state.status === "downloading")
        return state;
      return { status: "checking", manual: event.manual };
    case "available":
      if (state.status === "ready") return state;
      return { status: "available", version: event.version };
    case "progress":
      if (state.status !== "available" && state.status !== "downloading")
        return state;
      return {
        status: "downloading",
        version: state.version,
        percent: Math.max(0, Math.min(100, Math.round(event.percent))),
      };
    case "downloaded":
      return { status: "ready", version: event.version };
    case "not-available":
      if (state.status === "ready") return state;
      return {
        status: "current",
        manual: state.status === "checking" ? state.manual : false,
      };
    case "error":
      if (state.status === "ready") return state;
      return {
        status: "error",
        message: event.message.slice(0, 300),
        manual: state.status === "checking" ? state.manual : false,
      };
    case "dismiss":
      return state.status === "ready" || state.status === "downloading"
        ? state
        : state.status === "disabled"
          ? { ...state, manual: false }
          : initialUpdateState;
  }
}

/** What the banner shows. Background checks stay silent unless an update exists. */
export function updateBanner(
  state: UpdateState,
): {
  tone: "info" | "success" | "warning";
  text: string;
  action?: "install" | "releases" | "dismiss";
} | null {
  switch (state.status) {
    case "available":
      return { tone: "info", text: `Downloading Preflight ${state.version}…` };
    case "downloading":
      return {
        tone: "info",
        text: `Downloading Preflight ${state.version} (${state.percent}%)`,
      };
    case "ready":
      return {
        tone: "success",
        text: `Preflight ${state.version} is ready.`,
        action: "install",
      };
    case "checking":
      return state.manual
        ? { tone: "info", text: "Checking for updates…" }
        : null;
    case "current":
      return state.manual
        ? { tone: "info", text: "Preflight is up to date.", action: "dismiss" }
        : null;
    case "error":
      return state.manual
        ? {
            tone: "warning",
            text: `Could not check for updates: ${state.message}`,
            action: "dismiss",
          }
        : null;
    case "disabled":
      return state.manual
        ? { tone: "warning", text: state.reason, action: "releases" }
        : null;
    default:
      return null;
  }
}

export interface UpdateSupportInput {
  packaged: boolean;
  platform: NodeJS.Platform;
  /** macOS only: the app carries a Developer ID signature. */
  signed: boolean;
  /** Linux only: running from an AppImage. */
  appImage: boolean;
  testMode: boolean;
}

/** Why updates cannot run for this build, or null when they can. */
export function updateUnsupportedReason(
  input: UpdateSupportInput,
): string | null {
  if (input.testMode) return "Updates are off in test runs.";
  if (!input.packaged) return "Updates only run in installed builds.";
  if (input.platform === "darwin" && !input.signed)
    return "This build is not signed, and macOS only updates signed apps. Download the latest release from GitHub.";
  if (input.platform === "linux" && !input.appImage)
    return "Only the AppImage updates itself. Install the new .deb or AppImage from GitHub.";
  return null;
}
