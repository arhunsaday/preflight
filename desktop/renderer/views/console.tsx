import { useRef, useState } from "react";
import { Play, Trash2 } from "lucide-react";
import type { Workspace } from "../workspace";
import { commandGroups, tokenize } from "../command-model";
import { Button, Json, Notice } from "../components/ui";

interface Entry {
  id: number;
  line: string;
  at: Date;
  value: unknown;
  failed: boolean;
}

export function Console({ workspace: w }: { workspace: Workspace }) {
  const [line, setLine] = useState("list"),
    [history, setHistory] = useState<Entry[]>([]),
    [cursor, setCursor] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const submit = async () => {
    const text = line.trim().replace(/^adk\s+/, "");
    if (!text) return;
    let args: string[];
    try {
      args = tokenize(text);
    } catch (e) {
      w.setError(e instanceof Error ? e.message : String(e));
      return;
    }
    // Writes open the review dialog; read-only output lands in the history.
    const response = await w.prepare(args, false);
    setHistory((all) => [
      {
        id: ++counter.current,
        line: text,
        at: new Date(),
        value: !response
          ? "Command failed. See the error above."
          : response.kind === "preview"
            ? "Opened for review. Nothing is written until you apply."
            : response.value,
        failed: !response,
      },
      ...all.slice(0, 19),
    ]);
    setCursor(-1);
  };
  const commands = history.map((h) => h.line);
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>Every CLI capability, in your workspace</h2>
          <p>
            Run ADK commands against the active workspace. Writes always open a
            preview; read-only output stays below. Use ↑ and ↓ to recall earlier
            commands.
          </p>
        </div>
      </div>
      <form
        className="console-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span>adk</span>
        <input
          ref={input}
          aria-label="ADK command"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" && commands.length) {
              e.preventDefault();
              const next = Math.min(cursor + 1, commands.length - 1);
              setCursor(next);
              setLine(commands[next]!);
            } else if (e.key === "ArrowDown" && cursor >= 0) {
              e.preventDefault();
              const next = cursor - 1;
              setCursor(next);
              setLine(next < 0 ? "" : commands[next]!);
            }
          }}
        />
        <Button type="submit" variant="primary" disabled={!!w.busy}>
          <Play size={15} />
          Run
        </Button>
      </form>
      <Notice tone="info">
        This console runs ADK commands, not shell scripts. Project and home
        paths come from the workspace and cannot be overridden here.
      </Notice>
      {history.length > 0 && (
        <div className="console-history" aria-live="polite">
          {history.map((entry) => (
            <article
              className={`console-entry ${entry.failed ? "failed" : ""}`}
              key={entry.id}
            >
              <header>
                <span>adk {entry.line}</span>
                <time dateTime={entry.at.toISOString()}>
                  {entry.at.toLocaleTimeString()}
                </time>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Run again"
                  title="Load into the prompt"
                  onClick={() => {
                    setLine(entry.line);
                    input.current?.focus();
                  }}
                >
                  <Play size={13} />
                </button>
              </header>
              <Json value={entry.value} />
            </article>
          ))}
          <Button variant="ghost" onClick={() => setHistory([])}>
            <Trash2 size={14} />
            Clear output
          </Button>
        </div>
      )}
      <div className="command-catalogue">
        {commandGroups.map((group) => (
          <section key={group.name}>
            <h3>{group.name}</h3>
            {group.commands.map((command) => (
              <button
                type="button"
                key={command}
                onClick={() => {
                  setLine(command);
                  // Select the first placeholder so typing replaces it.
                  requestAnimationFrame(() => {
                    const field = input.current;
                    if (!field) return;
                    field.focus();
                    const start = command.indexOf("<");
                    if (start >= 0)
                      field.setSelectionRange(
                        start,
                        command.indexOf(">", start) + 1,
                      );
                  });
                }}
              >
                {command}
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
