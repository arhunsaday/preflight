import {z} from 'zod';

export const ResourceTypeSchema = z.enum([
  'skill', 'mcp', 'subagent', 'hook', 'prompt', 'tool', 'plugin', 'statusline', 'command',
]);
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

export const ScopeSchema = z.enum(['global', 'project']);
export type Scope = z.infer<typeof ScopeSchema>;

export const HarnessIdSchema = z.enum(['claude-code', 'cursor']);
export type HarnessId = z.infer<typeof HarnessIdSchema>;

const jsonValue: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(z.string(), jsonValue),
]));

export const ResourceSchema = z.object({
  id: z.string().min(3).regex(/^[a-z0-9][a-z0-9:._/-]*$/i),
  type: ResourceTypeSchema,
  name: z.string().min(1),
  description: z.string().default(''),
  source: z.string().min(1),
  scope: ScopeSchema,
  harnesses: z.array(HarnessIdSchema).min(1),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), jsonValue).default({}),
  content: z.string().optional(),
  tags: z.array(z.string()).default([]),
  updatedAt: z.string().datetime().optional(),
}).strict();
export type Resource = z.infer<typeof ResourceSchema>;

export const ProfileSchema = z.object({
  description: z.string().default(''),
  resources: z.array(ResourceSchema).default([]),
}).strict();
export type Profile = z.infer<typeof ProfileSchema>;

export const AdkConfigSchema = z.object({
  version: z.literal(1),
  activeProfile: z.string().min(1).default('default'),
  profiles: z.record(z.string(), ProfileSchema),
}).strict().superRefine((config, context) => {
  if (!(config.activeProfile in config.profiles)) {
    context.addIssue({code: 'custom', path: ['activeProfile'], message: 'Active profile does not exist'});
  }
  for (const [name, profile] of Object.entries(config.profiles)) {
    const seen = new Set<string>();
    profile.resources.forEach((resource, index) => {
      if (seen.has(resource.id)) {
        context.addIssue({code: 'custom', path: ['profiles', name, 'resources', index, 'id'], message: 'Duplicate resource id'});
      }
      seen.add(resource.id);
    });
  }
});
export type AdkConfig = z.infer<typeof AdkConfigSchema>;

export const LockEntrySchema = z.object({
  resourceId: z.string(),
  harness: HarnessIdSchema,
  scope: ScopeSchema,
  path: z.string(),
  digest: z.string(),
  installedAt: z.string().datetime(),
}).strict();

export const AdkLockSchema = z.object({
  version: z.literal(1),
  profile: z.string(),
  entries: z.array(LockEntrySchema),
}).strict();
export type AdkLock = z.infer<typeof AdkLockSchema>;

const secretKey = /(?:secret|token|password|passwd|api[_-]?key|private[_-]?key|credential)/i;
const secretValue = /(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|[A-Za-z0-9+/]{40,}={0,2})/;
const envReference = /^\$\{[A-Z][A-Z0-9_]*\}$/;

export function secretPaths(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => secretPaths(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, nested]) => {
    const nestedPath = `${path}.${key}`;
    if (typeof nested === 'string' && !envReference.test(nested)
      && ((secretKey.test(key) && nested.length > 0) || secretValue.test(nested))) return [nestedPath];
    return secretPaths(nested, nestedPath);
  });
}

export const SharePayloadSchema = z.object({
  version: z.literal(1),
  ownerId: z.string().min(1),
  visibility: z.enum(['public', 'unlisted']),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  resources: z.array(ResourceSchema).min(1),
  profileName: z.string().optional(),
}).strict().superRefine((payload, context) => {
  for (const path of secretPaths(payload.resources)) {
    context.addIssue({code: 'custom', path: ['resources'], message: `Share contains a possible secret at ${path}`});
  }
});
export type SharePayload = z.infer<typeof SharePayloadSchema>;

export const defaultConfig = (): AdkConfig => ({
  version: 1,
  activeProfile: 'default',
  profiles: {default: {description: 'Default development setup', resources: []}},
});
