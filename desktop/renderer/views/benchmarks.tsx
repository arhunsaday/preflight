import { useState } from "react";
import {
  FlaskConical,
  Play,
  ArrowRightLeft,
  FilePlus2,
  Swords,
  CircleCheck,
  TriangleAlert,
  CircleX,
} from "lucide-react";
import type { ArenaReport } from "../../../src/bench-arena.js";
import type { Checklist } from "../../../src/bench-checklist.js";
import type { Workspace } from "../workspace";
import { Button, Empty, Badge, Notice } from "../components/ui";
const STATUS = {
  pass: { Icon: CircleCheck, word: "Pass", tone: "green" },
  warn: { Icon: TriangleAlert, word: "Warning", tone: "amber" },
  fail: { Icon: CircleX, word: "Fail", tone: "red" },
} as const;
/** Checklist rows: icon and word carry the status, colour only adds to it. */
export function ChecklistRows({ checklist }: { checklist: Checklist }) {
  return (
    <div className="checklist">
      <table aria-label="Result checklist">
        <thead>
          <tr>
            <th>Check</th>
            <th>Status</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {checklist.checks.map((c) => {
            const { Icon, word, tone } = STATUS[c.status];
            return (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td>
                  <Badge tone={tone}>
                    <Icon size={13} aria-hidden /> {word}
                  </Badge>
                </td>
                <td>{c.message}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {checklist.note && <Notice>{checklist.note}</Notice>}
    </div>
  );
}
type Spread = { median: number | null; min: number | null; max: number | null };
const range = (s: Spread | null, f: (v: number) => string) =>
  s && s.median !== null
    ? `${f(s.median)} (${f(s.min!)} to ${f(s.max!)})`
    : "Unknown";
export function ArenaResult({ report }: { report: ArenaReport }) {
  const rows: [string, (s: ArenaReport["left"]) => string][] = [
    ["Success rate", (s) => `${(s.successRate * 100).toFixed(0)}%`],
    [
      "Duration, median (range)",
      (s) => range(s.durationMs, (v) => `${(v / 1000).toFixed(1)}s`),
    ],
    [
      "Tokens, median (range)",
      (s) => range(s.tokens, (v) => v.toLocaleString()),
    ],
    [
      "Cost, median (range)",
      (s) => range(s.costUsd, (v) => `$${v.toFixed(2)}`),
    ],
    [
      "Spread of duration",
      (s) =>
        s.durationMs.cv === null
          ? "Unknown"
          : `${(s.durationMs.cv * 100).toFixed(0)}%`,
    ],
    ["Runs", (s) => String(s.runs)],
  ];
  return (
    <section className="arena-result" aria-label={`Arena ${report.name}`}>
      <h4>
        <Swords size={15} /> {report.name}
      </h4>
      <table>
        <thead>
          <tr>
            <th>Measure</th>
            <th>{report.left.label} (left)</th>
            <th>{report.right.label} (right)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{f(report.left)}</td>
              <td>{f(report.right)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <Badge tone={report.winner === "none" ? "amber" : "green"}>
          {report.winner === "none"
            ? "No winner"
            : `Winner: ${report.winnerLabel}`}
        </Badge>{" "}
        {report.verdict}
      </p>
      <ChecklistRows checklist={report.checklist} />
    </section>
  );
}
export function Benchmarks({ workspace: w }: { workspace: Workspace }) {
  const [name, setName] = useState("candidate"),
    [tasks, setTasks] = useState("bench/tasks.json"),
    [config, setConfig] = useState("current"),
    [repo, setRepo] = useState(w.snapshot?.root ?? ""),
    [revision, setRevision] = useState(""),
    [agent, setAgent] = useState("claude"),
    [left, setLeft] = useState(""),
    [right, setRight] = useState(""),
    [arenaTask, setArenaTask] = useState("bench/tasks.json"),
    [arenaLeft, setArenaLeft] = useState(""),
    [arenaRight, setArenaRight] = useState(""),
    [arenaRuns, setArenaRuns] = useState("3"),
    [arenaModel, setArenaModel] = useState(""),
    [arenaEffort, setArenaEffort] = useState(""),
    [arenaBudget, setArenaBudget] = useState(""),
    [checklist, setChecklist] = useState<Checklist | null>(null);
  const runs = w.snapshot?.benches ?? [];
  const arenas = w.snapshot?.arenas ?? [];
  const choices = [
    ...new Set([
      ...Object.keys(w.snapshot?.config?.profiles ?? {}),
      ...(w.snapshot?.loadouts ?? []),
    ]),
  ];
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>Measure whether your setup helps</h2>
          <p>
            Compare configurations on the same task set and pinned repository
            revision.
          </p>
        </div>
      </div>
      <Notice>
        Runs execute your chosen agent and verification commands in isolated
        clones. Agent usage may incur costs. Review the task manifest before
        starting.
      </Notice>
      <div className="benchmark-results">
        {runs.length ? (
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Passed</th>
                <th>Duration</th>
                <th>Tokens</th>
                <th>Revision</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.name}>
                  <td>
                    <FlaskConical size={15} /> {run.name}
                  </td>
                  <td>
                    <Badge tone="green">
                      {run.results.filter((t) => t.passed).length} /{" "}
                      {run.results.length}
                    </Badge>
                  </td>
                  <td>
                    {(
                      run.results.reduce((sum, t) => sum + t.durationMs, 0) /
                      1000
                    ).toFixed(1)}
                    s
                  </td>
                  <td>
                    {run.results.every((t) => t.tokens !== null)
                      ? run.results
                          .reduce((sum, t) => sum + (t.tokens ?? 0), 0)
                          .toLocaleString()
                      : "Unknown"}
                  </td>
                  <td>
                    <code>{run.revision.slice(0, 8)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty
            title="No benchmark runs yet"
            description="Generate the ten-task suite or use your own manifest, then preview your first run."
          />
        )}
      </div>
      <div className="form-section">
        <h3>Run a benchmark</h3>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void w.run([
              "bench",
              "run",
              "--config",
              config,
              "--tasks",
              tasks,
              "--name",
              name,
            ]);
          }}
        >
          <label>
            Run name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              pattern="[A-Za-z0-9_\-]+"
            />
          </label>
          <label>
            Configuration
            <input
              required
              value={config}
              onChange={(e) => setConfig(e.target.value)}
            />
          </label>
          <label>
            Task manifest
            <div className="input-with-button">
              <input
                required
                value={tasks}
                onChange={(e) => setTasks(e.target.value)}
              />
              <button
                type="button"
                aria-label="Choose task manifest"
                onClick={async () => {
                  const path = await window.preflight.chooseFile();
                  if (path) setTasks(path);
                }}
              >
                …
              </button>
            </div>
          </label>
          <Button
            type="submit"
            disabled={!!w.busy || !w.snapshot?.initialized}
            variant="primary"
          >
            <Play size={15} />
            Preview run
          </Button>
        </form>
      </div>
      <div className="form-section">
        <h3>Compare completed runs</h3>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void w.run(["bench", "compare", left, right]).then((v) => {
              setChecklist(
                (v as { checklist?: Checklist } | undefined)?.checklist ?? null,
              );
            });
          }}
        >
          <label>
            Baseline
            <select
              required
              value={left}
              onChange={(e) => setLeft(e.target.value)}
            >
              <option value="">Choose run</option>
              {runs.map((r) => (
                <option key={r.name}>{r.name}</option>
              ))}
            </select>
          </label>
          <label>
            Candidate
            <select
              required
              value={right}
              onChange={(e) => setRight(e.target.value)}
            >
              <option value="">Choose run</option>
              {runs.map((r) => (
                <option key={r.name}>{r.name}</option>
              ))}
            </select>
          </label>
          <Button disabled={!!w.busy || !left || !right} type="submit">
            <ArrowRightLeft size={15} />
            Compare
          </Button>
        </form>
      </div>
      {checklist && (
        <div className="form-section">
          <h3>Result checklist</h3>
          <ChecklistRows checklist={checklist} />
        </div>
      )}
      <div className="form-section">
        <h3>Arena: two configurations, one task</h3>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void w.run([
              "bench",
              "arena",
              "--task",
              arenaTask,
              "--left",
              arenaLeft,
              "--right",
              arenaRight,
              "--runs",
              arenaRuns,
              ...(arenaModel ? ["--model", arenaModel] : []),
              ...(arenaEffort ? ["--effort", arenaEffort] : []),
              ...(arenaBudget ? ["--budget", arenaBudget] : []),
            ]);
          }}
        >
          <label>
            Task manifest
            <input
              required
              value={arenaTask}
              onChange={(e) => setArenaTask(e.target.value)}
            />
          </label>
          <label>
            Left
            <input
              required
              list="arena-choices"
              value={arenaLeft}
              onChange={(e) => setArenaLeft(e.target.value)}
            />
          </label>
          <label>
            Right
            <input
              required
              list="arena-choices"
              value={arenaRight}
              onChange={(e) => setArenaRight(e.target.value)}
            />
          </label>
          <datalist id="arena-choices">
            {choices.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <label>
            Runs per side
            <input
              required
              type="number"
              min={1}
              max={50}
              value={arenaRuns}
              onChange={(e) => setArenaRuns(e.target.value)}
            />
          </label>
          <label>
            Model (optional)
            <input
              value={arenaModel}
              onChange={(e) => setArenaModel(e.target.value)}
            />
          </label>
          <label>
            Effort (optional)
            <input
              value={arenaEffort}
              onChange={(e) => setArenaEffort(e.target.value)}
            />
          </label>
          <label>
            Budget per task, USD (optional)
            <input
              type="number"
              min={0}
              step="any"
              value={arenaBudget}
              onChange={(e) => setArenaBudget(e.target.value)}
            />
          </label>
          <Button
            type="submit"
            disabled={!!w.busy || !w.snapshot?.initialized}
            variant="primary"
          >
            <Swords size={15} />
            Preview arena
          </Button>
        </form>
        {arenas.map((r) => (
          <ArenaResult key={r.name} report={r} />
        ))}
      </div>
      <details className="form-section">
        <summary>Generate the ten-task suite</summary>
        <form
          className="inline-form scaffold-form"
          onSubmit={(e) => {
            e.preventDefault();
            void w.run([
              "bench",
              "scaffold",
              "--repo",
              repo,
              "--revision",
              revision,
              "--agent",
              agent,
              "--out",
              tasks,
            ]);
          }}
        >
          <label>
            Repository
            <input
              required
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
          </label>
          <label>
            Pinned commit (40 characters)
            <input
              required
              value={revision}
              pattern="[a-f0-9]{40}"
              onChange={(e) => setRevision(e.target.value)}
            />
          </label>
          <label>
            Agent binary
            <input
              required
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
            />
          </label>
          <Button disabled={!!w.busy} type="submit">
            <FilePlus2 size={15} />
            Preview scaffold
          </Button>
        </form>
      </details>
    </div>
  );
}
