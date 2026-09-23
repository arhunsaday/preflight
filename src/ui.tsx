import React, { useEffect, useState } from "react";
import { Box, Text, render, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { execute } from "./commands.js";
import type { Resource } from "./schema.js";
import { ResourceSchema } from "./schema.js";
import type { Context } from "./adapters.js";
import { measureUsage } from "./analysis.js";
import { join } from "node:path";
import { AdkService } from "./service.js";
// Terminal content is untrusted; strip control characters before rendering.
export const clean = (text: string) =>
  // eslint-disable-next-line no-control-regex
  text.replace(/[\u001b\u0000-\u0008\u000b-\u001f\u007f]/g, "");
export function outputLines(text: string, width: number): string[] {
  return clean(text)
    .split("\n")
    .flatMap((line) => {
      const characters = [...line];
      const lines: string[] = [];
      for (let i = 0; i < characters.length; i += width)
        lines.push(characters.slice(i, i + width).join(""));
      return lines.length ? lines : [""];
    });
}
export function ResourceList({
  resources,
  selected,
  height,
}: {
  resources: Resource[];
  selected: number;
  height: number;
}) {
  const start = Math.max(
    0,
    Math.min(selected - Math.floor(height / 2), resources.length - height),
  );
  return (
    <Box flexDirection="column">
      {resources.slice(start, start + height).map((r, index) => (
        <Text
          key={r.id}
          {...(start + index === selected ? { color: "green" } : {})}
        >
          {start + index === selected ? "›" : " "} {clean(r.name)} · {r.type} ·{" "}
          {r.scope}
        </Text>
      ))}
      {!resources.length && <Text dimColor>No matching resources</Text>}
    </Box>
  );
}
const fields = [
  "type",
  "name",
  "id",
  "source",
  "scope",
  "harnesses",
  "content",
  "config",
] as const;
export function App({ context }: { context: Context }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [usage, setUsage] = useState("Usage: measuring local transcripts…");
  const [resources, setResources] = useState<Resource[]>([]);
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"search" | "command" | "form">("search");
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("Loading…");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [field, setField] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [outputOffset, setOutputOffset] = useState(0);
  const [pending, setPending] = useState<string[] | null>(null);
  const [scope, setScope] = useState<"all" | "global" | "project">("all");
  async function refresh() {
    try {
      setResources(await new AdkService(context).list());
    } catch {
      setResources([]);
    }
  }
  useEffect(() => {
    void refresh().then(() =>
      setOutput(
        "Select a resource to inspect, or Tab for commands. Run init if this project has no configuration.",
      ),
    );
    void new AdkService(context)
      .detect()
      .then((states) =>
        measureUsage(
          join(context.home, ".claude", "projects"),
          states.flatMap((state) => state.resources),
        ),
      )
      .then((result) =>
        setUsage(
          result.sessions
            ? `Usage: ${result.skillsUsed}/${result.skillsInstalled} skills observed across ${result.sessions} transcript files`
            : "Usage: no transcripts found; utilization unknown",
        ),
      )
      .catch(() => setUsage("Usage: transcripts unavailable"));
  }, []); // Context is fixed for the lifetime of this UI.
  const filtered = resources.filter(
    (r) =>
      (scope === "all" || r.scope === scope) &&
      `${r.name} ${r.type} ${r.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const index = Math.min(selected, Math.max(0, filtered.length - 1));
  async function run(args: string[]) {
    setBusy(true);
    setOutputOffset(0);
    try {
      const result = await execute(args, context);
      setOutput(JSON.stringify(result, null, 2));
      await refresh();
    } catch (e) {
      setOutput(String(e));
    } finally {
      setBusy(false);
    }
  }
  function beginForm(resource?: Resource) {
    setEditing(resource?.id ?? null);
    setForm(
      resource
        ? {
            type: resource.type,
            name: resource.name,
            id: resource.id,
            source: resource.source,
            scope: resource.scope,
            harnesses: resource.harnesses.join(","),
            content: resource.content ?? "",
            config: JSON.stringify(resource.config),
          }
        : {
            type: "skill",
            name: "",
            id: "",
            source: "local:owned",
            scope: "project",
            harnesses: "claude-code",
            content: "",
            config: "{}",
          },
    );
    setField(0);
    setMode("form");
  }
  async function submit(value: string) {
    if (mode === "form") {
      const next = { ...form, [fields[field]!]: value };
      setForm(next);
      if (field < fields.length - 1) {
        setField(field + 1);
        return;
      }
      try {
        const original = editing ? resources.find((r) => r.id === editing) : {};
        const resource = ResourceSchema.parse({
          ...original,
          ...next,
          harnesses: next.harnesses!.split(",").map((s) => s.trim()),
          config: JSON.parse(next.config!),
          content: next.content!.replace(/\\n/g, "\n"),
        });
        const args = editing
          ? ["update-json", editing, JSON.stringify(resource)]
          : ["create-json", JSON.stringify(resource)];
        setPending(args);
        setMode("command");
        setCommand("");
        await run([...args, "--dry-run"]);
      } catch (e) {
        setOutput(String(e));
      }
      return;
    }
    const r = filtered[index];
    if (value === "new") {
      beginForm();
      return;
    }
    if (value === "edit" && r) {
      beginForm(r);
      return;
    }
    if (value === "confirm" && pending) {
      const args = pending;
      setPending(null);
      await run(args);
      return;
    }
    let args: string[];
    try {
      args = tokenize(value);
    } catch (e) {
      setOutput(String(e));
      return;
    }
    if (!args.length) return;
    if (
      [
        "create",
        "create-json",
        "update",
        "update-json",
        "delete",
        "move",
        "fork",
        "sync",
        "apply",
        "rollback",
        "retrofit",
      ].includes(args[0]!) &&
      !args.includes("--dry-run")
    ) {
      setPending(args);
      await run([...args, "--dry-run"]);
    } else await run(args);
    setCommand("");
  }
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }
    if (busy) return;
    if (key.pageDown) {
      setOutputOffset((offset) =>
        Math.min(
          offset + 5,
          Math.max(
            0,
            outputLines(output, Math.max(20, (stdout.columns ?? 80) - 8))
              .length - 3,
          ),
        ),
      );
      return;
    }
    if (key.pageUp) {
      setOutputOffset((offset) => Math.max(0, offset - 5));
      return;
    }
    if (key.escape) {
      setMode("search");
      setPending(null);
      return;
    }
    if (key.tab) {
      setMode(mode === "command" ? "search" : "command");
      return;
    }
    if (mode === "search") {
      if (key.upArrow) setSelected(Math.max(0, index - 1));
      if (key.downArrow) setSelected(Math.min(filtered.length - 1, index + 1));
      if (key.return && filtered[index])
        void run(["inspect", filtered[index]!.id]);
      if (key.ctrl && input === "s")
        setScope(
          scope === "all" ? "global" : scope === "global" ? "project" : "all",
        );
    }
  });
  const height = Math.max(3, Math.min(12, (stdout.rows ?? 30) - 14));
  const visibleOutput = outputLines(
    output,
    Math.max(20, (stdout.columns ?? 80) - 8),
  )
    .slice(
      outputOffset,
      outputOffset + Math.max(3, (stdout.rows ?? 30) - height - 9),
    )
    .join("\n");
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="green">
        ADK / {scope} / {filtered.length} resources {busy ? "· working…" : ""}
      </Text>
      <Text dimColor>{usage}</Text>
      <Text dimColor>
        ↑↓ select · Enter inspect · PgUp/PgDn output · Tab search/command ·
        Ctrl+S scope · Ctrl+C exit
      </Text>
      <ResourceList resources={filtered} selected={index} height={height} />
      <Box borderStyle="round" paddingX={1}>
        <Text>{visibleOutput}</Text>
      </Box>
      {pending && (
        <Text color="yellow">
          Preview only. Type confirm to apply, or Escape to cancel.
        </Text>
      )}
      <Text dimColor>
        Commands: new · edit · doctor · usage · search · profiles · share ·
        --help
      </Text>
      <Box>
        <Text color="green">
          {mode === "form"
            ? `${fields[field]}: `
            : mode === "search"
              ? "Search › "
              : "adk › "}
        </Text>
        <TextInput
          focus={!busy}
          value={
            mode === "form"
              ? (form[fields[field]!] ?? "")
              : mode === "search"
                ? query
                : command
          }
          onChange={(value) => {
            if (mode === "form") setForm({ ...form, [fields[field]!]: value });
            else if (mode === "search") {
              setQuery(value);
              setSelected(0);
            } else setCommand(value);
          }}
          onSubmit={(value) => {
            if (mode !== "search") void submit(value);
          }}
        />
      </Box>
    </Box>
  );
}
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let value = "",
    quote = "",
    active = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = "";
      else value += ch;
      active = true;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      active = true;
    } else if (/\s/.test(ch)) {
      if (active) {
        tokens.push(value);
        value = "";
        active = false;
      }
    } else {
      value += ch;
      active = true;
    }
  }
  if (quote) throw new Error("Unclosed quote");
  if (active) tokens.push(value);
  return tokens;
}
export async function startUI(context: Context) {
  await render(<App context={context} />).waitUntilExit();
}
