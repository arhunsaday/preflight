import {
  Globe,
  FolderOpen,
  Layers,
  Plug,
  Compass,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { availableResources, type Workspace } from "../workspace";
import { Badge, Button, Notice } from "../components/ui";
export function Overview({
  workspace: w,
  navigate,
}: {
  workspace: Workspace;
  navigate: (view: string) => void;
}) {
  const global = w.state?.workspace === "global";
  const resources = availableResources(w.snapshot);
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
      count: w.snapshot?.detected.length ?? 0,
      text: "Existing resources available to adopt",
    },
  ];
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
            <Globe size={25} />
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
              ? "Build your baseline here. Project workspaces can add the tools they need while keeping your global setup available."
              : "Your global setup stays connected. Add project resources here and review exactly what changes before applying them."}
          </p>
          <div className="scope-route">
            <span>
              <Globe size={17} />
              Global configuration
            </span>
            <div aria-hidden="true" className="scope-route-line" />
            <span>
              <FolderOpen size={17} />
              {global ? "Your projects" : "This project"}
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
                <card.icon size={21} />
              </span>
              <span>
                <strong>{card.title}</strong>
                <small>{card.text}</small>
              </span>
              <b>{card.count}</b>
              <ArrowRight size={15} />
            </button>
          ))}
          <p className="hint">
            Includes global resources inherited by this workspace.
          </p>
        </section>
      </div>
      <section className="workspace-location path-register">
        <div>
          <h3>{global ? "Global configuration" : "Project configuration"}</h3>
          <p>Your configuration file and agent destinations</p>
        </div>
        <dl>
          <div>
            <dt>Configuration</dt>
            <dd>
              <code>{w.snapshot?.root}/adk.config.json</code>
            </dd>
          </div>
          <div>
            <dt>Agent files</dt>
            <dd>
              <code>
                {global ? w.snapshot?.home : w.snapshot?.root}/.claude ·{" "}
                {global ? w.snapshot?.home : w.snapshot?.root}/.cursor
              </code>
            </dd>
          </div>
        </dl>
        <p className="hint">
          Every preview shows the exact paths before writing. Existing
          installations are adopted explicitly.
        </p>
      </section>
      {!global && (
        <section className="workspace-location">
          <div className="section-intro">
            <div>
              <h3>Inherited global configuration</h3>
              <p>
                {w.snapshot?.inherited.length ?? 0} resources managed globally.
                Edit them in Global configuration.
              </p>
            </div>
            <Button onClick={() => void w.switchGlobal()}>
              <Globe size={15} />
              Manage global
            </Button>
          </div>
          {w.snapshot?.resources.some((r) => r.scope === "global") && (
            <Notice>
              This project also manages global resources from an earlier
              configuration. They remain here; nothing has been migrated or
              overwritten. Use All scopes in the resource list to inspect them.
            </Notice>
          )}
        </section>
      )}
      <section className="workspace-location">
        <div className="section-intro">
          <div>
            <h3>Configuration health</h3>
            <p>
              {w.snapshot?.findings.filter((f) => f.severity === "error")
                .length ?? 0}{" "}
              blocking findings ·{" "}
              {w.snapshot?.findings.filter((f) => f.severity === "warning")
                .length ?? 0}{" "}
              warnings
            </p>
          </div>
          <Button onClick={() => navigate("doctor")}>
            <ShieldCheck size={15} />
            Open doctor
          </Button>
        </div>
      </section>
    </div>
  );
}
