import { useState, useEffect, useCallback, useRef } from "react";
import type { DesktopState, Snapshot, Prepared } from "../protocol";
export function useWorkspace() {
  const [state, setState] = useState<DesktopState | null>(null),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [prepared, setPrepared] = useState<Prepared | null>(null),
    [result, setResult] = useState<unknown>(undefined);
  const refreshing = useRef<Promise<void> | null>(null);
  const reload = useCallback(async () => {
    if (refreshing.current) return refreshing.current;
    const pending = (async () => {
      const state = await window.adk.state();
      setState(state);
      setSnapshot(await window.adk.snapshot());
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
  const task = async <T>(label: string, fn: () => Promise<T>) => {
    setError("");
    setMessage("");
    setBusy(label);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy("");
    }
  };
  const run = async (args: string[], display = true) =>
    task("Preparing operation…", async () => {
      const response = await window.adk.prepare(args);
      if (response.kind === "preview") setPrepared(response);
      else if (display) setResult(response.value);
      return response.value;
    });
  const confirm = () =>
    task("Applying changes…", async () => {
      if (!prepared?.receipt) return;
      const value = await window.adk.confirm(prepared.receipt);
      setPrepared(null);
      setResult(value);
      setMessage("Operation completed");
      await reload();
    });
  const switchProject = (id: string) =>
    task("Opening project…", async () => {
      await window.adk.selectProject(id);
      setPrepared(null);
      setResult(undefined);
      await reload();
    });
  const switchGlobal = () =>
    task("Opening global configuration…", async () => {
      await window.adk.selectGlobal();
      setPrepared(null);
      setResult(undefined);
      await reload();
    });
  const chooseProject = () =>
    task("Opening project…", async () => {
      await window.adk.chooseProject();
      setPrepared(null);
      await reload();
    });
  return {
    state,
    snapshot,
    busy,
    error,
    message,
    prepared,
    result,
    setState,
    setError,
    setPrepared,
    setResult,
    reload,
    run,
    confirm,
    task,
    switchProject,
    switchGlobal,
    chooseProject,
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
