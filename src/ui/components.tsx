import React, { useEffect, useState } from "react";
import { Box, Text, useStdout } from "ink";
import type { ReactNode } from "react";
import type { Finding, Usage } from "../analysis.js";
import type { Resource, ResourceType } from "../schema.js";
import { frontmatter } from "../adapters.js";
import {
  color,
  diffColor,
  diffGlyph,
  glyph,
  scopeColor,
  severity,
  typeColor,
  typeLabel,
} from "./theme.js";
import {
  count,
  fit,
  outputLines,
  truncate,
  truncateStart,
  wrapWords,
} from "./text.js";
import type { PreviewSummary } from "./preview.js";
import { shortPath } from "./preview.js";
import type { Action, ActionState, ViewId } from "./actions.js";
import { commandLine, referenceState, views } from "./actions.js";
import type { FieldName, FormField, FormState } from "./form.js";
import { displayValue } from "./form.js";

export function useTerminalSize() {
  const { stdout } = useStdout();
  const read = () => ({
    columns: Math.max(40, stdout?.columns ?? 80),
    rows: Math.max(14, stdout?.rows ?? 30),
  });
  const [size, setSize] = useState(read);
  useEffect(() => {
    if (!stdout?.on) return;
    const onResize = () => setSize(read());
    stdout.on("resize", onResize);
    return () => {
      stdout.off?.("resize", onResize);
    };
  }, [stdout]);
  return size;
}

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label }: { label?: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setFrame((value) => (value + 1) % frames.length),
      90,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <Text color={color.accent}>
      {frames[frame]}
      {label ? ` ${label}` : ""}
    </Text>
  );
}

export function Rule({ width }: { width: number }) {
  return (
    <Text dimColor>{"─".repeat(Math.max(0, width))}</Text>
  );
}

export function Viewport({
  lines,
  height,
  offset,
}: {
  lines: ReactNode[];
  height: number;
  offset: number;
}) {
  const overflow = lines.length > height;
  const body = overflow ? height - 1 : height;
  const start = Math.max(0, Math.min(offset, lines.length - body));
  const visible = lines.slice(start, start + body);
  return (
    <Box flexDirection="column">
      {visible.map((line, index) => (
        <Box key={start + index} height={1} flexShrink={0} overflow="hidden">
          {line}
        </Box>
      ))}
      {!overflow &&
        Array.from({ length: Math.max(0, body - visible.length) }, (_, i) => (
          <Box key={`pad-${i}`}>
            <Text> </Text>
          </Box>
        ))}
      {overflow && (
        <Text dimColor>
          {start > 0 ? glyph.scrollUp : " "}
          {start + body < lines.length ? glyph.scrollDown : " "}{" "}
          {start + 1}–{Math.min(lines.length, start + body)} of {lines.length}
        </Text>
      )}
    </Box>
  );
}

export interface HarnessSummary {
  id: string;
  detected: boolean;
  capabilities: ResourceType[];
  issues: string[];
  error?: string | undefined;
}

export function StatusBar({
  profile,
  harnesses,
  findings,
  usage,
  busy,
  width,
}: {
  profile: string;
  harnesses: HarnessSummary[];
  findings: Finding[] | null;
  usage: string | null;
  busy: string | null;
  width: number;
}) {
  const errors = findings?.filter((f) => f.severity === "error").length ?? 0;
  const warnings = findings?.filter((f) => f.severity === "warning").length ?? 0;
  const compact = width < 72;
  return (
    <Box width={width} justifyContent="space-between">
      <Box flexShrink={1}>
        <Text wrap="truncate">
          <Text bold color={color.accent}>
            ADK{" "}
          </Text>
          <Text dimColor>{glyph.dot} </Text>
          <Text>{truncate(profile, compact ? 16 : 28)}</Text>
          <Text dimColor> {glyph.dot} </Text>
          {harnesses.map((harness) => (
            <Text key={harness.id}>
              <Text
                color={
                  harness.error
                    ? color.danger
                    : harness.detected
                      ? color.success
                      : color.muted
                }
              >
                {harness.error
                  ? glyph.error
                  : harness.detected
                    ? glyph.on
                    : glyph.off}
              </Text>
              <Text dimColor>{compact ? "" : ` ${harness.id}`} </Text>
            </Text>
          ))}
        </Text>
      </Box>
      <Box flexShrink={0}>
        {busy ? (
          <Spinner {...(compact ? {} : { label: busy })} />
        ) : (
          <Text wrap="truncate">
            {usage && !compact ? <Text dimColor>{usage} </Text> : <Text />}
            {findings === null ? (
              <Text dimColor>doctor pending</Text>
            ) : (
              <Text>
                <Text color={errors ? color.danger : color.muted}>
                  {severity.error.glyph} {errors}
                </Text>
                <Text dimColor> </Text>
                <Text color={warnings ? color.warning : color.muted}>
                  {severity.warning.glyph} {warnings}
                </Text>
              </Text>
            )}
          </Text>
        )}
      </Box>
    </Box>
  );
}

export function TabBar({
  view,
  counts,
  width,
}: {
  view: ViewId;
  counts: Partial<Record<ViewId, number | null>>;
  width: number;
}) {
  const compact = width < 84;
  return (
    <Box width={width}>
      <Text wrap="truncate">
        {views.map((tab) => {
          const active = tab.id === view;
          const count = counts[tab.id];
          return (
            <Text
              key={tab.id}
              {...(active ? { color: color.accent } : {})}
              bold={active}
              dimColor={!active}
            >
              {active ? glyph.selected : " "} {tab.key} {tab.label}
              {compact || count === null || count === undefined
                ? ""
                : ` ${count}`}
              {compact ? " " : "   "}
            </Text>
          );
        })}
      </Text>
    </Box>
  );
}

function scopeMarker(resource: Resource, width: number) {
  if (width >= 7) return resource.scope === "global" ? "global" : "project";
  return resource.scope === "global" ? "G" : "P";
}

interface Cell {
  text: string;
  color?: string;
  dim?: boolean;
}

export function ResourceList({
  resources,
  selected,
  height,
  width = 46,
  findings = [],
  applied,
}: {
  resources: Resource[];
  selected: number;
  height: number;
  width?: number;
  findings?: Finding[];
  applied?: Map<string, "applied" | "pending">;
}) {
  const start = Math.max(
    0,
    Math.min(selected - Math.floor(height / 2), resources.length - height),
  );
  const scopeWidth = width >= 44 ? 7 : 1;
  const nameWidth = Math.max(6, width - (applied ? 14 : 12) - scopeWidth);
  const flagged = new Set(
    findings
      .filter((f) => f.severity !== "info" && f.resourceId)
      .map((f) => f.resourceId!),
  );
  return (
    <Box flexDirection="column">
      {resources.slice(start, start + height).map((resource, index) => {
        const position = start + index;
        const active = position === selected;
        const cells: Cell[] = [
          { text: active ? `${glyph.selected} ` : "  " },
          { text: fit(typeLabel[resource.type], 6), color: typeColor[resource.type] },
          { text: " " },
          { text: fit(resource.name, nameWidth), dim: !resource.enabled },
          { text: " " },
          {
            text: fit(scopeMarker(resource, scopeWidth), scopeWidth),
            color: scopeColor[resource.scope],
            dim: true,
          },
          { text: " " },
          ...(applied
            ? [
                {
                  text:
                    applied.get(resource.id) === "applied"
                      ? glyph.on
                      : glyph.off,
                  color:
                    applied.get(resource.id) === "applied"
                      ? color.success
                      : color.warning,
                },
                { text: " " },
              ]
            : []),
          {
            text: flagged.has(resource.id) ? severity.warning.glyph : " ",
            color: color.warning,
          },
        ];
        if (active)
          return (
            <Text key={resource.id} inverse bold wrap="truncate">
              {cells.map((cell) => cell.text).join("")}
            </Text>
          );
        return (
          <Text key={resource.id} wrap="truncate">
            {cells.map((cell, position) => (
              <Text
                key={position}
                {...(cell.color ? { color: cell.color } : {})}
                {...(cell.dim ? { dimColor: true } : {})}
              >
                {cell.text}
              </Text>
            ))}
          </Text>
        );
      })}
      {!resources.length && <Text dimColor>No matching resources</Text>}
    </Box>
  );
}

export function SimpleList({
  items,
  selected,
  height,
}: {
  items: ReactNode[];
  selected: number;
  height: number;
}) {
  const start = Math.max(
    0,
    Math.min(selected - Math.floor(height / 2), items.length - height),
  );
  return (
    <Box flexDirection="column">
      {items.slice(start, start + height).map((item, index) => (
        <Box key={start + index}>{item}</Box>
      ))}
    </Box>
  );
}

export function Field({
  label,
  children,
  width = 10,
}: {
  label: string;
  children: ReactNode;
  width?: number;
}) {
  return (
    <Text wrap="truncate">
      <Text dimColor>{fit(label, width)}</Text>
      {children}
    </Text>
  );
}

const reference = /\$\{[A-Z][A-Z0-9_]*\}/;

export function configLines(
  value: unknown,
  prefix = "",
): { key: string; value: string; reference: boolean }[] {
  if (value === null || typeof value !== "object")
    return [
      {
        key: prefix,
        value: String(value),
        reference: typeof value === "string" && reference.test(value),
      },
    ];
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item !== "object" || item === null))
      return [
        { key: prefix, value: value.map(String).join(" "), reference: false },
      ];
    return value.flatMap((item, index) =>
      configLines(item, `${prefix}[${index}]`),
    );
  }
  return Object.entries(value).flatMap(([key, nested]) =>
    configLines(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function harnessSupport(
  resource: Resource,
  capabilities: Record<string, ResourceType[]>,
) {
  return resource.harnesses.map((id) => ({
    id,
    supported: (capabilities[id] ?? []).includes(resource.type),
  }));
}

/**
 * Observed invocations for a resource, or null when nothing was measured.
 * Skills are counted the way the usage command counts them; MCP servers are
 * counted from the `mcp__<server>__<tool>` names harnesses record.
 */
export function observed(resource: Resource, usage: Usage | null) {
  if (!usage?.sessions) return null;
  const names = new Set([resource.id]);
  if (resource.type === "skill") names.add(`skill:${resource.name}`);
  const prefix = `mcp__${resource.name}__`;
  let total = 0;
  for (const [name, invocations] of Object.entries(usage.invocations))
    if (
      names.has(name) ||
      (resource.type === "mcp" && name.startsWith(prefix))
    )
      total += invocations;
  return total;
}

export function resourceDetail({
  resource,
  findings,
  capabilities,
  usage = null,
  applied,
  width,
}: {
  resource: Resource;
  findings: Finding[];
  capabilities: Record<string, ResourceType[]>;
  usage?: Usage | null;
  applied?: "applied" | "pending" | undefined;
  width: number;
}): ReactNode[] {
  const lines: ReactNode[] = [];
  const labelWidth = 10;
  lines.push(
    <Text wrap="truncate">
      <Text bold color={typeColor[resource.type]}>
        {typeLabel[resource.type].toUpperCase()}
      </Text>
      <Text bold> {truncate(resource.name, width - 10)}</Text>
    </Text>,
  );
  lines.push(<Rule width={width} />);
  lines.push(
    <Field label="id" width={labelWidth}>
      <Text>{truncate(resource.id, width - labelWidth)}</Text>
    </Field>,
  );
  lines.push(
    <Field label="scope" width={labelWidth}>
      <Text color={scopeColor[resource.scope]}>{resource.scope}</Text>
      {!resource.enabled && <Text color={color.muted}> (disabled)</Text>}
    </Field>,
  );
  if (applied)
    lines.push(
      <Field label="applied" width={labelWidth}>
        <Text color={applied === "applied" ? color.success : color.warning}>
          {applied === "applied"
            ? "written to the harness files"
            : "not yet written; y reconciles"}
        </Text>
      </Field>,
    );
  lines.push(
    <Field label="harnesses" width={labelWidth}>
      <Text>
        {harnessSupport(resource, capabilities).map((entry) => (
          <Text key={entry.id}>
            <Text color={entry.supported ? color.success : color.muted}>
              {entry.supported ? glyph.ok : glyph.error}
            </Text>
            <Text dimColor={!entry.supported}> {entry.id}  </Text>
          </Text>
        ))}
      </Text>
    </Field>,
  );
  const invocations = observed(resource, usage);
  if (invocations !== null)
    lines.push(
      <Field label="observed" width={labelWidth}>
        <Text color={invocations ? color.success : color.warning}>
          {invocations
            ? count(invocations, "invocation")
            : `never, across ${count(usage!.sessions, "transcript")}`}
        </Text>
      </Field>,
    );
  lines.push(
    <Field label="source" width={labelWidth}>
      <Text>{truncate(resource.source, width - labelWidth)}</Text>
    </Field>,
  );
  if (resource.tags.length)
    lines.push(
      <Field label="tags" width={labelWidth}>
        <Text dimColor>
          {truncate(resource.tags.join(", "), width - labelWidth)}
        </Text>
      </Field>,
    );
  if (resource.updatedAt)
    lines.push(
      <Field label="updated" width={labelWidth}>
        <Text dimColor>{resource.updatedAt}</Text>
      </Field>,
    );
  if (resource.description) {
    lines.push(<Text> </Text>);
    for (const line of wrapWords(resource.description, width).slice(0, 6))
      lines.push(<Text wrap="truncate">{line}</Text>);
  }

  let tools: unknown =
    (resource.config as Record<string, unknown>)["allowed-tools"] ??
    (resource.config as Record<string, unknown>)["allowedTools"];
  if (!tools && resource.content) {
    try {
      const meta = frontmatter(resource.content);
      tools = meta["allowed-tools"] ?? meta["allowedTools"];
    } catch {
      tools = undefined;
    }
  }
  if (tools) {
    lines.push(<Text> </Text>);
    lines.push(
      <Field label="tools" width={labelWidth}>
        <Text color={color.warning}>
          {truncate(
            Array.isArray(tools) ? tools.map(String).join(", ") : String(tools),
            width - labelWidth,
          )}
        </Text>
      </Field>,
    );
  }

  const config = configLines(resource.config);
  if (config.length) {
    lines.push(<Text> </Text>);
    lines.push(<Text dimColor>config</Text>);
    const valueWidth = Math.max(8, width - 19);
    for (const entry of config.slice(0, 20))
      wrapWords(entry.value, valueWidth)
        .slice(0, 3)
        .forEach((line, position) =>
          lines.push(
            <Text wrap="truncate">
              <Text dimColor> {fit(position ? "" : entry.key, 16)} </Text>
              <Text {...(entry.reference ? { color: color.warning } : {})}>
                {line}
              </Text>
            </Text>,
          ),
        );
    if (config.length > 20)
      lines.push(<Text dimColor> … {config.length - 20} more</Text>);
  }

  if (resource.content) {
    // Only the visible head is wrapped: content can be tens of thousands of
    // characters and this runs on every keystroke.
    const source = resource.content.split("\n");
    const preview = outputLines(source.slice(0, 40).join("\n"), width - 2);
    lines.push(<Text> </Text>);
    lines.push(
      <Text dimColor wrap="truncate">
        content {glyph.dot} {count(source.length, "line")} {glyph.dot} ~
        {Math.ceil(resource.content.length / 4)} tokens
      </Text>,
    );
    for (const line of preview.slice(0, 40))
      lines.push(
        <Text dimColor wrap="truncate">
          {" "}
          {line}
        </Text>,
      );
    if (source.length > 40)
      lines.push(
        <Text dimColor wrap="truncate">
          {" "}
          … {count(source.length - 40, "more line")}
        </Text>,
      );
  }

  const related = findings.filter((f) => f.resourceId === resource.id);
  if (related.length) {
    lines.push(<Text> </Text>);
    lines.push(<Text dimColor>findings</Text>);
    for (const finding of related)
      lines.push(
        <Text wrap="truncate">
          <Text color={severity[finding.severity].color}>
            {" "}
            {severity[finding.severity].glyph}{" "}
          </Text>
          <Text>{truncate(finding.message, width - 4)}</Text>
        </Text>,
      );
  }
  return lines;
}

export function findingRow(finding: Finding, width: number, active: boolean) {
  const subject = Math.max(8, width - 23);
  // The identifier says which resource; the message repeats across findings.
  const detail = finding.resourceId
    ? truncateStart(finding.resourceId, subject)
    : truncate(finding.message, subject);
  if (active)
    return (
      <Text inverse bold wrap="truncate">
        {fit(
          `${severity[finding.severity].glyph} ${fit(finding.code, 20)} ${detail}`,
          width,
        )}
      </Text>
    );
  return (
    <Text wrap="truncate">
      <Text color={severity[finding.severity].color}>
        {severity[finding.severity].glyph}{" "}
      </Text>
      <Text dimColor>{fit(finding.code, 20)}</Text>
      <Text> {detail}</Text>
    </Text>
  );
}

export function profileRow(
  name: string,
  count: number,
  active: boolean,
  selected: boolean,
  width: number,
) {
  const text = `${active ? glyph.on : glyph.off} ${fit(name, 24)} ${count} resources`;
  if (selected)
    return (
      <Text inverse bold wrap="truncate">
        {fit(text, width)}
      </Text>
    );
  return (
    <Text wrap="truncate">
      <Text color={active ? color.success : color.muted}>
        {active ? glyph.on : glyph.off}{" "}
      </Text>
      <Text bold={active}>{fit(name, 25)}</Text>
      <Text dimColor>{count} resources</Text>
    </Text>
  );
}

export function PreviewPane({
  summary,
  raw,
  title,
  command,
  width,
  height,
  offset,
  context,
}: {
  summary: PreviewSummary | null;
  raw: string;
  title: string;
  command: string;
  width: number;
  height: number;
  offset: number;
  context: { root: string; home: string };
}) {
  const lines: ReactNode[] = [];
  lines.push(
    <Text>
      <Text bold color={color.warning}>
        PREVIEW{" "}
      </Text>
      <Text bold>{truncate(title, width - 12)}</Text>
    </Text>,
  );
  lines.push(
    <Text dimColor wrap="truncate">
      {command}
    </Text>,
  );
  lines.push(<Rule width={width} />);
  if (summary) {
    if (!summary.files.length && !summary.changes.length)
      lines.push(<Text color={color.muted}>No changes.</Text>);
    for (const change of summary.changes)
      lines.push(
        <Text wrap="truncate">
          <Text color={diffColor[change.kind] ?? color.muted}>
            {diffGlyph[change.kind] ?? glyph.dot} {fit(change.kind, 9)}
          </Text>
          <Text>{fit(change.id, 34)}</Text>
          <Text dimColor>{truncate(change.name, Math.max(6, width - 46))}</Text>
        </Text>,
      );
    if (summary.changes.length && summary.files.length)
      lines.push(<Text> </Text>);
    for (const file of summary.files)
      lines.push(
        <Text wrap="truncate">
          <Text
            color={
              file.status === "created"
                ? color.success
                : file.status === "deleted"
                  ? color.danger
                  : color.warning
            }
          >
            {fit(file.status, 9)}
          </Text>
          <Text color={color.success}>{fit(`+${file.added}`, 6)}</Text>
          <Text color={color.danger}>{fit(`-${file.removed}`, 6)}</Text>
          <Text dimColor>
            {truncate(
              shortPath(file.path, context.home, context.root),
              Math.max(10, width - 22),
            )}
          </Text>
        </Text>,
      );
    for (const warning of summary.warnings)
      wrapWords(warning, width - 2).forEach((line, position) =>
        lines.push(
          <Text wrap="truncate">
            <Text color={color.warning}>
              {position === 0 ? severity.warning.glyph : " "}{" "}
            </Text>
            <Text>{line}</Text>
          </Text>,
        ),
      );
  } else {
    for (const line of outputLines(raw, width))
      lines.push(<JsonLine line={line} />);
  }
  return <Viewport lines={lines} height={height} offset={offset} />;
}

export function FormPane({
  form,
  fields,
  index,
  issues,
  locked = [],
  title,
  command,
  input,
  width,
  height,
  offset,
}: {
  form: FormState;
  fields: FormField[];
  index: number;
  issues: Partial<Record<FieldName, string>>;
  locked?: FieldName[];
  title: string;
  command: string;
  input: ReactNode;
  width: number;
  height: number;
  offset: number;
}) {
  const labelWidth = 13;
  const lines: ReactNode[] = [
    <Text>
      <Text bold color={color.accent}>
        {truncate(title, width - 12)}
      </Text>
    </Text>,
    <Text dimColor wrap="truncate">
      {command}
    </Text>,
    <Rule width={width} />,
  ];
  fields.forEach((field, position) => {
    const active = position === index;
    const issue = issues[field.name];
    const fixed = locked.includes(field.name);
    lines.push(
      <Text wrap="truncate">
        <Text color={color.accent}>{active ? glyph.selected : " "} </Text>
        <Text bold={active} dimColor={!active}>
          {fit(field.name, labelWidth)}
        </Text>
        {fixed ? (
          <Text dimColor>
            {"  "}
            {truncate(displayValue(form, field), width - labelWidth - 6)}
          </Text>
        ) : field.kind === "text" && active ? (
          <Text>
            {"  "}
            {input}
          </Text>
        ) : field.kind === "text" ? (
          <Text dimColor>
            {"  "}
            {truncate(displayValue(form, field) || "—", width - labelWidth - 6)}
          </Text>
        ) : field.kind === "multi" ? (
          <Text>
            {"  "}
            {(field.options ?? []).map((option, position) => {
              const on = (form.harnesses as string[]).includes(option);
              return (
                <Text key={option}>
                  <Text color={on ? color.success : color.muted}>
                    {position + 1}
                    {on ? glyph.ok : glyph.off}
                  </Text>
                  <Text dimColor={!on}>
                    {" "}
                    {option}
                    {"  "}
                  </Text>
                </Text>
              );
            })}
          </Text>
        ) : (
          <Text {...(active ? { color: color.accent } : {})}>
            {active ? "‹ " : "  "}
            {displayValue(form, field)}
            {active ? " ›" : ""}
          </Text>
        )}
        {issue ? (
          <Text color={color.danger}>
            {"  "}
            {severity.error.glyph} {truncate(issue, 40)}
          </Text>
        ) : active && fixed ? (
          <Text dimColor>
            {"  "}
            {glyph.locked} fixed; fork to rename
          </Text>
        ) : active && field.hint ? (
          <Text dimColor>
            {"  "}
            {field.hint}
          </Text>
        ) : (
          <Text />
        )}
      </Text>,
    );
  });
  return <Viewport lines={lines} height={height} offset={offset} />;
}

export function PaletteList({
  matches,
  selected,
  state,
  height,
  width,
}: {
  matches: Action[];
  selected: number;
  state: ActionState;
  height: number;
  width: number;
}) {
  const labelWidth = Math.max(18, Math.floor(width * 0.45));
  const items = matches.map((action, index) => {
    const line = `${fit(action.label, labelWidth)} ${commandLine(action, state)}`;
    if (index === selected)
      return (
        <Text key={action.id} inverse bold wrap="truncate">
          {fit(line, width)}
        </Text>
      );
    return (
      <Text key={action.id} wrap="truncate">
        <Text>{fit(action.label, labelWidth)}</Text>
        <Text dimColor> {truncate(commandLine(action, state), width - labelWidth - 1)}</Text>
      </Text>
    );
  });
  return (
    <Box flexDirection="column">
      {!items.length && <Text dimColor>No matching action</Text>}
      <SimpleList items={items} selected={selected} height={height} />
    </Box>
  );
}

export function HelpPane({
  width,
  height,
  offset,
  state,
  actions: list,
}: {
  width: number;
  height: number;
  offset: number;
  state: ActionState;
  actions: Action[];
}) {
  const lines: ReactNode[] = [];
  const groups = [...new Set(list.map((action) => action.group))];
  const shown = referenceState(state);
  lines.push(
    <Text bold color={color.accent}>
      KEYBOARD REFERENCE
    </Text>,
  );
  lines.push(<Rule width={width} />);
  const navigation: [string, string][][] = [
    [
      ["↑↓ / j k", "move"],
      ["PgUp / PgDn", "scroll"],
      ["g / G", "first / last"],
    ],
    [
      ["Enter", "inspect"],
      ["Tab", "next view"],
      ["Esc", "back"],
    ],
    [
      ["Ctrl+K", "action palette"],
      ["Ctrl+C", "quit"],
    ],
  ];
  for (const row of navigation)
    lines.push(
      <Text dimColor wrap="truncate">
        {row.map(([key, label]) => (
          <Text key={key}>
            {fit(key, 13)}
            {fit(label, 20)}
          </Text>
        ))}
      </Text>,
    );
  for (const group of groups) {
    const members = list.filter((action) => action.group === group);
    lines.push(<Text> </Text>);
    lines.push(<Text bold>{group}</Text>);
    for (const action of members)
      lines.push(
        <Text wrap="truncate">
          <Text color={action.key ? color.accent : color.muted}>
            {fit(action.key ?? " ", 3)}
          </Text>
          <Text>
            {fit(action.label, Math.max(18, Math.floor(width * 0.45)))}
          </Text>
          <Text dimColor>
            {truncate(
              commandLine(action, shown),
              Math.max(8, width - Math.floor(width * 0.45) - 4),
            )}
          </Text>
        </Text>,
      );
  }
  return <Viewport lines={lines} height={height} offset={offset} />;
}

const jsonToken =
  /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

/** Colours a pretty-printed JSON line; unmatched text renders plainly. */
export function jsonSegments(line: string): Cell[] {
  const cells: Cell[] = [];
  let last = 0;
  for (const match of line.matchAll(jsonToken)) {
    const at = match.index;
    if (at > last) cells.push({ text: line.slice(last, at), dim: true });
    const [whole, text, colon, numeric, literal] = match;
    if (text !== undefined)
      cells.push(
        colon
          ? { text: text + colon, color: color.accent }
          : { text, color: color.success },
      );
    else if (numeric !== undefined) cells.push({ text: numeric, color: color.warning });
    else if (literal !== undefined) cells.push({ text: literal, color: "magenta" });
    last = at + whole.length;
  }
  if (last < line.length) cells.push({ text: line.slice(last), dim: true });
  return cells;
}

function JsonLine({ line }: { line: string }) {
  return (
    <Text wrap="truncate">
      {jsonSegments(line).map((cell, position) => (
        <Text
          key={position}
          {...(cell.color ? { color: cell.color } : {})}
          {...(cell.dim ? { dimColor: true } : {})}
        >
          {cell.text}
        </Text>
      ))}
    </Text>
  );
}

export function OutputPane({
  text,
  width,
  height,
  offset,
  title,
}: {
  text: string;
  width: number;
  height: number;
  offset: number;
  title: string;
}) {
  const lines: ReactNode[] = [
    <Text bold color={color.accent}>
      {truncate(title, width)}
    </Text>,
    <Rule width={width} />,
    ...outputLines(text, width).map((line) => <JsonLine line={line} />),
  ];
  return <Viewport lines={lines} height={height} offset={offset} />;
}

export function HintBar({
  hints,
  width,
}: {
  hints: { key: string; label: string }[];
  width: number;
}) {
  let budget = width;
  const shown = hints.filter((hint) => {
    const cost = hint.key.length + hint.label.length + 4;
    if (cost > budget) return false;
    budget -= cost;
    return true;
  });
  return (
    <Box width={width}>
      <Text wrap="truncate">
        {shown.map((hint) => (
          <Text key={hint.key + hint.label}>
            <Text color={color.accent}>{hint.key}</Text>
            <Text dimColor> {hint.label}   </Text>
          </Text>
        ))}
      </Text>
    </Box>
  );
}
