import { useState } from "react";
import { FlaskConical, Play, ArrowRightLeft, FilePlus2 } from "lucide-react";
import type { Workspace } from "../workspace";
import { Button, Empty, Badge, Notice } from "../components/ui";
export function Benchmarks({ workspace: w }: { workspace: Workspace }) {
  const [name, setName] = useState("candidate"),
    [tasks, setTasks] = useState("bench/tasks.json"),
    [config, setConfig] = useState("current"),
    [repo, setRepo] = useState(w.snapshot?.root ?? ""),
    [revision, setRevision] = useState(""),
    [agent, setAgent] = useState("claude"),
    [left, setLeft] = useState(""),
    [right, setRight] = useState("");
  const runs = w.snapshot?.benches ?? [];
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
        <Badge tone="blue">Local A/B</Badge>
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
              pattern="[A-Za-z0-9_-]+"
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
                  const path = await window.adk.chooseFile();
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
            void w.run(["bench", "compare", left, right]);
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
