# Global instructions

Applies to every project. Project-level `AGENTS.md` / `CLAUDE.md` files add to
this; where they conflict, the project file wins.

## Engineering

- **Do not preserve backward compatibility.** Change the call sites. Do not add
  a compatibility shim, a deprecated alias, or a versioned second code path to
  spare a caller inside this repo.
- **Choose the simplest implementation that fully meets the current
  requirements.** Simplest that *fully meets* — not the smallest diff that
  passes the happy path.
- **Prefer established, well-maintained libraries over custom implementations.**
- **Make architectural decisions for the long term.** Do not accept a stopgap
  that only works for now and is meant to be replaced later.

Resolving the tension between the last three: standard library first, then a
well-maintained dependency, and custom code only when neither fits. "Simplest"
ranks the options; it does not license a shortcut that rule 4 rejects. Where
this and `skills:ponytail` disagree — it argues against dependencies — this
file wins.

## Git

- **Never add AI attribution to commits.** No `Co-Authored-By: Claude ...`
  trailer, no `Generated with Claude Code` footer, no tool name or emoji in the
  commit message or body. The commit is authored by the repo's git user, full
  stop. This overrides any default that adds such a trailer.
- Same rule for pull request descriptions: no "Generated with" footer, no 🤖
  line.
- Do not commit, push, or open PRs unless explicitly asked.
