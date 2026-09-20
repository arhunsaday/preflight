---
name: langfuse-observability
description: Instrument, trace, evaluate and iterate on LLM applications with Langfuse — tracing LangChain/LangGraph runs, building datasets from real traffic, defining evaluators, running experiments before shipping a prompt change. Use when building or debugging an LLM feature, when quality regressed and nobody knows why, or before changing a prompt in production.
source:
  upstream: hand-authored in ai-dev-kit
  imported: 2026-09-20
risk_level: medium
writes_files: true
---

# LLM observability with Langfuse

Without tracing you debug by vibes: a user says "it got worse" and there is no
record of what the model actually saw.

## The loop

```
trace everything  →  dataset from real traffic  →  evaluators
        ↑                                              ↓
  ship the change  ←  compare runs  ←  experiment against the dataset
```

**A prompt change with no eval is a deploy with no test.** That is the argument
for the whole skill.

## Tracing

```python
from langfuse import observe, get_client

@observe()
def answer(question: str) -> str:
    docs = retrieve(question)        # nested span, automatically
    return generate(question, docs)

get_client().update_current_trace(
    user_id=user.id, session_id=session.id,
    tags=["prod", "v2"], metadata={"retriever": "hybrid-rrf"},
)
```

LangChain / LangGraph, including every node and tool call:

```python
from langfuse.langchain import CallbackHandler
chain.invoke({"q": q}, config={"callbacks": [CallbackHandler()]})
```

### On every trace

- **`user_id` and `session_id`** — otherwise "this user gets bad answers" is
  unanswerable
- **A version tag** on the prompt and the retriever. Without it, a regression
  cannot be attributed to a change
- **Retrieval as its own span, with scores.** This is what separates a retrieval
  failure from a generation failure at a glance — see `rag-pgvector`

## Prompt management

Prompts live in Langfuse, versioned, fetched at runtime with a local cache:

```python
prompt = get_client().get_prompt("answer-question", label="production")
compiled = prompt.compile(question=q, context=ctx)
```

The gain is not storage. It is that a prompt change becomes a deployable,
revertible artifact with an owner, instead of a diff buried in application code.

## Datasets and experiments

Build the dataset from **real traffic**, never from invented examples:

1. Find traces that went wrong — low score, thumbs-down, a support ticket
2. Add each to a dataset with the expected output
3. Define evaluators: LLM-as-judge for faithfulness, deterministic checks for
   format, exact match where a right answer exists
4. Run the candidate change against the dataset, compare runs

```python
dataset = get_client().get_dataset("qa-regressions")
for item in dataset.items:
    with item.run(run_name="hybrid-retrieval-v3") as root:
        root.update(output=answer(item.input["question"]))
```

Twenty real failures beat two hundred synthetic examples — a synthetic dataset
mostly measures whether the model is consistent with itself.

## Scores

| Source | Good for |
| --- | --- |
| User feedback (thumbs) | ground truth, sparse |
| LLM-as-judge | faithfulness, relevance, tone — cheap, noisy |
| Deterministic | JSON valid, schema matches, citation present |
| Human review | the arbiter when the other three disagree |

**Do not trust an LLM judge you have not validated** against human labels on at
least 30 examples.

## Cost and latency

Two things worth watching:

- **p95 latency by span** — usually retrieval, not generation
- **cost per *successful* answer**, not per call. A cheap call that fails and
  retries is not cheap

## Self-hosting

Docker Compose locally, Helm on Kubernetes. Needs Postgres, ClickHouse, Redis
and S3-compatible storage. Self-host when traces contain customer data — which,
for client work, they will.

## Reference

[langfuse.com/docs](https://langfuse.com/docs). The `langfuse` skill installed
in this setup covers the API surface in more detail.
