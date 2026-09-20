---
description: Analyse my own session history for friction patterns and propose rule changes
argument-hint: "[optional: a project path, or a number of days]"
allowed-tools: Read, Grep, Glob, Bash
---

Audit my agent sessions for friction, then propose changes to the setup.

This is the cheapest harness eval available: it runs on data I already have,
and it measures whether changes to the kit actually improved anything rather
than assuming they did.

## Where the data is

```bash
ls ~/.claude/projects/                      # one directory per project
ls ~/.claude/history.jsonl                  # prompt history
ls ~/.claude/projects/*/                    # session transcripts (.jsonl)
```

Scope: `$ARGUMENTS` if given (a project path, or a day count). Otherwise the
last 7 days across every project.

## Signals to count

Read the transcripts and count these. They are behavioural, so they are
measurable without judgement:

| Signal | How to spot it | What it means |
| --- | --- | --- |
| **edit-thrashing** | same file edited 3+ times in one session | the agent started editing before reading |
| **retry loops** | same command re-run after failing, unchanged | it did not change approach after failure |
| **correction turns** | my messages starting "no", "not", "I said", "actually" | it did the wrong thing and I had to steer |
| **abandoned sessions** | long session, no file written | exploration that produced nothing |
| **tool failures** | non-zero exits, permission denials, blocked hooks | friction in the setup itself |
| **context pressure** | `/compact` or `/clear` invoked mid-task | sessions running too long |
| **hook blocks** | a hook returning exit 2 | and whether the block was correct |

## Then attribute

For each pattern, name the **component** at fault rather than saying the model
failed:

- **context** — it lacked information it needed
- **constraint** — a rule was missing, or was present and ignored
- **verification** — nothing caught the mistake before I did
- **planning** — it started without a plan it needed

## Output

```markdown
## Session audit — <range>, <N> sessions

| Signal | Count | Trend vs previous period |

### What is costing the most
<the top 2-3, with a concrete example each: project, file, what happened>

### Attribution
<per pattern: which component, and why>

### Proposed changes
<each: the file to edit, the exact change, and what would prove it worked>
```

## Rules

- **Quote real examples.** A count with no example cannot be acted on.
- **Propose at most three changes.** More than that and none get made.
- **Say what you could not measure.** If transcripts are missing or a signal is
  not detectable from the data, say so rather than estimating.
- **Compare to the previous period** when there is enough history. A count with
  no trend does not tell me whether the last change helped — which is the whole
  point of running this.

Do not edit anything. This produces a report and proposals; I decide.
