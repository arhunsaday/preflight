import { expect, it } from "vitest";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { execute } from "../src/commands.js";
import { commandPath, outputMode } from "../src/output.js";
import { genericText, renderText, table } from "../src/render-text.js";
import { buildStatus } from "../src/status.js";

const sandbox = async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "preflight-out-"));
  const home = join(root, "home");
  await mkdir(join(home, ".claude", "skills", "demo"), { recursive: true });
  await writeFile(
    join(home, ".claude", "skills", "demo", "SKILL.md"),
    "---\nname: demo\ndescription: Demo skill\n---\nBody\n",
  );
  await mkdir(join(root, "project"), { recursive: true });
  const ctx = { root: join(root, "project"), home };
  await execute(["init"], ctx);
  return ctx;
};
const cli = (ctx: { root: string; home: string }, ...args: string[]) =>
  spawnSync(
    join(process.cwd(), "node_modules", ".bin", "tsx"),
    [
      join(process.cwd(), "src", "cli.ts"),
      "--root",
      ctx.root,
      "--home",
      ctx.home,
      ...args,
    ],
    { encoding: "utf8", env: { ...process.env, PREFLIGHT_HOME: ctx.home } },
  );

it("resolves the output mode", () => {
  expect(outputMode([], true)).toBe("text");
  expect(outputMode([], false)).toBe("json");
  expect(outputMode(["--json"], true)).toBe("json");
  expect(outputMode(["--text"], false)).toBe("text");
  const args = ["list", "-o", "json"];
  expect(outputMode(args, true)).toBe("json");
  expect(args).toEqual(["list"]);
  expect(outputMode(["--output=text"], false)).toBe("text");
  expect(outputMode(["-o", "auto"], true)).toBe("text");
  expect(() => outputMode(["-o", "xml"], true)).toThrow(/json, text or auto/);
  expect(commandPath(["--root", "x", "-o", "text", "source", "list"])).toEqual([
    "source",
    "list",
  ]);
});

it("reports one status row per harness without reading transcripts", async () => {
  const ctx = await sandbox();
  const status = await buildStatus(ctx);
  expect(status.harnesses.map((h) => h.harness).sort()).toEqual([
    "claude-code",
    "codex",
    "cursor",
  ]);
  const claude = status.harnesses.find((h) => h.harness === "claude-code")!;
  expect(claude).toMatchObject({ installed: true, name: "Claude Code" });
  expect(claude.global.skills).toBe(1);
  expect(status.harnesses.find((h) => h.harness === "cursor")!.installed).toBe(
    false,
  );
  expect(await execute(["status"], ctx)).toEqual(status);
  const text = renderText(["status"], status);
  expect(text).toContain("Claude Code");
  expect(text).toMatch(/harness\s+installed\s+profile\s+skills/);
});

it("keeps piped output byte-identical to the JSON contract", async () => {
  const ctx = await sandbox();
  for (const args of [["list"], ["detect"], ["profiles", "list"], ["status"]]) {
    const expected = JSON.stringify(await execute(args, ctx), null, 2) + "\n";
    const piped = cli(ctx, ...args);
    expect(piped.stdout).toBe(expected);
    expect(cli(ctx, ...args, "-o", "json").stdout).toBe(expected);
    expect(cli(ctx, ...args, "--json").stdout).toBe(expected);
  }
}, 60_000);

it("renders text with -o text and --text, and errors on one line", async () => {
  const ctx = await sandbox();
  const text = cli(ctx, "detect", "-o", "text").stdout;
  expect(text).toContain("claude-code: installed");
  expect(() => JSON.parse(text)).toThrow();
  expect(cli(ctx, "profiles", "list", "--text").stdout).toMatch(
    /profile\s+active/,
  );
  const bad = cli(ctx, "inspect", "nothing:here", "-o", "text");
  expect(bad.status).toBe(1);
  expect(bad.stderr).toMatch(/^error: .+\n$/);
  const badJson = cli(ctx, "inspect", "nothing:here");
  expect(JSON.parse(badJson.stderr)).toHaveProperty("error");
  const doctor = cli(ctx, "doctor", "--no-transcripts", "-o", "text").stdout;
  expect(() => JSON.parse(doctor)).toThrow();
  expect(
    JSON.parse(cli(ctx, "doctor", "--no-transcripts").stdout),
  ).toBeInstanceOf(Array);
}, 60_000);

it("falls back to a generic rendering", () => {
  expect(
    genericText({
      a: 1,
      b: [
        { x: 1, y: "z" },
        { x: 22, y: "w" },
      ],
      c: ["p", "q"],
    }),
  ).toBe("a: 1\nb:\n   x  y\n   1  z\n  22  w\nc: p,q");
  expect(
    table(
      ["n", "v"],
      [
        ["a", 1],
        ["bb", 22],
      ],
      [1],
    ),
  ).toBe("n    v\na    1\nbb  22");
  expect(renderText(["unknown"], { ok: true })).toBe("ok: true\n");
});
