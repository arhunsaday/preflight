import {
  Globe,
  FolderOpen,
  Layers,
  Plug,
  Compass,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  CheckCircle2,
  Circle,
  Rocket,
  ArrowDownToLine,
} from "lucide-react";
import { availableResources, type Workspace } from "../workspace";
import { plural, tildify } from "../format";
import { Badge, Button, Notice } from "../components/ui";
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
  const errors =
    snapshot?.findings.filter((f) => f.severity === "error").length ?? 0;
  const warnings =
    snapshot?.findings.filter((f) => f.severity === "warning").length ?? 0;
  const cards = [
    {
      title: "Skills",
      icon: Layers,
      view: "skills",
      count: resources.filter((r) => r.type === "skill").length,
      text: "Instructions your agents can use",
    },
    {
      title: "MCP servers",
      icon: Plug,
      view: "mcp",
      count: resources.filter((r) => r.type === "mcp").length,
      text: "Tools and services connected to your agents",
    },
    {
      title: "Detected",
      icon: FolderOpen,
      view: "detected",
      count: snapshot?.detected.length ?? 0,
      text: "Existing resources available to adopt",
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
      label: snapshot?.detected.length
        ? `Adopt resources you already have (${snapshot.detected.length} detected)`
        : "Add your first skill or MCP server",
      done: own > 0,
      action: snapshot?.detected.length ? (
        <Button onClick={() => navigate("detected")}>
          <ArrowDownToLine size={13} />
          Review
        </Button>
      ) : (
        <Button onClick={() => navigate("catalogue")}>
          <Compass size={13} />
          Browse
        </Button>
      ),
    },
    {
      label: "Resolve blocking doctor findings",
      done: errors === 0,
      action: (
        <Button onClick={() => navigate("doctor")}>
          <ShieldCheck size={13} />
          Open doctor
        </Button>
      ),
    },
  ];
  const remaining = steps.filter((s) => !s.done).length;
  const next = steps.findIndex((s) => !s.done);
  const HealthIcon = errors ? ShieldX : warnings ? ShieldAlert : ShieldCheck;
  return (
    <div className="page-scroll overview-page">
      <div className="section-intro">
        <div>
          <Badge tone="blue">{global ? "All projects" : "This project"}</Badge>
          <h2>
            {global
              ? "Your global AI configuration"
              : "Your project AI configuration"}
          </h2>
          <p>
            {global
              ? "Set up skills, MCP servers and defaults once for all your projects. No project needs to be open."
              : "Keep project-specific tools here. Your global configuration remains available to your agents."}
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate("catalogue")}>
          <Compass size={16} />
          Discover resources
        </Button>
      </div>
      <div className="briefing-layout">
        <section className="workspace-briefing">
          <div className="briefing-top">
            {global ? <Globe size={18} /> : <FolderOpen size={18} />}
            <span>
              {global
                ? "Defaults that travel with you"
                : "A setup for this project"}
            </span>
          </div>
          <h3>
            {global
              ? "One setup. Every project."
              : "A shared foundation, your own tools."}
          </h3>
          <p>
            {global
              ? "Build your baseline here. Project workspaces add the tools they need while keeping this setup available."
              : "Your global setup stays connected. Add project resources here and review exactly what changes before applying them."}
          </p>
          <div className="scope-route">
            <span>
              <Globe size={16} />
              Global configuration
              {!global && <b>{inherited}</b>}
              {global && <b>{own}</b>}
            </span>
            <div aria-hidden="true" className="scope-route-line" />
            <span>
              <FolderOpen size={16} />
              {global ? "Your projects" : "This project"}
              {global ? <b>{w.state?.projects.length ?? 0}</b> : <b>{own}</b>}
            </span>
          </div>
          <div className="briefing-actions">
            <Button onClick={() => navigate("resources")}>
              Manage configuration
            </Button>
            <Button variant="ghost" onClick={() => navigate("doctor")}>
              <ShieldCheck size={15} />
              Check setup
            </Button>
          </div>
        </section>
        <section className="setup-inventory" aria-label="Workspace resources">
          <h3>On board</h3>
          {cards.map((card) => (
            <button
              className="inventory-row"
              key={card.view}
              onClick={() => navigate(card.view)}
            >
              <span className="inventory-icon">
                <card.icon size={19} />
              </span>
              <span>
                <strong>{card.title}</strong>
                <small>{card.text}</small>
              </span>
              <b>{card.count}</b>
              <ArrowRight size={15} />
            </button>
          ))}
          {!global && (
            <p className="hint">
              Includes global resources inherited by this workspace.
            </p>
          )}
        </section>
      </div>
      {remaining > 0 && snapshot && (
        <section className="workspace-location">
          <h3>Get started</h3>
          <p>
            {plural(remaining, "step")} left to a working{" "}
            {global ? "global" : "project"} setup.
          </p>
          <ol className="checklist">
            {steps.map((step, i) => (
              <li className={step.done ? "done" : ""} key={step.label}>
                {step.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                <span>{step.label}</span>
                {!step.done && i === next && step.action}
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="overview-grid">
        <section className="workspace-location path-register">
          <h3>{global ? "Global configuration" : "Project configuration"}</h3>
          <p>Your configuration file and agent destinations.</p>
          <dl>
            <div>
              <dt>Configuration</dt>
              <dd>
                <code title={`${snapshot?.root}/adk.config.json`}>
                  {tildify(`${snapshot?.root}/adk.config.json`, home)}
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
          <p className="hint">
            Every preview shows the exact paths before writing. Existing
            installations are adopted explicitly.
          </p>
        </section>
        <section className="workspace-location">
          <h3>Configuration health</h3>
          <div
            className={`health-line ${errors ? "error" : warnings ? "warn" : ""}`}
          >
            <HealthIcon size={26} />
            <div>
              <strong>
                {errors
                  ? `${plural(errors, "blocking finding")}`
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
            <Button onClick={() => navigate("doctor")}>
              <ShieldCheck size={15} />
              Open doctor
            </Button>
            <Button variant="ghost" onClick={() => navigate("context")}>
              View context map
            </Button>
          </div>
        </section>
      </div>
      {!global && (
        <section className="workspace-location">
          <div className="section-intro">
            <div>
              <h3>Inherited global configuration</h3>
              <p>
                {plural(inherited, "resource")} managed globally. Edit them in
                Global configuration.
              </p>
            </div>
            <Button onClick={() => void w.switchGlobal()}>
              <Globe size={15} />
              Manage global
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
