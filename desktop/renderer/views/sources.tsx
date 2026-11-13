import { Input } from "../components/ui/input";
import { useState } from "react";
import {
  Library,
  Plus,
  RefreshCw,
  Trash,
  GitBranch,
  Folder,
} from "lucide-react";
import type { Workspace } from "../workspace";
import { Badge, Button, Empty, Notice } from "../components/ui";

export const EXAMPLE_SOURCE = "github:arhunsaday/agent-kit@main";

/**
 * Content sources: the repositories the catalogue and loadouts come from.
 * Preflight ships none; every change goes through the usual preview.
 */
export function Sources({ workspace: w }: { workspace: Workspace }) {
  const [spec, setSpec] = useState("");
  const sources = w.snapshot?.sources ?? [];
  const add = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) void w.run(["source", "add", trimmed]);
  };
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <Badge tone="blue">Sources</Badge>
          <h2>Content sources</h2>
          <p>
            Discover and Loadouts read from these repositories. A GitHub source
            is pinned to the commit its branch or tag names when you add it;
            Update moves it to that ref&apos;s current commit. A local folder is
            read as it is.
          </p>
        </div>
      </div>
      <form
        className="source-add"
        aria-label="Add a source"
        onSubmit={(e) => {
          e.preventDefault();
          add(spec);
        }}
      >
        <Input
          aria-label="Source"
          placeholder={`${EXAMPLE_SOURCE} or /path/to/folder`}
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
        />
        <Button
          variant="primary"
          type="submit"
          disabled={!!w.busy || !spec.trim()}
        >
          <Plus size={15} />
          Preview adding
        </Button>
      </form>
      {sources.length === 0 ? (
        <Empty
          icon={Library}
          title="No content source yet"
          description={`Preflight ships with no skills, plugins or loadouts of its own. Add a repository that holds them, for example ${EXAMPLE_SOURCE}, then browse it in Discover.`}
          action={
            <Button
              variant="primary"
              disabled={!!w.busy}
              onClick={() => add(EXAMPLE_SOURCE)}
            >
              <Plus size={15} />
              Add agent-kit
            </Button>
          }
        />
      ) : (
        <div className="source-list" role="list">
          {sources.map((source) => (
            <div className="source-row" role="listitem" key={source.name}>
              <div className="resource-glyph skill">
                {source.kind === "github" ? (
                  <GitBranch size={18} />
                ) : (
                  <Folder size={18} />
                )}
              </div>
              <div className="source-detail">
                <strong>{source.name}</strong>
                <small>
                  {source.kind === "github"
                    ? `github:${source.repo}@${source.ref ?? ""} · ${source.commit?.slice(0, 7) ?? ""}`
                    : source.path}
                </small>
                <span>
                  <Badge>{source.resources} resources</Badge>{" "}
                  <Badge>{source.loadouts} loadouts</Badge>
                </span>
              </div>
              <div className="button-row">
                {source.kind === "github" && (
                  <Button
                    disabled={!!w.busy}
                    onClick={() =>
                      void w.run(["source", "update", source.name])
                    }
                  >
                    <RefreshCw size={15} />
                    Update
                  </Button>
                )}
                <Button
                  disabled={!!w.busy}
                  onClick={() => void w.run(["source", "remove", source.name])}
                >
                  <Trash size={15} />
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Notice tone="info">
        Sources are stored for your user in ~/.preflight/sources.json and are
        shared by every project and the global workspace.
      </Notice>
    </div>
  );
}
