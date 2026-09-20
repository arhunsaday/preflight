# rules/

Empty on purpose — and a note on why, so the folder is not re-created by
accident.

`rules/` was scaffolded before the kit had a shape. Everything it would hold now
lives somewhere more specific:

| What you might put here | Where it actually goes |
| --- | --- |
| How the agent should work with me | `claude-code/CLAUDE.md` |
| A rule triggered by a situation | `templates/shared/agent/instincts/` |
| A rule that must hold deterministically | `claude-code/hooks/` |
| Language-level code conventions | `standards/` |
| Project-specific conventions | that project's `AGENTS.md` |

The distinction that decides it: **`CLAUDE.md` and instincts *ask*, hooks
*enforce*.** If a rule genuinely must hold, it is a hook. If it is guidance, it
is an instinct or a line in `CLAUDE.md`.

Delete this folder if it bothers you; nothing reads it.
