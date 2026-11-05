import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads the desktop theme tokens as text and checks WCAG 2.x contrast for
// every text/background pair the interface draws, in both themes.
const css = readFileSync("desktop/renderer/styles.css", "utf8");

function block(selector: string) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing ${selector}`);
  const body = css.slice(start + selector.length + 2);
  return body.slice(0, body.indexOf("}"));
}
function tokens(text: string) {
  return Object.fromEntries(
    [...text.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [
      m[1]!,
      m[2]!.trim(),
    ]),
  );
}
type Rgba = [number, number, number, number];
function parse(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [n >> 16, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(value);
  if (rgb) return [+rgb[1]!, +rgb[2]!, +rgb[3]!, rgb[4] ? +rgb[4] : 1];
  throw new Error(`Unsupported colour ${value}`);
}
const over = ([r, g, b, a]: Rgba, [R, G, B]: Rgba): Rgba => [
  r * a + R * (1 - a),
  g * a + G * (1 - a),
  b * a + B * (1 - a),
  1,
];
function luminance([r, g, b]: Rgba) {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}
export function contrast(fg: Rgba, bg: Rgba) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
}

const light = tokens(block(":root"));
const dark = tokens(block(':root[data-theme="dark"]'));
const system = tokens(block(':root:not([data-theme="light"])'));

const surfaces = ["app", "bg", "surface", "surface-2", "surface-3"];
const pairs: [string, string][] = [
  ...["text", "text-2", "text-3"].flatMap((fg) =>
    [...surfaces, "selected", "hover"].map((bg) => [fg, bg] as [string, string]),
  ),
  ...["primary", "danger", "warning", "success", "info"].flatMap((fg) =>
    surfaces.map((bg) => [fg, bg] as [string, string]),
  ),
  ["primary", "accent-soft"],
  ["primary", "selected"],
  ["danger", "danger-soft"],
  ["warning", "warning-soft"],
  ["success", "success-soft"],
  ["info", "info-soft"],
  ["on-primary", "primary"],
  ["on-primary", "primary-hover"],
  ["text-2", "code-bg"],
  ...["map-skill", "map-prompt", "map-subagent", "map-command"].map(
    (bg) => ["map-ink", bg] as [string, string],
  ),
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme tokens", (_name, theme) => {
  // Translucent fills (hover, selection) are drawn over the work surface.
  const colour = (name: string) => {
    const value = theme[name];
    if (!value) throw new Error(`Missing --${name}`);
    const parsed = parse(value);
    return parsed[3] < 1 ? over(parsed, parse(theme.surface!)) : parsed;
  };
  it.each(pairs)("--%s on --%s reaches 4.5:1", (fg, bg) => {
    expect(contrast(colour(fg), colour(bg))).toBeGreaterThanOrEqual(4.5);
  });
  it("draws focus rings at 3:1 against the surfaces", () => {
    for (const bg of surfaces)
      expect(
        contrast(colour("ring-border"), colour(bg)),
      ).toBeGreaterThanOrEqual(3);
  });
});

describe("theme blocks", () => {
  it("defines the same dark tokens for the system and the pinned theme", () => {
    expect(system).toEqual(dark);
  });
  it("defines every light token in dark", () => {
    const themed = Object.keys(light).filter(
      (k) => !k.startsWith("radius") && !["sans", "mono", "ease"].includes(k),
    );
    expect(themed.filter((k) => !(k in dark))).toEqual([]);
  });
});
