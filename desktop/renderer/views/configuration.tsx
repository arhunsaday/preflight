import { useEffect, useState } from "react";
import {
  FolderPlus,
  FolderOpen,
  ArrowUpRight,
  Layers,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  OctagonAlert,
  Info,
  ArrowRightLeft,
  RefreshCw,
  WandSparkles,
  Plus,
  GitBranch,
  ArrowDownToLine,
  ArrowUpFromLine,
  Undo2,
  LifeBuoy,
  History,
  Package,
  Users,
  Activity as ActivityIcon,
  FilePen,
  Check,
} from "lucide-react";
import loadoutCatalog from "../../../catalog/loadouts.json";
import type { Workspace } from "../workspace";
import { humanize, plural, relativeTime, tildify } from "../format";
import { Badge, Button, Empty, Json, Notice } from "../components/ui";

export function Projects({ workspace: w }: { workspace: Workspace }) {
  const projects = w.state?.projects ?? [];
  const home = w.snapshot?.home;
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>Your project workspaces</h2>
          <p>
            Keep each project's AI setup focused. Global resources stay
            available across projects. Opening a folder never changes it until
            you initialize it.
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
      {projects.length ? (
        <div className="project-list">
          {projects.map((p) => {
            const current =
              w.state?.workspace === "project" &&
              p.id === w.state?.activeProjectId;
            return (
              <div
                className={`project-item ${current ? "active" : ""}`}
                key={p.id}
              >
                <div className="project-icon">
                  <FolderOpen size={22} />
                </div>
                <div>
                  <h3>
                    {p.name} {current && <Badge tone="green">Active</Badge>}
                  </h3>
                  <p title={p.root}>{tildify(p.root, home)}</p>
                  <small>Added {relativeTime(p.addedAt)}</small>
                </div>
                <Button
                  disabled={!!w.busy || current}
                  onClick={() => void w.switchProject(p.id)}
                >
                  Open
                  <ArrowUpRight size={14} />
                </Button>
                <Button
                  disabled={!!w.busy}
                  variant="ghost"
                  title="Remove from this list. Files are not touched."
                  onClick={() =>
                    void w.task("Removing from recent projects…", async () => {
                      await window.adk.forgetProject(p.id);
                      await w.reload();
                      w.notify(`${p.name} removed from recent projects`);
                    })
                  }
                >
                  Forget
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={FolderOpen}
          title="No projects yet"
          description="Open a repository to give it its own skills and MCP servers on top of your global setup."
          action={
            <Button onClick={() => void w.chooseProject()}>
              <FolderPlus size={15} />
              Open project
            </Button>
          }
        />
      )}
      {w.snapshot && w.state?.workspace === "project" && (
        <div className="section-intro secondary-intro">
          <div>
            <h2>Project maintenance</h2>
            <p>
              Sync writes the desired configuration to agent files. AGENTS.md is
              generated from the detected stack. Both open a preview first.
            </p>
          </div>
          <div className="button-row">
            <Button
              disabled={!!w.busy || !w.snapshot.initialized}
              onClick={() => void w.run(["sync"])}
            >
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

const severityIcon = {
  error: OctagonAlert,
  warning: AlertTriangle,
  info: Info,
};
const severityTone = { error: "red", warning: "amber", info: "info" };
export function Doctor({ workspace: w }: { workspace: Workspace }) {
  const [severity, setSeverity] = useState<
    "all" | "error" | "warning" | "info"
  >("all");
  const findings = w.snapshot?.findings ?? [];
  const order = { error: 0, warning: 1, info: 2 };
  const filtered = findings
    .filter((f) => severity === "all" || f.severity === severity)
    .sort((a, b) => order[a.severity] - order[b.severity]);
  const counts = {
    error: findings.filter((f) => f.severity === "error").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };
  const state = counts.error ? "error" : counts.warning ? "warn" : "ok";
  const Icon =
    state === "error" ? ShieldX : state === "warn" ? ShieldAlert : ShieldCheck;
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>Check your setup</h2>
          <p>
            Wiring, permissions, conflicts and drift across your configured
            agents. Findings refresh with the workspace.
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
      <div className={`health-summary ${state}`}>
        <Icon size={28} />
        <div>
          <strong>
            {counts.error
              ? `${plural(counts.error, "issue")} need attention`
              : counts.warning
                ? "No blocking issues, a few things to review"
                : "Everything looks healthy"}
          </strong>
          <p>
            {plural(counts.error, "error")} ·{" "}
            {plural(counts.warning, "warning")} · {plural(counts.info, "note")}
          </p>
        </div>
        <div
          className="segmented"
          role="radiogroup"
          aria-label="Finding severity"
        >
          {(["all", "error", "warning", "info"] as const).map((value) => (
            <button
              key={value}
              role="radio"
              aria-checked={severity === value}
              className={severity === value ? "active" : ""}
              onClick={() => setSeverity(value)}
            >
              {value === "all"
                ? "All"
                : value === "error"
                  ? `Errors ${counts.error}`
                  : value === "warning"
                    ? `Warnings ${counts.warning}`
                    : `Notes ${counts.info}`}
            </button>
          ))}
        </div>
      </div>
      <div className="findings">
        {filtered.map((f, i) => {
          const FindingIcon = severityIcon[f.severity];
          return (
            <article className={`finding ${f.severity}`} key={i}>
              <FindingIcon size={19} />
              <div>
                <h3>
                  {humanize(f.code)}
                  <Badge tone={severityTone[f.severity]}>{f.severity}</Badge>
                </h3>
                <p>{f.message}</p>
                {f.resourceId && <small>{f.resourceId}</small>}
              </div>
            </article>
          );
        })}
      </div>
      {!findings.length ? (
        <Empty
          icon={ShieldCheck}
          title="No findings"
          description="The doctor found nothing to report for this workspace's configured agents."
        />
      ) : (
        !filtered.length && (
          <p className="hint">No findings at this severity.</p>
        )
      )}
    </div>
  );
}

export function Usage({ workspace: w }: { workspace: Workspace }) {
  const usage = w.snapshot?.usage;
  const entries = Object.entries(usage?.invocations ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  const top = Math.max(1, ...entries.map(([, count]) => count));
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
        <Button
          disabled={!!w.busy || !usage?.sessions}
          onClick={() => void w.run(["prune"])}
        >
          Review pruning proposals
        </Button>
      </div>
      {!usage?.sessions ? (
        <Empty
          icon={ActivityIcon}
          title="Usage is unknown"
          description="No readable transcripts were found. Use your skills and MCP servers in a session, then refresh to measure their use."
        />
      ) : (
        <>
          <div className="metrics">
            <div>
              <span>Transcript files</span>
              <strong>{usage.sessions.toLocaleString()}</strong>
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
              <span>Unreadable lines</span>
              <strong>{usage.invalidLines.toLocaleString()}</strong>
            </div>
          </div>
          {entries.length ? (
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Resource / tool</th>
                    <th>Invocations</th>
                    <th>Share of activity</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(([name, count]) => (
                    <tr key={name}>
                      <td>
                        <code>{name}</code>
                      </td>
                      <td>{count.toLocaleString()}</td>
                      <td>
                        <div
                          className="bar"
                          role="meter"
                          aria-valuemin={0}
                          aria-valuemax={top}
                          aria-valuenow={count}
                          aria-label={`${name} invocations`}
                        >
                          <i style={{ width: `${(count / top) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Notice tone="info">
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
  const profiles = Object.entries(config?.profiles ?? {});
  const taken = !!name && !!config?.profiles[name];
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
      {!config ? (
        <Empty
          icon={Layers}
          title="No profiles yet"
          description="Initialize this workspace to create its default profile."
        />
      ) : (
        <div className="profile-list">
          {profiles.map(([profile, p]) => {
            const current = config.activeProfile === profile;
            return (
              <div
                className={`profile-item ${current ? "active" : ""}`}
                key={profile}
              >
                <Layers size={20} />
                <div>
                  <h3>
                    {profile} {current && <Badge tone="green">Active</Badge>}
                  </h3>
                  <p>
                    {p.description ? `${p.description} · ` : ""}
                    {plural(p.resources.length, "resource")}
                  </p>
                </div>
                <Button
                  disabled={!!w.busy || current}
                  onClick={() => void w.run(["profiles", "switch", profile])}
                >
                  {current ? (
                    <>
                      <Check size={14} />
                      In use
                    </>
                  ) : (
                    "Switch profile"
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <div className="form-section">
        <h3>Create a profile</h3>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void w
              .run([
                "profiles",
                "create",
                name,
                ...(from ? ["--from", from] : []),
              ])
              .then((value) => {
                if (value !== undefined) setName("");
              });
          }}
        >
          <label>
            Name
            <input
              required
              value={name}
              pattern="[A-Za-z0-9_\-]+"
              title="Letters, numbers, dashes and underscores"
              onChange={(e) => setName(e.target.value.trim())}
              placeholder="frontend"
            />
          </label>
          <label>
            Start from
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Empty profile</option>
              {profiles.map(([n]) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={!!w.busy || !config || taken}>
            <Plus size={15} />
            Create profile
          </Button>
        </form>
        {taken && <p className="hint">A profile named “{name}” exists.</p>}
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
              {profiles.map(([n]) => (
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
              {profiles.map(([n]) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <Button
            type="submit"
            disabled={!!w.busy || !left || !right || left === right}
          >
            <ArrowRightLeft size={15} />
            Compare
          </Button>
        </form>
      </div>
    </div>
  );
}

interface LoadoutItem {
  id: string;
  why: string;
  kind: string;
  from: string;
  scope?: string;
  needs?: string[];
  blocking?: boolean;
  external?: string;
}
const catalogue = loadoutCatalog as {
  loadouts: Record<string, { description?: string; extends?: string }>;
  presets?: Record<string, string[]>;
};
export function Loadouts({ workspace: w }: { workspace: Workspace }) {
  const [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<unknown>(null);
  const presets = Object.entries(catalogue.presets ?? {});
  const open = async (name: string) => {
    setSelected(name);
    setDetail(null);
    setDetail(await w.run(["loadouts", "show", name, "--explain"], false));
  };
  const items = Array.isArray(detail) ? (detail as LoadoutItem[]) : null;
  const kinds = items ? [...new Set(items.map((i) => i.kind))] : [];
  const entry = catalogue.loadouts[selected];
  const preset = catalogue.presets?.[selected];
  return (
    <div className="split-view">
      <div className="loadout-list">
        <span className="nav-label">Loadouts</span>
        {w.snapshot?.loadouts.map((name) => (
          <button
            className={selected === name ? "selected" : ""}
            key={name}
            disabled={!!w.busy}
            onClick={() => void open(name)}
          >
            <div className="resource-glyph skill">
              <Package size={18} />
            </div>
            <div>
              <strong>{name}</strong>
              <small>
                {catalogue.loadouts[name]?.description ??
                  "Curated skills and configuration"}
              </small>
            </div>
          </button>
        ))}
        {presets.length > 0 && <span className="nav-label">Role presets</span>}
        {presets.map(([name, layers]) => (
          <button
            className={selected === name ? "selected" : ""}
            key={name}
            disabled={!!w.busy}
            onClick={() => void open(name)}
          >
            <div className="resource-glyph mcp">
              <Users size={18} />
            </div>
            <div>
              <strong>{name}</strong>
              <small>{layers.join(" + ")}</small>
            </div>
          </button>
        ))}
      </div>
      <div className="page-scroll">
        {selected ? (
          <>
            <div className="section-intro">
              <div>
                <Badge tone="blue">{preset ? "Role preset" : "Loadout"}</Badge>
                <h2>{selected}</h2>
                <p>
                  {preset
                    ? `Combines ${preset.join(", ")}.`
                    : (entry?.description ??
                      "Curated skills and configuration.")}
                  {entry?.extends && ` Builds on ${entry.extends}.`} Review each
                  choice before installing.
                </p>
              </div>
              <Button
                variant="primary"
                disabled={!!w.busy || !w.snapshot?.initialized}
                onClick={() => void w.run(["loadouts", "install", selected])}
              >
                <ArrowDownToLine size={15} />
                Preview installation
              </Button>
            </div>
            {!w.snapshot?.initialized && (
              <Notice>Initialize this workspace to install a loadout.</Notice>
            )}
            {items ? (
              kinds.map((kind) => (
                <section className="loadout-kind" key={kind}>
                  <h3>
                    {kind}
                    <Badge>{items.filter((i) => i.kind === kind).length}</Badge>
                  </h3>
                  <div className="loadout-items">
                    {items
                      .filter((i) => i.kind === kind)
                      .map((item) => (
                        <div className="loadout-item" key={item.id}>
                          <div>
                            <strong>{item.id}</strong>
                            <span>
                              {item.scope && <Badge>{item.scope}</Badge>}
                              {item.from !== selected && (
                                <Badge tone="info">from {item.from}</Badge>
                              )}
                              {item.blocking && (
                                <Badge tone="orange">blocking</Badge>
                              )}
                            </span>
                          </div>
                          <div>
                            <p>{item.why}</p>
                            {(item.needs?.length || item.external) && (
                              <span>
                                {item.needs?.map((need) => (
                                  <Badge tone="amber" key={need}>
                                    needs {need}
                                  </Badge>
                                ))}
                                {item.external && (
                                  <Badge tone="amber">
                                    external · {item.external}
                                  </Badge>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              ))
            ) : detail !== null ? (
              <Json value={detail} />
            ) : (
              <p className="muted">Loading composition…</p>
            )}
            <Notice tone="info">
              External prerequisites must be installed separately. A loadout
              with missing dependencies is not partially applied.
            </Notice>
          </>
        ) : (
          <Empty
            icon={Package}
            title="Choose a loadout"
            description="Each loadout is a curated set of skills, agents and MCP servers, with the reasoning behind every choice."
          />
        )}
      </div>
    </div>
  );
}

interface AuditEntry {
  id?: string;
  at?: string;
  actor?: string;
  source?: string;
  action?: string;
  paths?: string[];
  transactions?: string[];
}
export function Activity({ workspace: w }: { workspace: Workspace }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const initialized = !!w.snapshot?.initialized;
  const home = w.snapshot?.home;
  const load = async () => {
    const value = await w.run(["audit"], false);
    if (Array.isArray(value)) setEntries(value as AuditEntry[]);
  };
  // Load once per workspace; the parent remounts this view when it changes.
  useEffect(() => {
    if (initialized) void load();
  }, [initialized]);
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>Local change history</h2>
          <p>
            Every write ADK makes is journaled here. Roll back the latest change
            or recover an interrupted one; both open a preview.
          </p>
        </div>
        <Button
          variant="ghost"
          disabled={!!w.busy || !initialized}
          onClick={() => void load()}
        >
          <RefreshCw size={15} />
          Reload history
        </Button>
      </div>
      <div className="toolbar-group">
        <Button
          disabled={!!w.busy || !initialized}
          onClick={() => void w.run(["rollback"])}
        >
          <Undo2 size={15} />
          Preview rollback
        </Button>
        <Button
          disabled={!!w.busy || !initialized}
          onClick={() => void w.run(["recover"])}
        >
          <LifeBuoy size={15} />
          Recover interrupted operation
        </Button>
        <span className="divider" />
        <Button
          disabled={!!w.busy}
          onClick={() => void w.run(["git", "status"])}
        >
          <GitBranch size={15} />
          Git status
        </Button>
        <Button disabled={!!w.busy} onClick={() => void w.run(["git", "pull"])}>
          <ArrowDownToLine size={15} />
          Git pull
        </Button>
        <Button disabled={!!w.busy} onClick={() => void w.run(["git", "push"])}>
          <ArrowUpFromLine size={15} />
          Git push
        </Button>
      </div>
      {!initialized ? (
        <Empty
          icon={History}
          title="No history yet"
          description="Initialize this workspace; every change made through ADK will be recorded here."
        />
      ) : entries === null ? (
        <p className="muted">Loading history…</p>
      ) : !entries.length ? (
        <Empty
          icon={History}
          title="No changes recorded"
          description="Changes you apply from Preflight or the CLI will appear here, newest first."
        />
      ) : (
        <ol className="timeline">
          {[...entries].reverse().map((entry, i) => {
            const recover = entry.action === "recover";
            return (
              <li key={entry.id ?? `${entry.at}-${i}`}>
                <span className="timeline-icon">
                  {recover ? <LifeBuoy size={15} /> : <FilePen size={15} />}
                </span>
                <div>
                  <strong>
                    {recover
                      ? `Recovered ${plural(entry.transactions?.length ?? 0, "transaction")}`
                      : entry.source
                        ? `Applied ${entry.source}`
                        : `Changed ${plural(entry.paths?.length ?? 0, "file")}`}
                  </strong>
                  <p>
                    {entry.actor ?? "local"}
                    {entry.id && (
                      <>
                        {" · "}
                        <code>{entry.id.slice(0, 8)}</code>
                      </>
                    )}
                  </p>
                  {!!entry.paths?.length && (
                    <details>
                      <summary>{plural(entry.paths.length, "file")}</summary>
                      <ul>
                        {entry.paths.map((path) => (
                          <li key={path}>{tildify(path, home)}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                {entry.at && (
                  <time dateTime={entry.at} title={entry.at}>
                    {relativeTime(entry.at)}
                  </time>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
