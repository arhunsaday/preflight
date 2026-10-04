import { useState } from "react";
import { Terminal, Play } from "lucide-react";
import type { Workspace } from "../workspace";
import { commandGroups, tokenize } from "../command-model";
import { Button, Json, Notice } from "../components/ui";
export function Console({ workspace: w }: { workspace: Workspace }) {
  const [line, setLine] = useState("list"),
    [output, setOutput] = useState<unknown>(null);
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>Every CLI capability, in your workspace</h2>
          <p>
            Run ADK commands against the active project. Writes always open a
            preview.
          </p>
        </div>
        <Terminal size={25} />
      </div>
      <form
        className="console-form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            void w
              .run(tokenize(line.replace(/^adk\s+/, "")))
              .then((value) => setOutput(value));
          } catch (e) {
            w.setError(String(e));
          }
        }}
      >
        <span>adk</span>
        <input
          aria-label="ADK command"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          spellCheck={false}
        />
        <Button type="submit" variant="primary" disabled={!!w.busy}>
          <Play size={15} />
          Run
        </Button>
      </form>
      <Notice>
        This console runs ADK commands, not shell scripts. Project and home
        paths come from the workspace, and cannot be overridden here.
      </Notice>
      {output !== null && <Json value={output} />}
      <div className="command-catalogue">
        {commandGroups.map((group) => (
          <section key={group.name}>
            <h3>{group.name}</h3>
            {group.commands.map((command) => (
              <button key={command} onClick={() => setLine(command)}>
                {command}
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
