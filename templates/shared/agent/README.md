# Agent drop-in

Files that make a repository legible to coding agents. Copy them into a project
and fill the `<PLACEHOLDER>` markers — nothing here works unedited, by design:
a contract full of generic advice trains agents to skim it.

```bash
./bootstrap.sh --project ~/path/to/repo
```

Copies (never overwrites) into the target repo.

## What lands where

| File                          | Destination          | Role                                                                                    |
| ----------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| `AGENTS.md`                   | repo root            | **Canonical contract.** Conventions, validation matrix, completion gate, handoff format |
| `CLAUDE.md`                   | repo root            | Thin pointer to `AGENTS.md` + Claude-specific bits                                      |
| `CODEX.md`                    | repo root            | Thin pointer                                                                            |
| `copilot-instructions.md`     | `.github/`           | Thin pointer                                                                            |
| `agent-commands.json` | repo root            | Command registry — the real invocations, so agents stop guessing                        |
| `.claudeignore`               | repo root            | Context exclusions                                                                      |
| `instincts/*.md`              | `.claude/instincts/` | Context-triggered rules — see `instincts/README.md`                                     |

## The layering rule

**One canonical file, thin pointers.** `AGENTS.md` holds every project
convention; `CLAUDE.md`, `CODEX.md`, and `copilot-instructions.md` say "read
`AGENTS.md` first" and add only what is specific to their tool.

The alternative — three files each carrying a copy of the conventions — drifts
within a month, and then no one can tell which copy is current. If a rule
applies to more than one tool, it belongs in `AGENTS.md`.

## Order of adoption

1. **`agent-commands.json` first.** Cheapest to fill, immediate payoff:
   agents stop running whole-repo test suites and inventing script names.
2. **`.claudeignore`.** Also cheap. Removes lockfiles and build output from the
   context window.
3. **`AGENTS.md`.** The real work. Write the Validation Matrix and Completion
   Gate first — they change agent behavior more than the prose sections do.
4. **Pointer files** for whichever tools the team actually uses. Skip the rest.
5. **`instincts/`.** Add one when a review catches the same class of mistake
   twice — not in a big upfront batch.
