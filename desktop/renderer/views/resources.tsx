import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Layers,
  Plug,
  Terminal,
  ArrowUpRight,
  Copy,
  Globe,
  Folder,
  MoreHorizontal,
  Check,
  FileText,
  ShieldCheck,
  Download,
  Trash2,
  Pencil,
  Power,
} from "lucide-react";
import type { Resource, ResourceType } from "../../../src/schema";
import { ResourceSchema, ResourceTypeSchema } from "../../../src/schema";
import type { Workspace } from "../workspace";
import { Button, Badge, Empty, Json, Notice } from "../components/ui";
import { ResourceForm } from "../components/resource-form";
const iconFor = (type: string) =>
  type === "skill" ? Layers : type === "mcp" ? Plug : Terminal;
export function Resources({
  workspace: w,
  type,
  mode = "installed",
}: {
  workspace: Workspace;
  type?: ResourceType;
  mode?: "installed" | "catalogue" | "detected";
}) {
  const global = w.state?.workspace === "global";
  const [kind, setKind] = useState(type ?? "all");
  const [source, setSource] = useState("mcp-registry");
  const [repository, setRepository] = useState("vercel-labs/agent-skills");
  const [channel, setChannel] = useState("bundled");
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);
  const [searched, setSearched] = useState("");
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState(""),
    [scope, setScope] = useState(
      mode === "installed" && global ? "global" : "all",
    ),
    [harness, setHarness] = useState("all"),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState("overview"),
    [form, setForm] = useState<"new" | Resource | null>(null),
    [inspected, setInspected] = useState<Resource | null>(null),
    [online, setOnline] = useState<Resource[] | null>(null),
    [sort, setSort] = useState("name");
  const base =
    mode === "catalogue"
      ? (online ?? w.snapshot?.catalogue ?? [])
      : mode === "detected"
        ? (w.snapshot?.detected ?? [])
        : [
            ...(w.snapshot?.resources ?? []),
            ...(w.snapshot?.inherited ?? []).filter(
              (r) => !w.snapshot?.resources.some((local) => local.id === r.id),
            ),
          ];
  const items = useMemo(
    () =>
      base
        .filter(
          (r) =>
            (kind === "all" || r.type === kind) &&
            (scope === "all" || r.scope === scope) &&
            (harness === "all" ||
              r.harnesses.includes(harness as "cursor" | "claude-code")) &&
            `${r.name} ${r.description} ${r.tags.join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name)
            : (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
        ),
    [base, kind, scope, harness, query, sort],
  );
  const raw = items.find((r) => r.id === selected) ?? items[0];
  const resource = inspected?.id === raw?.id ? inspected : raw;
  const inherited =
    mode === "installed" &&
    !!resource &&
    !w.snapshot?.resources.some((r) => r.id === resource.id);
  const Icon = iconFor(resource?.type ?? type ?? "skill");
  const usage = resource
    ? Object.entries(w.snapshot?.usage?.invocations ?? {}).reduce(
        (total, [key, count]) =>
          total +
          (key === resource.id ||
          (resource.type === "skill" && key === `skill:${resource.name}`) ||
          (resource.type === "mcp" && key.startsWith(`mcp__${resource.name}__`))
            ? count
            : 0),
        0,
      )
    : 0;
  const applied =
    resource &&
    w.snapshot?.lock?.resources.some(
      (r) => JSON.stringify(r) === JSON.stringify(resource),
    );
  const select = (r: Resource) => {
    setSelected(r.id);
    setInspected(null);
    setTab("overview");
  };
  const searchOnline = async () => {
    const data = await w.run(
      [
        "search",
        query,
        "--online",
        "--source",
        source,
        ...(kind !== "all" ? ["--type", kind] : []),
        ...(source === "github" ? ["--github", repository] : []),
      ],
      false,
    );
    if (data && typeof data === "object" && "resources" in data) {
      const reply = data as { resources: Resource[]; errors: string[] };
      setOnline(reply.resources);
      setSourceErrors(reply.errors ?? []);
      setSearched(query);
      setSelected("");
      setInspected(null);
    }
  };
  const perform = (args: string[]) => void w.run(args);
  return (
    <>
      {mode === "catalogue" && (
        <div className="discovery-header">
          <div>
            <h2>Find your next skill or MCP server</h2>
            <p>
              Browse the bundled library offline, or search an online source.
              Inspect and configure every resource before adding it.
            </p>
          </div>
          <div className="segmented">
            <button
              className={channel === "bundled" ? "active" : ""}
              onClick={() => {
                setChannel("bundled");
                setOnline(null);
                setSourceErrors([]);
              }}
            >
              Bundled library
            </button>
            <button
              className={channel === "online" ? "active" : ""}
              onClick={() => {
                setChannel("online");
                setOnline([]);
                setSearched("");
              }}
            >
              Search online
            </button>
          </div>
        </div>
      )}
      <div className="collection-tools">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search resources"
            placeholder={
              mode === "catalogue"
                ? "Search the catalogue…"
                : "Filter resources…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                mode === "catalogue" &&
                channel === "online"
              )
                void searchOnline();
            }}
          />
          <kbd>⌘ K</kbd>
        </div>
        <select
          aria-label="Filter scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="all">All scopes</option>
          <option value="project">Project</option>
          <option value="global">Global</option>
        </select>
        <select
          aria-label="Filter harness"
          value={harness}
          onChange={(e) => setHarness(e.target.value)}
        >
          <option value="all">All agents</option>
          <option value="claude-code">Claude Code</option>
          <option value="cursor">Cursor</option>
        </select>
        <Button
          variant="primary"
          disabled={!!w.busy}
          onClick={() => {
            setAdding(false);
            setForm("new");
          }}
        >
          <Plus size={15} />
          New resource
        </Button>
      </div>
      {mode === "catalogue" && channel === "online" ? (
        <div className="discovery-sources">
          <label>
            Source
            <select
              aria-label="Search source"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setOnline([]);
                setSourceErrors([]);
              }}
            >
              <option value="mcp-registry">Official MCP Registry</option>
              <option value="github">GitHub repository</option>
              <option value="skills.sh">skills.sh (token required)</option>
              <option value="all">All online sources + library</option>
            </select>
          </label>
          <label>
            Resource type
            <select
              aria-label="Search resource type"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">All resources</option>
              {ResourceTypeSchema.options.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {source === "github" && (
            <label>
              GitHub repository
              <input
                aria-label="GitHub repository"
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
                placeholder="owner/repository"
              />
            </label>
          )}
          <Button
            variant="primary"
            disabled={!!w.busy || (source === "github" && !repository.trim())}
            onClick={() => void searchOnline()}
          >
            <Search size={15} />
            Search source
          </Button>
          <p className="muted">
            {source === "skills.sh"
              ? "Requires VERCEL_OIDC_TOKEN in the desktop launch environment. GitHub repository search works without it."
              : "Remote results are bounded to 100 entries per source. Content is fetched only when you inspect or add."}
          </p>
        </div>
      ) : (
        mode === "catalogue" && (
          <div className="catalogue-bar">
            <span>
              <Globe size={14} />{" "}
              {online
                ? "Remote + bundled results"
                : `${w.snapshot?.catalogue.length ?? 0} curated resources, ready to inspect`}
            </span>
            <select
              aria-label="Library resource type"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">All resource types</option>
              {ResourceTypeSchema.options.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )
      )}
      {sourceErrors.map((error, i) => (
        <div className="discovery-error" key={i}>
          <Notice>{error}</Notice>
        </div>
      ))}
      {mode === "catalogue" && channel === "online" && (
        <div className="search-summary" role="status">
          {searched
            ? `${items.length} results for “${searched}”`
            : "Choose a source and submit a search above."}
        </div>
      )}
      <div className="resource-workspace">
        <section className="resource-list" aria-label="Resources">
          <div className="list-heading">
            <span>
              {items.length} {type ?? "resource"}
              {items.length === 1 ? "" : "s"}
            </span>
            <select
              aria-label="Sort resources"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="name">Name A–Z</option>
              <option value="updated">Recently updated</option>
            </select>
          </div>
          <div className="list-scroll">
            {items.map((r) => {
              const RowIcon = iconFor(r.type);
              return (
                <button
                  key={r.id}
                  className={`resource-row ${resource?.id === r.id ? "selected" : ""}`}
                  onClick={() => select(r)}
                >
                  <div className={`resource-glyph ${r.type}`}>
                    <RowIcon size={19} />
                  </div>
                  <div className="resource-row-body">
                    <div className="resource-row-title">
                      <strong>{r.name}</strong>
                      {!r.enabled && <Badge>Disabled</Badge>}
                    </div>
                    <p>
                      {r.description ||
                        `A ${r.type} resource for your AI workflow.`}
                    </p>
                    <div className="row-meta">
                      <span>
                        {r.scope === "project" ? (
                          <Folder size={12} />
                        ) : (
                          <Globe size={12} />
                        )}{" "}
                        {r.scope === "project" ? "Project" : "Global"}
                      </span>
                      <span>
                        {r.harnesses
                          .map((h) =>
                            h === "claude-code" ? "Claude" : "Cursor",
                          )
                          .join(", ")}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
            {!items.length && (
              <Empty
                title={query ? "No matches" : "No resources yet"}
                description={
                  query
                    ? "Try another search or clear your filters."
                    : mode === "detected"
                      ? "No unmanaged resources were detected in this project or harness home."
                      : "Create a resource or add one from the catalogue."
                }
                action={
                  !query && mode === "installed" ? (
                    <Button
                      onClick={() => {
                        setAdding(false);
                        setForm("new");
                      }}
                    >
                      <Plus size={15} />
                      Create resource
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        </section>
        <section className="resource-detail" aria-label="Resource details">
          {resource ? (
            <>
              <div className="detail-header">
                <div className={`detail-glyph ${resource.type}`}>
                  <Icon size={27} />
                </div>
                <div className="detail-heading">
                  <div className="detail-badges">
                    <Badge tone="blue">{resource.type}</Badge>
                    <Badge>{resource.scope}</Badge>
                    {mode === "installed" && (
                      <Badge
                        tone={inherited ? "blue" : applied ? "green" : "amber"}
                      >
                        {inherited
                          ? "Inherited from global"
                          : applied
                            ? "Applied"
                            : "Not applied"}
                      </Badge>
                    )}
                  </div>
                  <h2>{resource.name}</h2>
                  <p>{resource.description || "No description provided."}</p>
                </div>
              </div>
              <div className="detail-actions">
                {mode === "catalogue" ? (
                  <>
                    <Button
                      variant="primary"
                      disabled={
                        !!w.busy ||
                        !w.snapshot?.initialized ||
                        w.snapshot.resources.some((r) => r.id === resource.id)
                      }
                      onClick={async () => {
                        const materialized = await w.task(
                          "Inspecting source…",
                          async () => {
                            const reply = await window.adk.prepare([
                              "inspect-json",
                              JSON.stringify(resource),
                            ]);
                            return ResourceSchema.parse(reply.value);
                          },
                        );
                        if (materialized) {
                          setInspected(materialized);
                          setAdding(true);
                          setForm({
                            ...materialized,
                            scope: global ? "global" : "project",
                          });
                        }
                      }}
                    >
                      <Download size={15} />
                      Configure & add
                    </Button>
                    <Button
                      disabled={!!w.busy}
                      onClick={async () => {
                        const result = await w.run(
                          ["inspect-json", JSON.stringify(resource)],
                          false,
                        );
                        try {
                          setInspected(ResourceSchema.parse(result));
                          setTab("content");
                        } catch {
                          /* errors are reported by workspace */
                        }
                      }}
                    >
                      <FileText size={15} />
                      Inspect source
                    </Button>
                  </>
                ) : mode === "detected" ? (
                  <Button
                    variant="primary"
                    disabled={!!w.busy || !w.snapshot?.initialized}
                    onClick={() => perform(["adopt", resource.id])}
                  >
                    <Check size={15} />
                    Adopt resource
                  </Button>
                ) : inherited ? (
                  <Button onClick={() => void w.switchGlobal()}>
                    <Globe size={15} />
                    Edit in global configuration
                  </Button>
                ) : (
                  <>
                    <Button
                      disabled={!!w.busy}
                      onClick={() => {
                        setAdding(false);
                        setForm(resource);
                      }}
                    >
                      <Pencil size={15} />
                      Edit
                    </Button>
                    <Button
                      disabled={!!w.busy}
                      onClick={() =>
                        perform([
                          "verify",
                          resource.id,
                          ...(resource.type === "mcp" ? ["--connect"] : []),
                        ])
                      }
                    >
                      <ShieldCheck size={15} />
                      Verify
                    </Button>
                    <div className="action-menu">
                      <Button
                        aria-label="More resource actions"
                        onClick={(e) => {
                          const menu = e.currentTarget
                            .nextElementSibling as HTMLDivElement;
                          menu.hidden = !menu.hidden;
                        }}
                      >
                        <MoreHorizontal size={17} />
                      </Button>
                      <div className="dropdown" hidden>
                        <button
                          disabled={global}
                          onClick={() =>
                            perform([
                              "move",
                              resource.id,
                              resource.scope === "project"
                                ? "global"
                                : "project",
                            ])
                          }
                        >
                          <ArrowUpRight size={15} />
                          Move to{" "}
                          {resource.scope === "project" ? "global" : "project"}
                        </button>
                        <button
                          onClick={() =>
                            perform([
                              "update-json",
                              resource.id,
                              JSON.stringify({ enabled: !resource.enabled }),
                            ])
                          }
                        >
                          <Power size={15} />
                          {resource.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() =>
                            perform([
                              "fork",
                              resource.id,
                              `${resource.id}-copy`,
                            ])
                          }
                        >
                          <Copy size={15} />
                          Duplicate
                        </button>
                        <button
                          onClick={() =>
                            perform(["install", resource.id, "--execute"])
                          }
                        >
                          <Download size={15} />
                          Run installer
                        </button>
                        <button
                          className="danger-text"
                          onClick={() => perform(["delete", resource.id])}
                        >
                          <Trash2 size={15} />
                          Delete resource
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {!w.snapshot?.initialized && (
                <Notice>
                  {global
                    ? "Initialize your global configuration to add or adopt resources."
                    : "Initialize this project to add or adopt resources."}
                </Notice>
              )}
              <div
                className="detail-tabs"
                role="tablist"
                aria-label="Resource information"
              >
                {["overview", "content", "configuration"].map((t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t === "overview"
                      ? "Overview"
                      : t === "content"
                        ? "Content"
                        : "Configuration"}
                  </button>
                ))}
              </div>
              <div className="detail-scroll">
                {tab === "content" ? (
                  resource.content ? (
                    <pre className="content-document">{resource.content}</pre>
                  ) : (
                    <Empty
                      title="Content not loaded"
                      description="Inspect the source to fetch its instructions, or edit this resource to add content."
                    />
                  )
                ) : tab === "configuration" ? (
                  <Json value={resource.config} />
                ) : (
                  <>
                    <div className="metadata-grid">
                      <div>
                        <span>Available in</span>
                        <div className="harness-list">
                          {resource.harnesses.map((h) => (
                            <Badge
                              key={h}
                              tone={h === "claude-code" ? "orange" : "blue"}
                            >
                              {h === "claude-code"
                                ? "✳ Claude Code"
                                : "⌘ Cursor"}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span>Usage observed</span>
                        <strong>
                          {w.snapshot?.usage?.sessions
                            ? `${usage} invocations`
                            : "Unknown"}
                        </strong>
                        <small>
                          {w.snapshot?.usage?.sessions
                            ? "From local transcripts"
                            : "No measured sessions"}
                        </small>
                      </div>
                      <div>
                        <span>Scope</span>
                        <strong>
                          {resource.scope === "project"
                            ? "This project"
                            : "All projects"}
                        </strong>
                        <small>
                          {resource.scope === "project"
                            ? w.snapshot?.root
                            : w.snapshot?.home}
                        </small>
                      </div>
                      <div>
                        <span>Status</span>
                        <strong>
                          {resource.enabled ? "Enabled" : "Disabled"}
                        </strong>
                        <small>
                          {mode === "catalogue"
                            ? "Not installed"
                            : mode === "detected"
                              ? "Detected, not managed"
                              : "Managed by Preflight"}
                        </small>
                      </div>
                    </div>
                    <div className="detail-section">
                      <h3>Source</h3>
                      <p className="source-value">{resource.source}</p>
                      <small>{resource.id}</small>
                    </div>
                    {resource.tags.length > 0 && (
                      <div className="detail-section">
                        <h3>Tags</h3>
                        <div className="tag-list">
                          {resource.tags.map((tag) => (
                            <Badge key={tag}>{tag}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="detail-section">
                      <h3>
                        {resource.type === "mcp"
                          ? "Server configuration"
                          : "Instructions"}
                      </h3>
                      {resource.content ? (
                        <pre className="content-document excerpt">
                          {resource.content.slice(0, 5000)}
                        </pre>
                      ) : Object.keys(resource.config).length ? (
                        <Json value={resource.config} />
                      ) : (
                        <p className="muted">
                          Inspect the source to review this resource before
                          adding it.
                        </p>
                      )}
                    </div>
                    {w.snapshot?.findings
                      .filter((f) => f.resourceId === resource.id)
                      .map((f, i) => (
                        <Notice key={i}>{f.message}</Notice>
                      ))}
                  </>
                )}
              </div>
            </>
          ) : (
            <Empty
              title="Select a resource"
              description="Inspect its instructions, configuration and availability before making changes."
            />
          )}
        </section>
      </div>
      {form && (
        <ResourceForm
          {...(form === "new" ? { type: type ?? "skill" } : { resource: form })}
          adding={adding}
          defaultScope={global ? "global" : "project"}
          globalOnly={global}
          onClose={() => setForm(null)}
          onSave={async (value) => {
            setForm(null);
            await w.run(
              form === "new" || adding
                ? ["create-json", JSON.stringify(value)]
                : ["update-json", form.id, JSON.stringify(value)],
            );
          }}
        />
      )}
    </>
  );
}
