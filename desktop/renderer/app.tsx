import { useState, useEffect, useRef } from "react";
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
  X,
  Search,
  Rocket,
  LayoutDashboard,
  Map as MapIcon,
  FileText,
  Package,
  Library,
  Globe,
  Sun,
  Moon,
  Monitor,
  Keyboard,
  RotateCw,
  ChevronRight,
  ChevronsUpDown,
  CircleCheck,
  TriangleAlert,
  OctagonX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useWorkspace, availableResources } from "./workspace";
import { useTheme } from "./theme";
import { UpdateBanner } from "./components/update-banner";
import { initials, isTyping, plural, tildify } from "./format";
import { Overview } from "./views/overview";
import { Resources } from "./views/resources";
import {
  Projects,
  Doctor,
  Usage,
  Profiles,
  Loadouts,
  Activity,
} from "./views/configuration";
import { ContextMap } from "./views/context-map";
import { Instructions } from "./views/instructions";
import { Sources } from "./views/sources";
import { Benchmarks } from "./views/benchmarks";
import { Collaboration, Team, Account } from "./views/collaboration";
import { Console } from "./views/console";
import { Button, Busy, Dialog, Notice, Toasts } from "./components/ui";
import { NavigationIcon } from "./components/semantic-icons";
import { Preview } from "./components/preview";
import { OutcomeDialog } from "./components/outcome";
import { CommandPalette, type PaletteEntry } from "./components/palette";
import type { DesktopCommand } from "../protocol";

/**
 * The Preflight mark (assets/brand/icon.svg): an airliner seen from above,
 * climbing to the upper right, with the beacon light on its wing tip.
 */
function BrandMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 1024 1024"
      width={20}
      height={20}
      aria-hidden="true"
    >
      <rect width="1024" height="1024" rx="232" fill="#13707a" />
      <g transform="translate(548 476) rotate(45)">
        <path fill="#f3f1ea" d="M0 -340 C34 -340 46 -300 46 -255 L46 -80 L340 70 L340 135 L46 55 L46 205 L135 275 L135 318 L0 288 L-135 318 L-135 275 L-46 205 L-46 55 L-340 135 L-340 70 L-46 -80 L-46 -255 C-46 -300 -34 -340 0 -340 Z" />
        <circle cx="340" cy="102" r="30" fill="#f0a04a" />
      </g>
    </svg>
  );
}
const mac = navigator.platform.toLowerCase().includes("mac");
const mod = mac ? "⌘" : "Ctrl+";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  alert?: boolean;
  /** Cmd/Ctrl+digit, mirrored by the native View menu. */
  key?: string;
}
const shortcuts: [string, string[]][] = [
  ["Go to a view or run an action", [mod, "K"]],
  ["Refresh the workspace", [mod, "R"]],
  ["Open a project folder", [mod, "O"]],
  ["Switch to global configuration", [mod, "⇧", "G"]],
  ["Jump to a view", [mod, "1 – 8"]],
  ["Filter the current list", ["/"]],
  ["Move through a resource list", ["↑", "↓"]],
  ["Show keyboard shortcuts", ["?"]],
];

export function App() {
  const w = useWorkspace();
  const { theme, cycle } = useTheme();
  const [view, setView] = useState("overview"),
    [palette, setPalette] = useState(false),
    [help, setHelp] = useState(false);
  const global = w.state?.workspace === "global";
  const active = !global
    ? w.state?.projects.find((p) => p.id === w.state?.activeProjectId)
    : undefined;
  const resources = availableResources(w.snapshot);
  const errors =
    w.snapshot?.findings.filter((f) => f.severity === "error").length ?? 0;
  const warnings =
    w.snapshot?.findings.filter((f) => f.severity === "warning").length ?? 0;
  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: "Configuration",
      items: [
        { id: "overview", label: "Overview", icon: LayoutDashboard, key: "1" },
        {
          id: "skills",
          label: "Skills",
          icon: Layers,
          key: "2",
          count: resources.filter((r) => r.type === "skill").length,
        },
        {
          id: "mcp",
          label: "MCP servers",
          icon: Plug,
          key: "3",
          count: resources.filter((r) => r.type === "mcp").length,
        },
        {
          id: "resources",
          label: "All resources",
          icon: Blocks,
          key: "4",
          count: resources.length,
        },
        {
          id: "detected",
          label: "Detected",
          icon: ArrowDownToLine,
          count: w.snapshot?.detected.length ?? 0,
        },
      ],
    },
    {
      label: "Discover",
      items: [
        {
          id: "catalogue",
          label: "Discover resources",
          icon: Compass,
          key: "5",
        },
        { id: "loadouts", label: "Loadouts", icon: Package },
        {
          id: "sources",
          label: "Sources",
          icon: Library,
          count: w.snapshot?.sources.length ?? 0,
        },
      ],
    },
    {
      label: "Health",
      items: [
        {
          id: "doctor",
          label: "Doctor",
          icon: ShieldCheck,
          key: "6",
          count: errors,
          alert: errors > 0,
        },
        { id: "context", label: "Context map", icon: MapIcon, key: "7" },
        { id: "instructions", label: "Instructions", icon: FileText },
        { id: "usage", label: "Usage", icon: ActivityIcon },
        { id: "benchmarks", label: "Benchmarks", icon: FlaskConical },
      ],
    },
    {
      label: "Manage",
      items: [
        { id: "profiles", label: "Profiles", icon: Settings2 },
        {
          id: "projects",
          label: "Projects",
          icon: FolderOpen,
          count: w.state?.projects.length ?? 0,
        },
        { id: "activity", label: "Activity", icon: History },
        { id: "console", label: "Command console", icon: Terminal, key: "8" },
      ],
    },
    {
      label: "Collaborate",
      items: [
        { id: "collaboration", label: "Sharing", icon: Share2 },
        { id: "team", label: "Team", icon: Users },
      ],
    },
  ];
  const items = [
    ...groups.flatMap((g) => g.items),
    { id: "account", label: "Account", icon: CircleUserRound } as NavItem,
  ];
  const current = items.find((i) => i.id === view) ?? items[0]!;
  function navigate(id: string) {
    setView(id);
    setPalette(false);
    w.setOutcome(undefined);
  }
  const refresh = () => void w.task("Refreshing…", () => w.reload());
  // The native menu and in-page key handlers can both see one key press.
  const last = useRef({ command: "", at: 0 });
  const command = (value: DesktopCommand) => {
    const now = Date.now();
    if (last.current.command === value && now - last.current.at < 400) return;
    last.current = { command: value, at: now };
    if (value === "palette") setPalette(true);
    else if (value === "refresh") refresh();
    else if (value === "open-project") void w.chooseProject();
    else if (value === "global") void w.switchGlobal();
    else if (value === "shortcuts") setHelp(true);
    else if (value.startsWith("navigate:")) navigate(value.slice(9));
  };
  const commandRef = useRef(command);
  commandRef.current = command;
  useEffect(
    () => window.preflight.onCommand((value) => commandRef.current(value)),
    [],
  );
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const bound: Record<string, DesktopCommand> = {
        k: "palette",
        r: "refresh",
        o: "open-project",
        "/": "shortcuts",
      };
      if (meta && !event.altKey) {
        const target =
          event.shiftKey && key === "g"
            ? "global"
            : event.shiftKey
              ? undefined
              : (bound[key] ??
                (items.find((i) => i.key === key)
                  ? (`navigate:${items.find((i) => i.key === key)!.id}` as DesktopCommand)
                  : undefined));
        if (target) {
          event.preventDefault();
          commandRef.current(target);
        }
        return;
      }
      if (event.key === "?" && !isTyping(event.target) && !palette) {
        event.preventDefault();
        setHelp(true);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
  const resourceMode =
    view === "catalogue"
      ? "catalogue"
      : view === "detected"
        ? "detected"
        : "installed";
  const resourceKey = `${view}:${global ? "global" : (active?.id ?? "none")}`;
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const account = w.state?.account;
  const paletteEntries: PaletteEntry[] = [
    ...items.map((item) => ({
      id: `view-${item.id}`,
      label: item.label,
      group: "Go to",
      icon: item.icon,
      ...(item.key ? { hint: `${mod}${item.key}` } : {}),
      run: () => navigate(item.id),
    })),
    {
      id: "refresh",
      label: "Refresh workspace",
      group: "Actions",
      icon: RotateCw,
      hint: `${mod}R`,
      run: refresh,
    },
    {
      id: "open-project",
      label: "Open project folder…",
      group: "Actions",
      icon: FolderOpen,
      hint: `${mod}O`,
      run: () => void w.chooseProject(),
    },
    ...(w.snapshot?.initialized
      ? [
          {
            id: "sync",
            label: "Sync configuration to agent files",
            group: "Actions",
            icon: RefreshCw,
            keywords: "apply reconcile",
            run: () => void w.run(["sync"]),
          },
          {
            id: "rollback",
            label: "Preview rollback of the last change",
            group: "Actions",
            icon: History,
            keywords: "undo revert",
            run: () => void w.run(["rollback"]),
          },
        ]
      : w.snapshot
        ? [
            {
              id: "init",
              label: global
                ? "Initialize global configuration"
                : "Initialize this project",
              group: "Actions",
              icon: Rocket,
              keywords: "setup create",
              run: () => void w.run(["init"]),
            },
          ]
        : []),
    {
      id: "theme",
      label: `Theme: ${theme} (switch)`,
      group: "Actions",
      icon: ThemeIcon,
      keywords: "dark light appearance mode",
      run: cycle,
    },
    {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      group: "Actions",
      icon: Keyboard,
      hint: "?",
      run: () => setHelp(true),
    },
    ...(global
      ? []
      : [
          {
            id: "workspace-global",
            label: "Global configuration",
            group: "Workspaces",
            icon: Globe,
            hint: `${mod}⇧G`,
            run: () => void w.switchGlobal(),
          },
        ]),
    ...(w.state?.projects ?? [])
      .filter((p) => global || p.id !== active?.id)
      .map((p) => ({
        id: `workspace-${p.id}`,
        label: p.name,
        group: "Workspaces",
        icon: FolderOpen,
        keywords: p.root,
        run: () => void w.switchProject(p.id),
      })),
  ];
  const configurationError = w.snapshot?.errors.some((e) =>
    e.startsWith("Configuration:"),
  );
  return (
    <div
      className={`app-shell ${mac ? "mac" : ""} ${w.busy ? "is-busy" : ""}`}
    >
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <strong>Preflight</strong>
          <span className="version">0.1</span>
        </div>
        <div className="ws-switcher">
          <span className="ws-avatar" aria-hidden="true">
            {global ? <Globe size={16} /> : initials(active?.name ?? "?")}
          </span>
          <span className="ws-text">
            <strong>{global ? "Global" : (active?.name ?? "Project")}</strong>
            <small>
              {global
                ? "Shared by every project"
                : w.snapshot?.config
                  ? `Profile · ${w.snapshot.config.activeProfile}`
                  : "Not initialized"}
            </small>
          </span>
          <ChevronsUpDown size={15} />
          <select
            aria-label="Configuration workspace"
            disabled={!!w.busy}
            value={global ? "global" : (active?.id ?? "global")}
            onChange={(e) => {
              void (e.target.value === "global"
                ? w.switchGlobal()
                : w.switchProject(e.target.value));
            }}
          >
            <option value="global">Global · all projects</option>
            {!!w.state?.projects.length && (
              <optgroup label="Projects">
                {w.state.projects.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <button
          className="sidebar-search"
          title={`Search (${mod}K)`}
          onClick={() => setPalette(true)}
        >
          <Search size={14} />
          <span>Search</span>
          <kbd>{mod}K</kbd>
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
                  title={
                    item.key ? `${item.label} (${mod}${item.key})` : item.label
                  }
                >
                  <NavigationIcon id={item.id} fallback={item.icon} />
                  <span>{item.label}</span>
                  {item.count !== undefined &&
                    (item.count > 0 || item.id !== "doctor") && (
                      <span
                        className={`nav-count ${item.alert ? "alert" : ""}`}
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
          <button
            aria-label="Account"
            aria-current={view === "account" ? "page" : undefined}
            className="account-chip"
            title="Account"
            disabled={!!w.busy}
            onClick={() => navigate("account")}
          >
            <span
              className={`account-avatar ${account?.connected ? "online" : ""}`}
              aria-hidden="true"
            >
              {account?.connected && account.user ? (
                initials(account.user.name)
              ) : (
                <CircleUserRound size={16} />
              )}
            </span>
            <span>
              <strong>
                {account?.connected
                  ? (account.user?.name ?? account.ownerId)
                  : "Account"}
              </strong>
              <small>
                {account?.connected
                  ? (account.user?.email ?? "Share service connected")
                  : "Sign in to collaborate"}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="toolbar">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <span className="toolbar-project">
              {global ? "Global" : active?.name}
            </span>
            <ChevronRight size={14} />
            <h1>{current.label}</h1>
            {w.snapshot && (
              <code className="toolbar-path" title={w.snapshot.root}>
                {tildify(w.snapshot.root, w.snapshot.home)}
              </code>
            )}
          </nav>
          <div className="toolbar-actions">
            {w.busy ? (
              <Busy label={w.busy} />
            ) : (
              <span className="saved-state">
                <i aria-hidden="true" />
                Up to date
              </span>
            )}
            <Button
              variant="ghost"
              aria-label={`Theme: ${theme}. Switch theme`}
              title={`Theme: ${theme}`}
              onClick={cycle}
            >
              <ThemeIcon size={16} />
            </Button>
            <Button
              variant="ghost"
              aria-label="Refresh workspace"
              title={`Refresh (${mod}R)`}
              disabled={!!w.busy}
              onClick={refresh}
            >
              <RefreshCw size={16} />
            </Button>
            <span className="toolbar-divider" aria-hidden="true" />
            <Button
              aria-label="Open project folder"
              title={`Open project (${mod}O)`}
              disabled={!!w.busy}
              onClick={() => void w.chooseProject()}
            >
              <FolderOpen size={15} />
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
        {w.snapshot?.errors.map((error, i) => (
          <div className="snapshot-error" key={i}>
            <Notice>{error}</Notice>
          </div>
        ))}
        {!w.snapshot?.initialized && w.snapshot && !w.snapshot.config && (
          <div className="init-banner">
            <Rocket size={20} />
            <div>
              <strong>
                {configurationError
                  ? "Configuration needs attention"
                  : global
                    ? "Set up your global configuration"
                    : "Set up this project"}
              </strong>
              <span>
                {configurationError
                  ? "Fix the configuration error before making changes."
                  : global
                    ? "Create your shared configuration at ~/.preflight/global. Existing agent files are preserved."
                    : "Create preflight.config.json to manage resources. Existing harness files are preserved."}
              </span>
            </div>
            <Button
              variant="primary"
              disabled={!!w.busy || w.snapshot.initialized}
              onClick={() => void w.run(["init"])}
            >
              {global
                ? "Initialize global configuration"
                : "Initialize project"}
            </Button>
          </div>
        )}
        <div className="main-content">
          {view === "projects" ? (
            <Projects workspace={w} />
          ) : view === "account" ? (
            <Account workspace={w} />
          ) : view === "team" ? (
            <Team key={w.state?.team.name} workspace={w} />
          ) : !w.snapshot ? (
            <div className="loading-workspace">
              <Busy label="Reading project configuration…" />
            </div>
          ) : view === "overview" ? (
            <Overview workspace={w} navigate={navigate} />
          ) : ["skills", "mcp", "resources", "catalogue", "detected"].includes(
              view,
            ) ? (
            <Resources
              key={resourceKey}
              workspace={w}
              mode={resourceMode}
              navigate={navigate}
              {...(view === "skills"
                ? { type: "skill" as const }
                : view === "mcp"
                  ? { type: "mcp" as const }
                  : {})}
            />
          ) : view === "doctor" ? (
            <Doctor workspace={w} />
          ) : view === "instructions" ? (
            <Instructions key={resourceKey} workspace={w} />
          ) : view === "usage" ? (
            <Usage workspace={w} />
          ) : view === "profiles" ? (
            <Profiles workspace={w} />
          ) : view === "loadouts" ? (
            <Loadouts workspace={w} navigate={navigate} />
          ) : view === "sources" ? (
            <Sources workspace={w} />
          ) : view === "context" ? (
            <ContextMap key={resourceKey} workspace={w} />
          ) : view === "benchmarks" ? (
            <Benchmarks workspace={w} />
          ) : view === "activity" ? (
            <Activity key={resourceKey} workspace={w} />
          ) : view === "collaboration" ? (
            <Collaboration workspace={w} />
          ) : (
            <Console workspace={w} />
          )}
        </div>
        <footer className="statusbar" aria-label="Workspace status">
          <span className="status-scope">
            {global ? <Globe size={12} /> : <FolderOpen size={12} />}
            {global ? "global" : `project · ${active?.name ?? ""}`}
          </span>
          {w.snapshot?.config && (
            <span>profile {w.snapshot.config.activeProfile}</span>
          )}
          <span>
            {plural(w.snapshot?.resources.length ?? 0, "managed resource")}
          </span>
          {w.snapshot && (
            <span
              className={
                errors ? "status-error" : warnings ? "status-warn" : "status-ok"
              }
            >
              {errors ? (
                <OctagonX size={12} />
              ) : warnings ? (
                <TriangleAlert size={12} />
              ) : (
                <CircleCheck size={12} />
              )}
              {errors
                ? `doctor: ${plural(errors, "error")}`
                : warnings
                  ? `doctor: ${plural(warnings, "warning")}`
                  : "doctor: clear"}
            </span>
          )}
          <button onClick={() => navigate("console")}>
            <Terminal size={12} />
            CLI parity
          </button>
        </footer>
      </main>
      <Preview
        prepared={w.prepared}
        busy={!!w.busy}
        home={w.snapshot?.home}
        onClose={() => w.setPrepared(null)}
        onConfirm={() => void w.confirm()}
      />
      <OutcomeDialog workspace={w} />
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        entries={paletteEntries}
      />
      <Dialog
        open={help}
        onClose={() => setHelp(false)}
        title="Keyboard shortcuts"
        description="Every shortcut is also available from the menu bar."
      >
        <div className="dialog-body shortcut-list">
          {shortcuts.map(([label, keys]) => [
            <span key={`${label}-label`}>{label}</span>,
            <span key={`${label}-keys`}>
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </span>,
          ])}
        </div>
      </Dialog>
      <UpdateBanner />
      <Toasts toasts={w.toasts} dismiss={w.dismiss} />
    </div>
  );
}
