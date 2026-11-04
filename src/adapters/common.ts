import { readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parse as yaml } from "yaml";
import type { Resource, HarnessId, ResourceType, Scope } from "../schema.js";
import type { FileChange } from "../transaction.js";
export interface Context {
  root: string;
  home: string;
  globalOnly?: boolean;
}
export interface HarnessPaths {
  global: string;
  project: string;
}
export interface HarnessNote {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
}
export interface HarnessState {
  resources: Resource[];
  issues: string[];
  /** Harness-specific doctor observations that are not broken files. */
  notes?: HarnessNote[];
  /** Read-only settings worth showing in an inventory (model, profiles...). */
  settings?: Record<string, unknown>;
}
export interface HarnessAdapter {
  id: HarnessId;
  capabilities: ResourceType[];
  detect(): Promise<boolean>;
  paths(): HarnessPaths;
  /** Where this harness keeps a resource; throws for a type it cannot hold. */
  target(resource: Resource): { path: string; key?: string; section?: string };
  read(): Promise<HarnessState>;
  plan(desired: Resource[], previous: Resource[]): Promise<FileChange[]>;
  write(plan: { files: FileChange[]; dryRun?: boolean }): Promise<unknown>;
  /**
   * Files the harness shares with its user, where Preflight edits only the
   * parts it owns. The adapter's plan guarantees the rest is unchanged.
   */
  sharedFiles?(): string[];
  /** For a shared file, which owned parts the lockfile digest covers. */
  lockPart?(path: string): string | undefined;
  /** The directory an adopted file-backed resource is relative to. */
  adoptBase?(scope: Scope, type: ResourceType): string;
}
export const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export const slug = (id: string) =>
  id.replace(/[^a-z0-9_-]/gi, "-") + "-" + digest(id).slice(0, 8);
/** A path inside a harness directory: relative, no traversal, no drive. */
export function safeRelative(path: unknown): path is string {
  return (
    typeof path === "string" &&
    !!path &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.includes(":") &&
    !path
      .split("/")
      .some((part) => part === ".." || part === "." || part === "")
  );
}

/** The harness that owns an adopted resource's existing file, if any. */
export function adoptedIn(resource: Resource, id: HarnessId) {
  return resource.config.adoptedBy === id &&
    safeRelative(resource.config.adoptedPath)
    ? resource.config.adoptedPath
    : undefined;
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected configuration object");
  return value as Record<string, unknown>;
}
export function frontmatter(content: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  return match ? object(yaml(match[1]!)) : {};
}
export async function emptyDirectoryTree(path: string): Promise<boolean> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      !(await emptyDirectoryTree(join(path, entry.name)))
    )
      return false;
  }
  return true;
}
