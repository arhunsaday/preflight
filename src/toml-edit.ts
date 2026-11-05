import { parse } from "smol-toml";

/**
 * Surgical TOML table editing. Preflight owns individual tables of files that
 * belong to someone else (Codex's `config.toml`): it replaces or removes the
 * text of the tables it owns and leaves every other byte of the file alone,
 * comments, ordering and formatting included. Reading uses `smol-toml`; every
 * edit is checked by parsing the result.
 */

export type TomlPath = readonly string[];

interface Header {
  /** Offset of the first line of the block (leading comments included). */
  start: number;
  /** Offset of the header line itself. */
  headerStart: number;
  path: string[];
  array: boolean;
}

const bare = /^[A-Za-z0-9_-]+$/;

export function tomlKey(key: string) {
  return bare.test(key) ? key : JSON.stringify(key);
}

function parseKeyPath(source: string): string[] | null {
  const keys: string[] = [];
  let i = 0;
  const space = () => {
    while (source[i] === " " || source[i] === "\t") i++;
  };
  for (;;) {
    space();
    const c = source[i];
    if (c === '"') {
      let j = i + 1;
      while (j < source.length && source[j] !== '"')
        j += source[j] === "\\" ? 2 : 1;
      if (j >= source.length) return null;
      try {
        keys.push(JSON.parse(source.slice(i, j + 1)) as string);
      } catch {
        keys.push(source.slice(i + 1, j));
      }
      i = j + 1;
    } else if (c === "'") {
      const j = source.indexOf("'", i + 1);
      if (j < 0) return null;
      keys.push(source.slice(i + 1, j));
      i = j + 1;
    } else {
      const match = /^[A-Za-z0-9_-]+/.exec(source.slice(i));
      if (!match) return null;
      keys.push(match[0]);
      i += match[0].length;
    }
    space();
    if (i >= source.length) return keys;
    if (source[i] !== ".") return null;
    i++;
  }
}

/** Every table header of a document, with the block each one starts. */
export function tableHeaders(text: string): Header[] {
  const headers: Header[] = [];
  let i = 0;
  let depth = 0;
  // Comment-only lines directly above a header travel with that header.
  let commentRun: number | null = null;
  while (i < text.length) {
    const lineStart = i;
    const lineEnd =
      text.indexOf("\n", i) < 0 ? text.length : text.indexOf("\n", i) + 1;
    const line = text.slice(lineStart, lineEnd);
    const trimmed = line.trim();
    if (depth === 0 && trimmed.startsWith("[")) {
      const array = trimmed.startsWith("[[");
      const close = array ? trimmed.indexOf("]]") : trimmed.indexOf("]");
      const path =
        close > 0 ? parseKeyPath(trimmed.slice(array ? 2 : 1, close)) : null;
      if (path)
        headers.push({
          start: commentRun ?? lineStart,
          headerStart: lineStart,
          path,
          array,
        });
      commentRun = null;
      i = lineEnd;
      continue;
    }
    if (depth === 0 && trimmed.startsWith("#")) commentRun ??= lineStart;
    else commentRun = null;
    // Scan a key/value line (and any multi-line value it opens) for strings
    // and brackets, so a "[" inside a value is never taken for a header.
    let j = lineStart;
    let inComment = false;
    while (j < text.length) {
      const c = text[j]!;
      if (c === "\n") {
        inComment = false;
        j++;
        if (depth === 0) break;
        continue;
      }
      if (inComment) {
        j++;
        continue;
      }
      if (c === "#") {
        inComment = true;
        j++;
        continue;
      }
      if (text.startsWith('"""', j) || text.startsWith("'''", j)) {
        const quote = text.slice(j, j + 3);
        let k = j + 3;
        for (;;) {
          const end = text.indexOf(quote, k);
          if (end < 0) {
            k = text.length;
            break;
          }
          if (quote === '"""') {
            let slashes = 0;
            for (let s = end - 1; text[s] === "\\"; s--) slashes++;
            if (slashes % 2) {
              k = end + 1;
              continue;
            }
          }
          k = end + 3;
          while (text[k] === quote[0]) k++;
          break;
        }
        j = k;
        continue;
      }
      if (c === '"') {
        let k = j + 1;
        while (k < text.length && text[k] !== '"' && text[k] !== "\n")
          k += text[k] === "\\" ? 2 : 1;
        j = k + 1;
        continue;
      }
      if (c === "'") {
        let k = j + 1;
        while (k < text.length && text[k] !== "'" && text[k] !== "\n") k++;
        j = k + 1;
        continue;
      }
      if (c === "[" || c === "{") depth++;
      else if ((c === "]" || c === "}") && depth > 0) depth--;
      j++;
    }
    i = j;
  }
  return headers;
}

function stringValue(value: string) {
  // JSON escapes are valid TOML basic-string escapes.
  return JSON.stringify(value);
}

export function tomlValue(value: unknown): string {
  if (typeof value === "string") return stringValue(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Cannot write a non-finite number to TOML");
    return String(value);
  }
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(", ")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(
      ([, v]) => v !== undefined && v !== null,
    );
    return entries.length
      ? `{ ${entries.map(([k, v]) => `${tomlKey(k)} = ${tomlValue(v)}`).join(", ")} }`
      : "{}";
  }
  throw new Error(
    `Cannot write ${value === null ? "null" : typeof value} to TOML`,
  );
}

/** One standard table; nested objects are written as inline tables. */
export function tomlTable(
  path: TomlPath,
  value: Record<string, unknown>,
  eol = "\n",
) {
  const lines = [`[${path.map(tomlKey).join(".")}]`];
  for (const [key, item] of Object.entries(value))
    if (item !== undefined && item !== null)
      lines.push(`${tomlKey(key)} = ${tomlValue(item)}`);
  return lines.join(eol) + eol;
}

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((k, i) => k === b[i]);
const within = (path: readonly string[], prefix: readonly string[]) =>
  path.length >= prefix.length && prefix.every((k, i) => k === path[i]);

export function tomlGet(document: unknown, path: TomlPath): unknown {
  let current = document;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** JSON-compatible copy of parsed TOML (dates become ISO strings). */
export function plainToml(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null));
}

export function parseToml(text: string): Record<string, unknown> {
  return plainToml(parse(text)) as Record<string, unknown>;
}

/**
 * Replace (or with `null` remove) the table at `path` and its sub-tables.
 * Everything outside those blocks is kept byte for byte. A table that the file
 * defines some other way (inline in its parent, with dotted keys, or as an
 * array of tables) is refused rather than rewritten.
 */
export function setTomlTable(
  text: string,
  path: TomlPath,
  value: Record<string, unknown> | null,
): string {
  if (!path.length) throw new Error("A table path is required");
  const before = text ? parseToml(text) : {};
  const headers = tableHeaders(text);
  const ends = headers.map((h, i) => headers[i + 1]?.start ?? text.length);
  const owned = headers
    .map((h, i) => ({ ...h, end: ends[i]! }))
    .filter((h) => within(h.path, path));
  if (owned.some((h) => h.array))
    throw new Error(`${path.join(".")} is an array of tables; edit it by hand`);
  const existing = tomlGet(before, path);
  if (existing !== undefined && !owned.some((h) => same(h.path, path)))
    throw new Error(
      `${path.join(".")} is defined inline or with dotted keys; edit it by hand`,
    );
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const block = value ? tomlTable(path, value, eol) : "";
  let result: string;
  if (owned.length) {
    // Trailing blank lines of the first owned block stay as separators.
    const first = owned[0]!;
    const firstText = text.slice(first.start, first.end);
    const trailing =
      /(?:\r?\n)*$/.exec(firstText.replace(/\r?\n$/, ""))?.[0] ?? "";
    let out = "";
    let cursor = 0;
    owned.forEach((h, index) => {
      // A comment above a replaced table stays; a removed table takes it along.
      out += text.slice(cursor, index === 0 && value ? h.headerStart : h.start);
      if (index === 0 && value) out += block + trailing;
      cursor = h.end;
    });
    out += text.slice(cursor);
    result = out;
    if (
      !value &&
      owned.at(-1)!.end === text.length &&
      /\r?\n\r?\n$/.test(result)
    )
      result = result.replace(/\r?\n$/, "");
  } else if (value) {
    // Group a new table after its siblings when there are any, else append.
    const parent = path.slice(0, -1);
    const siblings = parent.length
      ? headers
          .map((h, i) => ({ ...h, end: ends[i]! }))
          .filter((h) => within(h.path, parent))
      : [];
    const last = siblings.at(-1);
    if (last && last.end < text.length) {
      const head = text.slice(0, last.end);
      const tail = text.slice(last.end);
      result = /\r?\n\r?\n$/.test(head)
        ? head + block + eol + tail
        : head + block + tail;
    } else {
      let head = text;
      if (head && !head.endsWith("\n")) head += eol;
      if (head && !/\r?\n\r?\n$/.test(head)) head += eol;
      result = head + block;
    }
  } else result = text;
  // The edit must parse, hold exactly the requested table, and leave every
  // other value as it was.
  let after: Record<string, unknown>;
  try {
    after = result ? parseToml(result) : {};
  } catch (error) {
    throw new Error(
      `Editing ${path.join(".")} would break the TOML file: ${String(error)}`,
    );
  }
  const got = tomlGet(after, path);
  if (
    JSON.stringify(got ?? null) !==
    JSON.stringify(value ? plainToml(value) : null)
  )
    throw new Error(`${path.join(".")} could not be edited in place`);
  const strip = (doc: Record<string, unknown>) => {
    const copy = structuredClone(doc);
    const parent = tomlGet(copy, path.slice(0, -1)) as
      Record<string, unknown> | undefined;
    if (parent && typeof parent === "object") delete parent[path.at(-1)!];
    return JSON.stringify(copy, (k, v: unknown) =>
      k &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !Object.keys(v).length
        ? undefined
        : v,
    );
  };
  if (strip(before) !== strip(after))
    throw new Error(`Editing ${path.join(".")} would change other settings`);
  return result;
}
