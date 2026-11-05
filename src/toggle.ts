import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createAdapters, type Context } from "./adapters.js";
import { frontmatter } from "./adapters/common.js";
import { listingTokens } from "./context-map.js";
import { readGlobalSetup } from "./doctor-global.js";
import { ResourceSchema, type Resource } from "./schema.js";
import { parseToml, setTomlTable } from "./toml-edit.js";
import {
  applyFiles,
  jsonText,
  readText,
  type FileChange,
} from "./transaction.js";

/**
 * Turn a resource off and on, and make a skill manual or automatic.
 *
 * Off uses the switch the harness has when there is one: Claude Code
 * `enabledPlugins`, `disabledMcpjsonServers`, and Codex `enabled = false`.
 * Otherwise the entry or file moves to a store that Preflight owns
 * (`.preflight/disabled/` under the home or project folder) and `enable`
 * puts it back. Every write is previewed and journaled like other edits.
 * The toggle idea follows agent-compass `engine/assets.mjs` (MIT).
 */

// ---------------------------------------------------------------- skill mode

const KEY = "disable-model-invocation";

/**
 * Set or clear `disable-model-invocation: true` in the frontmatter of a
 * SKILL.md. Every other byte of the file stays as it was.
 */
export function setSkillMode(text: string, manual: boolean): string {
  const open = /^---[ \t]*(\r\n|\n)/.exec(text);
  if (!open) throw new Error("The skill has no frontmatter");
  const eol = open[1]!;
  let at = open[0].length;
  let close = -1;
  let key: { start: number; end: number; value: string } | null = null;
  while (at <= text.length) {
    const match = /([^\r\n]*)(\r\n|\n|$)/y;
    match.lastIndex = at;
    const m = match.exec(text)!;
    const line = m[1]!;
    if (/^---[ \t]*$/.test(line)) {
      close = at;
      break;
    }
    const k = new RegExp(`^${KEY}[ \\t]*:(.*)$`).exec(line);
    if (k && !key) key = { start: at, end: at + m[0].length, value: k[1]! };
    if (!m[0]) break;
    at += m[0].length;
  }
  if (close < 0) throw new Error("The frontmatter has no closing ---");
  const isTrue = key !== null && /^\s*(["']?)true\1\s*(#.*)?$/i.test(key.value);
  if (manual) {
    if (isTrue) return text;
    if (key)
      return (
        text.slice(0, key.start) +
        `${KEY}: true${text.slice(key.start, key.end).match(/\r?\n$/)?.[0] ?? ""}` +
        text.slice(key.end)
      );
    return text.slice(0, close) + `${KEY}: true${eol}` + text.slice(close);
  }
  return key ? text.slice(0, key.start) + text.slice(key.end) : text;
}

const pathOf = (r: Resource) =>
  r.source.startsWith("file://") ? r.source.slice("file://".length) : "";
const estimate = (r: Resource) =>
  Math.ceil(`${r.name}\n${r.description}`.length / 4);

async function detected(context: Context) {
  const out: Resource[] = [];
  for (const adapter of createAdapters(context))
    out.push(
      ...(await adapter.read().catch(() => ({ resources: [] }))).resources,
    );
  return out;
}
const sameRef = (r: Resource, ref: string) =>
  r.id === ref ||
  `${r.type}:${r.name}`.toLowerCase() === ref.toLowerCase() ||
  r.name.toLowerCase() === ref.toLowerCase();

export interface ModeItem {
  id: string;
  name: string;
  harness: string;
  scope: string;
  path: string;
  changed: boolean;
  /** Listing tokens per session: saved by manual, paid again by auto. */
  tokens: number;
}
/** `preflight skill manual|auto`: edit the frontmatter of each named skill. */
export async function skillMode(
  context: Context,
  names: string[],
  manual: boolean,
  dryRun: boolean,
) {
  if (!names.length) throw new Error("Name at least one skill");
  const skills = (await detected(context)).filter((r) => r.type === "skill");
  const items: ModeItem[] = [];
  const files: FileChange[] = [];
  const notes: string[] = [];
  for (const name of names) {
    const found = skills.filter((r) => sameRef(r, name) || r.id === name);
    if (!found.length) throw new Error(`Skill not found: ${name}`);
    for (const r of found) {
      if (
        r.harnesses.includes("codex") &&
        !r.harnesses.includes("claude-code")
      ) {
        notes.push(
          `${r.id}: Codex does not read ${KEY}; it was left as it is.`,
        );
        continue;
      }
      const path = pathOf(r);
      const before = await readText(path);
      if (before === null) throw new Error(`Cannot read ${path}`);
      const after = setSkillMode(before, manual);
      if (after !== before) files.push({ path, before, after });
      items.push({
        id: r.id,
        name: r.name,
        harness: r.harnesses[0]!,
        scope: r.scope,
        path,
        changed: after !== before,
        tokens: estimate(r),
      });
    }
  }
  const result = await applyFiles(context.root, files, {
    actor: process.env.USER ?? "local",
    source: manual ? "skill manual" : "skill auto",
    dryRun,
  });
  const moved = items.filter((i) => i.changed);
  return {
    action: manual ? "manual" : "auto",
    dryRun,
    items,
    tokens: moved.reduce((t, i) => t + i.tokens, 0),
    tokenEffect: manual ? "saved" : "added",
    files: result.files,
    notes,
    next: dryRun
      ? `Run again with --apply to write ${moved.length} file${moved.length === 1 ? "" : "s"}.`
      : undefined,
  };
}

// ------------------------------------------------------------------- toggle

const STORE = join(".preflight", "disabled");
const scopeRoot = (context: Context, scope: string) =>
  scope === "global" ? context.home : context.root;
const storeFile = (context: Context, scope: string, path: string) => {
  const base = scopeRoot(context, scope);
  const rel = relative(base, resolve(path));
  if (rel.startsWith("..") || resolve(rel) === rel)
    throw new Error(`${path} is outside ${base}; Preflight will not move it`);
  return join(base, STORE, "files", rel);
};

interface StoredEntry {
  kind: "mcp" | "hook";
  harness: string;
  scope: string;
  file: string;
  section: string;
  /** MCP server name, or hook event. */
  key: string;
  name: string;
  value: unknown;
}
const entriesPath = (context: Context, scope: string) =>
  join(scopeRoot(context, scope), STORE, "entries.json");
async function readEntries(context: Context, scope: string) {
  const text = await readText(entriesPath(context, scope));
  return text ? (JSON.parse(text) as StoredEntry[]) : [];
}

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (
      ["ENOENT", "ENOTDIR"].includes(String((e as NodeJS.ErrnoException).code))
    )
      return [];
    throw e;
  }
  const out: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

const harnessOf = (rel: string) =>
  rel.startsWith(".claude")
    ? "claude-code"
    : rel.startsWith(".cursor")
      ? "cursor"
      : "codex";
const slug = (s: string) => s.replace(/[^a-z0-9._-]/gi, "-");

interface Stored {
  resource: Resource;
  /** Store file and the place it goes back to. */
  moves: { from: string; to: string }[];
  entry?: StoredEntry;
  entryIndex?: number;
}

/** Everything Preflight has switched off by moving it to its store. */
export async function storedResources(context: Context): Promise<Stored[]> {
  const out: Stored[] = [];
  const scopes = [
    ["global", context.home],
    ...(resolve(context.root) === resolve(context.home)
      ? []
      : [["project", context.root] as const]),
  ] as const;
  for (const [scope, base] of scopes) {
    const dir = join(base, STORE, "files");
    const groups = new Map<
      string,
      {
        type: "skill" | "subagent" | "command";
        name: string;
        rel: string;
        files: string[];
      }
    >();
    for (const file of await walk(dir)) {
      const rel = relative(dir, file).split(sep).join("/");
      const skill = /^(.*\/skills\/([^/]+))\/.+$/.exec(rel);
      const agent = /^(.*\/agents\/([^/]+))\.md$/.exec(rel);
      const command = /^(.*\/commands\/([^/]+))\.md$/.exec(rel);
      const hit = skill
        ? { type: "skill" as const, key: skill[1]!, name: skill[2]! }
        : agent
          ? { type: "subagent" as const, key: agent[1]!, name: agent[2]! }
          : command
            ? { type: "command" as const, key: command[1]!, name: command[2]! }
            : null;
      if (!hit) continue;
      const group = groups.get(hit.key) ?? {
        type: hit.type,
        name: hit.name,
        rel,
        files: [],
      };
      group.files.push(file);
      groups.set(hit.key, group);
    }
    for (const group of groups.values()) {
      const harness = harnessOf(group.rel);
      const main =
        group.files.find((f) => f.endsWith("SKILL.md")) ?? group.files[0]!;
      const content = (await readText(main)) ?? "";
      let meta: Record<string, unknown> = {};
      try {
        meta = frontmatter(content);
      } catch {
        /* a file with odd frontmatter is still listed */
      }
      const name = typeof meta.name === "string" ? meta.name : group.name;
      out.push({
        resource: ResourceSchema.parse({
          id: `${group.type}:${harness}:${scope}:${slug(group.name)}`,
          type: group.type,
          name,
          description:
            typeof meta.description === "string" ? meta.description : "",
          source: `file://${join(base, relative(dir, main))}`,
          scope,
          harnesses: [harness],
          enabled: false,
          content,
          config: { ...meta, preflightDisabled: true },
        }),
        moves: group.files.map((f) => ({
          from: f,
          to: join(base, relative(dir, f)),
        })),
      });
    }
    (await readEntries(context, scope)).forEach((entry, entryIndex) =>
      out.push({
        entry,
        entryIndex,
        moves: [],
        resource: ResourceSchema.parse({
          id:
            entry.kind === "mcp"
              ? `mcp:${entry.harness}:${scope}:${slug(entry.name)}`
              : `hook:${scope}:${entry.key}:off${entryIndex}`,
          type: entry.kind,
          name: entry.name,
          source: `file://${entry.file}`,
          scope,
          harnesses: [entry.harness],
          enabled: false,
          config:
            entry.kind === "mcp"
              ? { ...(entry.value as object), preflightDisabled: true }
              : {
                  event: entry.key,
                  entry: entry.value,
                  preflightDisabled: true,
                },
        }),
      }),
    );
  }
  return out;
}

/** The resources Preflight switched off by moving them, as resources with `enabled: false`. */
export const disabledResources = async (context: Context) =>
  (await storedResources(context)).map((s) => s.resource);

export interface ToggleItem {
  id: string;
  type: string;
  name: string;
  harness: string;
  scope: string;
  /** native: the harness switch; store: moved to the Preflight store. */
  method: "native" | "store";
  /** Listing tokens saved by disable, paid again by enable; null when not measured. */
  tokens: number | null;
}

const tokensOf = (r: Resource, plugins: Record<string, number>) =>
  r.type === "skill" || r.type === "subagent"
    ? listingTokens({
        ...r,
        config: { ...r.config, "disable-model-invocation": false },
      })
    : r.type === "plugin"
      ? (plugins[r.name] ?? null)
      : null;

function indentOf(text: string) {
  const m = /^\{\r?\n([ \t]+)"/.exec(text);
  return m ? m[1]! : "  ";
}
function jsonOut(value: unknown, original: string) {
  const out = JSON.stringify(value, null, indentOf(original)) + "\n";
  return original.endsWith("\n") || !original ? out : out.trimEnd();
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

/**
 * `preflight disable|enable <resource...>`: preview or apply the change.
 * A reference is a resource id, `type:name` or a name.
 */
export async function toggleResources(
  context: Context,
  refs: string[],
  on: boolean,
  dryRun: boolean,
) {
  if (!refs.length) throw new Error("Name at least one resource");
  const files = new Map<string, FileChange>();
  const obtain = async (path: string) => {
    let file = files.get(path);
    if (!file) {
      const before = await readText(path);
      file = { path, before, after: before };
      files.set(path, file);
    }
    return file;
  };
  const editJson = async (
    path: string,
    change: (doc: Record<string, unknown>) => void,
  ) => {
    const file = await obtain(path);
    const doc = file.after ? record(JSON.parse(file.after)) : {};
    change(doc);
    file.after = jsonOut(doc, file.before ?? "");
  };
  const stored = await storedResources(context);
  const all = await detected(context);
  // Plugins and MCP servers the harness itself switched off.
  const native = all.filter((r) => !r.enabled);
  const live = all.filter((r) => r.enabled);
  let plugins: Record<string, number> = {};
  try {
    plugins = Object.fromEntries(
      (await readGlobalSetup(context)).plugins.map((p) => [
        p.id,
        p.listingTokens,
      ]),
    );
  } catch {
    /* plugin costs stay unknown */
  }
  const pool: { resource: Resource; stored?: Stored }[] = on
    ? [
        ...native.map((resource) => ({ resource })),
        ...stored.map((s) => ({ resource: s.resource, stored: s })),
      ]
    : live.map((resource) => ({ resource }));
  const picked: typeof pool = [];
  for (const ref of refs) {
    const exact = pool.filter((p) => p.resource.id === ref);
    const found = exact.length
      ? exact
      : pool.filter((p) => sameRef(p.resource, ref));
    if (!found.length) {
      const other = (
        on ? live : [...native, ...stored.map((s) => s.resource)]
      ).some((r) => sameRef(r, ref));
      throw new Error(
        other
          ? `${ref} is already ${on ? "on" : "off"}`
          : `Resource not found: ${ref}`,
      );
    }
    if (found.length > 1)
      throw new Error(
        `${ref} matches ${found.length} resources; use an id: ${found.map((f) => f.resource.id).join(", ")}`,
      );
    if (!picked.includes(found[0]!)) picked.push(found[0]!);
  }
  // Hooks are removed from the highest index down so earlier indexes hold.
  picked.sort(
    (a, b) =>
      Number(b.resource.id.split(":").at(-1)) -
        Number(a.resource.id.split(":").at(-1)) || 0,
  );
  const items: ToggleItem[] = [];
  const newEntries = new Map<string, StoredEntry[]>();
  const droppedEntries = new Map<string, number[]>();
  for (const { resource: r, stored: s } of picked) {
    const path = pathOf(r);
    const harness = r.harnesses[0]!;
    let method: ToggleItem["method"] = "native";
    if (
      !["skill", "subagent", "command", "mcp", "plugin", "hook"].includes(
        r.type,
      )
    )
      throw new Error(`${r.type} cannot be switched off (${r.id})`);
    if (s) {
      method = "store";
      if (s.entry) {
        const e = s.entry;
        await editJson(e.file, (doc) => {
          if (e.kind === "mcp") {
            const section = record(doc[e.section]);
            if (Object.hasOwn(section, e.key))
              throw new Error(`${e.name} already exists in ${e.file}`);
            doc[e.section] = { ...section, [e.key]: e.value };
          } else {
            const hooks = record(doc.hooks);
            hooks[e.key] = [
              ...(Array.isArray(hooks[e.key])
                ? (hooks[e.key] as unknown[])
                : []),
              e.value,
            ];
            doc.hooks = hooks;
          }
        });
        droppedEntries.set(r.scope, [
          ...(droppedEntries.get(r.scope) ?? []),
          s.entryIndex!,
        ]);
      } else
        for (const m of s.moves) {
          const text = await readText(m.from);
          (await obtain(m.from)).after = null;
          const target = await obtain(m.to);
          if (target.before !== null)
            throw new Error(
              `${m.to} exists; move it away before enabling ${r.name}`,
            );
          target.after = text;
        }
    } else if (r.type === "plugin") {
      await editJson(path, (doc) => {
        doc.enabledPlugins = { ...record(doc.enabledPlugins), [r.name]: on };
      });
    } else if (r.type === "mcp" && harness === "codex") {
      const file = await obtain(path);
      const table = record(
        record(parseToml(file.after ?? "").mcp_servers)[r.name],
      );
      const next = { ...table };
      if (on) delete next.enabled;
      else next.enabled = false;
      file.after = setTomlTable(
        file.after ?? "",
        ["mcp_servers", r.name],
        next,
      );
    } else if (
      r.type === "mcp" &&
      harness === "claude-code" &&
      r.scope === "project"
    ) {
      await editJson(
        join(context.root, ".claude", "settings.local.json"),
        (doc) => {
          const strip = (k: string) =>
            (Array.isArray(doc[k]) ? (doc[k] as unknown[]) : []).filter(
              (n) => n !== r.name,
            );
          doc.disabledMcpjsonServers = on
            ? strip("disabledMcpjsonServers")
            : [...strip("disabledMcpjsonServers"), r.name];
          if (!on) doc.enabledMcpjsonServers = strip("enabledMcpjsonServers");
          for (const k of ["disabledMcpjsonServers", "enabledMcpjsonServers"])
            if (Array.isArray(doc[k]) && !(doc[k] as unknown[]).length)
              delete doc[k];
        },
      );
    } else if (r.type === "mcp" || r.type === "hook") {
      method = "store";
      const entry: StoredEntry =
        r.type === "mcp"
          ? {
              kind: "mcp",
              harness,
              scope: r.scope,
              file: path,
              section: "mcpServers",
              key: r.name,
              name: r.name,
              value: null,
            }
          : {
              kind: "hook",
              harness,
              scope: r.scope,
              file: path,
              section: "hooks",
              key: String(r.config.event),
              name: r.name,
              value: r.config.entry,
            };
      await editJson(path, (doc) => {
        if (r.type === "mcp") {
          const section = record(doc.mcpServers);
          entry.value = section[r.name];
          delete section[r.name];
          doc.mcpServers = section;
        } else {
          const hooks = record(doc.hooks);
          const list = Array.isArray(hooks[entry.key])
            ? [...(hooks[entry.key] as unknown[])]
            : [];
          const index = Number(r.id.split(":").at(-1));
          if (JSON.stringify(list[index]) !== JSON.stringify(entry.value))
            throw new Error(`${r.id} changed on disk; run the command again`);
          list.splice(index, 1);
          if (list.length) hooks[entry.key] = list;
          else delete hooks[entry.key];
          if (Object.keys(hooks).length) doc.hooks = hooks;
          else delete doc.hooks;
        }
      });
      newEntries.set(r.scope, [...(newEntries.get(r.scope) ?? []), entry]);
    } else {
      // skill, subagent, command: move every file of it into the store.
      method = "store";
      const root = r.type === "skill" ? dirname(path) : path;
      const list = r.type === "skill" ? await walk(root) : [path];
      if (r.type === "skill" && !list.includes(path)) list.push(path);
      for (const f of list) {
        const buffer = await readFile(f);
        const text = buffer.toString("utf8");
        if (!Buffer.from(text).equals(buffer))
          throw new Error(`${f} is not a text file; move ${r.name} by hand`);
        (await obtain(f)).after = null;
        const target = await obtain(storeFile(context, r.scope, f));
        if (target.before !== null)
          throw new Error(`${target.path} exists; enable or remove it first`);
        target.after = text;
      }
    }
    items.push({
      id: r.id,
      type: r.type,
      name: r.name,
      harness,
      scope: r.scope,
      method,
      tokens: tokensOf(r, plugins),
    });
  }
  for (const scope of new Set([
    ...newEntries.keys(),
    ...droppedEntries.keys(),
  ])) {
    const file = await obtain(entriesPath(context, scope));
    const all: StoredEntry[] = file.before ? JSON.parse(file.before) : [];
    const drop = new Set(droppedEntries.get(scope) ?? []);
    const next = [
      ...all.filter((_, i) => !drop.has(i)),
      ...(newEntries.get(scope) ?? []),
    ];
    file.after = next.length ? jsonText(next) : null;
  }
  const result = await applyFiles(context.root, [...files.values()], {
    actor: process.env.USER ?? "local",
    source: on ? "enable" : "disable",
    dryRun,
  });
  const known = items
    .map((i) => i.tokens)
    .filter((t): t is number => t !== null);
  return {
    action: on ? "enable" : "disable",
    dryRun,
    items,
    tokens: known.reduce((a, b) => a + b, 0),
    tokenEffect: on ? "added" : "saved",
    tokensNotMeasured: items.length - known.length,
    files: result.files,
    next: dryRun
      ? `Run again with --apply to ${on ? "enable" : "disable"} ${items.length} resource${items.length === 1 ? "" : "s"}.`
      : undefined,
  };
}
