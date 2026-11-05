import { useState } from "react";
import { ArrowLeft, List, Map as MapIcon, RotateCcw } from "lucide-react";
import { buildContextReport, contextResources } from "../../../src/context-map";
import type { HarnessId, ResourceType, Scope } from "../../../src/schema";
import { type Workspace } from "../workspace";
import {
  ContextTree,
  ContextDetail,
  ContextList,
  names,
  count,
} from "../components/context-tree";
import { Badge, Button, Empty } from "../components/ui";
export function ContextMap({ workspace: w }: { workspace: Workspace }) {
  const [mode, setMode] = useState<"potential" | "catalogue">("potential");
  const [harness, setHarness] = useState("all"),
    [scope, setScope] = useState("all"),
    [query, setQuery] = useState(""),
    [type, setType] = useState<ResourceType | null>(null),
    [selected, setSelected] = useState(""),
    [display, setDisplay] = useState("map"),
    [disabled, setDisabled] = useState(false);
  // Files on disk that Preflight does not manage can be switched here;
  // the ones it manages are changed in Resources, so the lock stays true.
  const switchable = [
    ...(w.snapshot?.detected ?? []),
    ...(w.snapshot?.disabled ?? []),
  ];
  const resources = [
    ...contextResources(
      w.snapshot?.detected ?? [],
      w.snapshot?.inherited ?? [],
      w.snapshot?.resources ?? [],
    ),
    ...(w.snapshot?.disabled ?? []),
  ];
  const toggle = {
    find: (id: string) => switchable.find((r) => r.id === id),
    busy: !!w.busy,
    run: (args: string[]) => void w.run(args),
  };
  const report = buildContextReport(resources, {
    mode,
    ...(harness === "all" ? {} : { harness: harness as HarnessId }),
    ...(scope === "all" ? {} : { scope: scope as Scope }),
  });
  const entries = report.entries.filter(
    (e) =>
      (disabled || e.enabled) &&
      (!type || e.type === type) &&
      `${e.name} ${e.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  const known = entries.filter((e) => (e.tokens ?? 0) > 0);
  const total = known.reduce((s, e) => s + e.tokens!, 0);
  const detail = entries.find((e) => e.id === selected);
  const unmeasured = entries.filter(
    (e) =>
      e.enabled &&
      (e.tokens === null ||
        ["mcp", "tool", "plugin", "hook", "statusline"].includes(e.type)),
  );
  return (
    <div className="page-scroll context-page">
      <div className="section-intro">
        <div>
          <h2>See the weight of your setup</h2>
          <p>
            Explore available instructions by size. This is a local estimate,
            not a live session monitor.
          </p>
        </div>
      </div>
      <div className="context-controls">
        <label>
          Scenario
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="potential">All available bodies if loaded</option>
            <option value="catalogue">Skill catalogue only</option>
          </select>
        </label>
        <label>
          Agent
          <select value={harness} onChange={(e) => setHarness(e.target.value)}>
            <option value="all">All agents (deduplicated)</option>
            <option value="claude-code">Claude Code</option>
            <option value="cursor">Cursor</option>
            <option value="codex">Codex</option>
          </select>
        </label>
        <label>
          Scope
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Global + project</option>
            <option value="global">Global</option>
            <option value="project">Project</option>
          </select>
        </label>
        <label>
          Find a resource
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or resource ID"
          />
        </label>
      </div>
      <div className="context-summary">
        <div>
          <strong>~{count(total)}</strong> estimated tokens{" "}
          <span>in {known.length} sized resources</span>
        </div>
        <span>
          {unmeasured.length} unmeasured ·{" "}
          {entries.filter((e) => !e.enabled).length} disabled shown
        </span>
      </div>
      <p className="context-method">
        Characters ÷ 4, rounded up per contribution. Skills load on demand;
        agents and commands may never be loaded together. MCP tool schemas, tool
        responses, conversation history and agent system prompts are not
        included. No MCP server is started.
      </p>
      <div className="context-map-toolbar">
        <div className="context-breadcrumb">
          <Button
            variant="ghost"
            onClick={() => {
              setType(null);
              setSelected("");
            }}
          >
            <ArrowLeft size={14} />
            All resources
          </Button>
          {type && <span>/ {names[type]}</span>}
        </div>
        <div>
          <label className="context-disabled">
            <input
              type="checkbox"
              checked={disabled}
              onChange={(e) => setDisabled(e.target.checked)}
            />
            Show disabled
          </label>
          <Button
            aria-pressed={display === "map"}
            onClick={() => setDisplay("map")}
          >
            <MapIcon size={15} />
            Map
          </Button>
          <Button
            aria-pressed={display === "list"}
            onClick={() => setDisplay("list")}
          >
            <List size={15} />
            List
          </Button>
          <Button
            aria-label="Reset context filters"
            onClick={() => {
              setMode("potential");
              setHarness("all");
              setScope("all");
              setQuery("");
              setType(null);
              setSelected("");
              setDisabled(false);
            }}
          >
            <RotateCcw size={15} />
          </Button>
        </div>
      </div>
      <div className="context-explorer">
        <div className="context-main">
          {display === "map" ? (
            known.length ? (
              <ContextTree
                entries={known}
                selected={selected}
                select={setSelected}
                zoom={setType}
              />
            ) : (
              <Empty
                title="No sized content in this selection"
                description="Try another scenario or filter. Unmeasured resources are listed below; unknown does not mean zero."
              />
            )
          ) : (
            <ContextList
              entries={entries}
              selected={selected}
              select={setSelected}
              total={total}
              toggle={toggle}
            />
          )}
          <div className="context-legend">
            {[...new Set(known.map((e) => e.type))].map((t) => (
              <button key={t} onClick={() => setType(t)}>
                <i className={`context-color-${t}`} />
                {names[t]}
              </button>
            ))}
          </div>
          {unmeasured.length > 0 && (
            <div className="context-unknown">
              <h3>Not measured</h3>
              <p>
                These resources may add context at runtime. They have no
                invented area in the map.
              </p>
              {unmeasured.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelected(e.id)}
                  aria-pressed={selected === e.id}
                >
                  <strong>{e.name}</strong>
                  <span>
                    {names[e.type]} · {e.scope}
                  </span>
                  <Badge>Unknown</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
        <ContextDetail detail={detail} toggle={toggle} />
      </div>
    </div>
  );
}
