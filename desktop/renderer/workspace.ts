import { useState, useEffect, useCallback, useRef } from "react";
import type { DesktopState, Snapshot, Prepared } from "../protocol";
export function availableResources(snapshot: Snapshot | null) {
  return [
    ...new Map(
      [...(snapshot?.inherited ?? []), ...(snapshot?.resources ?? [])].map(
        (resource) => [resource.id, resource] as const,
      ),
    ).values(),
  ];
}
/** Drop Electron's IPC wrapper so errors read as the engine wrote them. */
export const readable = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    "",
  );
export interface Toast {
  id: number;
  text: string;
}
/** What the result dialog shows: the value and the command that produced it. */
export interface Outcome {
  args: string[];
  value: unknown;
  applied: boolean;
}
const describe = (args: string[]) => {
  const [command = "", sub = ""] = args;
  const names: Record<string, string> = {
    init: "Configuration initialized",
    sync: "Configuration synced",
    "create-json": "Resource created",
    "update-json": "Resource updated",
    delete: "Resource deleted",
    adopt: "Resource adopted",
    skill: sub === "manual" ? "Skill is manual now" : "Skill is automatic now",
    disable: "Resource switched off",
    enable: "Resource switched on",
    move: "Resource moved",
    fork: "Resource duplicated",
    install: "Installer finished",
    retrofit: "AGENTS.md generated",
    rollback: "Last change rolled back",
    recover: "Interrupted operation recovered",
    apply: "Shared setup imported",
    reflect: "Lesson saved",
    share: "Setup shared",
    revoke: "Share revoked",
    profiles: sub === "switch" ? "Profile switched" : "Profile created",
    loadouts: "Loadout installed",
    source:
      sub === "remove"
        ? "Source removed"
        : sub === "update"
          ? "Source updated"
          : "Source added",
  };
  return names[command] ?? "Operation completed";
};
export function useWorkspace() {
  const [state, setState] = useState<DesktopState | null>(null),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [toasts, setToasts] = useState<Toast[]>([]),
    [prepared, setPrepared] = useState<Prepared | null>(null),
    [outcome, setOutcome] = useState<Outcome | undefined>(undefined);
  const refreshing = useRef<Promise<void> | null>(null);
  const toastId = useRef(0);
  const reload = useCallback(async () => {
    if (refreshing.current) return refreshing.current;
    const pending = (async () => {
      const state = await window.preflight.state();
      setState(state);
      setSnapshot(await window.preflight.snapshot());
    })();
    refreshing.current = pending;
    try {
      await pending;
    } finally {
      refreshing.current = null;
    }
  }, []);
  useEffect(() => {
    setBusy("Opening workspace…");
    void reload()
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(""));
  }, [reload]);
  const dismiss = useCallback(
    (id: number) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  );
  const notify = useCallback(
    (text: string) => {
      const id = ++toastId.current;
      setToasts((all) => [...all.slice(-1), { id, text }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );
  const task = async <T>(label: string, fn: () => Promise<T>) => {
    setError("");
    setBusy(label);
    try {
      return await fn();
    } catch (e) {
      setError(readable(e));
      return undefined;
    } finally {
      setBusy("");
    }
  };
  /** Prepare a command: writes open the review dialog, reads return a value. */
  const prepare = async (args: string[], display = true) =>
    task("Preparing operation…", async () => {
      const response = await window.preflight.prepare(args);
      if (response.kind === "preview") setPrepared(response);
      else if (display)
        setOutcome({ args, value: response.value, applied: false });
      return response;
    });
  const run = async (args: string[], display = true) =>
    (await prepare(args, display))?.value;
  const confirm = () =>
    task("Applying changes…", async () => {
      if (!prepared?.receipt) return;
      const args = prepared.args;
      const value = await window.preflight.confirm(prepared.receipt);
      setPrepared(null);
      setOutcome({ args, value, applied: true });
      notify(describe(args));
      await reload();
    });
  const switchProject = (id: string) =>
    task("Opening project…", async () => {
      await window.preflight.selectProject(id);
      setPrepared(null);
      setOutcome(undefined);
      await reload();
    });
  const switchGlobal = () =>
    task("Opening global configuration…", async () => {
      await window.preflight.selectGlobal();
      setPrepared(null);
      setOutcome(undefined);
      await reload();
    });
  const chooseProject = () =>
    task("Opening project…", async () => {
      await window.preflight.chooseProject();
      setPrepared(null);
      await reload();
    });
  return {
    state,
    snapshot,
    busy,
    error,
    toasts,
    prepared,
    outcome,
    setState,
    setError,
    setPrepared,
    setOutcome,
    reload,
    prepare,
    run,
    confirm,
    task,
    notify,
    dismiss,
    describe,
    switchProject,
    switchGlobal,
    chooseProject,
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
