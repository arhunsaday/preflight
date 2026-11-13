import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { useEffect, useRef, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { layoutTreemap, type ContextEntry } from "../../../src/context-map";
import type { ResourceType } from "../../../src/schema";
import type { Resource } from "../../../src/schema";
import { Badge, Empty } from "./ui";
import { ResourceSwitch, switchable } from "./resource-switch";
export const names: Record<ResourceType, string> = {
  skill: "Skills",
  prompt: "Prompts",
  subagent: "Agents",
  command: "Commands",
  mcp: "MCP servers",
  tool: "Tools",
  plugin: "Plugins",
  hook: "Hooks",
  statusline: "Status lines",
  instructions: "Instructions",
};
export const count = (value: number) => value.toLocaleString();
export function ContextTree({
  entries,
  selected,
  select,
  zoom,
}: {
  entries: ContextEntry[];
  selected: string;
  select: (id: string) => void;
  zoom: (type: ResourceType) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 480 });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const groups = [...new Set(entries.map((e) => e.type))].map((type) => ({
    id: type,
    value: entries
      .filter((e) => e.type === type)
      .reduce((s, e) => s + (e.tokens ?? 0), 0),
  }));
  return (
    <div
      className="context-tree"
      ref={ref}
      aria-label="Estimated context treemap"
    >
      {layoutTreemap(groups, size.width, size.height).map((group) => {
        const type = group.id as ResourceType;
        const children = entries.filter((e) => e.type === type);
        return (
          <div
            className={`context-tree-group context-color-${type}`}
            key={type}
            style={{
              left: group.x,
              top: group.y,
              width: group.width,
              height: group.height,
            }}
          >
            {group.width > 85 && group.height > 50 && (
              <button
                className="context-group-title"
                onClick={() => zoom(type)}
              >
                {names[type]}{" "}
                <span>{count(groups.find((g) => g.id === type)!.value)}</span>
              </button>
            )}
            {layoutTreemap(
              children.map((e) => ({ id: e.id, value: e.tokens ?? 0 })),
              Math.max(0, group.width - 4),
              Math.max(
                0,
                group.height - (group.height > 50 && group.width > 85 ? 30 : 4),
              ),
            ).map((tile) => {
              const entry = children.find((e) => e.id === tile.id)!;
              return (
                <button
                  key={tile.id}
                  className={`context-tile ${selected === tile.id ? "selected" : ""}`}
                  style={{
                    left: tile.x + 2,
                    top:
                      tile.y + (group.height > 50 && group.width > 85 ? 28 : 2),
                    width: tile.width,
                    height: tile.height,
                  }}
                  onClick={() => select(tile.id)}
                  aria-pressed={selected === tile.id}
                  aria-label={`${entry.name}, approximately ${entry.tokens} tokens`}
                  title={`${entry.name} · ~${count(entry.tokens!)} tokens · ${entry.scope}`}
                >
                  {tile.width > 65 && tile.height > 38 && (
                    <>
                      <strong>{entry.name}</strong>
                      <span>~{count(entry.tokens!)} tokens</span>
                      {tile.height > 75 && (
                        <small>
                          {entry.scope} ·{" "}
                          {entry.type === "skill" ? "On demand" : "If loaded"}
                        </small>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** A switch for entries that are files on disk Preflight does not manage. */
export type ContextSwitch = {
  find: (id: string) => Resource | undefined;
  busy: boolean;
  run: (args: string[]) => void;
};
export function ContextDetail({
  detail,
  toggle,
}: {
  detail: ContextEntry | undefined;
  toggle?: ContextSwitch;
}) {
  const target = detail && toggle?.find(detail.id);
  return (
    <aside className="context-detail" aria-live="polite">
      {detail ? (
        <>
          <Badge>{names[detail.type]}</Badge>
          <h3>{detail.name}</h3>
          <code>{detail.id}</code>
          <div className="context-detail-total">
            {detail.tokens === null ? "Unknown" : `~${count(detail.tokens)}`}
            <span>
              {detail.tokens === null
                ? "Runtime contribution"
                : "Estimated tokens in this scenario"}
            </span>
          </div>
          <p>{detail.reason}</p>
          {target && switchable(target) && toggle && (
            <ResourceSwitch
              resource={target}
              disabled={toggle.busy}
              onChange={toggle.run}
            />
          )}
          <dl>
            <dt>Skill catalogue</dt>
            <dd>~{count(detail.catalogueTokens)} tokens</dd>
            <dt>Available body</dt>
            <dd>
              {detail.bodyTokens === null
                ? "Not measured"
                : `~${count(detail.bodyTokens)} tokens`}
            </dd>
            <dt>Scope</dt>
            <dd>{detail.scope}</dd>
            <dt>Agents</dt>
            <dd>{detail.harnesses.join(", ")}</dd>
            <dt>Status</dt>
            <dd>
              {detail.enabled ? "Enabled (not proof of loading)" : "Disabled"}
            </dd>
            <dt>Source</dt>
            <dd>{detail.source}</dd>
          </dl>
          <h4>What to review</h4>
          <p>
            {detail.type === "mcp"
              ? "Use MCP verification to inspect the server's actual tools. Long tool schemas and large responses can add context independently of this configuration."
              : "Check repeated instructions and narrow trigger descriptions. Keep large reference material separate from the entry instructions and load it when needed."}
          </p>
        </>
      ) : (
        <>
          <MapIcon size={26} />
          <h3>Pick a resource</h3>
          <p>
            Select a block or list row to see its estimate, scope and loading
            assumptions.
          </p>
          <h4>Read the map</h4>
          <p>
            Area represents the estimated share of sized content in your
            selection. Click a category heading to zoom; use the list for tiny
            blocks.
          </p>
        </>
      )}
    </aside>
  );
}
export function ContextList({
  entries,
  selected,
  select,
  total,
  toggle,
}: {
  entries: ContextEntry[];
  selected: string;
  select: (id: string) => void;
  total: number;
  toggle?: ContextSwitch;
}) {
  return (
    <div className="context-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Resource</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Estimated tokens</TableHead>
            <TableHead>Share of sized content</TableHead>
            {toggle && <TableHead>Switch</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.id}>
              <TableCell>
                <button
                  onClick={() => select(e.id)}
                  aria-pressed={selected === e.id}
                >
                  {e.name}
                  <small>{names[e.type]}</small>
                </button>
              </TableCell>
              <TableCell>{e.scope}</TableCell>
              <TableCell>
                {!e.enabled
                  ? "Disabled"
                  : e.tokens === null
                    ? "Unknown"
                    : `~${count(e.tokens)}`}
              </TableCell>
              <TableCell>
                {e.tokens && total
                  ? `${((e.tokens / total) * 100).toFixed(1)}%`
                  : "—"}
              </TableCell>
              {toggle && (
                <TableCell>
                  {(() => {
                    const target = toggle.find(e.id);
                    return target && switchable(target) ? (
                      <ResourceSwitch
                        resource={target}
                        disabled={toggle.busy}
                        onChange={toggle.run}
                      />
                    ) : (
                      "—"
                    );
                  })()}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!entries.length && (
        <Empty
          title="No matching resources"
          description="Reset the filters or add instructions to this workspace."
        />
      )}
    </div>
  );
}
