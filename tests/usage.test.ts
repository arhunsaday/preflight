import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zstdCompressSync } from "node:zlib";
import { expect, it } from "vitest";
import { execute } from "../src/commands.js";
import { parseSince, priceUsage, readUsage, repoRoot } from "../src/usage.js";

const now = new Date("2026-11-04T18:00:00");
const iso = (day: string, time = "10:00:00") =>
  new Date(`${day}T${time}`).toISOString();

async function home() {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "preflight-usage-"),
  );
  const project = join(root, "repo");
  await mkdir(join(project, ".git"), { recursive: true });
  await mkdir(join(project, "src"), { recursive: true });
  return { root, home: join(root, "home"), project };
}

const assistant = (o: {
  id: string;
  request: string;
  day: string;
  time?: string;
  output: number;
  content?: unknown[];
  cwd: string;
  model?: string;
}) =>
  JSON.stringify({
    type: "assistant",
    sessionId: "s1",
    requestId: o.request,
    cwd: o.cwd,
    timestamp: iso(o.day, o.time),
    message: {
      id: o.id,
      model: o.model ?? "claude-opus-5-5-20261001",
      content: o.content ?? [],
      usage: {
        input_tokens: 1000,
        output_tokens: o.output,
        cache_read_input_tokens: 9000,
        cache_creation_input_tokens: 0,
        cache_creation: {
          ephemeral_5m_input_tokens: 0,
          ephemeral_1h_input_tokens: 0,
        },
      },
    },
  });

async function writeClaude(home: string, cwd: string) {
  const dir = join(home, ".claude", "projects", "-repo");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "s1.jsonl"),
    [
      JSON.stringify({
        type: "user",
        sessionId: "s1",
        timestamp: iso("2026-11-03", "09:59:00"),
        message: { content: "review this" },
        cwd,
      }),
      // Streaming: two lines for the same message; the larger output counts.
      assistant({
        id: "m1",
        request: "r1",
        day: "2026-11-03",
        output: 10,
        cwd,
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "Skill",
            input: { skill: "review" },
          },
        ],
      }),
      assistant({
        id: "m1",
        request: "r1",
        day: "2026-11-03",
        output: 200,
        cwd,
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "Skill",
            input: { skill: "review" },
          },
        ],
      }),
      assistant({
        id: "m2",
        request: "r2",
        day: "2026-11-03",
        time: "10:01:00",
        output: 100,
        cwd,
      }),
      JSON.stringify({
        type: "user",
        sessionId: "s1",
        timestamp: iso("2026-11-04", "08:00:00"),
        message: { content: [{ type: "text", text: "next" }] },
        cwd,
      }),
      assistant({
        id: "m3",
        request: "r3",
        day: "2026-11-04",
        time: "08:01:00",
        output: 50,
        cwd,
        model: "claude-haiku-4-5",
      }),
      "not json",
    ].join("\n"),
  );
}

async function writeCodex(home: string, cwd: string, compressed = false) {
  const dir = join(home, ".codex", "sessions", "2026", "11", "02");
  await mkdir(dir, { recursive: true });
  const count = (day: string, input: number, cached: number, output: number) =>
    JSON.stringify({
      timestamp: iso(day),
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: input,
            cached_input_tokens: cached,
            output_tokens: output,
            reasoning_output_tokens: 0,
            total_tokens: input + output,
          },
        },
      },
    });
  const text = [
    JSON.stringify({
      timestamp: iso("2026-11-02"),
      type: "session_meta",
      payload: { id: "codex-1", timestamp: iso("2026-11-02"), cwd },
    }),
    JSON.stringify({
      timestamp: iso("2026-11-02"),
      type: "turn_context",
      payload: { model: "gpt-6.1-sol" },
    }),
    JSON.stringify({
      timestamp: iso("2026-11-02"),
      type: "response_item",
      payload: { type: "function_call", name: "shell", call_id: "c1" },
    }),
    count("2026-11-02", 1000, 400, 100),
    count("2026-11-02", 1000, 400, 100), // repeated event: not a step
    count("2026-11-04", 3000, 2000, 300),
  ].join("\n");
  const name = "rollout-2026-11-02T10-00-00-codex-1.jsonl";
  if (compressed)
    await writeFile(
      join(dir, name + ".zst"),
      zstdCompressSync(Buffer.from(text)),
    );
  else await writeFile(join(dir, name), text);
}

it("dedupes streamed Claude messages, prices them, and attributes tokens to skills", async () => {
  const { home: h, project } = await home();
  await writeClaude(h, join(project, "src"));
  const report = await readUsage({ home: h, agent: "claude-code", now });
  // m1 once (200 output), m2, m3
  expect(report.totals.messages).toBe(3);
  expect(report.totals.output).toBe(350);
  expect(report.totals.input).toBe(3000);
  expect(report.totals.cacheRead).toBe(27000);
  expect(report.cacheHitRate).toBeCloseTo(0.9);
  expect(report.invalidLines).toBe(1);
  expect(report.invocations["skill:review"]).toBe(1);
  expect(report.byProject[0]!.project).toBe(project);
  expect(report.byModel.map((m) => m.model).sort()).toEqual([
    "claude-haiku-4-5",
    "claude-opus-5-5-20261001",
  ]);
  // Opus 5.5: $4 in, $20 out, $0.20 cache read per MTok.
  const opus = (2000 * 4 + 300 * 20 + 18000 * 0.2) / 1e6;
  const haiku = (1000 * 1 + 50 * 5 + 9000 * 0.1) / 1e6;
  expect(report.costEstimate.usd).toBeCloseTo(opus + haiku, 10);
  expect(report.costEstimate.complete).toBe(true);
  // The skill runs from after its call to the next prompt: m2, not m1 or m3.
  expect(report.bySkill).toEqual([
    expect.objectContaining({
      skill: "review",
      calls: 1,
      messages: 1,
      output: 100,
    }),
  ]);
  expect(report.byDay.map((d) => d.day)).toEqual(["2026-11-03", "2026-11-04"]);
  const recent = await readUsage({
    home: h,
    agent: "claude-code",
    since: "1d",
    now,
  });
  expect(recent.totals.messages).toBe(1);
});

it("reads Codex rollouts step by step, including compressed ones, and marks them unpriced", async () => {
  for (const compressed of [false, true]) {
    const { home: h, project } = await home();
    await writeCodex(h, project, compressed);
    const report = await readUsage({ home: h, agent: "codex", now });
    expect(report.byDay).toEqual([
      expect.objectContaining({
        day: "2026-11-02",
        input: 600,
        cacheRead: 400,
        output: 100,
      }),
      expect.objectContaining({
        day: "2026-11-04",
        input: 400,
        cacheRead: 1600,
        output: 200,
      }),
    ]);
    expect(report.bySession[0]).toMatchObject({
      session: "codex-1",
      agent: "codex",
      project,
    });
    expect(report.invocations.shell).toBe(1);
    expect(report.costEstimate).toMatchObject({
      complete: false,
      unpricedModels: ["gpt-6.1-sol"],
    });
    expect(report.totals.unpricedTokens).toBe(report.totals.tokens);
  }
});

it("prices cache writes, long prompts and fast mode from the price table", () => {
  const writes = priceUsage(
    {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 2000,
      cache_creation: {
        ephemeral_5m_input_tokens: 1000,
        ephemeral_1h_input_tokens: 1000,
      },
    },
    "claude-sonnet-4-6",
  );
  expect(writes.cost).toBeCloseTo((1000 * 3 * 1.25 + 1000 * 3 * 2) / 1e6, 12);
  const long = priceUsage(
    { input_tokens: 200000, output_tokens: 0 },
    "claude-haiku-5-5",
  );
  expect(long.cost).toBeCloseTo((200000 * 0.5) / 1e6, 12);
  const fast = priceUsage(
    { input_tokens: 1e6, output_tokens: 0, speed: "fast" },
    "claude-opus-5-5",
  );
  expect(fast.cost).toBeCloseTo(8, 9);
  expect(priceUsage({ input_tokens: 5 }, "mystery").unpricedTokens).toBe(5);
});

it("parses windows and resolves repository roots without running git", async () => {
  expect(parseSince("1d", now)).toBe("2026-11-04");
  expect(parseSince("30d", now)).toBe("2026-10-06");
  expect(parseSince("2026-01-31", now)).toBe("2026-01-31");
  expect(() => parseSince("yesterday", now)).toThrow();
  const { project, root } = await home();
  expect(repoRoot(join(project, "src"))).toBe(project);
  expect(repoRoot(join(root, "home", ".claude", "worktrees", "x"))).toBe(
    root + "/home",
  );
  const linked = join(root, "linked");
  await mkdir(join(project, ".git", "worktrees", "linked"), {
    recursive: true,
  });
  await mkdir(linked);
  await writeFile(
    join(linked, ".git"),
    `gitdir: ${join(project, ".git", "worktrees", "linked")}\n`,
  );
  expect(repoRoot(linked)).toBe(project);
});

it("serves preflight usage --by and keeps skill utilisation for prune", async () => {
  const { home: h, project, root } = await home();
  await writeClaude(h, project);
  await writeCodex(h, project);
  const context = { root, home: h };
  const all = (await execute(["usage"], context)) as {
    byAgent: { agent: string }[];
    sessions: number;
    prune: string[];
  };
  expect(all.byAgent.map((a) => a.agent).sort()).toEqual([
    "claude-code",
    "codex",
  ]);
  expect(all.sessions).toBe(2);
  const bySkill = (await execute(["usage", "--by", "skill"], context)) as {
    rows: { skill: string }[];
  };
  expect(bySkill.rows[0]!.skill).toBe("review");
  const codex = (await execute(
    ["usage", "--agent", "codex", "--by", "model"],
    context,
  )) as {
    rows: { model: string }[];
  };
  expect(codex.rows.map((r) => r.model)).toEqual(["gpt-6.1-sol"]);
  await expect(execute(["usage", "--since", "soon"], context)).rejects.toThrow(
    /30d/,
  );
});
