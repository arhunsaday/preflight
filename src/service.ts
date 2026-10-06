import { join } from "node:path";
import { ConfigStore, diffResources } from "./state.js";
import {
  AdkLockSchema,
  AdkConfigSchema,
  ResourceSchema,
  defaultConfig,
  type AdkConfig,
  type HarnessId,
  type Resource,
} from "./schema.js";
import {
  createAdapters,
  detectAll,
  digest,
  safeRelative,
  type Context,
} from "./adapters.js";
import {
  applyFiles,
  linkedComponent,
  readText,
  jsonText,
  rollback,
  type FileChange,
} from "./transaction.js";
import { analyze, analyzeSettings, type Finding } from "./analysis.js";
const Lock = AdkLockSchema;
export type Policy = (
  desired: Resource[],
  previous: Resource[],
) => Promise<void>;
export class AdkService {
  readonly store: ConfigStore;
  constructor(
    readonly context: Context,
    readonly policy: Policy = async () => {},
  ) {
    this.store = new ConfigStore(context.root);
  }
  async init(dryRun = false) {
    const before = await readText(this.store.configPath);
    if (before !== null) return AdkConfigSchema.parse(JSON.parse(before));
    const config = defaultConfig();
    const plan = await applyFiles(
      this.context.root,
      [{ path: this.store.configPath, before: null, after: jsonText(config) }],
      { actor: process.env.USER ?? "local", dryRun },
    );
    return dryRun ? { ...config, ...plan } : config;
  }
  list() {
    return this.store.resources();
  }
  inspect(id: string) {
    return this.store.get(id);
  }
  detect() {
    return detectAll(createAdapters(this.context));
  }
  async doctor() {
    const states = await this.detect();
    const findings: Finding[] = states.flatMap((s) =>
      s.error
        ? [
            {
              code: "adapter-unavailable",
              severity: "error",
              message: `${s.id}: ${s.error}`,
            },
          ]
        : s.issues.map((message) => ({
            code: "broken-resource",
            severity: "error" as const,
            message,
          })),
    );
    findings.push(...analyze(states.flatMap((s) => s.resources)));
    for (const base of [this.context.home, this.context.root])
      for (const name of ["settings.json", "settings.local.json"]) {
        const path = join(base, ".claude", name);
        try {
          const text = await readText(path);
          if (text !== null)
            findings.push(...analyzeSettings(JSON.parse(text), path));
        } catch (error) {
          findings.push({
            code: "settings-invalid",
            severity: "error",
            message: `${path}: ${String(error)}`,
          });
        }
      }
    const raw = await readText(this.store.lockPath);
    if (raw) {
      const lock = Lock.parse(JSON.parse(raw));
      for (const f of lock.files) {
        const text = await readText(f.path);
        if ((text === null ? null : digest(text)) !== f.digest)
          findings.push({
            code: "drift",
            severity: "error",
            message: `Managed file changed: ${f.path}`,
          });
      }
    }
    return findings;
  }
  async change(
    mutate: (config: AdkConfig) => void,
    dryRun = false,
    source?: string,
  ) {
    const before = await readText(this.store.configPath);
    if (before === null) throw new Error("Run adk init first");
    const config = AdkConfigSchema.parse(JSON.parse(before));
    mutate(config);
    const valid = AdkConfigSchema.parse(config);
    return this.apply(valid, before, dryRun, source);
  }
  async apply(
    config: AdkConfig,
    before: string | null,
    dryRun = false,
    source?: string,
  ) {
    config = AdkConfigSchema.parse(config);
    if (
      this.context.globalOnly &&
      Object.values(config.profiles).some((p) =>
        p.resources.some((r) => r.scope !== "global"),
      )
    )
      throw new Error(
        "The global workspace only accepts global resources; choose a project for project scope.",
      );
    const desired = config.profiles[config.activeProfile]!.resources;
    const lockBefore = await readText(this.store.lockPath);
    const lock = lockBefore ? Lock.parse(JSON.parse(lockBefore)) : undefined;
    const previous = lock?.resources ?? [];
    await this.policy(desired, previous);
    for (const file of lock?.files ?? []) {
      const value = await readText(file.path);
      if ((value === null ? null : digest(value)) !== file.digest)
        throw new Error(
          `Managed file changed; inspect before applying: ${file.path}`,
        );
    }
    const files: FileChange[] = [];
    const warnings: string[] = [];
    const failed = new Set<string>();
    for (const adapter of createAdapters(this.context)) {
      try {
        await adapter.read();
        const planned = await adapter.plan(desired, previous);
        const owned = new Set(lock?.files.map((f) => f.path) ?? []);
        // Adoption is the one way a file ADK did not create becomes managed:
        // the resource names the harness and the path it was found in, and
        // the change is previewed like any other.
        for (const resource of desired)
          if (resource.config.adoptedBy === adapter.id)
            try {
              owned.add(adapter.target(resource).path);
            } catch {
              // An unsupported type has no target here; apply warns about it.
            }
        for (const file of planned) {
          if (!owned.has(file.path) && file.before !== null) {
            const shared = new Set([
              join(this.context.home, ".claude.json"),
              join(this.context.root, ".mcp.json"),
              ...Object.values(adapter.paths()).flatMap((base) => [
                join(base, "settings.json"),
                join(base, "mcp.json"),
              ]),
            ]);
            if (!shared.has(file.path))
              throw new Error(`Refusing unmanaged file: ${file.path}`);
            const old = JSON.parse(file.before);
            const next = file.after ? JSON.parse(file.after) : {};
            for (const section of ["mcpServers"])
              for (const key of Object.keys(old[section] ?? {}))
                if (
                  JSON.stringify(old[section][key]) !==
                  JSON.stringify(next[section]?.[key])
                )
                  throw new Error(
                    `Refusing unmanaged ${section} entry: ${key}`,
                  );
            if (
              old.statusLine &&
              JSON.stringify(old.statusLine) !== JSON.stringify(next.statusLine)
            )
              throw new Error("Refusing unmanaged statusLine");
          }
        }
        files.push(...planned);
      } catch (error) {
        if (/unmanaged|collision|Invalid resource/.test(String(error)))
          throw error;
        failed.add(adapter.id);
        warnings.push(`${adapter.id}: unsupported today: ${String(error)}`);
      }
    }
    for (const resource of desired)
      for (const id of resource.harnesses) {
        const adapter = createAdapters(this.context).find((a) => a.id === id)!;
        if (!adapter.capabilities.includes(resource.type))
          warnings.push(
            `${id}: ${resource.type} ${resource.id} is catalogued only; use install for delegated tools.`,
          );
      }
    const tracked = desired
      .map((r) => ({
        ...r,
        harnesses: r.harnesses.filter((id) => !failed.has(id)),
      }))
      .filter((r) => r.harnesses.length);
    const retained = previous
      .map((r) => ({
        ...r,
        harnesses: r.harnesses.filter((id) => failed.has(id)),
      }))
      .filter((r) => r.harnesses.length);
    const lockFiles = [
      ...files
        .filter((f) => f.after !== null)
        .map((f) => ({ path: f.path, digest: digest(f.after!) })),
      ...(lock?.files.filter((f) => !files.some((n) => n.path === f.path)) ??
        []),
    ];
    files.push(
      { path: this.store.configPath, before, after: jsonText(config) },
      {
        path: this.store.lockPath,
        before: lockBefore,
        after: jsonText({
          version: 1,
          profile: config.activeProfile,
          resources: [...tracked, ...retained],
          files: lockFiles,
        }),
      },
    );
    const result = await applyFiles(this.context.root, files, {
      actor: process.env.USER ?? "local",
      ...(source ? { source } : {}),
      dryRun,
    });
    return {
      ...result,
      diff: diffResources(previous, desired, true),
      warnings,
    };
  }
  /** Detected resources the active profile does not manage. */
  async unmanaged(inherited: Resource[] = []) {
    const desired = [
      ...inherited,
      ...(await this.list().catch(() => [] as Resource[])),
    ];
    const adapters = createAdapters(this.context);
    const claimed = new Set<string>();
    for (const resource of desired)
      for (const adapter of adapters)
        if (resource.harnesses.includes(adapter.id))
          try {
            const target = adapter.target(resource);
            claimed.add(`${target.path}#${target.key ?? ""}`);
          } catch {
            // The harness cannot hold this type; nothing is claimed.
          }
    const found: { harness: HarnessId; resource: Resource; path: string }[] =
      [];
    for (const state of await this.detect())
      for (const resource of state.resources) {
        const path = resource.source.startsWith("file://")
          ? resource.source.slice("file://".length)
          : "";
        const key =
          resource.type === "skill" ||
          resource.type === "subagent" ||
          resource.type === "command"
            ? ""
            : resource.type === "statusline"
              ? "statusLine"
              : resource.type === "hook"
                ? String(
                    (resource.config as { event?: unknown }).event ??
                      "PreToolUse",
                  )
                : resource.name;
        if (!claimed.has(`${path}#${key}`))
          found.push({ harness: state.id, resource, path });
      }
    return found;
  }

  /**
   * Bring a detected resource under management where it already lives. The
   * file is not moved and, when its content already matches, not rewritten.
   */
  async adopt(detectedId: string, dryRun = false) {
    const entry = (await this.unmanaged()).find(
      (found) => found.resource.id === detectedId,
    );
    if (!entry) throw new Error(`Unmanaged resource not found: ${detectedId}`);
    const { harness, resource, path } = entry;
    const adapter = createAdapters(this.context).find((a) => a.id === harness)!;
    const identifier = `${resource.type}:${resource.name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")}`;
    if (identifier.length < 3)
      throw new Error(`Cannot derive an identifier from ${detectedId}`);
    if ((await this.list()).some((r) => r.id === identifier))
      throw new Error(`Resource already exists: ${identifier}`);
    const fileBacked = ["skill", "subagent", "command"].includes(resource.type);
    const relative = fileBacked
      ? path.startsWith(adapter.paths()[resource.scope] + "/")
        ? path.slice(adapter.paths()[resource.scope].length + 1)
        : undefined
      : undefined;
    if (fileBacked && !safeRelative(relative))
      throw new Error(`Cannot adopt a resource outside ${harness}: ${path}`);
    // A linked file belongs to whatever installed it; ADK refuses writes
    // through symlinks, so it must not claim ownership of one either.
    const link = fileBacked ? await linkedComponent(path) : null;
    if (link)
      throw new Error(
        `${link} is a link into another tool's store; manage it there, or reinstall it with --copy to adopt it`,
      );
    return this.create(
      {
        ...resource,
        id: identifier,
        harnesses: [harness],
        config: {
          ...resource.config,
          adoptedBy: harness,
          ...(relative ? { adoptedPath: relative } : {}),
        },
      },
      dryRun,
    );
  }

  create(input: unknown, dryRun = false) {
    const resource = ResourceSchema.parse(input);
    return this.change((c) => {
      const resources = c.profiles[c.activeProfile]!.resources;
      if (resources.some((r) => r.id === resource.id))
        throw new Error("Resource already exists");
      resources.push(resource);
    }, dryRun);
  }
  update(id: string, patch: Record<string, unknown>, dryRun = false) {
    return this.change((c) => {
      const resources = c.profiles[c.activeProfile]!.resources;
      const index = resources.findIndex((r) => r.id === id);
      if (index < 0) throw new Error("Resource not found");
      resources[index] = ResourceSchema.parse({
        ...resources[index],
        ...patch,
        id,
      });
    }, dryRun);
  }
  remove(id: string, dryRun = false) {
    return this.change((c) => {
      const p = c.profiles[c.activeProfile]!;
      if (!p.resources.some((r) => r.id === id))
        throw new Error("Resource not found");
      p.resources = p.resources.filter((r) => r.id !== id);
    }, dryRun);
  }
  fork(id: string, newId: string, dryRun = false) {
    return this.inspect(id).then((r) =>
      this.create({ ...r, id: newId, name: `${r.name} copy` }, dryRun),
    );
  }
  profileCreate(name: string, from?: string, dryRun = false) {
    return this.change((c) => {
      if (Object.hasOwn(c.profiles, name))
        throw new Error("Profile already exists");
      if (from && !Object.hasOwn(c.profiles, from))
        throw new Error("Profile not found");
      c.profiles[name] = from
        ? structuredClone(c.profiles[from]!)
        : { description: "", resources: [] };
    }, dryRun);
  }
  profileSwitch(name: string, dryRun = false) {
    return this.change((c) => {
      if (!Object.hasOwn(c.profiles, name))
        throw new Error("Profile not found");
      c.activeProfile = name;
    }, dryRun);
  }
  profileDiff(a: string, b: string) {
    return this.store.profileDiff(a, b);
  }
  sync(dryRun = false) {
    return this.change(() => {}, dryRun);
  }
  rollback(dryRun = false) {
    return rollback(this.context.root, dryRun);
  }
  async import(resources: Resource[], dryRun = false, source?: string) {
    return this.change(
      (c) => {
        const p = c.profiles[c.activeProfile]!;
        for (const r of resources) {
          const i = p.resources.findIndex((x) => x.id === r.id);
          if (i < 0) p.resources.push(r);
          else p.resources[i] = r;
        }
      },
      dryRun,
      source,
    );
  }
  async audit() {
    return (
      (await readText(join(this.context.root, ".adk", "audit.jsonl"))) ?? ""
    )
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}
