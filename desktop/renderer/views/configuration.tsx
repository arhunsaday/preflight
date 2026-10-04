import { useState } from "react";
import {
  FolderPlus,
  FolderOpen,
  ArrowUpRight,
  Layers,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ArrowRightLeft,
  RefreshCw,
  WandSparkles,
  Plus,
  Globe,
} from "lucide-react";
import type { Workspace } from "../workspace";
import { Badge, Button, Empty, Json, Notice } from "../components/ui";
export function Projects({ workspace: w }: { workspace: Workspace }) {
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>Your project workspaces</h2>
          <p>
            Keep each project's AI setup focused. Global resources stay
            available across projects.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={!!w.busy}
          onClick={() => void w.chooseProject()}
        >
          <FolderPlus size={16} />
          Open project
        </Button>
      </div>
      <div className="project-list">
        {w.state?.projects.map((p) => (
          <div className="project-item" key={p.id}>
            <div className="project-icon">
              <FolderOpen size={24} />
            </div>
            <div>
              <h3>
                {p.name}{" "}
                {p.id === w.state?.activeProjectId && (
                  <Badge tone="green">Active</Badge>
                )}
              </h3>
              <p>{p.root}</p>
              <small>Added {new Date(p.addedAt).toLocaleDateString()}</small>
            </div>
            <Button
              disabled={!!w.busy || p.id === w.state?.activeProjectId}
              onClick={() => void w.switchProject(p.id)}
            >
              Open
              <ArrowUpRight size={14} />
            </Button>
            <Button
              disabled={!!w.busy}
              variant="ghost"
              onClick={() =>
                void w.task("Removing from recent projects…", async () => {
                  await window.adk.forgetProject(p.id);
                  await w.reload();
                })
              }
            >
              Forget
            </Button>
          </div>
        ))}
      </div>
      {w.snapshot && (
        <div className="section-intro secondary-intro">
          <div>
            <h2>Project maintenance</h2>
            <p>Use the same configuration and transactions as the CLI.</p>
          </div>
          <div className="button-row">
            <Button disabled={!!w.busy} onClick={() => void w.run(["sync"])}>
              <RefreshCw size={15} />
              Sync configuration
            </Button>
            <Button
              disabled={!!w.busy}
              onClick={() => void w.run(["retrofit"])}
            >
              <WandSparkles size={15} />
              Generate AGENTS.md
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
export function Doctor({ workspace: w }: { workspace: Workspace }) {
  const [severity, setSeverity] = useState("all");
  const findings = w.snapshot?.findings ?? [];
  const filtered = findings.filter(
    (f) => severity === "all" || f.severity === severity,
  );
  const counts = {
    error: findings.filter((f) => f.severity === "error").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>Check your setup</h2>
          <p>
            Wiring, permissions, conflicts and drift across your configured
            agents.
          </p>
        </div>
        <Button
          disabled={!!w.busy}
          onClick={() => void w.run(["doctor", "--connect"])}
        >
          <ShieldCheck size={15} />
          Test MCP connections
        </Button>
      </div>
      <div className="health-summary">
        <ShieldCheck size={28} />
        <div>
          <strong>
            {counts.error
              ? `${counts.error} issues need attention`
              : "No blocking issues found"}
          </strong>
          <p>
            {counts.warning} warnings · {counts.info} informational findings
          </p>
        </div>
        <select
          aria-label="Finding severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="all">All findings</option>
          <option value="error">Errors</option>
          <option value="warning">Warnings</option>
          <option value="info">Information</option>
        </select>
      </div>
      <div className="findings">
        {filtered.map((f, i) => (
          <article className={`finding ${f.severity}`} key={i}>
            {f.severity === "error" ? (
              <AlertTriangle size={20} />
            ) : f.severity === "warning" ? (
              <AlertTriangle size={20} />
            ) : (
              <CheckCircle2 size={20} />
            )}
            <div>
              <h3>
                {f.code.replace(/-/g, " ")}
                <Badge
                  tone={
                    f.severity === "error"
                      ? "red"
                      : f.severity === "warning"
                        ? "amber"
                        : "blue"
                  }
                >
                  {f.severity}
                </Badge>
              </h3>
              <p>{f.message}</p>
              {f.resourceId && <small>{f.resourceId}</small>}
            </div>
          </article>
        ))}
      </div>
      {!findings.length && (
        <Empty
          title="No findings"
          description="Refresh to scan the active project's configured agents."
        />
      )}
    </div>
  );
}
export function Usage({ workspace: w }: { workspace: Workspace }) {
  const usage = w.snapshot?.usage;
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>Evidence from your sessions</h2>
          <p>
            Observed tool invocations from local Claude transcripts. Text
            mentions are not counted.
          </p>
        </div>
        <Button disabled={!!w.busy} onClick={() => void w.run(["prune"])}>
          Review pruning proposals
        </Button>
      </div>
      {!usage?.sessions ? (
        <Empty
          title="Usage is unknown"
          description="No readable transcripts were found. Use your skills and MCP servers in a session, then refresh to measure their use."
        />
      ) : (
        <>
          <div className="metrics">
            <div>
              <span>Transcript files</span>
              <strong>{usage.sessions}</strong>
            </div>
            <div>
              <span>Skills used</span>
              <strong>
                {usage.skillsUsed} <small>/ {usage.skillsInstalled}</small>
              </strong>
            </div>
            <div>
              <span>Utilization</span>
              <strong>{Math.round(usage.utilization * 100)}%</strong>
            </div>
            <div>
              <span>Invalid lines</span>
              <strong>{usage.invalidLines}</strong>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Resource / tool</th>
                <th>Invocations</th>
                <th>Observed activity</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(usage.invocations)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{count}</td>
                    <td>
                      <meter
                        value={count}
                        min={0}
                        max={Math.max(...Object.values(usage.invocations), 1)}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!Object.keys(usage.invocations).length && (
            <Notice>
              Transcript files exist, but no supported tool invocations were
              found.
            </Notice>
          )}
        </>
      )}
    </div>
  );
}
export function Profiles({ workspace: w }: { workspace: Workspace }) {
  const [name, setName] = useState(""),
    [from, setFrom] = useState(""),
    [left, setLeft] = useState(""),
    [right, setRight] = useState("");
  const config = w.snapshot?.config;
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>A setup for each kind of work</h2>
          <p>
            Switch between focused configurations without changing your
            resources by hand.
          </p>
        </div>
      </div>
      <div className="profile-list">
        {Object.entries(config?.profiles ?? {}).map(([name, p]) => (
          <div className="profile-item" key={name}>
            <Layers size={22} />
            <div>
              <h3>
                {name}{" "}
                {config?.activeProfile === name && (
                  <Badge tone="green">Active</Badge>
                )}
              </h3>
              <p>
                {p.description ||
                  `${p.resources.length} resources in this configuration`}
              </p>
            </div>
            <Button
              disabled={!!w.busy || config?.activeProfile === name}
              onClick={() => void w.run(["profiles", "switch", name])}
            >
              Switch profile
            </Button>
          </div>
        ))}
      </div>
      <div className="form-section">
        <h3>Create a profile</h3>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void w.run([
              "profiles",
              "create",
              name,
              ...(from ? ["--from", from] : []),
            ]);
          }}
        >
          <label>
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="frontend"
            />
          </label>
          <label>
            Start from
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Empty profile</option>
              {Object.keys(config?.profiles ?? {}).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={!!w.busy || !config}>
            <Plus size={15} />
            Create profile
          </Button>
        </form>
      </div>
      <div className="form-section">
        <h3>Compare configurations</h3>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void w.run(["profiles", "diff", left, right]);
          }}
        >
          <label>
            Left
            <select
              required
              value={left}
              onChange={(e) => setLeft(e.target.value)}
            >
              <option value="">Choose profile</option>
              {Object.keys(config?.profiles ?? {}).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Right
            <select
              required
              value={right}
              onChange={(e) => setRight(e.target.value)}
            >
              <option value="">Choose profile</option>
              {Object.keys(config?.profiles ?? {}).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={!!w.busy || !left || !right}>
            <ArrowRightLeft size={15} />
            Compare
          </Button>
        </form>
      </div>
    </div>
  );
}
export function Loadouts({ workspace: w }: { workspace: Workspace }) {
  const [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<unknown>(null);
  return (
    <div className="split-view">
      <div className="loadout-list">
        {w.snapshot?.loadouts.map((name) => (
          <button
            className={selected === name ? "selected" : ""}
            key={name}
            disabled={!!w.busy}
            onClick={async () => {
              setSelected(name);
              const data = await w.run(
                ["loadouts", "show", name, "--explain"],
                false,
              );
              setDetail(data);
            }}
          >
            <div className="resource-glyph skill">
              <Layers size={20} />
            </div>
            <div>
              <strong>{name.replace(/-/g, " ")}</strong>
              <small>Curated skills and configuration</small>
            </div>
            <ArrowUpRight size={15} />
          </button>
        ))}
      </div>
      <div className="page-scroll">
        {selected ? (
          <>
            <div className="section-intro">
              <div>
                <Badge tone="blue">Loadout</Badge>
                <h2>{selected.replace(/-/g, " ")}</h2>
                <p>Review composition and reasons before installing.</p>
              </div>
              <Button
                variant="primary"
                disabled={!!w.busy || !w.snapshot?.initialized}
                onClick={() => void w.run(["loadouts", "install", selected])}
              >
                Preview installation
              </Button>
            </div>
            <Json value={detail} />
            <Notice>
              External prerequisites must be installed separately. A loadout
              with missing dependencies is not partially applied.
            </Notice>
          </>
        ) : (
          <Empty
            title="Choose a loadout"
            description="Combine a curated set of skills with the reasoning behind each choice."
          />
        )}
      </div>
    </div>
  );
}
export function Activity({ workspace: w }: { workspace: Workspace }) {
  const [entries, setEntries] = useState<unknown>(null);
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>Local change history</h2>
          <p>
            Inspect recorded transactions and recover from configuration
            changes.
          </p>
        </div>
        <Button
          disabled={!!w.busy}
          onClick={async () => setEntries(await w.run(["audit"], false))}
        >
          Load history
        </Button>
      </div>
      <div className="button-row">
        <Button disabled={!!w.busy} onClick={() => void w.run(["rollback"])}>
          Preview rollback
        </Button>
        <Button disabled={!!w.busy} onClick={() => void w.run(["recover"])}>
          Recover interrupted operation
        </Button>
        <Button
          disabled={!!w.busy}
          onClick={() => void w.run(["git", "status"])}
        >
          <Globe size={15} />
          Git status
        </Button>
        <Button disabled={!!w.busy} onClick={() => void w.run(["git", "pull"])}>
          Pull
        </Button>
        <Button disabled={!!w.busy} onClick={() => void w.run(["git", "push"])}>
          Push
        </Button>
      </div>
      {entries === null ? (
        <Empty
          title="Inspect your change history"
          description="Load the local audit trail to see operations made through ADK."
        />
      ) : (
        <Json value={entries} />
      )}
    </div>
  );
}
