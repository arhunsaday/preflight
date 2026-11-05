import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { Context } from "../adapters.js";
import type { Finding } from "../analysis.js";
import type { Resource } from "../schema.js";
import { PreflightService } from "../service.js";
import { App } from "./app.js";
import { useTerminalSize } from "./components.js";
import {
  harnessLabel,
  itemsOf,
  loadSnapshot,
  matches,
  overviewOf,
  sections,
  tabs,
  type Snapshot,
  type TabId,
} from "./dashboard-model.js";
import { shortPath, summarize, type PreviewSummary } from "./preview.js";
import { severityRank } from "./theme.js";
import { errorText, fit, truncate, wrapWords } from "./text.js";

/**
 * The palette follows the desktop app in terminal terms: petrol accent,
 * beacon orange for warnings. NO_COLOR removes every colour; glyphs and
 * words still carry the meaning.
 */
const hue = {
  accent: "#4fb3bd",
  ok: "#5ec58a",
  warn: "#f0a04a",
  bad: "#ff8f85",
} as const;
const tint = (name: keyof typeof hue) =>
  process.env["NO_COLOR"] ? undefined : hue[name];

const c = (name: keyof typeof hue) => {
  const value = tint(name);
  return value ? { color: value } : {};
};

const status = {
  error: { glyph: "✖", word: "error", tone: "bad" },
  warning: { glyph: "▲", word: "warning", tone: "warn" },
  info: { glyph: "•", word: "info", tone: "accent" },
} as const;

type Focus = "sections" | "items";
type Overlay =
  | { kind: "none" }
  | { kind: "help" }
  | { kind: "pick"; index: number }
  | { kind: "confirm"; name: string; summary: PreviewSummary | null };

const keyHints = [
  ["↑↓", "move"],
  ["Tab", "harness"],
  ["Enter", "open"],
  ["/", "filter"],
  ["p", "profile"],
  ["d", "doctor"],
  ["?", "help"],
  ["q", "quit"],
] as const;

const helpRows = [
  ["↑ ↓  j k", "Move in the focused list"],
  ["← →  h l", "Focus the sections or the items"],
  ["Tab  Shift+Tab", "Next or previous harness"],
  ["Enter", "Open a section, or preview a profile switch"],
  ["/", "Filter the items; Enter keeps it, Esc clears it"],
  ["p", "Switch profile: preview, then confirm"],
  ["d", "Run the doctor again"],
  ["m", "Manage resources (forms, catalogue, adopt)"],
  ["?  q", "This help, quit"],
] as const;

function Row({
  selected,
  children,
}: {
  selected: boolean;
  children: React.ReactNode;
}) {
  return (
    <Text wrap="truncate">
      <Text {...c("accent")} bold={selected}>
        {selected ? "▸ " : "  "}
      </Text>
      {children}
    </Text>
  );
}

function windowed<T>(items: T[], index: number, height: number) {
  const start = Math.max(
    0,
    Math.min(index - Math.floor(height / 2), items.length - height),
  );
  return { start, rows: items.slice(start, start + Math.max(1, height)) };
}

export function Dashboard({
  context,
  onManage,
}: {
  context: Context;
  onManage?: () => void;
}) {
  const { exit } = useApp();
  const size = useTerminalSize();
  const service = useMemo(() => new PreflightService(context), [context]);
  const mounted = useRef(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState(0);
  const [section, setSection] = useState(0);
  const [focus, setFocus] = useState<Focus>("sections");
  const [row, setRow] = useState(0);
  const [filter, setFilter] = useState("");
  const [typing, setTyping] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const [busy, setBusy] = useState<string | null>("Loading");
  const [toast, setToast] = useState<{ text: string; bad: boolean } | null>(
    null,
  );

  useEffect(() => () => void (mounted.current = false), []);

  async function reload(label = "Loading") {
    setBusy(label);
    try {
      const next = await loadSnapshot(service, context);
      if (mounted.current) setSnapshot(next);
      return next;
    } catch (error) {
      if (mounted.current) setToast({ text: errorText(error), bad: true });
      return null;
    } finally {
      if (mounted.current) setBusy(null);
    }
  }
  useEffect(() => {
    void reload();
  }, []); // The context is fixed for the life of the screen.

  const tabList = snapshot ? tabs(snapshot) : (["all"] as TabId[]);
  const activeTab = tabList[Math.min(tab, tabList.length - 1)] ?? "all";
  const current = sections[section]!;
  const profiles = snapshot?.config
    ? Object.keys(snapshot.config.profiles).sort()
    : [];

  // The rows of the right pane, filtered, as plain data.
  const items = useMemo(() => {
    if (!snapshot) return [];
    if (current.id === "doctor")
      return snapshot.findings
        .filter((f) => tabFinding(snapshot, activeTab, f))
        .filter((f) => matches(`${f.code} ${f.message} ${f.title ?? ""}`, filter))
        .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
    if (current.id === "profiles")
      return profiles.filter((name) => matches(name, filter));
    return itemsOf(snapshot, activeTab, current.id).filter((r) =>
      matches(`${r.name} ${r.id} ${r.description}`, filter),
    );
  }, [snapshot, activeTab, current.id, filter]);
  const hasList = current.id !== "overview" && current.id !== "usage";
  const index = Math.min(row, Math.max(0, items.length - 1));

  function go(next: { tab?: number; section?: number }) {
    if (next.tab !== undefined) setTab(next.tab);
    if (next.section !== undefined) setSection(next.section);
    setRow(0);
    setFilter("");
  }

  async function preview(name: string) {
    if (!snapshot?.config) {
      setToast({ text: "Run preflight init first", bad: true });
      return;
    }
    if (name === snapshot.config.activeProfile) {
      setToast({ text: `${name} is already active`, bad: false });
      setOverlay({ kind: "none" });
      return;
    }
    try {
      const result = await service.profileSwitch(name, true);
      setOverlay({ kind: "confirm", name, summary: summarize(result) });
    } catch (error) {
      setToast({ text: errorText(error), bad: true });
      setOverlay({ kind: "none" });
    }
  }

  async function confirm(name: string) {
    setOverlay({ kind: "none" });
    setBusy("Switching");
    try {
      await service.profileSwitch(name);
      await reload("Reloading");
      if (mounted.current) setToast({ text: `Active profile: ${name}`, bad: false });
    } catch (error) {
      if (mounted.current) setToast({ text: errorText(error), bad: true });
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  async function doctor() {
    const next = await reload("Running doctor");
    if (!next) return;
    go({ section: sections.findIndex((s) => s.id === "doctor") });
    setFocus("items");
    const bad = next.findings.filter((f) => f.severity === "error").length;
    setToast({
      text: `Doctor: ${bad} errors, ${next.findings.length - bad} other findings`,
      bad: bad > 0,
    });
  }

  useInput((input, key) => {
    if (typing) {
      if (key.return) setTyping(false);
      else if (key.escape) {
        setTyping(false);
        setFilter("");
      } else if (key.backspace || key.delete) setFilter((f) => f.slice(0, -1));
      else if (input && !key.ctrl && !key.meta && !key.tab) {
        setFilter((f) => f + input);
        setRow(0);
      }
      return;
    }
    if (overlay.kind === "help") return void setOverlay({ kind: "none" });
    if (overlay.kind === "pick") {
      if (key.escape || input === "q") setOverlay({ kind: "none" });
      else if (key.upArrow || input === "k")
        setOverlay({ kind: "pick", index: Math.max(0, overlay.index - 1) });
      else if (key.downArrow || input === "j")
        setOverlay({
          kind: "pick",
          index: Math.min(profiles.length - 1, overlay.index + 1),
        });
      else if (key.return && profiles[overlay.index])
        void preview(profiles[overlay.index]!);
      return;
    }
    if (overlay.kind === "confirm") {
      if (key.return || input === "y") void confirm(overlay.name);
      else if (key.escape || input === "n" || input === "q")
        setOverlay({ kind: "none" });
      return;
    }
    if (busy) return;
    setToast(null);
    if (input === "q") return exit();
    if (input === "?") return setOverlay({ kind: "help" });
    if (input === "d") return void doctor();
    if (input === "m" && onManage) return onManage();
    if (input === "/" && hasList) {
      setFocus("items");
      return setTyping(true);
    }
    if (input === "p") {
      const active = profiles.indexOf(snapshot?.config?.activeProfile ?? "");
      if (!snapshot?.config)
        return setToast({ text: "Run preflight init first", bad: true });
      return setOverlay({ kind: "pick", index: Math.max(0, active) });
    }
    if (key.tab) {
      const step = key.shift ? -1 : 1;
      return go({ tab: (tab + step + tabList.length) % tabList.length });
    }
    if (key.escape) {
      if (filter) return setFilter("");
      return setFocus("sections");
    }
    if (key.leftArrow || input === "h") return setFocus("sections");
    if (key.rightArrow || input === "l") return setFocus("items");
    const delta =
      key.downArrow || input === "j" ? 1 : key.upArrow || input === "k" ? -1 : 0;
    if (delta && focus === "sections")
      return go({
        section: Math.max(0, Math.min(sections.length - 1, section + delta)),
      });
    if (delta) return setRow(Math.max(0, Math.min(items.length - 1, index + delta)));
    if (input === "g") return setRow(0);
    if (input === "G") return setRow(Math.max(0, items.length - 1));
    if (key.return) {
      if (focus === "sections") return setFocus("items");
      if (current.id === "profiles" && items[index])
        return void preview(items[index] as string);
    }
  });

  const width = size.columns;
  const left = width < 60 ? 14 : 16;
  const right = width - left - 3;
  const body = size.rows - 4;
  const config = snapshot?.config;

  return (
    <Box flexDirection="column" width={width} height={size.rows}>
      <Text wrap="truncate">
        <Text {...c("accent")} bold>
          ◆ Preflight
        </Text>
        <Text dimColor>
          {" · "}
          {config ? `profile ${config.activeProfile}` : "not initialised"}
          {busy ? ` · ${busy}…` : ""}
        </Text>
      </Text>
      <Text wrap="truncate">
        {tabList.map((id, i) => (
          <Text
            key={id}
            bold={i === tab}
            {...(i === tab ? c("accent") : {})}
            dimColor={i !== tab}
            underline={i === tab}
          >
            {i === tab ? "▸" : " "}
            {id === "all" ? "All" : harnessLabel[id]}
            {"   "}
          </Text>
        ))}
      </Text>
      <Text> </Text>
      {overlay.kind !== "none" ? (
        <Box flexDirection="column" height={body} overflow="hidden">
          {overlay.kind === "help" ? (
            <Help />
          ) : overlay.kind === "pick" ? (
            <Pick
              profiles={profiles}
              active={config?.activeProfile ?? ""}
              index={overlay.index}
            />
          ) : (
            <Confirm
              from={config?.activeProfile ?? ""}
              name={overlay.name}
              summary={overlay.summary}
            />
          )}
        </Box>
      ) : (
        <Box height={body} overflow="hidden">
          <Box flexDirection="column" width={left}>
            {sections.map((entry, i) => (
              <Row key={entry.id} selected={i === section}>
                <Text
                  bold={i === section}
                  dimColor={i !== section && focus === "items"}
                >
                  {entry.label}
                </Text>
              </Row>
            ))}
          </Box>
          <Box flexDirection="column" width={width - left} paddingLeft={2}>
            {!snapshot ? (
              <Text dimColor>Loading…</Text>
            ) : current.id === "overview" ? (
              <OverviewPane snapshot={snapshot} tab={activeTab} width={right} />
            ) : current.id === "usage" ? (
              <UsagePane snapshot={snapshot} width={right} />
            ) : (
              <ListPane
                id={current.id}
                label={current.label}
                items={items}
                index={index}
                focused={focus === "items"}
                filter={filter}
                typing={typing}
                active={config?.activeProfile ?? ""}
                config={snapshot.config}
                height={body}
                width={right}
                home={context.home}
                root={context.root}
              />
            )}
          </Box>
        </Box>
      )}
      <Text wrap="truncate">
        {toast ? (
          <Text {...c(toast.bad ? "bad" : "ok")}>
            {toast.bad ? "✖ " : "✔ "}
            {toast.text}
          </Text>
        ) : (
          keyHints.map(([k, label]) => (
            <Text key={k}>
              <Text bold>{k}</Text>
              <Text dimColor> {label}  </Text>
            </Text>
          ))
        )}
      </Text>
    </Box>
  );
}

function tabFinding(snapshot: Snapshot, tab: TabId, finding: Finding) {
  if (tab === "all") return true;
  const ids = new Set(
    snapshot.harnesses.find((h) => h.id === tab)?.resources.map((r) => r.id),
  );
  return (
    (finding.resourceId ? ids.has(finding.resourceId) : false) ||
    finding.message.startsWith(`${tab}:`)
  );
}

function Label({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <Text wrap="truncate">
      <Text dimColor>{fit(name, 16)}</Text>
      {children}
    </Text>
  );
}

function OverviewPane({
  snapshot,
  tab,
  width,
}: {
  snapshot: Snapshot;
  tab: TabId;
  width: number;
}) {
  const o = overviewOf(snapshot, tab);
  const clean = o.errors + o.warnings === 0;
  return (
    <Box flexDirection="column" width={width}>
      <Text wrap="truncate">
        <Text bold>Overview</Text>
        <Text dimColor>
          {" · "}
          {tab === "all" ? "all harnesses" : harnessLabel[tab]}
        </Text>
      </Text>
      {o.counts.map((entry) => (
        <Label key={entry.section} name={entry.label}>
          <Text bold>{entry.count}</Text>
        </Label>
      ))}
      <Box flexDirection="column" marginTop={1}>
        <Label name="Active profile">
          <Text>{o.profile ?? "none (run preflight init)"}</Text>
        </Label>
        <Label name="Doctor">
          {clean ? (
            <Text {...c("ok")}>● clean</Text>
          ) : (
            <Text>
              <Text {...c("bad")}>{o.errors} {o.errors === 1 ? "error" : "errors"}</Text>
              <Text dimColor> · </Text>
              <Text {...c("warn")}>{o.warnings} {o.warnings === 1 ? "warning" : "warnings"}</Text>
              <Text dimColor> · {o.infos} info</Text>
            </Text>
          )}
        </Label>
        <Label name="Context cost">
          <Text>
            <Text bold>~{o.contextTokens.toLocaleString("en-US")}</Text>
            <Text dimColor> tokens if loaded</Text>
          </Text>
        </Label>
      </Box>
    </Box>
  );
}

function UsagePane({ snapshot, width }: { snapshot: Snapshot; width: number }) {
  const u = snapshot.usage;
  if (!u)
    return (
      <Box flexDirection="column" width={width}>
        <Text bold>Usage</Text>
        <Text dimColor>No usage data found.</Text>
      </Box>
    );
  const cost = u.costEstimate.usd.toFixed(2);
  return (
    <Box flexDirection="column" width={width}>
      <Text bold>Usage</Text>
      <Label name="Sessions">{String(u.sessions)}</Label>
      <Label name="Tokens">{u.totals.tokens.toLocaleString("en-US")}</Label>
      <Label name="Cost estimate">
        ${cost}
        {u.costEstimate.complete ? "" : " (partial)"}
      </Label>
      <Label name="Cache hits">{Math.round(u.cacheHitRate * 100)}%</Label>
      <Label name="Skills used">
        {u.skillsUsed} of {u.skillsInstalled}
      </Label>
      {u.prune.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text {...c("warn")}>▲ never called, candidates to remove</Text>
          {u.prune.slice(0, 5).map((id) => (
            <Text key={id} wrap="truncate" dimColor>
              {"  "}
              {id}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

function ListPane({
  id,
  label,
  items,
  index,
  focused,
  filter,
  typing,
  active,
  config,
  height,
  width,
  home,
  root,
}: {
  home: string;
  root: string;
  id: string;
  label: string;
  items: (Resource | Finding | string)[];
  index: number;
  focused: boolean;
  filter: string;
  typing: boolean;
  active: string;
  config: Snapshot["config"];
  height: number;
  width: number;
}) {
  const detailRows = 4;
  const view = windowed(items, index, Math.max(1, height - detailRows - 2));
  const selected = items[index];
  return (
    <Box flexDirection="column" width={width}>
      <Text wrap="truncate">
        <Text bold>{label}</Text>
        <Text dimColor> · {items.length}</Text>
        {(typing || filter) && (
          <Text {...c("accent")}>
            {"  "}/{filter}
            {typing ? "▏" : ""}
          </Text>
        )}
      </Text>
      {items.length === 0 && (
        <Text dimColor>{filter ? "Nothing matches." : "Nothing here."}</Text>
      )}
      {view.rows.map((item, i) => {
        const selectedRow = view.start + i === index;
        const marked = selectedRow && focused;
        if (typeof item === "string")
          return (
            <Row key={item} selected={marked}>
              <Text bold={selectedRow}>{fit(item, Math.max(8, width - 30))}</Text>
              {item === active ? (
                <Text {...c("ok")}>● active</Text>
              ) : (
                <Text dimColor>○ idle</Text>
              )}
              <Text dimColor>
                {"  "}
                {config?.profiles[item]?.resources.length ?? 0} resources
              </Text>
            </Row>
          );
        if ("severity" in item) {
          const s = status[item.severity];
          return (
            <Row key={`${item.code}-${view.start + i}`} selected={marked}>
              <Text {...c(s.tone)}>{fit(`${s.glyph} ${s.word}`, 10)}</Text>
              <Text bold={selectedRow}>
                {truncate(item.title ?? item.code, width - 14)}
              </Text>
            </Row>
          );
        }
        const nameWidth = Math.max(8, width - 26);
        return (
          <Row key={item.id} selected={marked}>
            <Text bold={selectedRow}>{fit(item.name, nameWidth)}</Text>
            <Text dimColor>{fit(item.scope, 9)}</Text>
            {item.enabled ? (
              <Text {...c("ok")}>● enabled</Text>
            ) : (
              <Text dimColor>○ disabled</Text>
            )}
          </Row>
        );
      })}
      <Box flexDirection="column" marginTop={1}>
        {selected !== undefined && (
          <Detail item={selected} width={width} id={id} config={config} home={home} root={root} />
        )}
      </Box>
    </Box>
  );
}

function Detail({
  item,
  width,
  id,
  config,
  home,
  root,
}: {
  item: Resource | Finding | string;
  width: number;
  id: string;
  config: Snapshot["config"];
  home: string;
  root: string;
}) {
  const lines: string[] =
    typeof item === "string"
      ? [
          config?.profiles[item]?.description || "No description.",
          id === "profiles" ? "Enter previews the switch." : "",
        ]
      : "severity" in item
        ? [item.message, ...(item.fix ? [`Fix: ${item.fix}`] : [])]
        : [item.description || "No description."];
  const text = wrapWords(lines.filter(Boolean).join(" "), width).slice(0, 2);
  const source =
    typeof item !== "string" && !("severity" in item)
      ? shortPath(item.source.replace(/^file:\/\//, ""), home, root)
      : "";
  return (
    <>
      {text.map((line, i) => (
        <Text key={i} dimColor wrap="truncate">
          {line}
        </Text>
      ))}
      {source && (
        <Text dimColor wrap="truncate-start">
          {source}
        </Text>
      )}
    </>
  );
}

function Help() {
  return (
    <Box flexDirection="column">
      <Text bold {...c("accent")}>
        Keys
      </Text>
      {helpRows.map(([k, text]) => (
        <Text key={k} wrap="truncate">
          <Text bold>{fit(k, 16)}</Text>
          <Text dimColor>{text}</Text>
        </Text>
      ))}
      <Text dimColor>Press any key to close.</Text>
    </Box>
  );
}

function Pick({
  profiles,
  active,
  index,
}: {
  profiles: string[];
  active: string;
  index: number;
}) {
  return (
    <Box flexDirection="column">
      <Text bold {...c("accent")}>
        Switch profile
      </Text>
      {profiles.map((name, i) => (
        <Row key={name} selected={i === index}>
          <Text bold={i === index}>{fit(name, 24)}</Text>
          {name === active ? (
            <Text {...c("ok")}>● active</Text>
          ) : (
            <Text dimColor>○ idle</Text>
          )}
        </Row>
      ))}
      <Text dimColor>Enter preview · Esc cancel</Text>
    </Box>
  );
}

function Confirm({
  from,
  name,
  summary,
}: {
  from: string;
  name: string;
  summary: PreviewSummary | null;
}) {
  const sign = { add: "+", remove: "−", replace: "~" } as Record<string, string>;
  return (
    <Box flexDirection="column">
      <Text bold {...c("accent")}>
        Switch profile {from} → {name}
      </Text>
      <Text dimColor>Preview only. Nothing is written yet.</Text>
      {summary?.changes.slice(0, 8).map((change) => (
        <Text key={change.id} wrap="truncate">
          {sign[change.kind] ?? "~"} {change.type}{" "}
          <Text bold>{change.name}</Text>
          <Text dimColor> ({change.kind})</Text>
        </Text>
      ))}
      {summary && summary.changes.length > 8 && (
        <Text dimColor>… and {summary.changes.length - 8} more</Text>
      )}
      {summary?.files.map((file) => (
        <Text key={file.path} wrap="truncate" dimColor>
          {file.status} {file.path} (+{file.added} −{file.removed})
        </Text>
      ))}
      {summary?.warnings.map((warning) => (
        <Text key={warning} wrap="truncate" {...c("warn")}>
          ▲ {warning}
        </Text>
      ))}
      {(!summary || summary.changes.length + summary.files.length === 0) && (
        <Text dimColor>No file changes.</Text>
      )}
      <Text>
        <Text bold>Enter</Text>
        <Text dimColor> apply · </Text>
        <Text bold>Esc</Text>
        <Text dimColor> cancel</Text>
      </Text>
    </Box>
  );
}

/** The screen `preflight ui` opens. `m` hands over to the resource manager. */
export function Root({
  context,
  classic = false,
}: {
  context: Context;
  classic?: boolean;
}) {
  const [manage, setManage] = useState(classic);
  return manage ? (
    <App context={context} />
  ) : (
    <Dashboard context={context} onManage={() => setManage(true)} />
  );
}
