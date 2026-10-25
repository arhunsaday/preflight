---
title: "Jev \u2014 typed decisions"
---
[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) is
TypeSafe AI's "System One" model. **It is not a chat model.**

It takes unstructured state plus a **typed question** and returns a **typed
decision** — a choice, a score, or a boolean — each with a confidence. No prose,
no parsing, no "please respond in JSON" and hoping.

## Why it matters for this stack

Every agent pipeline contains decision points that a chat model handles badly:

| Decision | Today, badly | With a typed decision layer |
| --- | --- | --- |
| Route a request to a branch | prompt a chat model, parse the answer | a typed choice with confidence |
| Score against a rubric | LLM-as-judge, noisy and slow | a typed score |
| Verify a RAG answer is grounded | another generation pass | a typed boolean |
| Guardrail before a tool call | regex, or hope | a typed boolean with a threshold |

The failure it removes is **parse-and-pray**: asking a generative model for
structure, getting prose back some fraction of the time, and building retry
logic around it.

## Where it fits your work

- **LangGraph routing** — the conditional edge is a typed choice, not a prompt
  whose answer you `JSON.parse` in a `try`
- **RAG verification** — "is this answer supported by the retrieved context"
  is a boolean with a confidence, which is exactly what you want to threshold on
- **Agent guardrails** — a cheap classification before an expensive or
  irreversible tool call
- **Classification at volume** — where a chat model is both overkill and
  unreliable

## Honest caveats

Worth stating because the ecosystem around it is young:

- It is **a decision layer, not a reasoning layer.** It will not plan, write
  code, or explain itself.
- The confidence score is only useful if you calibrate it against your own
  labels. An uncalibrated threshold is a guess with a decimal point.
- `awesome-jev`'s own README carries the right warning: *"Treat same-day bulk
  submissions with particular care. Volume is not evidence of quality."* Several
  repos published together sharing a scaffold can satisfy every inclusion rule
  and still be unproven.

## Read

- [Introducing System One models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- [yibie/awesome-jev](https://github.com/yibie/awesome-jev) — who is actually
  building with it, and which decision patterns transfer
