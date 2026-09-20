---
description: Log the small frictions from this session to PAPERCUTS.md
argument-hint: "[optional: a specific friction to log]"
allowed-tools: Read, Write, Edit, Bash, Grep
---

Log **papercuts** — the small frictions that are individually not worth a
ticket, but together show where this repo needs sanding down.

A papercut is: a tool call that missed and had to be retried, a confusing or
undocumented setup step, a flaky command, a stale cache, a misleading error, a
non-obvious gotcha.

It is **not**: a real bug (that is an issue), and not a record of what you
accomplished (that is a changelog).

## With an argument

Append that one friction and stop.

## Without an argument

Review this session's transcript and extract every papercut you hit. Be honest —
including the ones caused by your own mistakes, since a step you got wrong twice
is usually a step that is documented badly.

## Format

Append to `PAPERCUTS.md` at the repo root (create it if missing), newest last:

```markdown
## YYYY-MM-DD

- **What I was doing** → what got in the way. *(guess at the cause or fix — optional but welcome)*
```

One or two sentences each. No preamble, no severity ratings, no grouping by
theme — the value is in the raw list being cheap to append to.

If nothing tripped you up this session, say so and write nothing. An empty
papercut log is a real result.
