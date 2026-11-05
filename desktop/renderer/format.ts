/** "1 file", "3 files". Pass the plural when it is not just word + "s". */
export function plural(count: number, word: string, many = `${word}s`) {
  return `${count.toLocaleString()} ${count === 1 ? word : many}`;
}

/** Shorten a path under the user's home to "~/…" for display only. */
export function tildify(path: string | undefined, home: string | undefined) {
  if (!path) return "";
  if (!home || home === "/") return path;
  const base = home.replace(/\/+$/, "");
  return path === base
    ? "~"
    : path.startsWith(`${base}/`)
      ? `~${path.slice(base.length)}`
      : path;
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "3 minutes ago", "yesterday". Falls back to the raw value when unparsable. */
export function relativeTime(value: string | number | Date, now = Date.now()) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return String(value);
  const seconds = Math.round((time - now) / 1000);
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size)
      return relative.format(Math.round(seconds / size), unit);
  return Math.abs(seconds) < 45 ? "just now" : relative.format(seconds, "second");
}

/** Turn a finding code such as "no-hooks" into "No hooks". */
export function humanize(code: string) {
  const words = code.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Initials for an avatar: "Ada Lovelace" → "AL". */
export function initials(name: string) {
  return (
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** True while the user is typing, so single-key shortcuts stay out of the way. */
export function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return (
    !!element &&
    (element.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName))
  );
}
