import { useState } from "react";
import { ResourceSchema, ResourceTypeSchema } from "../../../src/schema";
import type { Resource } from "../../../src/schema";
import { Button, Dialog, Notice } from "./ui";
export function ResourceForm({
  resource,
  type = "skill",
  onClose,
  onSave,
}: {
  resource?: Resource;
  type?: Resource["type"];
  onClose: () => void;
  onSave: (value: Resource) => Promise<void>;
}) {
  const [value, setValue] = useState({
    name: resource?.name ?? "",
    id: resource?.id ?? "",
    type: resource?.type ?? type,
    description: resource?.description ?? "",
    source: resource?.source ?? "local:owned",
    scope: resource?.scope ?? "project",
    content: resource?.content ?? "",
    config: JSON.stringify(resource?.config ?? {}, null, 2),
    claude: resource?.harnesses.includes("claude-code") ?? true,
    cursor: resource?.harnesses.includes("cursor") ?? false,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const field = (key: keyof typeof value, text: string | boolean) =>
    setValue((prev) => ({ ...prev, [key]: text }));
  return (
    <Dialog
      open
      onClose={onClose}
      title={resource ? "Edit resource" : "Create resource"}
      description="Use the same resource schema as the CLI. Changes are previewed first."
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setSaving(true);
            setError("");
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
              config: JSON.parse(value.config),
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
              onChange={(e) => field("name", e.target.value)}
            />
          </label>
          <label>
            Type
            <select
              value={value.type}
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
          <label className="span-2">
            Content
            <textarea
              rows={8}
              value={value.content}
              onChange={(e) => field("content", e.target.value)}
              placeholder={
                value.type === "skill"
                  ? "---\nname: my-skill\ndescription: When to use it\n---\n\nInstructions…"
                  : ""
              }
            />
          </label>
          <label className="span-2">
            Configuration (JSON)
            <textarea
              rows={5}
              value={value.config}
              onChange={(e) => field("config", e.target.value)}
            />
          </label>
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
