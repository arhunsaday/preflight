---
sidebar_position: 3
---

# Setting up a new project

```bash
~/Repos/ai-dev-kit/bootstrap.sh --project .
```

Copies the agent drop-in into the repo. It **copies** rather than links, because
these files belong to that repo's history and every one needs local edits.

## What arrives

| File | Destination | Role |
| --- | --- | --- |
| `AGENTS.md` | root | **Canonical contract** — conventions, validation matrix, completion gate, handoff format |
| `CLAUDE.md` | root | Thin pointer to `AGENTS.md` |
| `CODEX.md` | root | Thin pointer |
| `copilot-instructions.md` | `.github/` | Thin pointer |
| `agent-compass.commands.json` | root | Command registry — the real invocations |
| `.claudeignore` | root | Context exclusions |
| `instincts/*.md` | `.claude/instincts/` | Context-triggered rules |

Nothing is overwritten. Re-running it on a repo that already has an `AGENTS.md`
leaves yours alone.

## One canonical file, thin pointers

`AGENTS.md` holds every convention. `CLAUDE.md`, `CODEX.md` and
`copilot-instructions.md` say "read `AGENTS.md` first" and add only what is
specific to their own tool.

The alternative — three files each carrying a copy of the conventions — drifts
within a month, and then nobody can tell which copy is current.

## Order of adoption

1. **`agent-compass.commands.json` first.** Cheapest to fill, immediate payoff:
   agents stop inventing script names and running whole-repo test suites.
2. **`.claudeignore`.** Removes lockfiles and build output from the context.
3. **`AGENTS.md`.** Write the Validation Matrix and Completion Gate first — they
   change behaviour far more than the prose sections.
4. **Pointer files** for the tools the team actually uses. Skip the rest.
5. **`instincts/`.** Add one when a review catches the same mistake twice — not
   in a big upfront batch.

## Instincts

Short rules, each loaded when its `trigger` matches what the agent is about to
do. Finer-grained than one large `AGENTS.md`, which gets read once and diluted.

```markdown
---
id: commit-convention
trigger: 'when writing a commit message'
confidence: 0.85
domain: git
source: hand-authored
---

# Use Conventional Commits
## Action
...
## Why
...
```

`trigger` is the load-bearing field: write the **situation**, not the topic.
`'when writing a commit message'`, never `'commits'`.
