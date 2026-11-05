import { z } from "zod";

export const ResourceTypeSchema = z.enum([
  "skill",
  "mcp",
  "subagent",
  "hook",
  "prompt",
  "tool",
  "plugin",
  "statusline",
  "command",
  "instructions",
]);
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

export const ScopeSchema = z.enum(["global", "project"]);
export type Scope = z.infer<typeof ScopeSchema>;

export const HarnessIdSchema = z.enum(["claude-code", "cursor", "codex"]);
export type HarnessId = z.infer<typeof HarnessIdSchema>;

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

export const ResourceSchema = z
  .object({
    id: z
      .string()
      .min(3)
      .regex(/^[a-z0-9][a-z0-9:._/-]*$/i),
    type: ResourceTypeSchema,
    name: z.string().min(1),
    description: z.string().default(""),
    source: z.string().min(1),
    scope: ScopeSchema,
    harnesses: z.array(HarnessIdSchema).min(1),
    enabled: z.boolean().default(true),
    config: z.record(z.string(), jsonValue).default({}),
    content: z.string().optional(),
    tags: z.array(z.string()).default([]),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();
export type Resource = z.infer<typeof ResourceSchema>;

export const ProfileSchema = z
  .object({
    description: z.string().default(""),
    resources: z.array(ResourceSchema).default([]),
  })
  .strict();
export type Profile = z.infer<typeof ProfileSchema>;

/**
 * Doctor thresholds. Every key is optional; a missing key keeps its default
 * (see `doctorDefaults`). The project configuration overrides the global one.
 */
export const DoctorSettingsSchema = z
  .object({
    /** A resource unused for this many days is reported as unused context. */
    unusedDays: z.number().int().min(1).max(3650).optional(),
    /** A skill used at most this many times in the window is a manual-skill candidate. */
    manualMaxUses: z.number().int().min(0).optional(),
    /** CLAUDE.md / AGENTS.md longer than this many lines is reported. */
    instructionsMaxLines: z.number().int().min(1).optional(),
    /** Jaccard similarity of skill descriptions that makes two skills overlap. */
    skillSimilarity: z.number().min(0.05).max(1).optional(),
    /** Target range for the number of model-invocable global skills. */
    skillTarget: z
      .object({ min: z.number().int().min(0), max: z.number().int().min(1) })
      .strict()
      .optional(),
    /** Enabled plugins before `plugins-many` is reported. */
    maxPlugins: z.number().int().min(0).optional(),
    /** User-level MCP servers before `mcp-many` is reported. */
    maxMcpServers: z.number().int().min(0).optional(),
    /** Characters one SessionStart hook may print (`--measure`). */
    hookOutputChars: z.number().int().min(0).optional(),
    /** Characters all SessionStart hooks together may print (`--measure`). */
    hookTotalChars: z.number().int().min(0).optional(),
    /** Time limit for one measured hook, in milliseconds. */
    hookTimeoutMs: z.number().int().min(100).max(120000).optional(),
    /** Resident memory of all MCP processes before it is a warning (`--processes`). */
    mcpProcessMemoryMb: z.number().min(1).optional(),
    /** Idle minutes after which the prompt cache has expired. */
    cacheGapMinutes: z.number().min(1).optional(),
    /** Shortest instruction line compared with skill bodies for duplication. */
    duplicateMinChars: z.number().int().min(10).optional(),
  })
  .strict();
export type DoctorSettings = z.infer<typeof DoctorSettingsSchema>;
export const doctorDefaults = {
  unusedDays: 30,
  manualMaxUses: 1,
  instructionsMaxLines: 200,
  skillSimilarity: 0.5,
  skillTarget: { min: 60, max: 80 },
  maxPlugins: 15,
  maxMcpServers: 10,
  hookOutputChars: 1000,
  hookTotalChars: 2000,
  hookTimeoutMs: 10000,
  mcpProcessMemoryMb: 1024,
  cacheGapMinutes: 5,
  duplicateMinChars: 40,
} satisfies Required<DoctorSettings>;
export type DoctorThresholds = typeof doctorDefaults;

export const PreflightConfigSchema = z
  .object({
    version: z.literal(1),
    activeProfile: z.string().min(1).default("default"),
    profiles: z.record(z.string(), ProfileSchema),
    doctor: DoctorSettingsSchema.optional(),
  })
  .strict()
  .superRefine((config, context) => {
    if (!(config.activeProfile in config.profiles)) {
      context.addIssue({
        code: "custom",
        path: ["activeProfile"],
        message: "Active profile does not exist",
      });
    }
    for (const [name, profile] of Object.entries(config.profiles)) {
      const seen = new Set<string>();
      profile.resources.forEach((resource, index) => {
        if (seen.has(resource.id)) {
          context.addIssue({
            code: "custom",
            path: ["profiles", name, "resources", index, "id"],
            message: "Duplicate resource id",
          });
        }
        seen.add(resource.id);
      });
    }
  });
export type PreflightConfig = z.infer<typeof PreflightConfigSchema>;

export const LockEntrySchema = z
  .object({
    resourceId: z.string(),
    harness: HarnessIdSchema,
    scope: ScopeSchema,
    path: z.string(),
    digest: z.string(),
    installedAt: z.string().datetime(),
  })
  .strict();

export const PreflightLockSchema = z
  .object({
    version: z.literal(1),
    profile: z.string(),
    resources: z.array(ResourceSchema),
    files: z.array(
      z
        .object({
          path: z.string(),
          digest: z.string().nullable(),
          /** The digest covers only the parts Preflight owns in a shared file. */
          part: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type PreflightLock = z.infer<typeof PreflightLockSchema>;

const secretKey =
  /(?:secret|token|password|passwd|api[_-]?key|private[_-]?key|credential|authorization|cookie)/i;
const secretValue =
  /(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^/\s:@]+:[^/@\s]+@|(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=-]+|(?:token|password|secret|api[_-]?key)\s*[=:]\s*["']?[A-Za-z0-9_+/.=-]+)/i;
const envReference = /^\$\{[A-Z][A-Z0-9_]*\}$/;
function containsSecret(value: string): boolean {
  return secretValue.test(value.replace(/\$\{[A-Z][A-Z0-9_]*\}/g, ""));
}
export function secretPaths(value: unknown, path = "$"): string[] {
  if (typeof value === "string") return containsSecret(value) ? [path] : [];
  if (Array.isArray(value))
    return value.flatMap((item, index) => {
      const previous = value[index - 1];
      if (
        typeof item === "string" &&
        typeof previous === "string" &&
        /^--?/.test(previous) &&
        secretKey.test(previous) &&
        !envReference.test(item)
      )
        return [`${path}[${index}]`];
      return secretPaths(item, `${path}[${index}]`);
    });
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => {
    const nestedPath = `${path}.${key}`;
    if (
      typeof nested === "string" &&
      !envReference.test(nested) &&
      ((secretKey.test(key) &&
        nested.length > 0 &&
        !/^(?:Bearer|Basic) \$\{[A-Z][A-Z0-9_]*\}$/.test(nested)) ||
        containsSecret(nested))
    )
      return [nestedPath];
    return secretPaths(nested, nestedPath);
  });
}

export const SharePayloadSchema = z
  .object({
    version: z.literal(1),
    ownerId: z.string().min(1),
    visibility: z.enum(["public", "unlisted"]),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime().optional(),
    /** Organization id: lists the share for that team's members. */
    team: z.string().min(1).max(200).optional(),
    resources: z.array(ResourceSchema).min(1),
    profileName: z.string().optional(),
  })
  .strict()
  .superRefine((payload, context) => {
    for (const path of secretPaths(payload.resources)) {
      context.addIssue({
        code: "custom",
        path: ["resources"],
        message: `Share contains a possible secret at ${path}`,
      });
    }
  });
export type SharePayload = z.infer<typeof SharePayloadSchema>;

export const defaultConfig = (): PreflightConfig => ({
  version: 1,
  activeProfile: "default",
  profiles: {
    default: { description: "Default development setup", resources: [] },
  },
});
