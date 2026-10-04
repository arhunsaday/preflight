import type { AdkConfig, AdkLock, Resource } from "../src/schema.js";
import type { Finding, Usage } from "../src/analysis.js";
import type { BenchResult } from "../src/bench.js";
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
}
export interface DesktopState {
  projects: Project[];
  activeProjectId: string | null;
  workspace: "global" | "project";
  team: Team;
  account: Account;
}
export interface Snapshot {
  root: string;
  home: string;
  initialized: boolean;
  config: AdkConfig | null;
  lock: AdkLock | null;
  resources: Resource[];
  inherited: Resource[];
  detected: Resource[];
  catalogue: Resource[];
  findings: Finding[];
  usage: Usage | null;
  loadouts: string[];
  benches: BenchResult[];
  errors: string[];
}
export interface Prepared {
  kind: "result" | "preview";
  value: unknown;
  args: string[];
  receipt?: string;
  note?: string;
}
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
  connect(value: { service: string; token: string }): Promise<DesktopState>;
  disconnect(): Promise<DesktopState>;
  openExternal(url: string): Promise<void>;
  chooseFile(): Promise<string | null>;
  exportFile(): Promise<string | null>;
}
declare global {
  interface Window {
    adk: DesktopApi;
  }
}
