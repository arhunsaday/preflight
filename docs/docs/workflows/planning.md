---
sidebar_position: 1
---

# Planning

The step people skip, and the one that determines whether everything after it
works.

## When to plan

| Task | Plan? |
| --- | --- |
| One-line fix, obvious cause | no |
| 3+ steps | **yes** |
| Any architectural decision | **yes** |
| Touching auth, money, data, migrations | **yes, written** |
| You cannot state "done means…" in one sentence | **yes** — that *is* the signal |

## The chain

```
idea → spec-workflow → implementation-planning → build → progress-audit → completion-plan
             ↑                                                   ↓
      harvest-questions ←──────── open questions ────────────────┘
```

| Step | Skill | Produces |
| --- | --- | --- |
| Clarify | `spec-workflow` | A spec with acceptance criteria |
| Interrogate | `/plan-challenge` | Assumptions challenged, decisions made with you |
| Detail | `implementation-planning` | Files, schema, contracts, tests — build-ready |
| Estimate | `ai-time-estimates` | Effort in agent-sessions, with a band |
| Track | `progress-audit` | Verified completion, measured against wired code |
| Scope the rest | `completion-plan` | Backlog with a plan and a ticket per item |

## `/plan-challenge`

The one to reach for on anything ambiguous. It interviews you with
`AskUserQuestion` instead of guessing, challenges the assumptions in your
request, names the alternative it rejected, and writes the plan for a **stranger**
— because the agent that executes it will not have the conversation.

Rule of thumb: if a plan lists no rejected alternative, no alternative was
considered.

## Estimating

Default estimates are wrong in both directions for agent work, and the errors do
not cancel.

- **Overestimated**: mechanical volume — boilerplate, CRUD, test scaffolds,
  renames across 200 files. 5–20× faster.
- **Underestimated**: deciding what to build, waiting for access, review cycles,
  integrating with something undocumented, and the loops where the agent is
  confidently wrong.

Estimate in **sessions**, not hours, and always give a band. `ai-time-estimates`
carries the full method.

## Spec-driven development

For anything where "what should this do" is genuinely open, look at
[github/spec-kit](https://github.com/github/spec-kit) (★125k) — `/specify`,
`/plan`, `/tasks` as a formal loop. This kit's `spec-workflow` covers the same
ground more lightly; spec-kit is worth it when several people must agree on the
spec before code exists.
