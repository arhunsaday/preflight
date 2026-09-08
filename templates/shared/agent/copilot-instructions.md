<!-- Drop at .github/copilot-instructions.md -->

# Copilot — <PROJECT>

Read `AGENTS.md` first. It is the canonical project contract.

Use this order for non-trivial work:

1. Read `agent-compass.commands.json` and `<ARCHITECTURE_MAP>`.
2. Read matching `.github/instructions/*.md` and `.claude/instincts/*.md`.
3. Make the smallest safe change and update tests.
4. Keep specs, docs, and API contract layers in sync.
5. Run scoped lint, typecheck, and relevant tests.

Do not commit, push, deploy, publish, or open PRs unless explicitly asked.

<!-- Per-area instructions go in .github/instructions/<area>.instructions.md
     with an `applyTo:` glob, so they load only for matching files. -->
