# AI Dev Kit

My AI coding setup, versioned in one place: global instructions and skills that
follow me across every project, plus the agent files I drop into a new repo.

Two audiences, two install paths.

## Install — machine

Links this kit's assets into `~/.claude`, so they apply to every project.

```bash
./bootstrap.sh
```

Symlinks, not copies: edit a file here and it is live immediately; `git pull`
updates every machine that ran it. Idempotent — re-run any time.

It never overwrites an existing real file (`--force` backs it up to
`~/.claude/backups/` first) and never touches `settings.json` or `mcp.json` if
you already have one — those are merge-not-replace, so it prints a `diff`
command instead. `--dry-run` shows the plan, `--unlink` reverses it.

## Install — a project

Copies the agent drop-in into a repo, skipping anything already there.

```bash
./bootstrap.sh --project <some-repo>
```

Copies rather than links: those files belong to that repo's history and each
one needs local edits. Then fill the `<PLACEHOLDER>` markers — start with
`agent-compass.commands.json`, then `AGENTS.md`.

## Layout

```
claude-code/         → ~/.claude       (global, all projects)
  CLAUDE.md            global instructions
  skills/              16 skills, linked into ~/.claude/skills/
  hooks/               hook scripts (referenced from settings.json)
  settings.json        only linked if you don't already have one
templates/
  shared/agent/        the project drop-in — AGENTS.md, instincts, .claudeignore
  shared/              CI, pre-commit, .env.example
  node-cli/            per-stack project scaffolds
  react-spa/
agent-instructions/  AGENTS.md for agents working on *this* repo
standards/           coding standards
prompts/             reusable prompts
```

Empty files and `.gitkeep` are scaffolding — `bootstrap.sh` skips them, so
unfinished sections never shadow real config. They start being installed the
moment they have content.

## Skills

Installed globally, so they trigger by description in any project — or by
`/name`.

|                   |                                                                                   |
| ----------------- | --------------------------------------------------------------------------------- |
| **Communication** | `caveman` · `caveman-commit` · `caveman-review` — compressed output, ~-75% tokens |
| **Approach**      | `ponytail` — forces the laziest solution that works (YAGNI)                       |
| **Gates**         | `verify-change` · `verify-module` · `verify-quality` · `verify-security`          |
| **Planning**      | `spec-workflow` · `implementation-planning` · `completion-plan`                   |
| **Audit**         | `progress-audit` — diffs specs against real code, not against status docs         |
| **Debug**         | `debug-loop` — build a failing repro before diagnosing                            |
| **PR**            | `pr-workflow` · `pr-review-governance`                                            |
| **PDF**           | `pdf-inspector` — PDF → Markdown, scanned-vs-text detection                       |

Most are adapted from `+Work/parcus-plus`, genericized.

## Adding a skill

```
claude-code/skills/<name>/SKILL.md
```

Frontmatter needs `name` (matching the directory) and a `description` that says
**when** to use it — that sentence is the only thing deciding whether the skill
ever fires. Run `./bootstrap.sh` to link it, then restart the session.
