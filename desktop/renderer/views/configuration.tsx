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
  Circle,
} from "lucide-react";
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
                      await window.preflight.forgetProject(p.id);
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
const severityWord = { error: "Error", warning: "Warning", info: "Note" };
type DoctorFinding = NonNullable<Workspace["snapshot"]>["findings"][number];
export function FindingRow({ finding: f }: { finding: DoctorFinding }) {
  const FindingIcon = severityIcon[f.severity];
  return (
    <article className={`finding ${f.severity}`} data-code={f.code}>
      <FindingIcon size={19} aria-hidden="true" />
      <div>
        <h3>
          {f.title ?? humanize(f.code)}
          <Badge tone={severityTone[f.severity]}>
            {severityWord[f.severity]}
          </Badge>
          {f.tokens !== undefined && (
            <span className="finding-cost">
              ~{f.tokens.toLocaleString()} tokens/session
            </span>
          )}
        </h3>
        <p>{f.message}</p>
        {f.explanation && <p className="finding-why">{f.explanation}</p>}
        {f.fix && (
          <p className="finding-fix">
            <span>Fix</span>
            <code>{f.fix}</code>
          </p>
        )}
        <small>
          {f.code}
          {f.resourceId ? ` · ${f.resourceId}` : ""}
        </small>
      </div>
    </article>
  );
}
export function Doctor({ workspace: w }: { workspace: Workspace }) {
  const [severity, setSeverity] = useState<
    "all" | "error" | "warning" | "info"
  >("all");
  const [processes, setProcesses] = useState<DoctorFinding[] | null>(null);
  useEffect(() => setProcesses(null), [w.snapshot]);
  const findings = [
    ...(w.snapshot?.findings ?? []),
    ...(processes ?? []).filter((f) => f.code === "mcp-processes"),
  ];
  const skipped = w.snapshot?.doctor?.skipped ?? [];
  const order = { error: 0, warning: 1, info: 2 };
  const filtered = findings
    .filter((f) => severity === "all" || f.severity === severity)
    .sort(
      (a, b) =>
        order[a.severity] - order[b.severity] ||
        (b.tokens ?? -1) - (a.tokens ?? -1),
    );
  const counts = {
    error: findings.filter((f) => f.severity === "error").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };
  const state = counts.error ? "error" : counts.warning ? "warn" : "ok";
  const Icon =
    state === "error" ? ShieldX : state === "warn" ? ShieldAlert : ShieldCheck;
  const countProcesses = async () => {
    const value = await w.run(["doctor", "--processes"], false);
    if (Array.isArray(value)) {
      const found = (value as DoctorFinding[]).filter(
        (f) => f.code === "mcp-processes",
      );
      setProcesses(found);
      if (!found.length) w.notify("Process counting is not available here");
    }
  };
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>Check your setup</h2>
          <p>
            Wiring, permissions, drift, and what your setup costs in context on
            every session. Findings refresh with the workspace.
          </p>
        </div>
        <div className="button-row">
          <Button
            disabled={!!w.busy}
            onClick={() => void w.run(["doctor", "--connect"])}
          >
            <ShieldCheck size={15} />
            Test MCP connections
          </Button>
          <Button disabled={!!w.busy} onClick={() => void countProcesses()}>
            <ActivityIcon size={15} />
            Count MCP processes
          </Button>
          <Button
            disabled={!!w.busy}
            onClick={() => void w.run(["doctor", "--measure"])}
          >
            <Layers size={15} />
            Measure startup hooks
          </Button>
        </div>
      </div>
      <div className={`health-summary ${state}`}>
        <Icon size={28} />
        <div>
          <strong>
            {counts.error
              ? `${plural(counts.error, "issue")} need attention`
              : counts.warning
                ? "No blocking issues, a few things to review"
                : "Nothing blocking"}
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
      {(["error", "warning", "info"] as const).map((group) => {
        const items = filtered.filter((f) => f.severity === group);
        if (!items.length) return null;
        const GroupIcon = severityIcon[group];
        return (
          <section
            className={`finding-group ${group}`}
            key={group}
            aria-label={severityWord[group]}
          >
            <h3 className="finding-group-title">
              <GroupIcon size={15} aria-hidden="true" />
              {severityWord[group]}
              <span>{items.length}</span>
            </h3>
            <div className="findings">
              {items.map((f, i) => (
                <FindingRow finding={f} key={`${f.code}-${i}`} />
              ))}
            </div>
          </section>
        );
      })}
      {skipped.length > 0 && (
        <section className="finding-group skipped" aria-label="Skipped">
          <h3 className="finding-group-title">
            <Circle size={13} aria-hidden="true" />
            Skipped
            <span>{skipped.length}</span>
          </h3>
          <ul className="skipped-list">
            {skipped.map((s) => (
              <li key={s.check}>
                <strong>{s.check}</strong> · {s.reason}
              </li>
            ))}
          </ul>
        </section>
      )}
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

const compact = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(1)}B`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)}M`
      : n >= 1e4
        ? `${Math.round(n / 1e3)}k`
        : n.toLocaleString();
const usd = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 10 ? 2 : 0,
  });
const percent = (n: number) => `${Math.round(n * 100)}%`;
const agentName = (agent: string) =>
  agent === "codex" ? "Codex" : agent === "claude-code" ? "Claude Code" : agent;

/** Tokens per day over the window: a small inline bar chart, no library. */
export function DailyBars({
  days,
  since,
  until,
}: {
  days: { day: string; tokens: number; cost: number }[];
  since: string | null;
  until: string;
}) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const first = since ?? days[0]?.day ?? until;
  const series: { day: string; tokens: number; cost: number }[] = [];
  const cursor = new Date(`${first}T00:00:00`);
  for (let i = 0; i < 400; i++) {
    const day = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (day > until) break;
    series.push(byDay.get(day) ?? { day, tokens: 0, cost: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  const max = Math.max(1, ...series.map((d) => d.tokens));
  const width = 520,
    height = 120,
    gap = 2,
    bar = Math.max(
      2,
      (width - gap * series.length) / Math.max(1, series.length),
    );
  return (
    <figure className="usage-chart">
      <svg
        viewBox={`0 0 ${width} ${height + 18}`}
        role="img"
        aria-label={`Tokens per day from ${series[0]?.day ?? first} to ${until}`}
      >
        <line x1={0} x2={width} y1={height} y2={height} className="axis" />
        {series.map((d, i) => {
          const h = d.tokens ? Math.max(2, (d.tokens / max) * (height - 8)) : 0;
          return (
            <rect
              key={d.day}
              x={i * (bar + gap)}
              y={height - h}
              width={bar}
              height={h}
              rx={1.5}
            >
              <title>{`${d.day}: ${d.tokens.toLocaleString()} tokens, ${usd(d.cost)}`}</title>
            </rect>
          );
        })}
        <text x={0} y={height + 14}>
          {series[0]?.day ?? first}
        </text>
        <text x={width} y={height + 14} textAnchor="end">
          {until}
        </text>
      </svg>
      <figcaption>
        Tokens per day · peak {compact(max)} · hover a bar for its day
      </figcaption>
    </figure>
  );
}

export function Usage({ workspace: w }: { workspace: Workspace }) {
  const usage = w.snapshot?.usage;
  const reading = w.state?.preferences?.readTranscripts ?? true;
  const entries = Object.entries(usage?.invocations ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);
  const top = Math.max(1, ...entries.map(([, count]) => count));
  const setReading = (readTranscripts: boolean) =>
    void w.task(
      readTranscripts ? "Reading transcripts…" : "Turning off…",
      async () => {
        w.setState(await window.preflight.preferences({ readTranscripts }));
        await w.reload();
      },
    );
  const measured = !!usage && (usage.totals.tokens > 0 || usage.sessions > 0);
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>Evidence from your sessions</h2>
          <p>
            Tokens, cache use and estimated cost over the last 30 days, from
            local Claude Code and Codex transcripts. Text mentions are not
            counted.
          </p>
        </div>
        <Button
          disabled={!!w.busy || !usage?.sessions || !reading}
          onClick={() => void w.run(["prune"])}
        >
          Review pruning proposals
        </Button>
      </div>
      <label className="checkbox usage-setting">
        <input
          type="checkbox"
          checked={reading}
          disabled={!!w.busy}
          onChange={(e) => setReading(e.target.checked)}
        />
        <span>
          <strong>Read conversation transcripts</strong>
          <small>
            Preflight reads ~/.claude/projects and ~/.codex/sessions on this
            computer to count tokens, tool calls and skills. Transcripts are
            read locally only; nothing leaves the machine. Turn this off to stop
            reading them.
          </small>
        </span>
      </label>
      {!reading || w.snapshot?.transcriptsOff ? (
        <Empty
          icon={ActivityIcon}
          title="Transcript reading is off"
          description="Usage, skill utilisation and pruning proposals need transcripts. Turn the setting on to measure them."
        />
      ) : !usage || !measured ? (
        <Empty
          icon={ActivityIcon}
          title="Usage is unknown"
          description="No readable transcripts were found in the last 30 days. Use your skills and MCP servers in a session, then refresh to measure their use."
        />
      ) : (
        <>
          <div className="metrics">
            <div>
              <span>Tokens</span>
              <strong>{compact(usage.totals.tokens)}</strong>
              <small>
                {compact(usage.totals.input)} in ·{" "}
                {compact(usage.totals.output)} out
              </small>
            </div>
            <div>
              <span>Cache hit rate</span>
              <strong>{percent(usage.cacheHitRate)}</strong>
              <small>
                {compact(usage.totals.cacheRead)} read ·{" "}
                {compact(usage.totals.cacheWrite)} written
              </small>
            </div>
            <div>
              <span>Estimated cost</span>
              <strong>
                {usd(usage.costEstimate.usd)}
                {usage.costEstimate.complete ? "" : "+"}
              </strong>
              <small>list price</small>
            </div>
            <div>
              <span>Sessions</span>
              <strong>{usage.sessions.toLocaleString()}</strong>
              <small>
                {usage.byAgent
                  .map((a) => `${agentName(a.agent)} ${compact(a.tokens)}`)
                  .join(" · ")}
              </small>
            </div>
          </div>
          {!usage.costEstimate.complete && (
            <Notice tone="info">
              No price for {usage.costEstimate.unpricedModels.join(", ")}:{" "}
              {compact(usage.totals.unpricedTokens)} tokens are not in the
              estimate.
            </Notice>
          )}
          <DailyBars
            days={usage.byDay}
            since={usage.window.since}
            until={usage.window.until}
          />
          <p className="usage-note">
            Estimate at Anthropic list prices (retrieved{" "}
            {usage.costEstimate.prices.retrieved}); plans, batch and discounts
            are not applied. Skills used: {usage.skillsUsed} of{" "}
            {usage.skillsInstalled} ({percent(usage.utilization)}).
            {usage.invalidLines
              ? ` ${usage.invalidLines.toLocaleString()} unreadable lines skipped.`
              : ""}
          </p>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Top sessions</th>
                  <th>Agent</th>
                  <th>Days</th>
                  <th>Tokens</th>
                  <th>Cache hit</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.bySession.slice(0, 8).map((s) => (
                  <tr key={`${s.agent}:${s.session}`}>
                    <td title={s.session}>
                      <code>{tildify(s.project, w.snapshot?.home)}</code>
                      <small className="muted"> · {s.model}</small>
                    </td>
                    <td>{agentName(s.agent)}</td>
                    <td>
                      {s.first === s.last ? s.first : `${s.first} – ${s.last}`}
                    </td>
                    <td>{compact(s.tokens)}</td>
                    <td>{percent(s.cacheHitRate)}</td>
                    <td>{s.unpricedTokens ? "—" : usd(s.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {usage.bySkill.length ? (
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Top skills</th>
                    <th>Calls</th>
                    <th>Tokens after the call</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.bySkill.slice(0, 8).map((s) => (
                    <tr key={s.skill}>
                      <td>
                        <code>{s.skill}</code>
                      </td>
                      <td>{s.calls.toLocaleString()}</td>
                      <td>{compact(s.tokens)}</td>
                      <td>{usd(s.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
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
              Transcripts exist, but no supported tool invocations were found.
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
export function Loadouts({
  workspace: w,
  navigate,
}: {
  workspace: Workspace;
  navigate?: (view: string) => void;
}) {
  const [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<unknown>(null);
  const catalogue = {
    loadouts: w.snapshot?.loadoutCatalog.details ?? {},
    presets: w.snapshot?.loadoutCatalog.presets ?? {},
  };
  if (w.snapshot && !w.snapshot.loadouts.length)
    return (
      <div className="page-scroll">
        <Empty
          icon={Package}
          title="No loadouts yet"
          description="Loadouts come from content sources. Add one, such as github:arhunsaday/agent-kit, to list its role and stack bundles here."
          action={
            navigate ? (
              <Button variant="primary" onClick={() => navigate("sources")}>
                Add a source
              </Button>
            ) : undefined
          }
        />
      </div>
    );
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
                {catalogue.loadouts[name]?.source &&
                  ` · ${catalogue.loadouts[name]?.source}`}
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
            Every write Preflight makes is journaled here. Roll back the latest
            change or recover an interrupted one; both open a preview.
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
          description="Initialize this workspace; every change made through Preflight will be recorded here."
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
