import {
  Globe,
  Layers,
  Plug,
  Compass,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  CheckCircle2,
  Circle,
  Rocket,
  ArrowDownToLine,
  ArrowUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { buildContextReport, contextResources } from "../../../src/context-map";
import { availableResources, type Workspace } from "../workspace";
import { plural, tildify } from "../format";
import { Button, Notice } from "../components/ui";

interface Stat {
  title: string;
  icon: LucideIcon;
  view: string;
  value: string;
  note: string;
  tone?: "error";
}

export function Overview({
  workspace: w,
  navigate,
}: {
  workspace: Workspace;
  navigate: (view: string) => void;
}) {
  const global = w.state?.workspace === "global";
  const snapshot = w.snapshot;
  const home = snapshot?.home;
  const resources = availableResources(snapshot);
  const own = snapshot?.resources.length ?? 0;
  const inherited = snapshot?.inherited.length ?? 0;
  const detected = snapshot?.detected.length ?? 0;
  const errors =
    snapshot?.findings.filter((f) => f.severity === "error").length ?? 0;
  const warnings =
    snapshot?.findings.filter((f) => f.severity === "warning").length ?? 0;
  const skills = resources.filter((r) => r.type === "skill").length;
  const servers = resources.filter((r) => r.type === "mcp").length;
  const context = buildContextReport(
    contextResources(
      snapshot?.detected ?? [],
      snapshot?.inherited ?? [],
      snapshot?.resources ?? [],
    ),
  ).estimatedTokens;
  const stats: Stat[] = [
    {
      title: "Skills",
      icon: Layers,
      view: "skills",
      value: String(skills),
      note: global ? "Available everywhere" : "Including inherited",
    },
    {
      title: "MCP servers",
      icon: Plug,
      view: "mcp",
      value: String(servers),
      note: "Tools connected to agents",
    },
    {
      title: "Detected",
      icon: ArrowDownToLine,
      view: "detected",
      value: String(detected),
      note: detected ? "Ready to adopt" : "Nothing unmanaged",
    },
    {
      title: "Context",
      icon: Compass,
      view: "context",
      value: `~${context.toLocaleString()}`,
      note: "Estimated tokens if loaded",
    },
  ];
  const steps = [
    {
      label: global
        ? "Initialize your global configuration"
        : "Initialize this project",
      done: !!snapshot?.initialized,
      action: (
        <Button variant="primary" onClick={() => void w.run(["init"])}>
          <Rocket size={13} />
          Initialize
        </Button>
      ),
    },
    {
      label: detected
        ? `Adopt resources you already have (${detected} detected)`
        : "Add your first skill or MCP server",
      done: own > 0,
      action: detected ? (
        <Button onClick={() => navigate("detected")}>Review</Button>
      ) : (
        <Button onClick={() => navigate("catalogue")}>Browse</Button>
      ),
    },
    {
      label: "Resolve blocking doctor findings",
      done: errors === 0,
      action: <Button onClick={() => navigate("doctor")}>Open doctor</Button>,
    },
  ];
  const completed = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  const HealthIcon = errors ? ShieldX : warnings ? ShieldAlert : ShieldCheck;
  return (
    <div className="page-scroll overview-page">
      <div className="section-intro">
        <div>
          <h2>
            {global
              ? "Global configuration"
              : (w.state?.projects.find(
                  (p) => p.id === w.state?.activeProjectId,
                )?.name ?? "Project")}
          </h2>
          <p>
            {global
              ? "Skills, MCP servers and defaults shared by every project."
              : "Project tools on top of your global setup. Every change is previewed before it is written."}
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate("catalogue")}>
          <Compass size={15} />
          Discover resources
        </Button>
      </div>
      <div className="stat-grid">
        {stats.map((stat) => (
          <button
            className={`stat-card ${stat.tone ?? ""}`}
            key={stat.view}
            onClick={() => navigate(stat.view)}
          >
            <header>
              {stat.title}
              <stat.icon />
            </header>
            <strong>{stat.value}</strong>
            <small>{stat.note}</small>
          </button>
        ))}
      </div>
      {completed < steps.length && snapshot && (
        <section className="workspace-location">
          <div className="card-heading">
            <div>
              <h3>Get started</h3>
              <p>
                {completed} of {steps.length} done
              </p>
            </div>
          </div>
          <div className="progress" aria-hidden="true">
            <i style={{ width: `${(completed / steps.length) * 100}%` }} />
          </div>
          <ol className="checklist">
            {steps.map((step, i) => (
              <li className={step.done ? "done" : ""} key={step.label}>
                {step.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                <span>{step.label}</span>
                {!step.done && i === next && step.action}
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="overview-grid">
        <section className="workspace-location">
          <h3>Configuration health</h3>
          <p>Wiring, permissions, conflicts and drift.</p>
          <div
            className={`health-line ${errors ? "error" : warnings ? "warn" : ""}`}
          >
            <HealthIcon />
            <div>
              <strong>
                {errors
                  ? plural(errors, "blocking finding")
                  : warnings
                    ? "No blocking findings"
                    : "Everything looks healthy"}
              </strong>
              <span>
                {plural(errors, "error")} · {plural(warnings, "warning")}
              </span>
            </div>
          </div>
          <div className="button-row">
            <Button onClick={() => navigate("doctor")}>Open doctor</Button>
            <Button variant="ghost" onClick={() => navigate("context")}>
              View context map
            </Button>
          </div>
        </section>
        <section className="workspace-location path-register">
          <h3>Files</h3>
          <p>Where this configuration lives and what it writes.</p>
          <dl>
            <div>
              <dt>Configuration</dt>
              <dd>
                <code title={`${snapshot?.root}/preflight.config.json`}>
                  {tildify(`${snapshot?.root}/preflight.config.json`, home)}
                </code>
              </dd>
            </div>
            <div>
              <dt>Agent files</dt>
              <dd>
                {[".claude", ".cursor"].map((folder) => (
                  <code key={folder}>
                    {tildify(
                      `${global ? snapshot?.home : snapshot?.root}/${folder}`,
                      home,
                    )}
                  </code>
                ))}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      {!global && (
        <section className="workspace-location">
          <div className="section-intro">
            <div>
              <h3>Inherited global configuration</h3>
              <p>
                {plural(inherited, "resource")} managed globally and available
                in this project.
              </p>
            </div>
            <Button onClick={() => void w.switchGlobal()}>
              <Globe size={15} />
              Manage global
              <ArrowUpRight size={14} />
            </Button>
          </div>
          {snapshot?.resources.some((r) => r.scope === "global") && (
            <Notice>
              This project also manages global resources from an earlier
              configuration. They remain here; nothing has been migrated or
              overwritten. Use All scopes in the resource list to inspect them.
            </Notice>
          )}
        </section>
      )}
    </div>
  );
}
