import { useState } from "react";
import { Download, FolderGit2, Search } from "lucide-react";
import type { HarnessId, ResourceType } from "../../../src/schema";
import type { Workspace } from "../workspace";
import { Button, Empty, Notice } from "../components/ui";
import { plural } from "../format";
import { HarnessBadge, ResourceIcon } from "../components/semantic-icons";

/** The parts of `preflight install <repo>` this view reads. */
interface Found {
  id: string;
  type: ResourceType;
  name: string;
  description: string;
  path: string;
  supports: HarnessId[];
  reasons: Partial<Record<HarnessId, string>>;
}
interface Report {
  repository: {
    kind: "github" | "local";
    repo?: string;
    commit?: string;
    root?: string;
    folder?: string;
  };
  detected: HarnessId[];
  found: Partial<Record<ResourceType, Found[]>>;
  notes: string[];
  hint?: string;
}
const agents: { id: HarnessId; label: string }[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
];
const isReport = (value: unknown): value is Report =>
  !!value && typeof value === "object" && "found" in value;

/** Discover → From GitHub: scan a repository, choose, then preview the install. */
export function GithubInstall({ workspace: w }: { workspace: Workspace }) {
  const [input, setInput] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<Set<HarnessId>>(new Set());
  const all = Object.values(report?.found ?? {}).flat();
  const usable = (item: Found, into: Set<HarnessId>) =>
    item.supports.some((h) => into.has(h));
  const scan = async () => {
    const value = await w.run(["install", input.trim()], false);
    if (!isReport(value)) return;
    const into = new Set(value.detected);
    setReport(value);
    setTargets(into);
    setChosen(
      new Set(
        Object.values(value.found)
          .flat()
          .filter((item) => usable(item, into))
          .map((item) => item.id),
      ),
    );
  };
  // Install exactly the commit that was scanned.
  const pinned = (r: Report) =>
    r.repository.kind === "github"
      ? `github:${r.repository.repo}@${r.repository.commit}${r.repository.folder ? `/${r.repository.folder}` : ""}`
      : r.repository.root!;
  const selected = all.filter(
    (item) => chosen.has(item.id) && usable(item, targets),
  );
  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  return (
    <>
      <div className="discovery-sources">
        <label>
          Repository
          <input
            aria-label="Repository to install from"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) void scan();
            }}
            placeholder="owner/repo, a GitHub URL or ./folder"
          />
        </label>
        <Button
          variant="primary"
          disabled={!!w.busy || !input.trim()}
          onClick={() => void scan()}
        >
          <Search size={15} />
          Scan repository
        </Button>
        <p className="muted">
          Preflight reads the repository and lists its skills, subagents,
          commands, MCP servers, hooks and plugins. No catalog/index.json is
          needed. Nothing is written until you review and apply.
        </p>
      </div>
      {report ? (
        <div className="repo-install">
          <div className="repo-install-agents" role="group" aria-label="Install into">
            <span>Install into</span>
            {agents.map((agent) => (
              <label key={agent.id}>
                <input
                  type="checkbox"
                  checked={targets.has(agent.id)}
                  onChange={() => setTargets(toggle(targets, agent.id))}
                />
                {agent.label}
                {!report.detected.includes(agent.id) && (
                  <small className="muted">not detected</small>
                )}
              </label>
            ))}
          </div>
          {report.notes.map((note, i) => (
            <Notice key={i}>{note}</Notice>
          ))}
          {!all.length && (
            <Empty
              icon={FolderGit2}
              title="Nothing to install"
              description="This repository has no SKILL.md, agents/ or commands/ folder, .mcp.json or plugin marketplace."
            />
          )}
          {Object.entries(report.found).map(([type, items]) => (
            <section key={type} aria-label={`Found ${type}`}>
              <h3>{plural(items.length, type === "mcp" ? "MCP server" : type)}</h3>
              <div className="file-list">
                {items.map((item) => {
                  const into = item.supports.filter((h) => targets.has(h));
                  const reasons = [...targets]
                    .filter((h) => item.reasons[h])
                    .map((h) => item.reasons[h]!);
                  return (
                    <label className="file-row repo-install-row" key={item.id}>
                      <input
                        type="checkbox"
                        aria-label={`Install ${item.name}`}
                        disabled={!into.length}
                        checked={chosen.has(item.id) && !!into.length}
                        onChange={() => setChosen(toggle(chosen, item.id))}
                      />
                      <ResourceIcon type={item.type} size={16} />
                      <span>
                        <strong>{item.name}</strong>{" "}
                        <small className="muted">{item.path}</small>
                        {reasons.length > 0 && (
                          <small className="repo-install-reason">
                            {[...new Set(reasons)].join(" · ")}
                          </small>
                        )}
                      </span>
                      <div className="row-harnesses">
                        {into.map((h) => (
                          <HarnessBadge key={h} harness={h} compact />
                        ))}
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
          <div className="button-row">
            <Button
              variant="primary"
              disabled={!!w.busy || !selected.length || !targets.size}
              onClick={() =>
                void w.run([
                  "install",
                  pinned(report),
                  "--select",
                  selected.map((item) => item.id).join(","),
                  "--harness",
                  [...targets].join(","),
                  "--apply",
                ])
              }
            >
              <Download size={15} />
              Preview installation of {plural(selected.length, "resource")}
            </Button>
          </div>
        </div>
      ) : (
        <Empty
          icon={FolderGit2}
          title="Install from any repository"
          description="Enter owner/repo, for example anthropics/skills. Preflight pins the commit it reads and records where each resource came from."
        />
      )}
    </>
  );
}
