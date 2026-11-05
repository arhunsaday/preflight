import { useState } from "react";
import { FileText, WandSparkles, CheckCircle2, XCircle } from "lucide-react";
import type { Workspace } from "../workspace";
import { plural, tildify } from "../format";
import { Button, Empty } from "../components/ui";
import { FindingRow } from "./configuration";

type Agent = "claude-code" | "codex";
type Scope = "global" | "project";
const fileNames: Record<Agent, Record<Scope, string>> = {
  "claude-code": { global: "~/.claude/CLAUDE.md", project: "CLAUDE.md" },
  codex: { global: "~/.codex/AGENTS.md", project: "AGENTS.md" },
};

/** CLAUDE.md / AGENTS.md: size against the limit, lint, and a reviewed draft. */
export function Instructions({ workspace: w }: { workspace: Workspace }) {
  const global = w.state?.workspace === "global";
  const [agent, setAgent] = useState<Agent>("claude-code");
  const [scope, setScope] = useState<Scope>(global ? "global" : "project");
  const effective: Scope = global ? "global" : scope;
  const report = w.snapshot?.instructions;
  const home = w.snapshot?.home;
  const max = report?.maxLines ?? 200;
  const files = (report?.files ?? []).filter(
    (f) => f.agent === agent && f.scope === effective,
  );
  const paths = new Set(files.map((f) => f.path));
  const findings = (report?.findings ?? []).filter(
    (f) => f.path && paths.has(f.path),
  );
  const draft = () =>
    void w.run([
      "instructions",
      "draft",
      "--write",
      "--scope",
      effective,
      "--agent",
      agent,
    ]);
  return (
    <div className="page-scroll instructions-page">
      <div className="section-intro">
        <div>
          <h2>Instructions</h2>
          <p>
            The file your agent loads on every session. Keep it short and
            verifiable; move task-specific rules into skills.
          </p>
        </div>
        <Button variant="primary" disabled={!!w.busy} onClick={draft}>
          <WandSparkles size={15} />
          Draft improvements
        </Button>
      </div>
      <div className="instructions-controls">
        <div className="segmented" role="radiogroup" aria-label="Agent">
          {(["claude-code", "codex"] as const).map((value) => (
            <button
              key={value}
              role="radio"
              aria-checked={agent === value}
              className={agent === value ? "active" : ""}
              onClick={() => setAgent(value)}
            >
              {value === "claude-code" ? "Claude Code" : "Codex"}
            </button>
          ))}
        </div>
        {!global && (
          <div className="segmented" role="radiogroup" aria-label="Scope">
            {(["project", "global"] as const).map((value) => (
              <button
                key={value}
                role="radio"
                aria-checked={scope === value}
                className={scope === value ? "active" : ""}
                onClick={() => setScope(value)}
              >
                {value === "project" ? "This project" : "Global"}
              </button>
            ))}
          </div>
        )}
      </div>
      {!files.length && (
        <Empty
          icon={FileText}
          title={`No ${fileNames[agent][effective]} yet`}
          description="Draft improvements proposes a short file from your setup. Nothing is written until you review and apply it."
        />
      )}
      {files.map((file) => {
        const ratio = Math.min(1, file.lines / max);
        const over = file.lines > max;
        return (
          <section className="instruction-file" key={file.path}>
            <h3>
              <FileText size={15} aria-hidden="true" />
              <code title={file.path}>{tildify(file.path, home)}</code>
            </h3>
            <div
              className={`line-gauge ${over ? "over" : ""}`}
              role="meter"
              aria-label="Lines against the limit"
              aria-valuemin={0}
              aria-valuemax={max}
              aria-valuenow={file.lines}
            >
              <i style={{ width: `${ratio * 100}%` }} />
            </div>
            <p className="gauge-caption">
              <strong>
                {file.lines}/{max} lines
              </strong>{" "}
              · ~{file.tokens.toLocaleString()} tokens
              {file.totalTokens !== file.tokens &&
                ` · ~${file.totalTokens.toLocaleString()} with imports`}
              {over && " · over the limit"}
            </p>
            {file.imports.length > 0 && (
              <ul className="import-list">
                {file.imports.map((ref) => (
                  <li key={`${ref.line}-${ref.spec}`}>
                    {ref.exists ? (
                      <CheckCircle2 size={13} className="ok" />
                    ) : (
                      <XCircle size={13} className="broken" />
                    )}
                    <span>{ref.exists ? "Found" : "Missing"}</span>
                    <code>@{ref.spec}</code>
                    <small>line {ref.line}</small>
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary>Show file</summary>
              <pre className="instruction-text">{file.text}</pre>
            </details>
          </section>
        );
      })}
      {files.length > 0 && (
        <section className="finding-group">
          <h3 className="finding-group-title">
            Lint <span>{plural(findings.length, "finding")}</span>
          </h3>
          {findings.length ? (
            <div className="findings">
              {findings.map((f, i) => (
                <FindingRow finding={f} key={`${f.code}-${i}`} />
              ))}
            </div>
          ) : (
            <p className="hint">No lint findings for this file.</p>
          )}
        </section>
      )}
    </div>
  );
}
