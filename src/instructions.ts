import { dirname, isAbsolute, join, resolve } from "node:path";
import { access } from "node:fs/promises";
import type { Context } from "./adapters.js";
import { findingCatalog, type Finding } from "./analysis.js";
import { secretPaths, type DoctorThresholds, type Resource } from "./schema.js";
import { readText } from "./transaction.js";
import { managedBlocks } from "./agents-md.js";
import { codexHomeFor } from "./usage.js";

export type InstructionAgent = "claude-code" | "codex";
export type InstructionScope = "global" | "project";
export interface ImportRef {
  spec: string;
  line: number;
  path: string;
  exists: boolean;
}
export interface InstructionFile {
  path: string;
  agent: InstructionAgent;
  scope: InstructionScope;
  lines: number;
  tokens: number;
  /** Tokens of this file plus every file it imports, recursively. */
  totalTokens: number;
  imports: ImportRef[];
  text: string;
}
export interface InstructionsReport {
  maxLines: number;
  files: InstructionFile[];
  findings: Finding[];
}

const estimate = (text: string) => Math.ceil(text.length / 4);
const lineCount = (text: string) =>
  text ? text.replace(/\n$/, "").split("\n").length : 0;

/** Where each agent reads its instructions, by scope. Draft writes the first. */
export function instructionPaths(
  context: Context,
  agent: InstructionAgent,
  scope: InstructionScope,
) {
  if (scope === "global")
    return agent === "codex"
      ? [join(codexHomeFor(context.home), "AGENTS.md")]
      : [join(context.home, ".claude", "CLAUDE.md")];
  return agent === "codex"
    ? [join(context.root, "AGENTS.md")]
    : [
        join(context.root, "CLAUDE.md"),
        join(context.root, ".claude", "CLAUDE.md"),
        join(context.root, "CLAUDE.local.md"),
      ];
}

/**
 * `@path` imports outside code. Only tokens that look like files count: a
 * relative or home path, or a name with an extension (so `@types/node` and
 * e-mail addresses are not imports).
 */
export function parseImports(text: string) {
  const found: { spec: string; line: number }[] = [];
  let fenced = false;
  text.split("\n").forEach((raw, index) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const line = raw.replace(/`[^`]*`/g, "");
    for (const match of line.matchAll(/(?:^|\s)@([^\s`'"()<>]+)/g)) {
      const spec = match[1]!.replace(/[.,;:!?)]+$/, "");
      if (
        /^(?:~\/|\.{1,2}\/|\/)/.test(spec) ||
        /\.[A-Za-z0-9]{1,8}$/.test(spec)
      )
        found.push({ spec, line: index + 1 });
    }
  });
  return found;
}
export const resolveImport = (spec: string, from: string, home: string) =>
  spec.startsWith("~/")
    ? join(home, spec.slice(2))
    : isAbsolute(spec)
      ? spec
      : resolve(dirname(from), spec);

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** Read one instruction file and resolve its imports (Claude Code: depth 5). */
export async function readInstructionFile(
  path: string,
  agent: InstructionAgent,
  scope: InstructionScope,
  home: string,
): Promise<InstructionFile | null> {
  const text = await readText(path);
  if (text === null) return null;
  const imports: ImportRef[] = [];
  const seen = new Set([resolve(path)]);
  let totalTokens = estimate(text);
  async function follow(file: string, body: string, depth: number) {
    if (agent !== "claude-code" || depth > 5) return;
    for (const ref of parseImports(body)) {
      const target = resolveImport(ref.spec, file, home);
      const ok = await exists(target);
      if (file === path) imports.push({ ...ref, path: target, exists: ok });
      if (!ok || seen.has(target)) continue;
      seen.add(target);
      const nested = await readText(target).catch(() => null);
      if (nested === null) continue;
      totalTokens += estimate(nested);
      await follow(target, nested, depth + 1);
    }
  }
  await follow(path, text, 1);
  return {
    path,
    agent,
    scope,
    lines: lineCount(text),
    tokens: estimate(text),
    totalTokens,
    imports,
    text,
  };
}

/** Normalized comparable form of a rule line; empty when it is not a rule. */
export function ruleKey(line: string) {
  const value = line
    .trim()
    .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  return /^(?:#|```|~~~|<!--|\||@)/.test(value) ? "" : value;
}
function skillLines(skills: Resource[], minChars: number) {
  const lines = new Map<string, string>();
  for (const skill of skills)
    for (const line of (skill.content ?? "").split("\n")) {
      const key = ruleKey(line);
      if (key.length >= minChars && !lines.has(key)) lines.set(key, skill.name);
    }
  return lines;
}

export async function readAllInstructions(context: Context) {
  const files: InstructionFile[] = [];
  for (const agent of ["claude-code", "codex"] as const)
    for (const scope of ["global", "project"] as const) {
      if (scope === "project" && context.globalOnly) continue;
      for (const path of instructionPaths(context, agent, scope)) {
        const file = await readInstructionFile(path, agent, scope, context.home);
        if (file) files.push(file);
      }
    }
  return files;
}

/** Findings for instruction files: length, broken imports, skill duplicates, secrets. */
export function lintFiles(
  files: InstructionFile[],
  resources: Resource[],
  limits: Pick<DoctorThresholds, "instructionsMaxLines" | "duplicateMinChars">,
): Finding[] {
  const findings: Finding[] = [];
  const skills = resources.filter((r) => r.type === "skill" && r.content);
  const known = skillLines(skills, limits.duplicateMinChars);
  for (const file of files) {
    if (file.lines > limits.instructionsMaxLines)
      findings.push({
        code: "claude-md-long",
        severity: "warning",
        message: `${file.path} has ${file.lines} lines; the limit is ${limits.instructionsMaxLines}.`,
        explanation: findingCatalog["claude-md-long"]!.explanation,
        tokens: file.totalTokens,
        path: file.path,
        fix: `Move task-specific sections into skills and project facts into the project file; \`preflight instructions draft --scope ${file.scope}${file.agent === "codex" ? " --agent codex" : ""}\` proposes a shorter version.`,
      });
    for (const ref of file.imports)
      if (!ref.exists)
        findings.push({
          code: "claude-md-broken-import",
          severity: "warning",
          message: `${file.path}:${ref.line} imports @${ref.spec}, which does not exist (${ref.path}).`,
          explanation: findingCatalog["claude-md-broken-import"]!.explanation,
          path: file.path,
          fix: `Fix the path on line ${ref.line} or delete the line.`,
        });
    const bySkill = new Map<string, number>();
    let chars = 0;
    for (const line of file.text.split("\n")) {
      const key = ruleKey(line);
      const skill = key.length >= limits.duplicateMinChars && known.get(key);
      if (!skill) continue;
      bySkill.set(skill, (bySkill.get(skill) ?? 0) + 1);
      chars += line.length;
    }
    for (const [skill, count] of bySkill)
      findings.push({
        code: "claude-md-duplicates-skill",
        severity: "info",
        message: `${file.path} repeats ${count} line${count === 1 ? "" : "s"} of skill ${skill}.`,
        explanation: findingCatalog["claude-md-duplicates-skill"]!.explanation,
        path: file.path,
        tokens: Math.ceil(chars / 4),
        fix: `Delete the repeated lines from ${file.path}; the skill already carries them.`,
      });
    if (secretPaths(file.text).length)
      findings.push({
        code: "claude-md-secret",
        severity: "error",
        message: `${file.path} contains what looks like a literal credential.`,
        explanation: findingCatalog["claude-md-secret"]!.explanation,
        path: file.path,
        fix: "Remove the value and refer to an environment variable such as ${API_TOKEN}.",
      });
  }
  return findings;
}

export async function lintInstructions(
  context: Context,
  resources: Resource[],
  limits: DoctorThresholds,
  file?: string,
): Promise<InstructionsReport> {
  let files: InstructionFile[];
  if (file) {
    const path = resolve(context.root, file);
    const read = await readInstructionFile(
      path,
      /AGENTS\.md$/i.test(path) ? "codex" : "claude-code",
      path.startsWith(context.root + "/") ? "project" : "global",
      context.home,
    );
    if (!read) throw new Error(`Instructions file not found: ${path}`);
    files = [read];
  } else files = await readAllInstructions(context);
  return {
    maxLines: limits.instructionsMaxLines,
    files,
    findings: lintFiles(files, resources, limits),
  };
}

/** Check commands a project declares: package scripts, Make, Cargo, Go, Python. */
export async function verificationCommands(root: string) {
  const commands: string[] = [];
  const pkg = await readText(join(root, "package.json")).catch(() => null);
  if (pkg) {
    try {
      const scripts = (JSON.parse(pkg).scripts ?? {}) as Record<string, unknown>;
      const runner = (await exists(join(root, "pnpm-lock.yaml")))
        ? "pnpm"
        : (await exists(join(root, "yarn.lock")))
          ? "yarn"
          : (await exists(join(root, "bun.lockb"))) ||
              (await exists(join(root, "bun.lock")))
            ? "bun run"
            : "npm run";
      const wanted = ["check", "lint", "typecheck", "test", "build"];
      const present = wanted.filter((s) => typeof scripts[s] === "string");
      // `check` usually runs the others; list it alone when it exists.
      for (const name of present.includes("check") ? ["check"] : present)
        commands.push(
          runner === "npm run" && name === "test" ? "npm test" : `${runner} ${name}`,
        );
    } catch {
      // Not JSON; nothing to suggest.
    }
  }
  const make = await readText(join(root, "Makefile")).catch(() => null);
  if (make)
    for (const target of ["check", "test", "lint"])
      if (new RegExp(`^${target}:`, "m").test(make)) {
        commands.push(`make ${target}`);
        break;
      }
  if (await exists(join(root, "Cargo.toml"))) commands.push("cargo test");
  if (await exists(join(root, "go.mod"))) commands.push("go test ./...");
  if (
    (await exists(join(root, "pyproject.toml"))) &&
    (await exists(join(root, "tests")))
  )
    commands.push("pytest");
  return commands;
}

export interface Draft {
  agent: InstructionAgent;
  scope: InstructionScope;
  path: string;
  before: string | null;
  after: string;
  patch: string;
  notes: string[];
  lines: { before: number; after: number };
  tokens: { before: number; after: number };
}

/**
 * A proposed concise instructions file: the user's rules first (without
 * exact duplicates, lines a skill already carries, or broken imports), then
 * the short best-practice sections the file does not cover yet.
 */
export async function draftInstructions(
  context: Context,
  options: { scope: InstructionScope; agent: InstructionAgent },
  resources: Resource[],
  limits: DoctorThresholds,
): Promise<Draft> {
  const { scope, agent } = options;
  if (scope === "project" && context.globalOnly)
    throw new Error("Open a project to draft project instructions");
  const candidates = instructionPaths(context, agent, scope);
  let path = candidates[0]!;
  for (const candidate of candidates.slice(0, 2))
    if ((await readText(candidate)) !== null) {
      path = candidate;
      break;
    }
  const before = await readText(path);
  const notes: string[] = [];
  // Preflight's managed blocks (AGENTS.md instructions resources) are kept
  // byte for byte: each is masked by one unique line while the draft runs.
  const blocks = before ? managedBlocks(before) : [];
  let masked = before;
  for (const [index, block] of [...blocks.entries()].reverse())
    masked =
      masked!.slice(0, block.start) +
      `<!-- preflight:kept ${index} -->` +
      masked!.slice(block.end);
  if (blocks.length)
    notes.push(
      `Kept ${blocks.length} Preflight-managed block${blocks.length === 1 ? "" : "s"} unchanged.`,
    );
  const known = skillLines(
    resources.filter((r) => r.type === "skill" && r.content),
    limits.duplicateMinChars,
  );
  const kept: string[] = [];
  const seen = new Set<string>();
  let fenced = false;
  let removedDuplicates = 0;
  const broken = new Set(
    masked && agent === "claude-code"
      ? (
          await Promise.all(
            parseImports(masked).map(async (ref) =>
              (await exists(resolveImport(ref.spec, path, context.home)))
                ? null
                : ref.line,
            ),
          )
        ).filter((n): n is number => n !== null)
      : [],
  );
  (masked ?? "").split("\n").forEach((raw, index) => {
    const line = raw.replace(/\s+$/, "");
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (!fenced) {
      if (broken.has(index + 1) && /^\s*@\S+\s*$/.test(line)) {
        notes.push(`Removed broken import on line ${index + 1}: ${line.trim()}`);
        return;
      }
      const key = ruleKey(line);
      if (key.length >= 12) {
        if (seen.has(key)) {
          removedDuplicates++;
          return;
        }
        seen.add(key);
        const skill = key.length >= limits.duplicateMinChars && known.get(key);
        if (skill) {
          notes.push(`Removed line ${index + 1}, already in skill ${skill}.`);
          return;
        }
      }
      if (!line && !kept.at(-1)) return;
    }
    kept.push(line);
  });
  if (removedDuplicates)
    notes.push(`Removed ${removedDuplicates} repeated line${removedDuplicates === 1 ? "" : "s"}.`);
  while (kept.length && !kept.at(-1)) kept.pop();
  const existing = kept.join("\n");
  const has = (pattern: RegExp) => pattern.test(existing);
  const sections: string[][] = [];
  if (!existing.trim())
    sections.push([
      scope === "global" ? "# Global instructions" : "# Project instructions",
    ]);
  if (
    scope === "project" &&
    agent === "claude-code" &&
    !has(/@AGENTS\.md/) &&
    (await exists(join(context.root, "AGENTS.md")))
  ) {
    sections.push(["@AGENTS.md"]);
    notes.push("Imports AGENTS.md, which this project already has.");
  }
  if (!has(/\b(language|reply in|respond in|answer in|style|concise|tone|brief)\b/i))
    sections.push([
      "## Style",
      "- Answer in the language I write in. Lead with the answer or the action; keep it short.",
      "- Make the smallest change that does the task. Do not refactor outside it.",
    ]);
  if (!has(/\b(test|verify|verification|check|lint|typecheck)\b/i)) {
    const commands =
      scope === "project" ? await verificationCommands(context.root) : [];
    sections.push([
      "## Verification",
      commands.length
        ? `- Before you report a task as done, run ${commands.map((c) => `\`${c}\``).join(", ")} and give the result.`
        : "- Before you report a task as done, run the project's check command (its CLAUDE.md or package scripts) and give the result.",
      "- Never skip, weaken or delete a test to make a check pass. Say \"partial\" when a check failed or did not run.",
    ]);
    if (commands.length)
      notes.push(`Verification commands detected: ${commands.join(", ")}.`);
  }
  if (agent === "claude-code" && !has(/\b(subagents?|haiku|sonnet|model:)/i))
    sections.push([
      "## Subagents",
      "- Pin a model for each subagent: haiku for search and lookups, sonnet for implementation.",
      "- Keep the main model for planning and review. Use a subagent for broad searches so their output stays out of this context.",
    ]);
  if (!has(/\b(secrets?|credentials?|\.env|api keys?|tokens?)\b/i))
    sections.push([
      "## Secrets",
      "- Never write a secret value into a file, command, URL or commit. Use an environment reference such as ${VAR}.",
      "- Do not read .env, key or credential files; .env.example is fine.",
    ]);
  const skills = resources.filter(
    (r) => r.type === "skill" && r.enabled && r.scope === scope,
  ).length;
  if (skills && !has(/\bskills?\b/i))
    sections.push([
      "## Skills",
      `- ${skills} ${scope} skills are installed. Prefer invoking a skill over restating its rules here.`,
    ]);
  const parts = [existing, ...sections.map((s) => s.join("\n"))].filter(
    (p) => p.trim(),
  );
  const after = (parts.join("\n\n") + "\n").replace(
    /<!-- preflight:kept (\d+) -->/g,
    (whole, index: string) => {
      const block = blocks[Number(index)];
      return block ? before!.slice(block.start, block.end) : whole;
    },
  );
  const body = sections.filter((s) => s[0]!.startsWith("## "));
  const added = body.reduce((t, s) => t + s.length, 0);
  if (body.length)
    notes.push(
      `Added ${body.length} short section${body.length === 1 ? "" : "s"} (${added} lines).`,
    );
  if (lineCount(after) > limits.instructionsMaxLines)
    notes.push(
      `Still ${lineCount(after)} lines, over the ${limits.instructionsMaxLines}-line limit: your rules are kept, move task-specific ones into skills.`,
    );
  if (before !== null && after === before)
    notes.push("No change proposed: the file already covers the template.");
  return {
    agent,
    scope,
    path,
    before,
    after,
    patch: unifiedDiff(before ?? "", after, path),
    notes,
    lines: { before: lineCount(before ?? ""), after: lineCount(after) },
    tokens: { before: estimate(before ?? ""), after: estimate(after) },
  };
}

/** Unified line diff with three lines of context. */
export function unifiedDiff(before: string, after: string, path: string) {
  if (before === after) return "";
  const a = before ? before.replace(/\n$/, "").split("\n") : [];
  const b = after ? after.replace(/\n$/, "").split("\n") : [];
  const ops: { kind: " " | "-" | "+"; text: string; ai: number; bi: number }[] = [];
  if (a.length * b.length > 4_000_000) {
    a.forEach((text, i) => ops.push({ kind: "-", text, ai: i, bi: 0 }));
    b.forEach((text, i) => ops.push({ kind: "+", text, ai: a.length, bi: i }));
  } else {
    const lcs = Array.from({ length: a.length + 1 }, () =>
      new Uint32Array(b.length + 1),
    );
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--)
        lcs[i]![j] =
          a[i] === b[j]
            ? lcs[i + 1]![j + 1]! + 1
            : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    let i = 0,
      j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        ops.push({ kind: " ", text: a[i]!, ai: i++, bi: j++ });
      } else if (j < b.length && (i >= a.length || lcs[i]![j + 1]! > lcs[i + 1]![j]!)) {
        ops.push({ kind: "+", text: b[j]!, ai: i, bi: j++ });
      } else ops.push({ kind: "-", text: a[i]!, ai: i++, bi: j });
    }
  }
  const out = [`--- ${before ? path : "/dev/null"}`, `+++ ${path}`];
  const context = 3;
  let k = 0;
  while (k < ops.length) {
    if (ops[k]!.kind === " ") {
      k++;
      continue;
    }
    let start = Math.max(0, k - context);
    let end = k;
    // Extend the hunk while changes are within 2 * context lines.
    for (;;) {
      while (end < ops.length && ops[end]!.kind !== " ") end++;
      let next = end;
      while (next < ops.length && ops[next]!.kind === " " && next - end < 2 * context) next++;
      if (next < ops.length && ops[next]!.kind !== " ") end = next;
      else break;
    }
    const stop = Math.min(ops.length, end + context);
    const hunk = ops.slice(start, stop);
    const aStart = hunk[0]!.ai,
      bStart = hunk[0]!.bi;
    const aLen = hunk.filter((o) => o.kind !== "+").length;
    const bLen = hunk.filter((o) => o.kind !== "-").length;
    out.push(
      `@@ -${aLen ? aStart + 1 : aStart},${aLen} +${bLen ? bStart + 1 : bStart},${bLen} @@`,
      ...hunk.map((o) => o.kind + o.text),
    );
    k = stop;
    start = stop;
  }
  return out.join("\n") + "\n";
}

const icons = { error: "✖ error", warning: "▲ warning", info: "● note" };
/** Human-readable lint output. */
export function formatInstructions(report: InstructionsReport) {
  const lines = [`preflight instructions lint · limit ${report.maxLines} lines`];
  if (!report.files.length) lines.push("", "No instruction files found.");
  for (const file of report.files) {
    const gauge = Math.min(20, Math.round((file.lines / report.maxLines) * 20));
    lines.push(
      "",
      `${file.path} (${file.agent}, ${file.scope})`,
      `  [${"#".repeat(gauge)}${"-".repeat(20 - gauge)}] ${file.lines}/${report.maxLines} lines · ~${file.tokens} tokens${file.totalTokens !== file.tokens ? ` (~${file.totalTokens} with imports)` : ""}`,
      ...file.imports.map(
        (ref) => `  ${ref.exists ? "✓ ok    " : "✖ broken"} @${ref.spec} (line ${ref.line})`,
      ),
    );
  }
  if (report.findings.length) lines.push("");
  for (const f of report.findings)
    lines.push(`${icons[f.severity]}  [${f.code}] ${f.message}`, ...(f.fix ? [`    Fix: ${f.fix}`] : []));
  return lines.join("\n") + "\n";
}
/** Human-readable draft: the diff, the notes, and what to run next. */
export function formatDraft(draft: Draft, written: boolean) {
  return [
    `preflight instructions draft · ${draft.agent} · ${draft.scope} · ${draft.path}`,
    `lines ${draft.lines.before} → ${draft.lines.after} · ~${draft.tokens.before} → ~${draft.tokens.after} tokens`,
    "",
    draft.patch || "(no change)",
    ...draft.notes.map((n) => `● ${n}`),
    "",
    written
      ? "Written. Undo with: preflight rollback"
      : draft.patch
        ? "Nothing written. Apply with --write (preview with --write --dry-run)."
        : "Nothing to write.",
  ].join("\n") + "\n";
}
