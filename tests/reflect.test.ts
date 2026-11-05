import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { execute } from "../src/commands.js";
import {
  hasSecret,
  redact,
  reflect,
  scoreSession,
  type ReflectReport,
  type LessonDraft,
} from "../src/reflect.js";

// Fake credentials: they must never appear in a trajectory.
const ANTHROPIC = `sk-ant-api03-${"Q".repeat(40)}`;
const GITHUB = `ghp_${"a".repeat(36)}`;

const yesterday = new Date(Date.now() - 86_400_000);
const at = (minute: number) =>
  new Date(
    yesterday.getFullYear(),
    yesterday.getMonth(),
    yesterday.getDate(),
    12,
    minute,
  ).toISOString();

async function fixture() {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "preflight-reflect-"),
  );
  const home = join(root, "home");
  const project = join(home, "work", "repo");
  const other = join(home, "work", "other");
  for (const dir of [join(project, ".git"), join(other, ".git"), home])
    await mkdir(dir, { recursive: true });
  const line = (session: string, cwd: string, minute: number, rest: object) =>
    JSON.stringify({ sessionId: session, cwd, timestamp: at(minute), ...rest });
  const use = (
    session: string,
    cwd: string,
    minute: number,
    id: string,
    name: string,
    input: object,
  ) =>
    line(session, cwd, minute, {
      type: "assistant",
      message: { content: [{ type: "tool_use", id, name, input }] },
    });
  const result = (
    session: string,
    cwd: string,
    minute: number,
    id: string,
    text: string,
    error = false,
  ) =>
    line(session, cwd, minute, {
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: id,
            content: text,
            is_error: error,
          },
        ],
      },
    });
  const bad: string[] = [
    line("bad-session", project, 0, {
      type: "user",
      message: { content: `fix the tests in ${project}/src, mail bob@corp.io` },
    }),
  ];
  for (let i = 0; i < 5; i++)
    bad.push(
      use("bad-session", project, 1 + i * 2, `t${i}`, "Bash", {
        command: "npm test",
      }),
      result(
        "bad-session",
        project,
        2 + i * 2,
        `t${i}`,
        `FAIL ${project}/tests/a.test.ts ${"x".repeat(900)}`,
        true,
      ),
    );
  bad.push(
    use("bad-session", project, 20, "k1", "Bash", { command: "printenv" }),
    result(
      "bad-session",
      project,
      21,
      "k1",
      `ANTHROPIC=${ANTHROPIC} and ${GITHUB}`,
    ),
    // The same result written twice counts once.
    result("bad-session", project, 21, "k1", "duplicate", true),
    use("bad-session", project, 22, "b1", "Bash", { command: "rm -rf build" }),
    result(
      "bad-session",
      project,
      23,
      "b1",
      "PreToolUse:Bash hook blocked this command",
      true,
    ),
  );
  for (let i = 0; i < 3; i++)
    bad.push(
      line("bad-session", project, 30 + i, {
        type: "user",
        isMeta: true,
        uuid: `stop${i}`,
        message: { content: "Stop hook feedback: run the tests" },
      }),
    );
  bad.push(
    line("bad-session", project, 40, {
      type: "attachment",
      uuid: "h1",
      attachment: {
        type: "hook_non_blocking_error",
        hookName: "PostToolUse:Edit",
      },
    }),
  );
  const calm = [
    use("calm-session", project, 0, "c1", "Read", {
      file_path: `${project}/README.md`,
    }),
    result("calm-session", project, 1, "c1", "hello"),
  ];
  const elsewhere = [
    use("other-session", other, 0, "o1", "Bash", { command: "make" }),
    result("other-session", other, 1, "o1", "make: *** error", true),
  ];
  const claude = join(home, ".claude", "projects", "-repo");
  await mkdir(claude, { recursive: true });
  await writeFile(join(claude, "bad.jsonl"), bad.join("\n") + "\n");
  await writeFile(join(claude, "calm.jsonl"), calm.join("\n") + "\n");
  await writeFile(join(claude, "other.jsonl"), elsewhere.join("\n") + "\n");
  const codex = join(home, ".codex", "sessions", "2026");
  await mkdir(codex, { recursive: true });
  const event = (minute: number, type: string, payload: object) =>
    JSON.stringify({ timestamp: at(minute), type, payload });
  await writeFile(
    join(codex, "rollout-1.jsonl"),
    [
      event(0, "session_meta", { id: "codex-session", cwd: project }),
      event(1, "response_item", {
        type: "function_call",
        name: "shell",
        call_id: "x1",
        arguments: JSON.stringify({ command: ["cargo", "build"] }),
      }),
      event(2, "response_item", {
        type: "function_call_output",
        call_id: "x1",
        output: JSON.stringify({
          output: "error[E0425]",
          metadata: { exit_code: 101 },
        }),
      }),
      event(3, "response_item", {
        type: "function_call",
        name: "shell",
        call_id: "x2",
        arguments: JSON.stringify({ command: ["cargo", "build"] }),
      }),
      event(4, "response_item", {
        type: "function_call_output",
        call_id: "x2",
        output: "Exit code: 1\nerror",
      }),
    ].join("\n") + "\n",
  );
  return { root, home, project, other };
}

it("ranks struggling sessions of the project and leaves calm ones out", async () => {
  const f = await fixture();
  const report = await reflect(
    { root: f.project, home: f.home },
    { project: f.project, write: false },
  );
  expect(report.sessions).toBe(3);
  expect(report.ranked.map((s) => s.session)).toEqual([
    "bad-session",
    "codex-session",
  ]);
  const bad = report.ranked[0]!;
  expect(bad.signals).toMatchObject({
    failed: 5,
    blocked: 1,
    repeated: 4,
    stopLoops: 3,
    hookErrors: 1,
  });
  expect(bad.reasons[0]).toBe("`npm test` failed 5 times");
  expect(report.ranked[1]!.signals).toMatchObject({ failed: 2, repeated: 1 });
  expect(report.output).toBeNull();
  await expect(readdir(join(f.project, ".preflight"))).rejects.toThrow();
  const global = await reflect(
    {
      root: join(f.home, ".preflight", "global"),
      home: f.home,
      globalOnly: true,
    },
    { write: false },
  );
  expect(global.ranked.map((s) => s.session)).toContain("other-session");
});

it("writes a redacted trajectory without secrets, emails or home paths", async () => {
  const f = await fixture();
  const report = await reflect(
    { root: f.project, home: f.home },
    { project: f.project },
  );
  const path = report.ranked[0]!.trajectory!;
  expect(path.startsWith(join(f.project, ".preflight", "reflect"))).toBe(true);
  expect(path).toMatch(/\d{4}-\d{2}-\d{2}-bad-sess\.md$/);
  const text = await readFile(path, "utf8");
  expect(text).not.toContain(ANTHROPIC);
  expect(text).not.toContain(GITHUB);
  expect(text).not.toContain("bob@corp.io");
  expect(text).not.toContain(f.home);
  expect(text).toContain("[redacted: possible secret]");
  expect(text).toContain("[email]");
  expect(text).toContain("~/");
  expect(text).toMatch(/cut \d+ characters/);
  expect(text).toContain("`npm test` failed 5 times");
  expect(
    await readFile(
      join(f.project, ".preflight", "reflect", ".gitignore"),
      "utf8",
    ),
  ).toBe("*\n");
  const shown = (await execute(["reflect", "show", "bad-session"], {
    root: f.project,
    home: f.home,
  })) as { text: string };
  expect(shown.text).toBe(text);
  expect(hasSecret(`key ${ANTHROPIC}`)).toBe(true);
  expect(redact("plain words", [])).toBe("plain words");
});

it("scores long and search-heavy sessions", () => {
  const base = {
    failed: 0,
    blocked: 0,
    repeated: 0,
    stopLoops: 0,
    hookErrors: 0,
    searchesBeforeEdit: 0,
    toolCalls: 0,
    tokens: 0,
    cost: 0,
  };
  expect(scoreSession(base).score).toBe(0);
  expect(scoreSession({ ...base, searchesBeforeEdit: 30 }).score).toBe(3);
  const long = scoreSession({ ...base, tokens: 12_000_000, cost: 40 });
  expect(long.score).toBe(2);
  expect(long.reasons[0]).toContain("12.0M tokens");
});

it("runs the lesson lifecycle: draft, preview, apply, verdict, dismiss", async () => {
  const f = await fixture();
  const context = { root: f.project, home: f.home };
  await writeFile(join(f.project, "AGENTS.md"), "# Project\n\nMy own rules.\n");
  const report = (await execute(["reflect"], context)) as ReflectReport;
  const failure = report.drafts.find(
    (d) => d.kind === "repeated-failure",
  ) as LessonDraft;
  expect(failure.title).toBe("Document the right way to run `npm test`");
  expect(failure.target).toBe("AGENTS.md");
  expect(report.drafts.some((d) => d.kind === "stop-loop")).toBe(true);

  const preview = (await execute(
    ["reflect", "lesson", "add", "--draft", failure.id, "--apply", "--dry-run"],
    context,
  )) as {
    files: { path: string }[];
    dryRun: boolean;
    patch: string;
  };
  expect(preview.dryRun).toBe(true);
  expect(preview.files.map((x) => x.path)).toEqual([
    join(f.project, ".preflight", "lessons", `${failure.id}.md`),
    join(f.project, "AGENTS.md"),
  ]);
  expect(preview.patch).toContain("+<!-- preflight:begin reflect-lessons -->");
  expect(await readFile(join(f.project, "AGENTS.md"), "utf8")).toBe(
    "# Project\n\nMy own rules.\n",
  );

  await execute(
    ["reflect", "lesson", "add", "--draft", failure.id, "--apply"],
    context,
  );
  const agents = await readFile(join(f.project, "AGENTS.md"), "utf8");
  expect(agents.startsWith("# Project\n\nMy own rules.\n")).toBe(true);
  expect(agents).toContain("<!-- preflight:begin reflect-lessons -->");
  expect(agents).toContain("`npm test` failed often in past sessions.");

  let listed = (await execute(["reflect", "lessons"], context)) as {
    lessons: { id: string; status: string; verdict: string }[];
    drafts: LessonDraft[];
  };
  expect(listed.lessons).toMatchObject([
    { id: failure.id, status: "applied", verdict: "unknown" },
  ]);
  expect(listed.drafts.some((d) => d.id === failure.id)).toBe(false);

  await execute(
    ["reflect", "lesson", "verdict", failure.id, "helped"],
    context,
  );
  const stop = listed.drafts.find((d) => d.kind === "stop-loop")!;
  await execute(["reflect", "lesson", "dismiss", stop.id], context);
  listed = (await execute(["reflect", "lessons"], context)) as typeof listed;
  expect(listed.lessons[0]!.verdict).toBe("helped");
  expect(listed.drafts.some((d) => d.id === stop.id)).toBe(false);
  // A new analysis does not propose dismissed or saved lessons again.
  const again = (await execute(
    ["reflect", "--no-write"],
    context,
  )) as ReflectReport;
  expect(again.drafts.map((d) => d.id)).not.toContain(stop.id);
  expect(again.drafts.map((d) => d.id)).not.toContain(failure.id);

  await execute(
    [
      "reflect",
      "lesson",
      "add",
      "--title",
      "Use pnpm",
      "--rule",
      "Use pnpm, not npm.",
      "--target",
      "CLAUDE.md",
      "--apply",
    ],
    context,
  );
  expect(await readFile(join(f.project, "CLAUDE.md"), "utf8")).toContain(
    "- Use pnpm, not npm.",
  );
  await expect(
    execute(
      [
        "reflect",
        "lesson",
        "add",
        "--title",
        "Escape",
        "--rule",
        "x",
        "--target",
        "../outside.md",
        "--apply",
      ],
      context,
    ),
  ).rejects.toThrow(/leaves the project/);
  await expect(
    execute(
      [
        "reflect",
        "lesson",
        "add",
        "--title",
        "Leak",
        "--happened",
        `token=${GITHUB}`,
      ],
      context,
    ),
  ).rejects.toThrow(/secret/);
  await expect(
    execute(["reflect", "lesson", "verdict", failure.id, "maybe"], context),
  ).rejects.toThrow(/Verdict/);
});
