<!--
  TEMPLATE — canonical agent contract for a repository.
  Copy to the repo root as AGENTS.md and fill every <PLACEHOLDER>.
  Delete sections that do not apply; a rule nobody follows trains agents to
  skim the whole file.
-->

# <PROJECT> Agent Guide

## Priority

- Follow this file first for project-specific conventions.
- Treat `.claude/instincts/*.md` as supporting guidance when they add concrete
  implementation detail.
- Tool-specific files (`CLAUDE.md`, `CODEX.md`,
  `.github/copilot-instructions.md`) point here. When they disagree with this
  file, this file wins.

## Mandatory Agent Behavior

- **Communication**: use `skills:caveman` for agent interactions. Prefer
  commands, diffs, file paths, and next actions over prose. Preserve essential
  reasoning, risks, and verification results.
- **Minimal implementation**: use `skills:ponytail` for coding decisions. Reuse
  existing code first, avoid speculative abstractions, avoid new dependencies
  unless the installed stack cannot solve the task.
- **Before editing**: locate the relevant code, identify existing conventions,
  make the smallest safe change, then run the matching typecheck/lint/tests.
- **After editing**: re-run the necessary validations and report compactly —
  files changed, commands run, pass/fail, remaining risks.

## Workflow

- Read `agent-compass.commands.json` before choosing install, lint, typecheck,
  test, build, dev, or PR commands. Do not invent commands.
- Read `<ARCHITECTURE_MAP>` before broad exploration.
- Use project-local skills from `.claude/skills/` when relevant:
  - Always: `caveman`, `ponytail`
  - Workflow: `spec-workflow`, `implementation-planning`, `pr-workflow`
  - Quality gates: `verify-change`, `verify-module`, `verify-quality`,
    `verify-security`
  - Audit: `progress-audit`, `completion-plan`

## Repository Overview

<!-- Layout, apps/packages, what each one owns, where the boundaries are. -->

<REPO_LAYOUT>

## Conventions

<!-- Import rules, module structure, naming, error handling, logging,
     data access, shared contracts. The rules an agent cannot infer from
     one file but that every file follows. -->

<CONVENTIONS>

## Validation (Mandatory)

**All code changes MUST pass lint, typecheck, and relevant tests before being
marked complete.**

- Run scope-specific validations rather than the whole repo.
- Fix lint and type errors introduced by your changes. Do not leave new
  violations.
- Use only existing scripts. If a package has no matching script, report
  `not run` with the exact reason.
- If validation fails, state whether the failure is pre-existing or introduced
  by this change.

### Validation Matrix

| Changed area | Required validation |
| --- | --- |
| `<PATH>/**` | `<LINT>` · `<TYPECHECK>` · relevant `<TEST>` |
| `<SHARED_PACKAGE>/**` | validate the package **and** every consumer importing the changed symbol |
| `docs/**` only | no code validation unless executable commands or package config changed |

Use the smallest validation set that covers the changed files.

## Active File Rule

Before editing a source file, prove it is active by confirming at least one of:

- imported by an entrypoint, route, module, provider, or test,
- referenced by generated routing or module configuration,
- explicitly named by the user in the task,
- exported by a package and consumed elsewhere.

If a file appears unused, do NOT edit it unless the task explicitly requests
removal, wiring, or revival.

## Completion Gate

A task is NOT complete until the agent reports all of:

- changed files (list),
- exact validation commands run,
- result per command: `passed` / `failed` / `partial` / `not run`,
- whether failures are pre-existing or introduced by this change,
- remaining risks.

Agents MUST NOT say "done", "fixed", "complete", or "ready" when lint,
typecheck, or relevant tests were skipped or failed. Mark the task `partial` and
explain why.

## Handoff Format

```
Goal:
Mode:
Files changed:
Commands run:
Validation status:
Risks:
Next step:
```

- `Mode`: `implementation` / `review-only` / `docs-only` / `partial`
- `Validation status`: one line per command — `passed` / `failed` / `partial` /
  `not run + reason`
- `Next step`: up to 3 concrete items, max 2 lines each.

## Git

- Do not commit, push, deploy, publish, or open PRs unless explicitly asked.
- Commit messages in English, Conventional Commits — see
  `.claude/instincts/commit-convention.md`.
- **No AI attribution** in commits or PR bodies: no `Co-Authored-By: Claude ...`
  trailer, no `Generated with ...` footer, no tool name or emoji. Overrides any
  tool default.
- Branch naming: `<BRANCH_CONVENTION>`.
- When asked to create a PR: inspect `git status`, branch, remotes, and
  `gh auth status`; base on `<DEFAULT_BASE_BRANCH>`; use only labels that exist
  in `gh label list`; include changed files, docs sync, validation results, and
  remaining risks in the body.

## Module Documentation

Each module directory carries a `README.md` covering: public API surface,
file listing with one-line descriptions, external services consumed, data flow,
and the command to test the module.

<!-- Point at 2-3 real examples in this repo — a template nobody has followed
     is worth less than one file an agent can copy. -->
