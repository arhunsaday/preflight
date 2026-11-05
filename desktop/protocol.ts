import type { CloudOperation } from "../src/cloud-client.js";
import type {
  PreflightConfig,
  PreflightLock,
  Resource,
} from "../src/schema.js";
import type { Finding, Usage } from "../src/analysis.js";
import type { BenchResult } from "../src/bench.js";
import type { ArenaReport } from "../src/bench-arena.js";
import type { UpdateState } from "./updates.js";
import type { DoctorExtras } from "../src/doctor.js";
import type { InstructionsReport } from "../src/instructions.js";
export interface Project {
  id: string;
  name: string;
  root: string;
  addedAt: string;
}
export interface Team {
  name: string;
  members: {
    name: string;
    email: string;
    role: "owner" | "member" | "viewer";
  }[];
}
export interface Account {
  connected: boolean;
  service: string;
  ownerId: string;
  storage: "encrypted" | "session" | "none";
  authentication: "token" | "none";
  user?: { id: string; name: string; email: string };
}
export interface DesktopState {
  projects: Project[];
  activeProjectId: string | null;
  workspace: "global" | "project";
  team: Team;
  preferences: Preferences;
  account: Account;
}
export interface Preferences {
  /** Read local Claude Code and Codex transcripts for usage. Nothing is uploaded. */
  readTranscripts: boolean;
}
/** A content source the catalogue and loadouts come from. */
export interface SourceSummary {
  name: string;
  kind: "github" | "local";
  repo?: string;
  ref?: string;
  commit?: string;
  path?: string;
  resources: number;
  loadouts: number;
}
export interface LoadoutCatalog {
  details: Record<
    string,
    { description?: string; extends?: string; source?: string }
  >;
  presets: Record<string, string[]>;
}
export interface Snapshot {
  root: string;
  home: string;
  initialized: boolean;
  config: PreflightConfig | null;
  lock: PreflightLock | null;
  resources: Resource[];
  inherited: Resource[];
  detected: Resource[];
  catalogue: Resource[];
  findings: Finding[];
  /** Doctor checks that did not run, and the facts behind the findings. */
  doctor: Pick<DoctorExtras, "skipped" | "facts"> | null;
  /** Instruction files (CLAUDE.md, AGENTS.md) with their lint findings. */
  instructions: InstructionsReport | null;
  usage: Usage | null;
  /** True when the person turned transcript reading off. */
  transcriptsOff?: boolean;
  loadouts: string[];
  loadoutCatalog: LoadoutCatalog;
  sources: SourceSummary[];
  benches: BenchResult[];
  /** Saved arena reports (.preflight/arena). */
  arenas: ArenaReport[];
  errors: string[];
}
export interface Prepared {
  kind: "result" | "preview";
  value: unknown;
  args: string[];
  receipt?: string;
  note?: string;
}
/** Commands the native application menu sends to the renderer. */
export const desktopViews = [
  "overview",
  "skills",
  "mcp",
  "resources",
  "catalogue",
  "doctor",
  "instructions",
  "context",
  "console",
] as const;
export type DesktopCommand =
  | "palette"
  | "refresh"
  | "open-project"
  | "global"
  | "shortcuts"
  | `navigate:${(typeof desktopViews)[number]}`;
export interface DesktopApi {
  state(): Promise<DesktopState>;
  chooseProject(): Promise<DesktopState>;
  selectGlobal(): Promise<DesktopState>;
  selectProject(id: string): Promise<DesktopState>;
  forgetProject(id: string): Promise<DesktopState>;
  snapshot(): Promise<Snapshot>;
  prepare(args: string[]): Promise<Prepared>;
  confirm(receipt: string): Promise<unknown>;
  team(value: Team): Promise<DesktopState>;
  preferences(value: Partial<Preferences>): Promise<DesktopState>;
  beginSignIn(service: string): Promise<{
    id: string;
    verificationUri: string;
    interval: number;
    expiresAt: number;
  }>;
  pollSignIn(
    id: string,
  ): Promise<{ status: "pending" | "connected"; interval?: number }>;
  cancelSignIn(id: string): Promise<void>;
  copyText(text: string): Promise<void>;
  cloud(input: CloudOperation): Promise<unknown>;
  connect(value: { service: string; token: string }): Promise<DesktopState>;
  disconnect(): Promise<DesktopState>;
  openExternal(url: string): Promise<void>;
  chooseFile(): Promise<string | null>;
  exportFile(): Promise<string | null>;
  onCommand(listener: (command: DesktopCommand) => void): () => void;
  updateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
  dismissUpdate(): Promise<void>;
  onUpdate(listener: (state: UpdateState) => void): () => void;
}
declare global {
  interface Window {
    preflight: DesktopApi;
  }
}
