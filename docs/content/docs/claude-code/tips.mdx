---
title: "Tips & tricks"
---
Things that are not in the mental model but change the day.

## Context

- **`/compact` mid-task, `/clear` between tasks.** A fresh context beats a
  compacted one carrying a dead task's residue.
- Sessions living above 150k tokens cost more on every turn, cached or not.
- **Write big output to a file, read the slice.** Never dump a full test log or
  a 200-page extraction into the conversation.
- `.claudeignore` keeps lockfiles and build output out from the start. Cheapest
  win available.

## Git worktrees

Run several sessions on the same repo without them fighting over the working
tree:

```bash
git worktree add ../repo-feature-x feature-x
```

One agent per worktree, each with its own branch and its own checkout.
[Docs](https://code.claude.com/docs/en/worktrees).

## Permissions

Pre-allow the read-only commands you approve twenty times a day:

```json
"permissions": {
  "allow": ["Bash(git status:*)", "Bash(git diff:*)", "Bash(ls:*)", "Bash(rg:*)"],
  "deny":  ["Read(./.env)", "Read(./**/*.pem)"]
}
```

`deny` is the important half. Fill it before `allow`.

## Plan mode

Plan mode for anything 3+ steps or architectural. If something goes sideways,
**stop and re-plan** rather than pushing. After two consecutive tool failures,
change approach entirely.

## Reviewing a diff

`git diff | claude` works, but `/review` or the `reviewer` subagent is better:
they read the surrounding code, which is what turns a confident-wrong finding
into a real one.

## When it goes wrong

Symptoms and what they usually mean:

| Symptom | Usually |
| --- | --- |
| Edits the same file 3+ times | It never read the whole file. Tell it to read, plan, then make **one** edit |
| Keeps retrying the same failing approach | Two failures is the signal to change strategy — say so |
| Ignores a correction | Make it quote back what you asked before proceeding |
| Wanders the codebase | Give it a starting file, or dispatch `explorer` |

Those four are worth putting in `CLAUDE.md` — they are in this kit's already.

## Official

- [Best practices](https://code.claude.com/docs/en/best-practices)
- [Cheatsheet](https://support.claude.com/en/articles/14553413-claude-code-cheatsheet)
- [Common workflows](https://code.claude.com/docs/en/common-workflows)
