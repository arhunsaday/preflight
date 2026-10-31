---
title: "Architecture"
---
## Decisions get written down

An architectural decision that exists only in a chat log will be re-litigated in
three months by someone who was not there. Write an ADR — **MADR** format:
context, the options, the decision, the consequences.

`diagram-to-adr` drafts one from a diagram file, which is usually where the
thinking already happened.

## Diagram → model → proposal

```
diagram (Excalidraw / draw.io)
   ├── diagram-to-adr      → the ADR: decision + alternatives + consequences
   └── diagram-to-likec4   → a LikeC4 .c4 model (C4 as code, version-controlled)
                                 └── likec4-to-openspec → proposal + spec deltas + tasks
```

[LikeC4](https://likec4.dev) is worth the adoption cost on anything that lives
longer than a quarter: the model is text, so it diffs, reviews and cannot silently
drift from what was agreed.

## Choosing a stack

Research first, technology-neutral, no unlabeled guesses. The output is an ADR
with mermaid diagrams, risks, assumptions and open questions — not a
recommendation with the reasoning hidden.

Two failure modes to watch for in an agent's architecture advice:

- **Confident familiarity.** It recommends what appears most often in training
  data, which is not the same as what fits your constraints.
- **Unlabeled guessing.** Ask it to mark every claim as verified or assumed.
  The assumed ones are where the risk is.

## Keeping architecture and code in sync

- `progress-audit` — diffs specs against **wired, tested code**, never against
  status docs
- `verify-change` — did a contract, README or spec go stale with this diff?
- `spec-drift-triage` *(in the host project, not yet vendored here)* — a spec changed;
  which already-created tickets are now wrong?

## Instincts worth having

```
one-artifact-root          — one place per artifact type, not three
verified-progress-signal   — completion measured against wired code
plan-before-operational-change — observe, plan, bound, then mutate
```
