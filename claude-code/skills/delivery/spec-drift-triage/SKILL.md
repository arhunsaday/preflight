---
name: spec-drift-triage
description: Triage a specification change against the tickets it already produced — summarise the delta in the vocabulary of the ticket, say what to do about it, and flag whether it is a candidate for a change request. Use when a spec moved after tickets were created, when the ticket registry reports drift or a conflict, or when the user asks what a spec edit means for Jira.
license: MIT
allowed-tools: Read Write Edit Glob Grep Bash(git:*) Bash(ls:*)
metadata:
  version: "1"
source:
  upstream: vendored, third-party
  imported: 2026-09-20
---

# Spec drift triage

A specification moved after the host project created the tickets. Answer three questions
for each affected ticket: **what changed**, **what to do**, and **is this a
change request**.

Its twin is `spec-to-tickets`, which writes the first version of the text.

## Where the facts are

1. `{{DELIVERY_DIR}}/tickets.json` — the registry. Each entry carries a state and
   a fingerprint per field.
2. `{{DELIVERY_DIR}}/tickets.plan.json` — the operations the host project proposes now.
3. The specification, under `{{OPENSPEC_DIR}}/`.
4. The patch: `git diff <base>...HEAD -- {{OPENSPEC_DIR}}`.

the host project computes the drift. It fingerprints the projection that would be sent to
Jira, field by field, and compares it with the fingerprint it recorded. You read
that result. Never recompute it by eye.

## The four states

| State | Meaning | Default action |
| --- | --- | --- |
| `synced` | the projection matches the recorded fingerprint | nothing |
| `drifted` | the specification moved, the ticket did not | update the ticket |
| `conflicted` | both the specification and the ticket moved | comment only |
| `orphaned` | the specification section is gone | comment only |

`conflicted` never becomes an update. A human edited that ticket after the host project
wrote it, and an update would delete their work without a review.

`orphaned` never becomes a deletion. Work that lost its specification may still
be in progress, or already done. The entry stays in the registry forever.

## Summarise the delta in the vocabulary of the ticket

Write what a person who reads only the ticket needs. Name the field that moved,
then the consequence.

| Instead of | Write |
| --- | --- |
| a diff hunk | the acceptance criterion that changed |
| a file path | the requirement, by its title |
| "the spec changed" | "the currency check now also rejects an unknown code" |
| a list of every field | only the fields whose fingerprint moved |

Say what did **not** move. "The acceptance criteria changed; the estimate did
not" is the sentence that stops a needless re-estimation.

Keep the summary to five lines. A longer note is a sign that the delta is a new
requirement, not a correction.

## Say what to do

One line per ticket, in this shape:

```
<TICKET-KEY> · <state> · <what moved> → <action>
```

The action is one of: `update the description`, `comment only`, `re-estimate`,
`split into a new ticket`, or `no action`.

Choose `no action` when the edit is a typo, a heading, or a reformatting. A
fingerprint that did not move is proof, and a typo that moves no fingerprint
touches no ticket.

Choose `split into a new ticket` when the specification gained a requirement
rather than correcting one. Growing an existing ticket hides the growth.

## Is it a change request

Flag a delta as a change request candidate when **any** of these is true:

1. The specification gained a requirement or a scenario that was not there.
2. The estimate of the linked costing task has to grow.
3. A ticket already in progress or done needs work again.
4. The delta moves a date, a scope boundary, or a deliverable.

A wording correction, a clarification of an existing rule, and a typo are not
change requests. Say so plainly, so nobody bills a typo.

Write the flag, never the decision. The commercial answer belongs to the person
who owns the contract.

## Output

Write the triage to `{{DELIVERY_DIR}}/drift/{{DATE}}-<kebab-slug>.md`.

```markdown
---
title: <one line>
date: {{DATE}}
base: <the base reference>
---

# <title>

**In one sentence:** …

## Tickets to act on

| Ticket | State | What moved | Action | Change request |
| --- | --- | --- | --- | --- |

## Change request candidates

One paragraph for each. What the client asked for before, what the specification
says now, and which tickets carry the extra work.

## No action

Tickets whose fingerprint did not move, with the reason in three words.
```

## Do not do these

- Do not edit `tickets.json`. the host project owns the registry.
- Do not propose a status transition or a deletion.
- Do not overwrite a ticket a human edited. Comment instead.
- Do not claim a drift you did not read in the registry.
