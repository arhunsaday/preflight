import {
  HarnessIdSchema,
  ResourceSchema,
  ResourceTypeSchema,
  ScopeSchema,
  type HarnessId,
  type Resource,
  type ResourceType,
  type Scope,
} from "../schema.js";

export interface FormState {
  type: ResourceType;
  id: string;
  name: string;
  description: string;
  source: string;
  scope: Scope;
  harnesses: HarnessId[];
  enabled: boolean;
  tags: string;
  content: string;
  config: string;
}

export type FieldName = keyof FormState;

export interface FormField {
  name: FieldName;
  kind: "text" | "choice" | "multi" | "boolean";
  options?: readonly string[];
  hint?: string;
}

export const resourceTypes = ResourceTypeSchema.options;
export const scopes = ScopeSchema.options;
export const harnessIds = HarnessIdSchema.options;

export const formFields: FormField[] = [
  { name: "type", kind: "choice", options: resourceTypes },
  { name: "id", kind: "text", hint: "stable identifier, e.g. skill:my-skill" },
  { name: "name", kind: "text" },
  { name: "description", kind: "text" },
  { name: "source", kind: "text", hint: "provenance URI" },
  { name: "scope", kind: "choice", options: scopes },
  { name: "harnesses", kind: "multi", options: harnessIds },
  { name: "enabled", kind: "boolean" },
  { name: "tags", kind: "text", hint: "comma separated" },
  { name: "content", kind: "text", hint: "\\n inserts a line break" },
  { name: "config", kind: "text", hint: "JSON object" },
];

export function emptyForm(): FormState {
  return {
    type: "skill",
    id: "",
    name: "",
    description: "",
    source: "local:owned",
    scope: "project",
    harnesses: ["claude-code"],
    enabled: true,
    tags: "",
    content: "",
    config: "{}",
  };
}

export function fromResource(resource: Resource): FormState {
  return {
    type: resource.type,
    id: resource.id,
    name: resource.name,
    description: resource.description,
    source: resource.source,
    scope: resource.scope,
    harnesses: [...resource.harnesses],
    enabled: resource.enabled,
    tags: resource.tags.join(", "),
    content: (resource.content ?? "").replace(/\n/g, "\\n"),
    config: JSON.stringify(resource.config),
  };
}

export function displayValue(form: FormState, field: FormField): string {
  const value = form[field.name];
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value;
}

export function cycle(
  form: FormState,
  field: FormField,
  direction: 1 | -1,
): FormState {
  if (field.kind === "boolean")
    return { ...form, [field.name]: !form[field.name] };
  if (field.kind !== "choice" || !field.options) return form;
  const options = field.options;
  const current = options.indexOf(String(form[field.name]));
  const next = (current + direction + options.length) % options.length;
  return { ...form, [field.name]: options[next]! };
}

export function toggle(
  form: FormState,
  field: FormField,
  option: string,
): FormState {
  if (field.kind !== "multi") return form;
  const current = form.harnesses;
  const value = HarnessIdSchema.parse(option);
  return {
    ...form,
    harnesses: current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value],
  };
}

export type FormResult =
  | { ok: true; resource: Resource }
  | { ok: false; issues: Partial<Record<FieldName, string>> };

export function validate(form: FormState, previous?: Resource): FormResult {
  let config: unknown;
  try {
    config = JSON.parse(form.config || "{}");
  } catch (error) {
    return {
      ok: false,
      issues: { config: error instanceof Error ? error.message : "Invalid JSON" },
    };
  }
  const parsed = ResourceSchema.safeParse({
    ...(previous ?? {}),
    type: form.type,
    id: form.id,
    name: form.name,
    description: form.description,
    source: form.source,
    scope: form.scope,
    harnesses: form.harnesses,
    enabled: form.enabled,
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    content: form.content ? form.content.replace(/\\n/g, "\n") : undefined,
    config,
  });
  if (parsed.success) return { ok: true, resource: parsed.data };
  const issues: Partial<Record<FieldName, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && field in form)
      issues[field as FieldName] ??= issue.message;
    else issues.id ??= `${issue.path.join(".") || "resource"}: ${issue.message}`;
  }
  return { ok: false, issues };
}
