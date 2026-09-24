// Terminal content is untrusted; strip control characters before rendering.
export const clean = (text: string) =>
  // eslint-disable-next-line no-control-regex
  text.replace(/[\u001b\u0000-\u0008\u000b-\u001f\u007f]/g, "");

const characters = (text: string) => [...text];

export function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  const value = characters(clean(text));
  if (value.length <= width) return value.join("");
  return width === 1 ? "…" : value.slice(0, width - 1).join("") + "…";
}

export function fit(text: string, width: number): string {
  const value = truncate(text, width);
  return value + " ".repeat(Math.max(0, width - characters(value).length));
}

export function outputLines(text: string, width: number): string[] {
  return clean(text)
    .split("\n")
    .flatMap((line) => {
      const value = characters(line);
      const lines: string[] = [];
      for (let i = 0; i < value.length; i += width)
        lines.push(value.slice(i, i + width).join(""));
      return lines.length ? lines : [""];
    });
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

export function wrapWords(text: string, width: number): string[] {
  if (width <= 0) return [];
  const lines: string[] = [];
  for (const paragraph of clean(text).split("\n")) {
    let line: string[] = [];
    const flush = () => {
      lines.push(line.join(""));
      line = [];
    };
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = characters(word);
      if (line.length && line.length + 1 + rest.length > width) flush();
      if (line.length) line.push(" ");
      while (line.length + rest.length > width) {
        const room = width - line.length;
        line.push(...rest.slice(0, room));
        rest = rest.slice(room);
        flush();
      }
      line.push(...rest);
    }
    flush();
  }
  return lines;
}

// Substring matches always rank above subsequence matches; within a tier,
// earlier and more contiguous matches rank first. Null means no match.
export function fuzzyScore(query: string, text: string): number | null {
  const haystack = clean(text).toLowerCase();
  const literal = query.toLowerCase().trim();
  if (!literal) return 0;
  const direct = haystack.indexOf(literal);
  if (direct >= 0) return direct;
  const needle = literal.replace(/\s+/g, "");
  let score = 1000,
    index = -1,
    previous = -2;
  for (const ch of needle) {
    index = haystack.indexOf(ch, index + 1);
    if (index < 0) return null;
    score += index === previous + 1 ? 1 : 10 + index;
    previous = index;
  }
  return score;
}

export function fuzzyFilter<T>(
  query: string,
  items: T[],
  key: (item: T) => string,
): T[] {
  if (!query.trim()) return items;
  return items
    .map((item) => ({ item, score: fuzzyScore(query, key(item)) }))
    .filter(
      (entry): entry is { item: T; score: number } => entry.score !== null,
    )
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.item);
}

export function jsonText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
