import { useState, useEffect } from "react";
import {
  Layers,
  Plug,
  FolderOpen,
  Compass,
  Blocks,
  FlaskConical,
  ShieldCheck,
  Activity as ActivityIcon,
  Share2,
  Users,
  CircleUserRound,
  Terminal,
  History,
  Settings2,
  ArrowDownToLine,
  RefreshCw,
  ChevronDown,
  Check,
  Circle,
  X,
  Command,
  Rocket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useWorkspace } from "./workspace";
import { Resources } from "./views/resources";
import {
  Projects,
  Doctor,
  Usage,
  Profiles,
  Loadouts,
  Activity,
} from "./views/configuration";
import { Benchmarks } from "./views/benchmarks";
import { Collaboration, Team, Account } from "./views/collaboration";
import { Console } from "./views/console";
import {
  Button,
  Badge,
  Busy,
  Empty,
  Dialog,
  Json,
  Notice,
} from "./components/ui";
import { Preview } from "./components/preview";

const preflightIcon = new URL("../assets/icon.svg", import.meta.url).href;

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}
export function App() {
  const w = useWorkspace();
  const [view, setView] = useState("skills"),
    [palette, setPalette] = useState(false),
    [paletteQuery, setPaletteQuery] = useState("");
  const active = w.state?.projects.find(
    (p) => p.id === w.state?.activeProjectId,
  );
  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: "Workspace",
      items: [
        {
          id: "skills",
          label: "Skills",
          icon: Layers,
          count:
            w.snapshot?.resources.filter((r) => r.type === "skill").length ?? 0,
        },
        {
          id: "mcp",
          label: "MCP servers",
          icon: Plug,
          count:
            w.snapshot?.resources.filter((r) => r.type === "mcp").length ?? 0,
        },
        {
          id: "resources",
          label: "All resources",
          icon: Blocks,
          count: w.snapshot?.resources.length ?? 0,
        },
        {
          id: "detected",
          label: "Detected",
          icon: ArrowDownToLine,
          count: w.snapshot?.detected.length ?? 0,
        },
        { id: "catalogue", label: "Catalogue", icon: Compass },
        {
          id: "projects",
          label: "Projects",
          icon: FolderOpen,
          count: w.state?.projects.length ?? 0,
        },
      ],
    },
    {
      label: "Improve",
      items: [
        { id: "loadouts", label: "Loadouts", icon: Layers },
        { id: "benchmarks", label: "Benchmarks", icon: FlaskConical },
        {
          id: "doctor",
          label: "Doctor",
          icon: ShieldCheck,
          count:
            w.snapshot?.findings.filter((f) => f.severity === "error").length ??
            0,
        },
        { id: "usage", label: "Usage", icon: ActivityIcon },
        { id: "profiles", label: "Profiles", icon: Settings2 },
      ],
    },
    {
      label: "Collaborate",
      items: [
        { id: "collaboration", label: "Sharing", icon: Share2 },
        { id: "team", label: "Team", icon: Users },
        { id: "account", label: "Account", icon: CircleUserRound },
      ],
    },
    {
      label: "Tools",
      items: [
        { id: "activity", label: "Activity", icon: History },
        { id: "console", label: "Command console", icon: Terminal },
      ],
    },
  ];
  const current = groups.flatMap((g) => g.items).find((i) => i.id === view)!;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setPalette((v) => !v);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "r") {
        event.preventDefault();
        void w.task("Refreshing…", () => w.reload());
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
  function navigate(id: string) {
    setView(id);
    setPalette(false);
    w.setResult(undefined);
  }
  const resourceMode =
    view === "catalogue"
      ? "catalogue"
      : view === "detected"
        ? "detected"
        : "installed";
  const resourceKey = `${view}:${active?.id ?? "none"}`;
  return (
    <div className={`app-shell ${w.busy ? "is-busy" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <img src={preflightIcon} alt="" width={31} height={31} />
          </span>
          <strong>Preflight</strong>
          <span className="version">0.1</span>
        </div>
        <button
          className="project-switcher"
          disabled={!!w.busy}
          onClick={() => navigate("projects")}
        >
          <div className="project-switch-icon">
            <FolderOpen size={18} />
          </div>
          <div>
            <strong>{active?.name ?? "Open a project"}</strong>
            <span>
              {w.snapshot?.config?.activeProfile ?? "AI development workspace"}
            </span>
          </div>
          <ChevronDown size={14} />
        </button>
        <nav aria-label="Main navigation">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  disabled={!!w.busy}
                  className={`nav-item ${view === item.id ? "active" : ""}`}
                  onClick={() => navigate(item.id)}
                  aria-current={view === item.id ? "page" : undefined}
                >
                  <item.icon size={17} />
                  <span>{item.label}</span>
                  {item.count !== undefined && (
                    <span
                      className={`nav-count ${item.id === "doctor" && item.count ? "alert" : ""}`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="command-shortcut" onClick={() => setPalette(true)}>
            <Command size={15} />
            <span>Quick navigation</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="local-status">
            <span className="status-dot" />
            <span>Local workspace</span>
            <Badge>Offline ready</Badge>
          </div>
          <small>
            {w.state?.account.connected
              ? "Share service connected"
              : "Your configuration stays on your machine"}
          </small>
        </div>
      </aside>
      <main className="main">
        <header className="toolbar">
          <div className="toolbar-title">
            <current.icon size={20} />
            <h1>{current.label}</h1>
            {active && <span className="toolbar-project">{active.name}</span>}
          </div>
          <div className="toolbar-actions">
            {w.busy ? (
              <Busy label={w.busy} />
            ) : (
              <span className="saved-state">
                <Check size={13} />
                Ready
              </span>
            )}
            <Button
              variant="ghost"
              aria-label="Refresh workspace"
              disabled={!!w.busy || !active}
              onClick={() => void w.task("Refreshing…", () => w.reload())}
            >
              <RefreshCw size={16} />
            </Button>
            <Button
              aria-label="Open project folder"
              disabled={!!w.busy}
              onClick={() => void w.chooseProject()}
            >
              <FolderOpen size={16} />
              <span>Open project</span>
            </Button>
          </div>
        </header>
        {w.error && (
          <div className="error-banner" role="alert">
            <span>{w.error}</span>
            <button aria-label="Dismiss error" onClick={() => w.setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {w.message && (
          <div className="success-banner" role="status">
            <Check size={15} />
            {w.message}
          </div>
        )}
        {w.snapshot?.errors.map((error, i) => (
          <div className="snapshot-error" key={i}>
            <Notice>{error}</Notice>
          </div>
        ))}
        {active &&
          !w.snapshot?.initialized &&
          w.snapshot &&
          !w.snapshot.config && (
            <div className="init-banner">
              <Rocket size={20} />
              <div>
                <strong>
                  {w.snapshot.errors.some((e) => e.startsWith("Configuration:"))
                    ? "Configuration needs attention"
                    : "Set up this project"}
                </strong>
                <span>
                  {w.snapshot.errors.some((e) => e.startsWith("Configuration:"))
                    ? "Fix the configuration error before making changes."
                    : "Create adk.config.json to manage resources. Existing harness files are preserved."}
                </span>
              </div>
              <Button
                variant="primary"
                disabled={!!w.busy || w.snapshot.initialized}
                onClick={() => void w.run(["init"])}
              >
                Initialize project
              </Button>
            </div>
          )}
        <div className="main-content">
          {!active && !["projects", "account", "team"].includes(view) ? (
            <Empty
              title="Bring your AI setup into focus"
              description="Open a project folder to inspect its skills, MCP servers and agent configuration. Your existing files stay in place."
              action={
                <Button
                  variant="primary"
                  disabled={!!w.busy}
                  onClick={() => void w.chooseProject()}
                >
                  <FolderOpen size={16} />
                  Open a project
                </Button>
              }
            />
          ) : view === "projects" ? (
            <Projects workspace={w} />
          ) : view === "account" ? (
            <Account workspace={w} />
          ) : view === "team" ? (
            <Team key={w.state?.team.name} workspace={w} />
          ) : !w.snapshot ? (
            <div className="loading-workspace">
              <Busy label="Reading project configuration…" />
            </div>
          ) : ["skills", "mcp", "resources", "catalogue", "detected"].includes(
              view,
            ) ? (
            <Resources
              key={resourceKey}
              workspace={w}
              mode={resourceMode}
              {...(view === "skills"
                ? { type: "skill" as const }
                : view === "mcp"
                  ? { type: "mcp" as const }
                  : {})}
            />
          ) : view === "doctor" ? (
            <Doctor workspace={w} />
          ) : view === "usage" ? (
            <Usage workspace={w} />
          ) : view === "profiles" ? (
            <Profiles workspace={w} />
          ) : view === "loadouts" ? (
            <Loadouts workspace={w} />
          ) : view === "benchmarks" ? (
            <Benchmarks workspace={w} />
          ) : view === "activity" ? (
            <Activity workspace={w} />
          ) : view === "collaboration" ? (
            <Collaboration workspace={w} />
          ) : (
            <Console workspace={w} />
          )}
        </div>
        <footer className="statusbar">
          <span>
            <Circle size={9} fill="currentColor" />
            {active ? "Project scope available" : "No project open"}
          </span>
          <span>{w.snapshot?.resources.length ?? 0} managed resources</span>
          <button onClick={() => navigate("console")}>
            <Terminal size={12} />
            CLI parity
          </button>
        </footer>
      </main>
      <Preview
        prepared={w.prepared}
        busy={!!w.busy}
        onClose={() => w.setPrepared(null)}
        onConfirm={() => void w.confirm()}
      />
      <Dialog
        open={w.result !== undefined && !w.prepared}
        onClose={() => w.setResult(undefined)}
        title="Operation result"
        description="The result returned by the shared ADK command engine."
        wide
      >
        <div className="dialog-body">
          <Json value={w.result} />
        </div>
        <div className="dialog-footer">
          <Button onClick={() => w.setResult(undefined)}>Done</Button>
        </div>
      </Dialog>
      <Dialog
        open={palette}
        onClose={() => setPalette(false)}
        title="Go to…"
        description="Navigate your workspace with the keyboard."
      >
        <div className="dialog-body palette-body">
          <input
            autoFocus
            aria-label="Find a view"
            value={paletteQuery}
            onChange={(e) => setPaletteQuery(e.target.value)}
            placeholder="Skills, benchmarks, doctor…"
          />
          {groups
            .flatMap((g) => g.items)
            .filter((i) =>
              i.label.toLowerCase().includes(paletteQuery.toLowerCase()),
            )
            .map((i) => (
              <button
                className="palette-item"
                key={i.id}
                onClick={() => navigate(i.id)}
              >
                <i.icon size={18} />
                {i.label}
              </button>
            ))}
        </div>
      </Dialog>
    </div>
  );
}
