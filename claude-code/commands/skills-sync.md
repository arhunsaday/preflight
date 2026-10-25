---
description: Update third-party skills and report what changed
allowed-tools: Bash, Read, Glob
---

Update every skill this machine gets from someone else, then tell me what moved.

Third-party skills are managed by the `skills` CLI and recorded in
`skills-lock.json`. They are **never** edited in place — an edit is silently
reverted by the next update. Skills I own live in `preflight/claude-code/skills/`
and are not touched by this command.

## Steps

1. Show what is installed and where it comes from:
   ```bash
   npx -y skills@latest list
   ```
2. Update, then show the resulting lockfile diff:
   ```bash
   npx -y skills@latest update -y
   git -C ~/Dotfiles diff --stat skills-lock.json 2>/dev/null || true
   ```
3. For every skill whose hash changed, read the new `SKILL.md` and summarise
   **what actually changed in the instructions** — not "updated to latest".
   A skill is a prompt; a changed prompt changes behaviour.
4. Flag anything that now conflicts with `~/.claude/CLAUDE.md`. That file wins,
   but a silent contradiction produces inconsistent behaviour, so name it.

## Report

| Skill | Source | Change |
| --- | --- | --- |

End with a one-line verdict: safe to keep, or something needs my attention.
