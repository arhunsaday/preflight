import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { join } from "node:path";
import type { ReactNode } from "react";
import { execute } from "../commands.js";
import { AdkService } from "../service.js";
import { measureUsage, type Finding, type Usage } from "../analysis.js";
import type { Context } from "../adapters.js";
import type { AdkConfig, Resource, ResourceType } from "../schema.js";
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
  tokenize,
  truncate,
  wrapWords,
} from "./text.js";
import { summarize } from "./preview.js";
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
}

const count = (total: number, noun: string) =>
  `${total} ${noun}${total === 1 ? "" : "s"}`;

interface Toast {
  text: string;
  tone: "success" | "danger" | "muted";
  command?: string;
}

const mutating = new Set([
  "init",
  "create",
  "create-json",
  "update",
  "update-json",
  "delete",
  "fork",
  "move",
  "sync",
  "apply",
  "rollback",
  "recover",
  "retrofit",
  "install",
  "profiles",
  "loadouts",
]);

export function App({ context }: { context: Context }) {
  const { exit } = useApp();
  const size = useTerminalSize();
  const service = useMemo(() => new AdkService(context), [context]);
  const mounted = useRef(true);

  const [view, setView] = useState<ViewId>("browse");
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [config, setConfig] = useState<AdkConfig | null>(null);
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
    doctor: 0,
    profiles: 0,
  });
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

  async function loadConfig() {
    try {
      setConfig(await service.store.read());
    } catch {
      setConfig(null);
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
      if (mounted.current) setUsage(measured);
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
        : view === "doctor"
          ? sortedFindings.length
          : profiles.length;
  const index = Math.min(cursor[view], Math.max(0, listLength - 1));
  const selectedResource =
    view === "browse"
      ? visible[index]
      : view === "catalogue"
        ? catalogueVisible[index]
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
    options: { title: string; confirm?: boolean },
  ) {
    setBusy(options.title);
    setToast(null);
    const full = options.confirm ? [...argv, "--dry-run"] : argv;
    try {
      const value = await execute(full, context);
      if (!mounted.current) return;
      setResult({ title: options.title, value });
      if (options.confirm) {
        setPending({ argv, title: options.title, result: value });
        setOverlay("preview");
        setOverlayOffset(0);
      } else {
        absorb(argv, value);
        setToast({
          text: options.title,
          tone: "success",
          command: `adk ${full.map((a) => truncate(a, 40)).join(" ")}`,
        });
        if (mutating.has(argv[0] ?? "")) {
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
        command: `adk ${full.map((a) => truncate(a, 40)).join(" ")}`,
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
          setPrompt({ kind: "command", label: "adk", value: "" });
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
      const confirm =
        mutating.has(argv[0] ?? "") && !argv.includes("--dry-run");
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

  useInput((input, key) => {
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
      if (key.leftArrow && field.kind !== "text") {
        setForm({ ...form, state: cycle(form.state, field, -1) });
        return;
      }
      if (key.rightArrow && field.kind !== "text") {
        setForm({ ...form, state: cycle(form.state, field, 1) });
        return;
      }
      if (input === " " && field.kind === "multi") {
        const option = field.options?.[0];
        if (option)
          setForm({ ...form, state: toggle(form.state, field, option) });
        return;
      }
      if (input >= "1" && input <= "9" && field.kind === "multi") {
        const option = field.options?.[Number(input) - 1];
        if (option)
          setForm({ ...form, state: toggle(form.state, field, option) });
        return;
      }
      if (key.return && field.kind !== "text") void submitForm();
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
        void run(apply.argv, { title: apply.title });
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
        lines.push(<Text>{truncate(profile.description, detailWidth)}</Text>);
      lines.push(
        <Text dimColor>
          {profile.resources.length} resources
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
            width: detailWidth,
          }),
        );
      } else if (finding.resourceId) {
        lines.push(<Text> </Text>);
        lines.push(
          <Text dimColor>
            {finding.resourceId} is not in the active profile
          </Text>,
        );
      }
      return lines;
    }
    if (!selectedResource)
      return [
        <Text dimColor>
          {config === null
            ? "No configuration in this project"
            : view === "catalogue"
              ? "Search the catalogue to see results"
              : "No resource selected"}
        </Text>,
      ];
    return resourceDetail({
      resource: selectedResource,
      findings: findings ?? [],
      capabilities,
      width: detailWidth,
    });
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
    const items = view === "browse" ? visible : catalogueVisible;
    return (
      <ResourceList
        resources={items}
        selected={index}
        height={listHeight}
        width={listWidth}
        findings={findings ?? []}
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
      parts.push(`scope ${scopeFilter}`);
      parts.push(`type ${typeFilter}`);
      if (filter) parts.push(`filter "${filter}"`);
    } else if (view === "catalogue") {
      parts.push(
        catalogue === null
          ? "press / to search"
          : `${listLength ? index + 1 : 0} of ${catalogueVisible.length}`,
      );
      if (search) parts.push(`query "${search}"`);
      parts.push(`sources ${online ? "bundled + remote" : "bundled"}`);
      parts.push(`type ${typeFilter}`);
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
          title={form.editing ? `EDIT ${form.editing}` : "NEW RESOURCE"}
          command={`adk ${form.editing ? `update-json ${form.editing}` : "create-json"} … --dry-run`}
          width={width}
          height={bodyHeight}
          offset={0}
          input={
            <TextInput
              focus={field.kind === "text"}
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
          command={`adk ${pending.argv.map((a) => truncate(a, 40)).join(" ")}`}
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
                  label: view === "profiles" ? "switch" : "inspect",
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
            ? usage.sessions
              ? `${usage.skillsUsed}/${usage.skillsInstalled} skills used`
              : "usage unknown"
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
            ? `adk inspect ${selectedResource.id}`
            : "Press ? for the keyboard reference"}
        </Text>
      )}
      <HintBar hints={hints} width={width} />
    </Box>
  );
}
