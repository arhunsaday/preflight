import { useState } from "react";
import { ResourceSchema, ResourceTypeSchema } from "../../../src/schema";
import type { Resource } from "../../../src/schema";
import { buildMcpConfig } from "./mcp-config";
import { Button, Dialog, Notice } from "./ui";
export function ResourceForm({
  resource,
  type = "skill",
  onClose,
  onSave,
  defaultScope = "project",
  globalOnly = false,
  adding = false,
}: {
  resource?: Resource;
  type?: Resource["type"];
  defaultScope?: "global" | "project";
  globalOnly?: boolean;
  adding?: boolean;
  onClose: () => void;
  onSave: (value: Resource) => Promise<void>;
}) {
  const [value, setValue] = useState({
    name: resource?.name ?? "",
    id: resource?.id ?? "",
    type: resource?.type ?? type,
    description: resource?.description ?? "",
    source: resource?.source ?? "local:owned",
    scope: globalOnly ? "global" : (resource?.scope ?? defaultScope),
    content: resource?.content ?? "",
    config: JSON.stringify(resource?.config ?? {}, null, 2),
    claude: resource?.harnesses.includes("claude-code") ?? true,
    cursor: resource?.harnesses.includes("cursor") ?? false,
  });
  const [advanced, setAdvanced] = useState(false);
  const [transport, setTransport] = useState(
    resource?.config.url
      ? resource.config.type === "sse"
        ? "sse"
        : "http"
      : "stdio",
  );
  const [url, setUrl] = useState(String(resource?.config.url ?? ""));
  const [command, setCommand] = useState(
    String(resource?.config.command ?? "npx"),
  );
  const [args, setArgs] = useState(
    Array.isArray(resource?.config.args) ? resource.config.args.join("\n") : "",
  );
  const [variables, setVariables] = useState(
    JSON.stringify(resource?.config.env ?? {}, null, 2),
  );
  const [headers, setHeaders] = useState(
    JSON.stringify(resource?.config.headers ?? {}, null, 2),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const field = (key: keyof typeof value, text: string | boolean) =>
    setValue((prev) => ({ ...prev, [key]: text }));
  return (
    <Dialog
      open
      onClose={onClose}
      title={
        adding
          ? "Configure resource before adding"
          : resource
            ? "Edit resource"
            : `Create ${type === "mcp" ? "MCP server" : "resource"}`
      }
      description={
        globalOnly
          ? "This resource will be managed globally and applied for all projects. Review the file paths before confirming."
          : "Choose the target agents and scope, then review the changes before applying."
      }
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setSaving(true);
            setError("");
            const config =
              value.type === "mcp" && !advanced
                ? buildMcpConfig(value.config, {
                    transport,
                    url,
                    command,
                    args,
                    variables,
                    headers,
                  })
                : JSON.parse(value.config);
            const parsed = ResourceSchema.parse({
              ...resource,
              id:
                value.id ||
                `${value.type}:${value.name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`,
              name: value.name,
              type: value.type,
              description: value.description,
              source: value.source,
              scope: value.scope,
              harnesses: [
                ...(value.claude ? ["claude-code"] : []),
                ...(value.cursor ? ["cursor"] : []),
              ],
              content: value.content,
              config,
            });
            await onSave(parsed);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="dialog-body form-grid">
          <label>
            Name
            <input
              required
              value={value.name}
              disabled={!!resource && !adding}
              onChange={(e) => field("name", e.target.value)}
            />
          </label>
          <label>
            Type
            <select
              value={value.type}
              disabled={!!resource}
              onChange={(e) => field("type", e.target.value)}
            >
              {ResourceTypeSchema.options.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Resource ID
            <input
              value={value.id}
              disabled={!!resource}
              placeholder={`${value.type}:my-resource`}
              onChange={(e) => field("id", e.target.value)}
            />
          </label>
          <label>
            Scope
            <select
              value={value.scope}
              disabled={globalOnly}
              onChange={(e) => field("scope", e.target.value)}
            >
              <option value="project">Project</option>
              <option value="global">Global</option>
            </select>
          </label>
          <label className="span-2">
            Description
            <input
              value={value.description}
              onChange={(e) => field("description", e.target.value)}
            />
          </label>
          <label className="span-2">
            Source
            <input
              required
              value={value.source}
              onChange={(e) => field("source", e.target.value)}
            />
          </label>
          <fieldset className="span-2">
            <legend>Available in</legend>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={value.claude}
                onChange={(e) => field("claude", e.target.checked)}
              />
              Claude Code
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={value.cursor}
                onChange={(e) => field("cursor", e.target.checked)}
              />
              Cursor
            </label>
          </fieldset>
          {value.type === "mcp" ? (
            <section className="span-2 mcp-editor">
              <div className="editor-heading">
                <h3>MCP connection</h3>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={advanced}
                    onChange={(e) => {
                      try {
                        if (e.target.checked)
                          field(
                            "config",
                            JSON.stringify(
                              buildMcpConfig(value.config, {
                                transport,
                                url,
                                command,
                                args,
                                variables,
                                headers,
                              }),
                              null,
                              2,
                            ),
                          );
                        else {
                          const config = JSON.parse(value.config);
                          setTransport(
                            config.url
                              ? config.type === "sse"
                                ? "sse"
                                : "http"
                              : "stdio",
                          );
                          setUrl(String(config.url ?? ""));
                          setCommand(String(config.command ?? ""));
                          setArgs(
                            Array.isArray(config.args)
                              ? config.args.join("\n")
                              : "",
                          );
                          setVariables(
                            JSON.stringify(config.env ?? {}, null, 2),
                          );
                          setHeaders(
                            JSON.stringify(config.headers ?? {}, null, 2),
                          );
                        }
                        setAdvanced(e.target.checked);
                        setError("");
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  />
                  Advanced JSON
                </label>
              </div>
              {advanced ? (
                <label>
                  Configuration (JSON)
                  <textarea
                    rows={9}
                    value={value.config}
                    onChange={(e) => field("config", e.target.value)}
                  />
                </label>
              ) : (
                <>
                  <label>
                    Connection type
                    <select
                      value={transport}
                      onChange={(e) => setTransport(e.target.value)}
                    >
                      <option value="stdio">Local command (stdio)</option>
                      <option value="http">Remote server (HTTP)</option>
                      <option value="sse">Remote server (SSE)</option>
                    </select>
                  </label>
                  {transport === "stdio" ? (
                    <>
                      <label>
                        Executable
                        <input
                          value={command}
                          onChange={(e) => setCommand(e.target.value)}
                          placeholder="npx, uvx, node or an absolute executable path"
                          required
                        />
                      </label>
                      <label>
                        Arguments (one per line)
                        <textarea
                          rows={4}
                          value={args}
                          onChange={(e) => setArgs(e.target.value)}
                          placeholder={
                            "-y\n@modelcontextprotocol/server-filesystem\n/path/to/folder"
                          }
                        />
                      </label>
                      <label>
                        Environment variables (JSON)
                        <textarea
                          rows={3}
                          value={variables}
                          onChange={(e) => setVariables(e.target.value)}
                          placeholder={'{"API_KEY":"${MY_API_KEY}"}'}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Server URL
                        <input
                          type="url"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          placeholder="https://example.com/mcp"
                          required
                        />
                      </label>
                      <label>
                        Headers (JSON)
                        <textarea
                          rows={3}
                          value={headers}
                          onChange={(e) => setHeaders(e.target.value)}
                          placeholder={
                            '{"Authorization":"Bearer ${MY_API_KEY}"}'
                          }
                        />
                      </label>
                    </>
                  )}
                  <p className="muted">
                    Use environment references such as ${"{MY_API_KEY}"} for
                    secrets. Connecting starts the executable or contacts the
                    server only after confirmation.
                  </p>
                </>
              )}
            </section>
          ) : (
            <>
              <label className="span-2">
                {value.type === "skill"
                  ? "Skill instructions (SKILL.md)"
                  : "Content"}
                <textarea
                  rows={10}
                  value={value.content}
                  onChange={(e) => field("content", e.target.value)}
                  placeholder={
                    value.type === "skill"
                      ? "---\nname: my-skill\ndescription: When to use it\n---\n\nInstructions…"
                      : ""
                  }
                />
              </label>
              <details className="span-2">
                <summary>Advanced configuration</summary>
                <label>
                  Configuration (JSON)
                  <textarea
                    rows={5}
                    value={value.config}
                    onChange={(e) => field("config", e.target.value)}
                  />
                </label>
              </details>
            </>
          )}
          {error && (
            <div className="span-2">
              <Notice>{error}</Notice>
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            Preview changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
