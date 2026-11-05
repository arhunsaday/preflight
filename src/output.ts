export type OutputMode = "json" | "text";
const VALUE_FLAGS = ["--root", "--home", "-o", "--output"];

/**
 * Resolve the output mode and remove -o/--output from `args` (in place).
 * Explicit -o wins; then --json / --text; then auto: text on a terminal,
 * JSON when piped.
 */
export function outputMode(args: string[], isTTY: boolean): OutputMode {
  let chosen: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-o" || a === "--output") {
      chosen = args[i + 1];
      args.splice(i, 2);
      i--;
    } else if (a.startsWith("--output=") || /^-o./.test(a)) {
      chosen = a.startsWith("--output=") ? a.slice(9) : a.slice(2);
      args.splice(i, 1);
      i--;
    }
  }
  if (chosen !== undefined) {
    if (chosen === "json" || chosen === "text") return chosen;
    if (chosen !== "auto")
      throw new Error(
        `Invalid output format "${chosen}": use json, text or auto`,
      );
  } else if (args.includes("--json")) return "json";
  else if (args.includes("--text")) return "text";
  return isTTY ? "text" : "json";
}

/** Positional words before any option value: ["source", "list"], ["status"]. */
export function commandPath(args: string[]): string[] {
  return args.filter(
    (a, i) => !a.startsWith("-") && !VALUE_FLAGS.includes(args[i - 1] ?? ""),
  );
}
