import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput, type Key } from "ink";
import TextInput from "ink-text-input";
import { join } from "node:path";
import type { ReactNode } from "react";
import { execute } from "../commands.js";
import { PreflightService } from "../service.js";
import { measureUsage, type Finding, type Usage } from "../analysis.js";
import type { Context } from "../adapters.js";
import type { PreflightConfig, PreflightLock, Resource, ResourceType } from "../schema.js";
import { PreflightLockSchema } from "../schema.js";
import { readText } from "../transaction.js";
import { diffResources } from "../diff.js";
import {
  actions as allActions,
  available,
  byKey,
  views,
  type Action,
  type ActionState,
  type ViewId,
} from "./actions.js";
import type { HarnessSummary } from "./components.js";
import {
  FormPane,
  HelpPane,
  HintBar,
  OutputPane,
  PaletteList,
  PreviewPane,
  ResourceList,
  Rule,
  SimpleList,
  StatusBar,
  TabBar,
  Viewport,
  findingRow,
  profileRow,
  resourceDetail,
  useTerminalSize,
} from "./components.js";
import { color, glyph, severity, severityRank, typeLabel } from "./theme.js";
import {
  errorText,
  fit,
  fuzzyFilter,
  jsonText,
  count,
  tokenize,
  truncate,
  wrapWords,
} from "./text.js";
import { shortPath, summarize } from "./preview.js";
import {
  emptyForm,
  formFields,
  fromResource,
  cycle,
  toggle,
  validate,
  type FormState,
  type FieldName,
} from "./form.js";

type Overlay = "none" | "palette" | "form" | "preview" | "help" | "output";
type PromptKind = "command" | "fork" | "profile";
type ScopeFilter = "all" | "global" | "project";
type TypeFilter = "all" | ResourceType;

interface Pending {
  argv: string[];
  title: string;
  result: unknown;
  show?: boolean;
}

export type AppliedState = "applied" | "pending";

type Unmanaged = Awaited<ReturnType<PreflightService["unmanaged"]>>[number];

interface Toast {
  text: string;
  tone: "success" | "danger" | "muted";
  command?: string;
}

const writeCommands = new Set([
  "adopt",
  "apply",
  "catalog-add",
  "create",
  "create-json",
  "delete",
  "fork",
  "init",
  "move",
  "recover",
  "retrofit",
  "rollback",
  "sync",
  "update",
  "update-json",
]);

/** update-json keeps the resource id, so editing cannot change it. */
const lockedFields = (editing: string | null): FieldName[] =>
  editing ? ["id"] : [];

/** Whether a command changes state, and so needs a preview before it runs. */
export function writes(argv: string[]): boolean {
  const [head, second] = argv;
  if (!head) return false;
  if (head === "profiles") return second === "create" || second === "switch";
  if (head === "loadouts") return second === "install";
  if (head === "bench") return second === "run" || second === "scaffold";
  if (head === "git") return second === "pull" || second === "push";
  if (head === "install") return argv.includes("--execute");
  if (head === "share") return argv.includes("--out");
  if (head === "instructions") return argv.includes("--write");
  if (head === "doctor") return argv.includes("--measure");
  return writeCommands.has(head);
}

export function App({ context }: { context: Context }) {
  const { exit } = useApp();
  const size = useTerminalSize();
  const service = useMemo(() => new PreflightService(context), [context]);
  const mounted = useRef(true);
  const catalogueLoaded = useRef(false);

  const [view, setView] = useState<ViewId>("browse");
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [config, setConfig] = useState<PreflightConfig | null>(null);
  const [lock, setLock] = useState<PreflightLock | null>(null);
  const [harnesses, setHarnesses] = useState<HarnessSummary[]>([]);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [catalogue, setCatalogue] = useState<Resource[] | null>(null);
  const [catalogueErrors, setCatalogueErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>("loading");
  const [toast, setToast] = useState<Toast | null>(null);
  const [result, setResult] = useState<{ title: string; value: unknown }>({
    title: "Result",
    value: null,
  });
  const [pending, setPending] = useState<Pending | null>(null);
  const [form, setForm] = useState<{
    state: FormState;
    index: number;
    issues: Partial<Record<FieldName, string>>;
    editing: string | null;
  } | null>(null);
  const [prompt, setPrompt] = useState<{
    kind: PromptKind;
    label: string;
    value: string;
  } | null>(null);
  const [cursor, setCursor] = useState<Record<ViewId, number>>({
    browse: 0,
    catalogue: 0,
    detected: 0,
    doctor: 0,
    profiles: 0,
  });
  const [detected, setDetected] = useState<Unmanaged[] | null>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [detailOffset, setDetailOffset] = useState(0);
  const [overlayOffset, setOverlayOffset] = useState(0);

  useEffect(() => () => void (mounted.current = false), []);

  const resources = useMemo(
    () => (config ? (config.profiles[config.activeProfile]?.resources ?? []) : []),
    [config],
  );
  const profiles = useMemo(
    () => (config ? Object.keys(config.profiles).sort() : []),
    [config],
  );
  // Desired state against the last applied lockfile: has this change landed?
  const applied = useMemo(() => {
    const states = new Map<string, AppliedState>();
    for (const entry of diffResources(lock?.resources ?? [], resources))
      states.set(
        entry.resource.id,
        entry.kind === "unchanged" ? "applied" : "pending",
      );
    return states;
  }, [lock, resources]);
  const notApplied = [...applied.values()].filter(
    (state) => state === "pending",
  ).length;

  async function loadConfig() {
    try {
      setConfig(await service.store.read());
    } catch {
      setConfig(null);
    }
    try {
      const raw = await readText(service.store.lockPath);
      setLock(raw ? PreflightLockSchema.parse(JSON.parse(raw)) : null);
    } catch {
      setLock(null);
    }
  }

  async function loadAnalysis() {
    try {
      const states = await service.detect();
      if (!mounted.current) return;
      setHarnesses(states);
      setFindings(await service.doctor());
      const measured = await measureUsage(
        join(context.home, ".claude", "projects"),
        states.flatMap((state) => state.resources),
      );
      if (!mounted.current) return;
      setUsage(measured);
      setDetected(await service.unmanaged());
    } catch (error) {
      if (mounted.current)
        setToast({ text: errorText(error), tone: "danger" });
    }
  }

  useEffect(() => {
    void (async () => {
      await loadConfig();
      if (!mounted.current) return;
      setBusy(null);
      await loadAnalysis();
    })();
  }, []); // Context is fixed for the lifetime of this interface.

  // The catalogue from configured sources loads once, the first time the view is opened.
  useEffect(() => {
    if (view !== "catalogue" || catalogueLoaded.current || busy) return;
    catalogueLoaded.current = true;
    void runSearch("").then(() => {
      // A failed search must not leave the view reading as still loading.
      if (mounted.current) setCatalogue((current) => current ?? []);
    });
  }, [view, busy]);

  const visible = useMemo(() => {
    const needle = filter.toLowerCase();
    return resources.filter(
      (resource) =>
        (scopeFilter === "all" || resource.scope === scopeFilter) &&
        (typeFilter === "all" || resource.type === typeFilter) &&
        `${resource.name} ${resource.id} ${resource.type} ${resource.description} ${resource.tags.join(" ")}`
          .toLowerCase()
          .includes(needle),
    );
  }, [resources, filter, scopeFilter, typeFilter]);

  const catalogueVisible = useMemo(
    () =>
      (catalogue ?? []).filter(
        (resource) => typeFilter === "all" || resource.type === typeFilter,
      ),
    [catalogue, typeFilter],
  );

  const detectedVisible = useMemo(
    () =>
      (detected ?? []).filter(
        (entry) =>
          (typeFilter === "all" || entry.resource.type === typeFilter) &&
          `${entry.resource.name} ${entry.resource.id} ${entry.harness}`
            .toLowerCase()
            .includes(filter.toLowerCase()),
      ),
    [detected, typeFilter, filter],
  );

  const sortedFindings = useMemo(
    () =>
      [...(findings ?? [])]
        .filter((finding) =>
          `${finding.code} ${finding.message} ${finding.resourceId ?? ""}`
            .toLowerCase()
            .includes(filter.toLowerCase()),
        )
        .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]),
    [findings, filter],
  );

  const listLength =
    view === "browse"
      ? visible.length
      : view === "catalogue"
        ? catalogueVisible.length
        : view === "detected"
          ? detectedVisible.length
          : view === "doctor"
            ? sortedFindings.length
            : profiles.length;
  const index = Math.min(cursor[view], Math.max(0, listLength - 1));
  const selectedResource =
    view === "browse"
      ? visible[index]
      : view === "catalogue"
        ? catalogueVisible[index]
        : view === "detected"
          ? detectedVisible[index]?.resource
          : view === "doctor"
            ? resources.find((r) => r.id === sortedFindings[index]?.resourceId)
            : undefined;
  const selectedProfile = view === "profiles" ? profiles[index] : undefined;

  const actionState: ActionState = {
    view,
    resource: selectedResource,
    profile: selectedProfile,
    activeProfile: config?.activeProfile,
    initialized: config !== null,
    online,
  };

  function move(delta: number) {
    setCursor((current) => ({
      ...current,
      [view]: Math.max(0, Math.min(listLength - 1, (current[view] ?? 0) + delta)),
    }));
    setDetailOffset(0);
  }

  function goto(position: number) {
    setCursor((current) => ({ ...current, [view]: position }));
    setDetailOffset(0);
  }

  function absorb(argv: string[], value: unknown) {
    const command = argv[0];
    if (command === "search") {
      const found = value as { resources?: Resource[]; errors?: string[] };
      setCatalogue(found.resources ?? []);
      setCatalogueErrors(found.errors ?? []);
      goto(0);
    } else if (command === "inspect-json") {
      const inspected = value as Resource;
      setCatalogue((current) =>
        (current ?? []).map((entry) =>
          entry.id === inspected.id ? inspected : entry,
        ),
      );
    } else if (command === "doctor") {
      setFindings(value as Finding[]);
    } else if (command === "usage" || command === "prune") {
      setUsage(value as Usage);
    }
  }

  async function run(
    argv: string[],
    options: { title: string; confirm?: boolean; show?: boolean },
  ) {
    setBusy(options.title);
    setToast(null);
    const full = options.confirm ? [...argv, "--dry-run"] : argv;
    try {
      const value = await execute(full, context);
      if (!mounted.current) return;
      setResult({ title: options.title, value });
      if (options.confirm) {
        setPending({
          argv,
          title: options.title,
          result: value,
          ...(options.show ? { show: true } : {}),
        });
        setOverlay("preview");
        setOverlayOffset(0);
      } else {
        absorb(argv, value);
        if (options.show) {
          setOverlay("output");
          setOverlayOffset(0);
        }
        setToast({
          text: options.title,
          tone: "success",
          command: `preflight ${full.map((a) => truncate(a, 40)).join(" ")}`,
        });
        if (writes(argv)) {
          await loadConfig();
          void loadAnalysis();
        }
      }
    } catch (error) {
      if (!mounted.current) return;
      setResult({ title: options.title, value: { error: errorText(error) } });
      setToast({
        text: errorText(error),
        tone: "danger",
        command: `preflight ${full.map((a) => truncate(a, 40)).join(" ")}`,
      });
      if (options.confirm) setPending(null);
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  async function runSearch(query: string) {
    await run(
      [
        "search",
        query,
        ...(online ? ["--online"] : []),
        ...(typeFilter === "all" ? [] : ["--type", typeFilter]),
      ],
      { title: `Search ${query || "catalogue"}` },
    );
  }

  async function addFromCatalogue(resource: Resource) {
    setBusy(`Inspecting ${resource.id}`);
    try {
      const inspected = await execute(
        ["inspect-json", JSON.stringify(resource)],
        context,
      );
      if (!mounted.current) return;
      absorb(["inspect-json"], inspected);
      const argv = ["create-json", JSON.stringify(inspected)];
      const value = await execute([...argv, "--dry-run"], context);
      if (!mounted.current) return;
      setPending({ argv, title: `Add ${resource.id}`, result: value });
      setResult({ title: `Add ${resource.id}`, value });
      setOverlay("preview");
      setOverlayOffset(0);
    } catch (error) {
      if (mounted.current)
        setToast({ text: errorText(error), tone: "danger" });
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  function openForm(resource?: Resource) {
    setForm({
      state: resource ? fromResource(resource) : emptyForm(),
      index: resource ? 1 : 0,
      issues: {},
      editing: resource?.id ?? null,
    });
    setOverlay("form");
    setOverlayOffset(0);
  }

  async function submitForm() {
    if (!form) return;
    const previous = form.editing
      ? resources.find((r) => r.id === form.editing)
      : undefined;
    const outcome = validate(form.state, previous);
    if (!outcome.ok) {
      setForm({ ...form, issues: outcome.issues });
      setToast({ text: "Resource is not valid yet", tone: "danger" });
      return;
    }
    const argv = form.editing
      ? ["update-json", form.editing, JSON.stringify(outcome.resource)]
      : ["create-json", JSON.stringify(outcome.resource)];
    setOverlay("none");
    setForm(null);
    await run(argv, {
      title: `${form.editing ? "Update" : "Create"} ${outcome.resource.id}`,
      confirm: true,
    });
  }

  async function perform(action: Action) {
    setOverlay("none");
    if (action.intent) {
      const goto = views.find((tab) => `goto-${tab.id}` === action.intent);
      if (goto) {
        setView(goto.id);
        setDetailOffset(0);
        return;
      }
      switch (action.intent) {
        case "form-new":
          openForm();
          return;
        case "form-edit":
          if (selectedResource) openForm(selectedResource);
          return;
        case "catalogue-add":
          if (selectedResource) await addFromCatalogue(selectedResource);
          return;
        case "prompt-fork":
          setPrompt({
            kind: "fork",
            label: `Fork ${selectedResource?.id} as`,
            value: "",
          });
          return;
        case "prompt-profile":
          setPrompt({ kind: "profile", label: "New profile name", value: "" });
          return;
        case "prompt-command":
          setPrompt({ kind: "command", label: "preflight", value: "" });
          return;
        case "toggle-online":
          setOnline((value) => !value);
          return;
        case "cycle-scope":
          setScopeFilter((value) =>
            value === "all" ? "global" : value === "global" ? "project" : "all",
          );
          return;
        case "cycle-type": {
          const order: TypeFilter[] = [
            "all",
            ...(Object.keys(typeLabel) as ResourceType[]),
          ];
          setTypeFilter(
            order[(order.indexOf(typeFilter) + 1) % order.length] ?? "all",
          );
          return;
        }
        case "filter":
          setTyping(true);
          return;
        case "raw-output":
          setOverlay("output");
          setOverlayOffset(0);
          return;
        case "help":
          setOverlay("help");
          setOverlayOffset(0);
          return;
        case "refresh":
          setBusy("refreshing");
          await loadConfig();
          setBusy(null);
          await loadAnalysis();
          setToast({ text: "Reloaded", tone: "muted" });
          return;
        case "quit":
          exit();
          return;
        default:
          return;
      }
    }
    if (!action.build) return;
    await run(action.build(actionState), {
      title: action.label,
      ...(action.confirm ? { confirm: true } : {}),
      ...(action.show ? { show: true } : {}),
    });
  }

  async function submitPrompt(value: string) {
    const current = prompt;
    setPrompt(null);
    if (!current || !value.trim()) return;
    if (current.kind === "fork" && selectedResource)
      await run(["fork", selectedResource.id, value.trim()], {
        title: `Fork ${selectedResource.id}`,
        confirm: true,
      });
    else if (current.kind === "profile")
      await run(["profiles", "create", value.trim()], {
        title: `Create profile ${value.trim()}`,
        confirm: true,
      });
    else if (current.kind === "command") {
      let argv: string[];
      try {
        argv = tokenize(value);
      } catch (error) {
        setToast({ text: errorText(error), tone: "danger" });
        return;
      }
      if (!argv.length) return;
      const confirm = writes(argv) && !argv.includes("--dry-run");
      await run(argv, {
        title: value.trim(),
        ...(confirm ? { confirm: true } : {}),
      });
    }
  }

  const paletteMatches = useMemo(
    () =>
      fuzzyFilter(
        paletteQuery,
        available(actionState),
        (action) => `${action.label} ${action.cli ?? ""} ${action.id}`,
      ),
    [paletteQuery, view, selectedResource?.id, selectedProfile, config],
  );

  function handleKey(input: string, key: Key) {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }
    if (busy) return;

    if (prompt) {
      if (key.escape) setPrompt(null);
      return;
    }

    if (overlay === "palette") {
      if (key.escape) {
        setOverlay("none");
        return;
      }
      if (key.upArrow) setPaletteIndex((value) => Math.max(0, value - 1));
      if (key.downArrow)
        setPaletteIndex((value) =>
          Math.min(paletteMatches.length - 1, value + 1),
        );
      return;
    }

    if (overlay === "form" && form) {
      const field = formFields[form.index]!;
      const locked = lockedFields(form.editing);
      if (key.escape) {
        setOverlay("none");
        setForm(null);
        return;
      }
      if (key.upArrow || (key.tab && key.shift)) {
        setForm({ ...form, index: Math.max(0, form.index - 1) });
        return;
      }
      if (key.downArrow || key.tab) {
        setForm({
          ...form,
          index: Math.min(formFields.length - 1, form.index + 1),
        });
        return;
      }
      if (locked.includes(field.name)) return;
      if (key.leftArrow && field.kind !== "text") {
        setForm({ ...form, state: cycle(form.state, field, -1) });
        return;
      }
      if (key.rightArrow && field.kind !== "text") {
        setForm({ ...form, state: cycle(form.state, field, 1) });
        return;
      }
      if (input >= "1" && input <= "9" && field.kind === "multi") {
        const option = field.options?.[Number(input) - 1];
        if (option)
          setForm({ ...form, state: toggle(form.state, field, option) });
        return;
      }
      if (key.return && (field.kind !== "text" || locked.includes(field.name)))
        void submitForm();
      return;
    }

    if (overlay === "preview") {
      if (key.escape) {
        setOverlay("none");
        setPending(null);
        setToast({ text: "Cancelled", tone: "muted" });
        return;
      }
      if (key.pageDown) setOverlayOffset((value) => value + 5);
      if (key.pageUp) setOverlayOffset((value) => Math.max(0, value - 5));
      if ((key.return || input === "y") && pending) {
        const apply = pending;
        setPending(null);
        setOverlay("none");
        void run(apply.argv, {
          title: apply.title,
          ...(apply.show ? { show: true } : {}),
        });
      }
      return;
    }

    if (overlay === "help" || overlay === "output") {
      if (key.escape || input === "q" || key.return) {
        setOverlay("none");
        return;
      }
      if (key.pageDown || key.downArrow)
        setOverlayOffset((value) => value + (key.pageDown ? 10 : 1));
      if (key.pageUp || key.upArrow)
        setOverlayOffset((value) =>
          Math.max(0, value - (key.pageUp ? 10 : 1)),
        );
      return;
    }

    if (key.ctrl && input === "k") {
      setPaletteQuery("");
      setPaletteIndex(0);
      setOverlay("palette");
      return;
    }

    if (typing) {
      if (key.escape) setTyping(false);
      if (key.upArrow) move(-1);
      if (key.downArrow) move(1);
      return;
    }

    if (key.escape) {
      if (filter) setFilter("");
      return;
    }
    if (key.tab) {
      const position = views.findIndex((tab) => tab.id === view);
      const next = views[(position + (key.shift ? -1 : 1) + views.length) % views.length]!;
      setView(next.id);
      setDetailOffset(0);
      return;
    }
    if (key.upArrow || input === "k") {
      move(-1);
      return;
    }
    if (key.downArrow || input === "j") {
      move(1);
      return;
    }
    if (key.pageDown) {
      setDetailOffset((value) => value + 10);
      return;
    }
    if (key.pageUp) {
      setDetailOffset((value) => Math.max(0, value - 10));
      return;
    }
    if (input === "g") {
      goto(0);
      return;
    }
    if (input === "G") {
      goto(Math.max(0, listLength - 1));
      return;
    }
    const tab = views.find((entry) => entry.key === input);
    if (tab) {
      setView(tab.id);
      setDetailOffset(0);
      return;
    }
    if (key.return) {
      if (view === "browse" && selectedResource)
        void run(["inspect", selectedResource.id], {
          title: `Inspect ${selectedResource.id}`,
        });
      else if (view === "catalogue" && selectedResource)
        void run(["inspect-json", JSON.stringify(selectedResource)], {
          title: `Inspect ${selectedResource.id}`,
        });
      else if (view === "detected" && selectedResource)
        void run(["adopt", selectedResource.id], {
          title: `Adopt ${selectedResource.id}`,
          confirm: true,
        });
      else if (view === "doctor" && selectedResource) {
        const target = visible.findIndex((r) => r.id === selectedResource.id);
        setView("browse");
        if (target >= 0) setCursor((c) => ({ ...c, browse: target }));
      } else if (view === "profiles" && selectedProfile)
        void run(["profiles", "switch", selectedProfile], {
          title: `Switch to ${selectedProfile}`,
          confirm: true,
        });
      return;
    }
    const action = byKey(input, actionState);
    if (action) void perform(action);
  }

  // A keystroke must never take the interface down with it.
  useInput((input, key) => {
    try {
      handleKey(input, key);
    } catch (error) {
      setToast({ text: errorText(error), tone: "danger" });
    }
  });

  const width = size.columns - 2; // the frame keeps one column of padding
  const bodyHeight = Math.max(6, size.rows - 7);
  const stacked = width < 74;
  const divider = 2; // the detail pane's left border and padding
  const listWidth = stacked
    ? width
    : Math.max(28, Math.min(52, Math.floor(width * 0.42)));
  const detailWidth = stacked ? width : width - listWidth - divider;
  const listHeight = stacked
    ? Math.max(4, Math.floor(bodyHeight / 2))
    : bodyHeight;
  const detailHeight = stacked ? bodyHeight - listHeight - 1 : bodyHeight;
  const capabilities = Object.fromEntries(
    harnesses.map((harness) => [harness.id, harness.capabilities]),
  );

  function detailLines(): ReactNode[] {
    if (view === "profiles") {
      const name = selectedProfile;
      if (!name || !config) return [<Text dimColor>No profile selected</Text>];
      const profile = config.profiles[name]!;
      const lines: ReactNode[] = [
        <Text bold color={color.accent}>
          {truncate(name, detailWidth)}
        </Text>,
        <Rule width={detailWidth} />,
      ];
      if (profile.description)
        lines.push(
          <Text wrap="truncate">
            {truncate(profile.description, detailWidth)}
          </Text>,
        );
      lines.push(
        <Text dimColor wrap="truncate">
          {count(profile.resources.length, "resource")}
          {name === config.activeProfile ? "  (active)" : ""}
        </Text>,
      );
      const counts = new Map<string, number>();
      for (const resource of profile.resources)
        counts.set(resource.type, (counts.get(resource.type) ?? 0) + 1);
      lines.push(<Text> </Text>);
      for (const [type, count] of [...counts].sort())
        lines.push(
          <Text>
            <Text dimColor>{fit(type, 12)}</Text>
            <Text>{count}</Text>
          </Text>,
        );
      if (name !== config.activeProfile) {
        const changes = diffResources(
          config.profiles[config.activeProfile]?.resources ?? [],
          profile.resources,
          true,
        ).filter((entry) => entry.kind !== "unchanged");
        lines.push(<Text> </Text>);
        lines.push(
          <Text dimColor>
            {changes.length} differences from {config.activeProfile}
          </Text>,
        );
        for (const change of changes.slice(0, 20))
          lines.push(
            <Text wrap="truncate">
              <Text
                color={
                  change.kind === "add"
                    ? color.success
                    : change.kind === "remove"
                      ? color.danger
                      : color.warning
                }
              >
                {fit(change.kind, 9)}
              </Text>
              <Text>{truncate(change.resource.id, detailWidth - 10)}</Text>
            </Text>,
          );
      }
      return lines;
    }
    if (view === "doctor") {
      const finding = sortedFindings[index];
      if (!finding) return [<Text dimColor>No findings</Text>];
      const lines: ReactNode[] = [
        <Text>
          <Text bold color={severity[finding.severity].color}>
            {severity[finding.severity].glyph} {finding.severity.toUpperCase()}
          </Text>
          <Text bold> {truncate(finding.code, detailWidth - 14)}</Text>
        </Text>,
        <Rule width={detailWidth} />,
      ];
      for (const line of wrapWords(finding.message, detailWidth))
        lines.push(<Text wrap="truncate">{line}</Text>);
      if (selectedResource) {
        lines.push(<Text> </Text>);
        lines.push(
          ...resourceDetail({
            resource: selectedResource,
            findings: findings ?? [],
            capabilities,
            usage,
            applied: applied.get(selectedResource.id),
            width: detailWidth,
          }),
        );
      } else if (finding.resourceId) {
        lines.push(<Text> </Text>);
        for (const line of wrapWords(
          `${finding.resourceId} is not in the active profile`,
          detailWidth,
        ))
          lines.push(
            <Text dimColor wrap="truncate">
              {line}
            </Text>,
          );
      }
      return lines;
    }
    if (!selectedResource) {
      const [title, next] =
        config === null
          ? ["No configuration in this project", "i creates preflight.config.json"]
          : view === "catalogue"
            ? ["No catalogue result", "/ searches, O adds remote sources"]
            : view === "detected"
              ? detected === null
                ? ["Reading the harnesses…", ""]
                : [
                    "Nothing installed outside this profile",
                    "every detected resource is managed",
                  ]
            : filter || scopeFilter !== "all" || typeFilter !== "all"
              ? ["No resource matches the filter", "Esc clears it"]
              : resources.length
                ? ["No resource selected", ""]
                : ["No resource in this profile", "n creates one, 2 browses the catalogue"];
      return [
        <Text bold>{title}</Text>,
        <Text dimColor>{next}</Text>,
      ];
    }
    const lines = resourceDetail({
      resource: selectedResource,
      findings: findings ?? [],
      capabilities,
      usage,
      applied: applied.get(selectedResource.id),
      width: detailWidth,
    });
    if (view === "detected") {
      const entry = detectedVisible[index];
      if (entry)
        lines.splice(
          2,
          0,
          <Text wrap="truncate">
            <Text dimColor>{fit("found in", 10)}</Text>
            <Text>
              {entry.harness} {glyph.dot}{" "}
              {shortPath(entry.path, context.home, context.root)}
            </Text>
          </Text>,
        );
    }
    if (
      view === "catalogue" &&
      resources.some((resource) => resource.id === selectedResource.id)
    )
      lines.splice(
        2,
        0,
        <Text>
          <Text dimColor>{fit("profile", 10)}</Text>
          <Text color={color.success}>already added</Text>
        </Text>,
      );
    return lines;
  }

  function listPane() {
    if (view === "profiles")
      return (
        <SimpleList
          height={listHeight}
          selected={index}
          items={profiles.map((name) =>
            profileRow(
              name,
              config?.profiles[name]?.resources.length ?? 0,
              name === config?.activeProfile,
              name === selectedProfile,
              listWidth,
            ),
          )}
        />
      );
    if (view === "doctor")
      return sortedFindings.length ? (
        <SimpleList
          height={listHeight}
          selected={index}
          items={sortedFindings.map((finding, position) =>
            findingRow(finding, listWidth, position === index),
          )}
        />
      ) : (
        <Text dimColor>
          {findings === null ? "Running doctor…" : "No findings"}
        </Text>
      );
    const items =
      view === "browse"
        ? visible
        : view === "detected"
          ? detectedVisible.map((entry) => entry.resource)
          : catalogueVisible;
    return (
      <ResourceList
        resources={items}
        selected={index}
        height={listHeight}
        width={listWidth}
        findings={findings ?? []}
        {...(view === "browse" ? { applied } : {})}
      />
    );
  }

  function contextLine() {
    if (typing)
      return (
        <Box>
          <Text color={color.accent}>
            {view === "catalogue" ? "search" : "filter"} {glyph.selected}{" "}
          </Text>
          <TextInput
            focus
            value={view === "catalogue" ? search : filter}
            onChange={(value) =>
              view === "catalogue" ? setSearch(value) : setFilter(value)
            }
            onSubmit={(value) => {
              setTyping(false);
              if (view === "catalogue") void runSearch(value);
            }}
          />
        </Box>
      );
    const parts: string[] = [];
    if (view === "browse") {
      parts.push(`${listLength ? index + 1 : 0} of ${visible.length}`);
      if (visible.length !== resources.length)
        parts.push(`${resources.length} total`);
      if (notApplied) parts.push(`${notApplied} not applied`);
      parts.push(`scope ${scopeFilter}`);
      parts.push(`type ${typeFilter}`);
      if (filter) parts.push(`filter "${filter}"`);
    } else if (view === "catalogue") {
      parts.push(
        catalogue === null
          ? "loading the catalogue from your sources…"
          : `${listLength ? index + 1 : 0} of ${catalogueVisible.length}`,
      );
      if (search) parts.push(`query "${search}"`);
      parts.push(`sources ${online ? "configured + remote" : "configured"}`);
      parts.push(`type ${typeFilter}`);
    } else if (view === "detected") {
      parts.push(
        detected === null
          ? "reading the harnesses…"
          : `${listLength ? index + 1 : 0} of ${detectedVisible.length}`,
      );
      if (detected?.length === 0) parts.push("nothing unmanaged");
      parts.push(`type ${typeFilter}`);
      if (filter) parts.push(`filter "${filter}"`);
    } else if (view === "doctor") {
      parts.push(
        findings === null
          ? "running…"
          : count(sortedFindings.length, "finding"),
      );
      if (filter) parts.push(`filter "${filter}"`);
    } else {
      parts.push(count(profiles.length, "profile"));
      parts.push(`active ${config?.activeProfile ?? "none"}`);
    }
    return (
      <Text dimColor wrap="truncate">
        {parts.join(`  ${glyph.dot}  `)}
        {catalogueErrors.length ? `  ${glyph.dot}  ` : ""}
        {catalogueErrors.length ? (
          <Text color={color.warning}>
            {count(catalogueErrors.length, "source error")}
          </Text>
        ) : (
          ""
        )}
      </Text>
    );
  }

  function overlayPane() {
    if (overlay === "palette")
      return (
        <Box flexDirection="column">
          <Box>
            <Text color={color.accent}>{glyph.selected} </Text>
            <TextInput
              focus
              value={paletteQuery}
              onChange={(value) => {
                setPaletteQuery(value);
                setPaletteIndex(0);
              }}
              onSubmit={() => {
                const action = paletteMatches[paletteIndex];
                if (action) void perform(action);
                else setOverlay("none");
              }}
            />
          </Box>
          <Rule width={width} />
          <PaletteList
            matches={paletteMatches}
            selected={paletteIndex}
            state={actionState}
            height={bodyHeight - 2}
            width={width}
          />
        </Box>
      );
    if (overlay === "form" && form) {
      const field = formFields[form.index]!;
      return (
        <FormPane
          form={form.state}
          fields={formFields}
          index={form.index}
          issues={form.issues}
          locked={lockedFields(form.editing)}
          title={form.editing ? `EDIT ${form.editing}` : "NEW RESOURCE"}
          command={`preflight ${form.editing ? `update-json ${form.editing}` : "create-json"} … --dry-run`}
          width={width}
          height={bodyHeight}
          offset={Math.max(0, form.index + 5 - bodyHeight)}
          input={
            <TextInput
              focus={
                field.kind === "text" &&
                !lockedFields(form.editing).includes(field.name)
              }
              value={String(form.state[field.name] ?? "")}
              onChange={(value) =>
                setForm({
                  ...form,
                  state: { ...form.state, [field.name]: value },
                })
              }
              onSubmit={() => void submitForm()}
            />
          }
        />
      );
    }
    if (overlay === "preview" && pending)
      return (
        <PreviewPane
          summary={summarize(pending.result)}
          raw={jsonText(pending.result)}
          title={pending.title}
          command={`preflight ${pending.argv.map((a) => truncate(a, 40)).join(" ")}`}
          width={width}
          height={bodyHeight}
          offset={overlayOffset}
          context={context}
        />
      );
    if (overlay === "help")
      return (
        <HelpPane
          width={width}
          height={bodyHeight}
          offset={overlayOffset}
          state={actionState}
          actions={allActions}
        />
      );
    return (
      <OutputPane
        text={jsonText(result.value)}
        title={result.title}
        width={width}
        height={bodyHeight}
        offset={overlayOffset}
      />
    );
  }

  const hints: { key: string; label: string }[] =
    overlay === "preview"
      ? [
          { key: "Enter", label: "apply" },
          { key: "Esc", label: "cancel" },
          { key: "PgUp/PgDn", label: "scroll" },
        ]
      : overlay === "form"
        ? [
            { key: "↑↓", label: "field" },
            { key: "←→", label: "choose" },
            { key: "1-9", label: "toggle" },
            { key: "Enter", label: "save" },
            { key: "Esc", label: "cancel" },
          ]
        : overlay === "palette"
          ? [
              { key: "↑↓", label: "select" },
              { key: "Enter", label: "run" },
              { key: "Esc", label: "close" },
            ]
          : overlay !== "none"
            ? [
                { key: "PgUp/PgDn", label: "scroll" },
                { key: "Esc", label: "close" },
              ]
            : [
                { key: "↑↓", label: "move" },
                {
                  key: "Enter",
                  label:
                    view === "profiles"
                      ? "switch"
                      : view === "detected"
                        ? "adopt"
                        : "inspect",
                },
                { key: "^K", label: "actions" },
                { key: "?", label: "help" },
                ...available(actionState)
                  .filter(
                    (action) =>
                      action.key && action.short && action.id !== "help",
                  )
                  .map((action) => ({
                    key: action.key!,
                    label: action.short!,
                  })),
              ];

  return (
    <Box flexDirection="column" width={width + 2} paddingX={1}>
      <StatusBar
        profile={config?.activeProfile ?? "no configuration"}
        harnesses={harnesses}
        findings={findings}
        usage={
          usage
            ? !usage.sessions
              ? "usage unknown"
              : usage.skillsInstalled
                ? `${usage.skillsUsed}/${usage.skillsInstalled} skills used`
                : `${count(usage.sessions, "transcript")} read`
            : null
        }
        busy={busy}
        width={width}
      />
      <Rule width={width} />
      {overlay === "none" ? (
        <>
          <TabBar
            view={view}
            counts={{
              browse: resources.length,
              catalogue: catalogue?.length ?? null,
              doctor: findings?.length ?? null,
              profiles: profiles.length,
            }}
            width={width}
          />
          {contextLine()}
          {stacked ? (
            <Box flexDirection="column">
              <Box height={listHeight}>{listPane()}</Box>
              <Rule width={width} />
              <Box height={detailHeight}>
                <Viewport
                  lines={detailLines()}
                  height={detailHeight}
                  offset={detailOffset}
                />
              </Box>
            </Box>
          ) : (
            <Box height={bodyHeight}>
              <Box width={listWidth} flexDirection="column">
                {listPane()}
              </Box>
              <Box
                width={detailWidth + divider}
                flexDirection="column"
                borderStyle="single"
                borderTop={false}
                borderRight={false}
                borderBottom={false}
                borderDimColor
                paddingLeft={1}
              >
                <Viewport
                  lines={detailLines()}
                  height={bodyHeight}
                  offset={detailOffset}
                />
              </Box>
            </Box>
          )}
        </>
      ) : (
        <Box height={bodyHeight + 2} flexDirection="column">
          {overlayPane()}
        </Box>
      )}
      <Rule width={width} />
      {prompt ? (
        <Box>
          <Text color={color.accent}>{prompt.label} </Text>
          <TextInput
            focus
            value={prompt.value}
            onChange={(value) => setPrompt({ ...prompt, value })}
            onSubmit={(value) => void submitPrompt(value)}
          />
        </Box>
      ) : toast ? (
        <Box width={width} justifyContent="space-between">
          <Text wrap="truncate">
            <Text
              color={
                toast.tone === "success"
                  ? color.success
                  : toast.tone === "danger"
                    ? color.danger
                    : color.muted
              }
            >
              {toast.tone === "success"
                ? glyph.ok
                : toast.tone === "danger"
                  ? glyph.error
                  : glyph.dot}{" "}
            </Text>
            <Text>{truncate(toast.text, Math.floor(width * 0.6))}</Text>
          </Text>
          {toast.command && (
            <Text dimColor wrap="truncate">
              {truncate(toast.command, Math.floor(width * 0.35))}
            </Text>
          )}
        </Box>
      ) : (
        <Text dimColor wrap="truncate">
          {selectedResource
            ? `preflight ${view === "detected" ? "adopt" : "inspect"} ${selectedResource.id}`
            : "Press ? for the keyboard reference"}
        </Text>
      )}
      <HintBar hints={hints} width={width} />
    </Box>
  );
}
