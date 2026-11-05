import { createHash, randomUUID } from "node:crypto";
import {
  readFile,
  realpath,
  stat,
  mkdir,
  writeFile,
  rename,
} from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { z } from "zod";
import type { Context } from "../../src/adapters.js";
import type { DesktopState, Prepared, Team, Account } from "../protocol.js";
const Member = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email(),
  role: z.enum(["owner", "member", "viewer"]),
});
export const TeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
  members: z.array(Member).max(100),
});
const Settings = z.object({
  version: z.literal(1),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      root: z.string(),
      addedAt: z.string(),
    }),
  ),
  activeProjectId: z.string().nullable(),
  workspace: z.enum(["global", "project"]).optional(),
  team: TeamSchema,
  /** Reading local transcripts is on unless the person turns it off. */
  preferences: z
    .object({ readTranscripts: z.boolean().default(true) })
    .default({ readTranscripts: true }),
  account: z
    .object({
      service: z.string(),
      ownerId: z.string(),
      encryptedToken: z.string().optional(),
      // "session" and "deployment-token" are pre-Clerk values, never restored.
      authentication: z
        .enum(["token", "session", "deployment-token"])
        .optional(),
      user: z
        .object({ id: z.string(), name: z.string(), email: z.string() })
        .optional(),
      expiresAt: z.string().optional(),
    })
    .nullable(),
});
type SettingsData = z.infer<typeof Settings>;
export const allowedCommands = new Set([
  "init",
  "list",
  "detect",
  "verify",
  "doctor",
  "instructions",
  "unmanaged",
  "adopt",
  "skill",
  "disable",
  "enable",
  "inspect",
  "inspect-json",
  "inspect-file",
  "create",
  "create-json",
  "update",
  "update-json",
  "delete",
  "fork",
  "move",
  "sync",
  "recover",
  "rollback",
  "audit",
  "profiles",
  "search",
  "catalog-inspect",
  "catalog-add",
  "install",
  "usage",
  "context",
  "prune",
  "share",
  "apply",
  "revoke",
  "loadouts",
  "source",
  "retrofit",
  "git",
  "bench",
  "validate",
  "--help",
]);
export function validateCommand(input: unknown): string[] {
  const args = z.array(z.string().max(2000000)).min(1).max(100).parse(input);
  if (!allowedCommands.has(args[0]!))
    throw new Error("Unknown desktop command");
  if (args.some((a) => /^--(?:root|home|global)(?:=|$)/.test(a)))
    throw new Error("Project and home overrides are not allowed");
  return args;
}
const reads = new Set([
  "list",
  "detect",
  "unmanaged",
  "inspect",
  "inspect-json",
  "inspect-file",
  "audit",
  "search",
  "catalog-inspect",
  "usage",
  "context",
  "prune",
  "validate",
  "--help",
]);
function isRead(args: string[]) {
  if (reads.has(args[0]!)) return true;
  if (["doctor", "verify"].includes(args[0]!))
    return !args.includes("--connect") && !args.includes("--measure");
  if (args[0] === "instructions") return !args.includes("--write");
  if (args[0] === "profiles") return ["list", "diff"].includes(args[1] ?? "");
  if (args[0] === "loadouts") return ["list", "show"].includes(args[1] ?? "");
  if (args[0] === "source") return ["list", "show"].includes(args[1] ?? "");
  if (args[0] === "bench") return args[1] === "compare";
  return args[0] === "git" && args[1] === "status";
}
export type Engine = (
  args: string[],
  context: Context,
  auth?: { service: string; token: string; ownerId: string },
) => Promise<unknown>;
function previewDigest(value: unknown, args: string[]) {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .flatMap(([key, item]) => {
            if (args[0] === "share" && key === "createdAt") return [];
            if (
              args[0] === "share" &&
              key === "after" &&
              typeof item === "string"
            ) {
              try {
                return [[key, normalize(JSON.parse(item))]];
              } catch {
                /* plain text */
              }
            }
            return [[key, normalize(item)]];
          }),
      );
    return value;
  };
  return createHash("sha256")
    .update(JSON.stringify(normalize(value)))
    .digest("hex");
}
interface Receipt {
  args: string[];
  projectId: string;
  fingerprint: string;
  previewDigest: string;
  expires: number;
}
export class DesktopController {
  private settings: SettingsData = {
    version: 1,
    projects: [],
    activeProjectId: null,
    team: { name: "My team", members: [] },
    preferences: { readTranscripts: true },
    account: null,
  };
  private receipts = new Map<string, Receipt>();
  private auth:
    | {
        service: string;
        token: string;
        ownerId: string;
        authentication?: "token";
        user?: { id: string; name: string; email: string };
        expiresAt?: string;
      }
    | undefined;
  private storage: Account["storage"] = "none";
  private busy = false;
  constructor(
    readonly path: string,
    readonly home: string,
    readonly engine: Engine,
  ) {}
  async load() {
    try {
      this.settings = Settings.parse(
        JSON.parse(await readFile(this.path, "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return this.publicState();
  }
  publicState(): DesktopState {
    return {
      projects: this.settings.projects.map((p) => ({ ...p })),
      activeProjectId: this.settings.activeProjectId,
      workspace: this.workspace(),
      team: structuredClone(this.settings.team),
      preferences: { ...this.settings.preferences },
      account: {
        connected: !!this.auth,
        service: this.settings.account?.service ?? "",
        ownerId: this.settings.account?.ownerId ?? "",
        storage: this.storage,
        authentication: this.auth ? "token" : "none",
        ...(this.settings.account?.user
          ? { user: this.settings.account.user }
          : {}),
      },
    };
  }
  private async save() {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = this.path + ".tmp";
    await writeFile(temp, JSON.stringify(this.settings, null, 2), {
      mode: 0o600,
    });
    await rename(temp, this.path);
  }
  async addProject(path: string) {
    return this.exclusive(async () => {
      const root = await realpath(path);
      if (!(await stat(root)).isDirectory())
        throw new Error("Choose a project folder");
      let p = this.settings.projects.find((p) => p.root === root);
      if (!p) {
        p = {
          id: randomUUID(),
          name: basename(root),
          root,
          addedAt: new Date().toISOString(),
        };
        this.settings.projects.push(p);
      }
      this.settings.activeProjectId = p.id;
      this.settings.workspace = "project";
      this.receipts.clear();
      await this.save();
      return this.publicState();
    });
  }
  async selectProject(id: string) {
    return this.exclusive(async () => {
      if (!this.settings.projects.some((p) => p.id === id))
        throw new Error("Project not found");
      this.settings.activeProjectId = id;
      this.settings.workspace = "project";
      this.receipts.clear();
      await this.save();
      return this.publicState();
    });
  }
  async forgetProject(id: string) {
    return this.exclusive(async () => {
      this.settings.projects = this.settings.projects.filter(
        (p) => p.id !== id,
      );
      if (this.settings.activeProjectId === id)
        this.settings.activeProjectId = this.settings.projects[0]?.id ?? null;
      if (!this.settings.activeProjectId) this.settings.workspace = "global";
      this.receipts.clear();
      await this.save();
      return this.publicState();
    });
  }
  private workspace() {
    return (
      this.settings.workspace ??
      (this.settings.activeProjectId ? "project" : "global")
    );
  }
  private contextId() {
    return this.workspace() === "global"
      ? "@global"
      : this.settings.activeProjectId;
  }
  async selectGlobal() {
    return this.exclusive(async () => {
      this.settings.workspace = "global";
      this.receipts.clear();
      await this.save();
      return this.publicState();
    });
  }
  context(): Context {
    if (this.workspace() === "global")
      return {
        root: join(this.home, ".preflight", "global"),
        home: this.home,
        globalOnly: true,
      };

    const p = this.settings.projects.find(
      (p) => p.id === this.settings.activeProjectId,
    );
    if (!p) throw new Error("Open a project first");
    return { root: p.root, home: this.home };
  }
  async snapshot() {
    return this.exclusive(() =>
      this.engine(
        [
          "@snapshot",
          ...(this.settings.preferences.readTranscripts
            ? []
            : ["--no-transcripts"]),
        ],
        this.context(),
      ),
    );
  }
  async setPreferences(value: unknown) {
    return this.exclusive(async () => {
      this.settings.preferences = Settings.shape.preferences.parse({
        ...this.settings.preferences,
        ...z
          .object({ readTranscripts: z.boolean().optional() })
          .strict()
          .parse(value),
      });
      await this.save();
      return this.publicState();
    });
  }
  private async fingerprint(context = this.context()) {
    const values = await Promise.all(
      ["preflight.config.json", "preflight.lock.json"].map(async (name) => {
        try {
          return await readFile(join(context.root, name), "utf8");
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw e;
        }
      }),
    );
    return createHash("sha256").update(JSON.stringify(values)).digest("hex");
  }
  private commandAuth(args: string[]) {
    return ["share", "apply", "revoke"].includes(args[0] ?? "")
      ? this.auth
      : undefined;
  }
  private async exclusive<T>(fn: () => Promise<T>) {
    if (this.busy) throw new Error("Another operation is running");
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }
  async prepare(input: unknown): Promise<Prepared> {
    return this.exclusive(async () => {
      const args = validateCommand(input).filter((a) => a !== "--dry-run");
      if (
        ["usage", "prune"].includes(args[0]!) &&
        !this.settings.preferences.readTranscripts
      )
        throw new Error(
          "Reading conversation transcripts is turned off. Turn it on in Usage to measure usage.",
        );
      if (
        args[0] === "doctor" &&
        !this.settings.preferences.readTranscripts &&
        !args.includes("--no-transcripts")
      )
        args.push("--no-transcripts");
      if (
        this.auth &&
        args.some((arg) => /^--(?:service|owner)(?:=|$)/.test(arg))
      )
        throw new Error(
          "The connected account controls share service and owner; change them in Account.",
        );
      const context = this.context();
      const projectId = this.contextId()!;
      const auth = this.commandAuth(args);
      if (isRead(args))
        return {
          kind: "result",
          args,
          value: await this.engine(args, context, auth),
        };
      const previewArgs = args.filter(
        (a) => a !== "--connect" && a !== "--execute",
      );
      const fingerprint = await this.fingerprint(context);
      const value = await this.engine(
        [...previewArgs, "--dry-run"],
        context,
        auth,
      );
      if (
        projectId !== this.contextId() ||
        fingerprint !== (await this.fingerprint(context))
      )
        throw new Error("Project changed while preparing; retry");
      const receipt = randomUUID();
      for (const [id, r] of this.receipts)
        if (r.expires < Date.now()) this.receipts.delete(id);
      this.receipts.set(receipt, {
        args,
        projectId,
        fingerprint,
        previewDigest: previewDigest(value, args),
        expires: Date.now() + 5 * 60000,
      });
      return {
        kind: "preview",
        args,
        value,
        receipt,
        note: args.includes("--connect")
          ? "Confirmation starts configured MCP programs or contacts servers."
          : args.includes("--measure")
            ? "Confirmation runs each SessionStart hook once in an empty temporary folder, with a time limit."
          : args[0] === "install" ||
              args[0] === "git" ||
              (args[0] === "bench" && args[1] === "run")
            ? "External process effects are outside the local file rollback."
            : undefined,
      } as Prepared;
    });
  }
  async confirm(id: string) {
    return this.exclusive(async () => {
      const receipt = this.receipts.get(id);
      this.receipts.delete(id);
      if (!receipt || receipt.expires < Date.now())
        throw new Error(
          "Preview expired, project/global workspace changed, or already used",
        );
      if (receipt.projectId !== this.contextId())
        throw new Error("Project changed; prepare another preview");
      if (receipt.fingerprint !== (await this.fingerprint()))
        throw new Error("Project changed since preview");
      const context = this.context();
      const auth = this.commandAuth(receipt.args);
      const repeated = await this.engine(
        [
          ...receipt.args.filter((a) => a !== "--connect" && a !== "--execute"),
          "--dry-run",
        ],
        context,
        auth,
      );
      if (previewDigest(repeated, receipt.args) !== receipt.previewDigest)
        throw new Error(
          "Inputs or affected files changed since preview; review again",
        );
      return this.engine(receipt.args, context, auth);
    });
  }
  async updateTeam(value: Team) {
    return this.exclusive(async () => {
      this.settings.team = TeamSchema.parse(value);
      await this.save();
      return this.publicState();
    });
  }
  async setAccount(
    value: NonNullable<typeof this.auth>,
    encryptedToken?: string,
  ) {
    return this.exclusive(async () => {
      this.receipts.clear();
      this.auth = value;
      this.storage = encryptedToken ? "encrypted" : "session";
      this.settings.account = {
        service: value.service,
        ownerId: value.ownerId,
        ...(encryptedToken ? { encryptedToken } : {}),
        authentication: "token",
        ...(value.user ? { user: value.user } : {}),
        ...(value.expiresAt ? { expiresAt: value.expiresAt } : {}),
      };
      await this.save();
      return this.publicState();
    });
  }
  restoreAuth(decrypt: (value: string) => string) {
    const account = this.settings.account;
    if (account?.expiresAt && Date.parse(account.expiresAt) <= Date.now())
      return;
    if (account?.encryptedToken && account.authentication === "token") {
      try {
        this.auth = {
          service: account.service,
          ownerId: account.ownerId,
          token: decrypt(account.encryptedToken),
          authentication: "token",
          ...(account.user ? { user: account.user } : {}),
          ...(account.expiresAt ? { expiresAt: account.expiresAt } : {}),
        };
        this.storage = "encrypted";
      } catch {
        this.storage = "none";
      }
    }
  }
  session() {
    return this.auth ? { ...this.auth } : undefined;
  }
  async disconnect() {
    return this.exclusive(async () => {
      this.receipts.clear();
      this.auth = undefined;
      this.storage = "none";
      this.settings.account = null;
      await this.save();
      return this.publicState();
    });
  }
}
