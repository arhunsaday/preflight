# Codex — <PROJECT>

Read `AGENTS.md` first. It is the canonical project contract.

Order of work for anything non-trivial:

1. Read `agent-compass.commands.json` for the real commands — do not invent any.
2. Read matching `.claude/instincts/*.md` for the area you are touching.
3. Make the smallest safe change and update the tests alongside it.
4. Run scoped lint, typecheck, and the relevant tests.
5. Report with the Completion Gate + Handoff Format from `AGENTS.md`.

Do not commit, push, deploy, publish, or open PRs unless explicitly asked.
