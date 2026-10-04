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
      <div className="overview-cards">
        {cards.map((card) => (
          <button
            className="overview-card"
            key={card.view}
            onClick={() => navigate(card.view)}
          >
            <card.icon size={21} />
            <strong>{card.count}</strong>
            <h3>{card.title}</h3>
            <p>{card.text}</p>
            <span>
              Manage <ArrowRight size={14} />
            </span>
          </button>
        ))}
      </div>
      <section className="workspace-location">
        <h3>
          {global
            ? "Where your global configuration lives"
            : "Where this project's configuration lives"}
        </h3>
        <p>Desired configuration</p>
        <code>{w.snapshot?.root}/adk.config.json</code>
        <p>{global ? "Applied agent files" : "Project agent files"}</p>
        <code>
          {global ? w.snapshot?.home : w.snapshot?.root}/.claude ·{" "}
          {global ? w.snapshot?.home : w.snapshot?.root}/.cursor
        </code>
        <p className="muted">
          Changes are applied to the paths shown in the confirmation preview.
          Existing installations are adopted explicitly.
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
          {resources.some((r) => r.scope === "global") && (
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
