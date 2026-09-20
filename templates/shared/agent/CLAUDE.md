# Claude — <PROJECT>

Read `AGENTS.md` first. It is the canonical project contract; this file only
adds what is specific to Claude Code.

Order of work for anything non-trivial:

1. Read `agent-commands.json` for the real commands — do not invent any.
2. Read matching `.claude/instincts/*.md` for the area you are touching.
3. Make the smallest safe change and update the tests alongside it.
4. Run scoped lint, typecheck, and the relevant tests.
5. Report with the Completion Gate + Handoff Format from `AGENTS.md`.

Do not commit, push, deploy, publish, or open PRs unless explicitly asked.

<!-- Add below: Claude-specific MCP servers, subagents, or hooks this repo
     expects. Keep project conventions in AGENTS.md, not here — duplicating
     them means they drift apart. -->
