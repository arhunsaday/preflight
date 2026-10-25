---
name: rag-pgvector
description: Build and debug retrieval-augmented generation on PostgreSQL + pgvector — chunking, embeddings, index choice (ivfflat vs hnsw), hybrid search, reranking, and measuring retrieval separately from generation. Use when building a RAG pipeline, when answers are wrong and retrieval is suspect, or when choosing a vector index.
source:
  upstream: hand-authored in preflight
  imported: 2026-09-20
risk_level: medium
writes_files: true
---

# RAG on Postgres + pgvector

## The rule that saves the most time

**Measure retrieval separately from generation.** Most "the model is
hallucinating" reports are retrieval failures: the answer-bearing chunk was
never in the context, so the model had nothing to be right about.

Before touching a prompt, take 20 real questions, run retrieval only, and check
by hand whether the right chunk is in the top-k. If it is not, the prompt is not
the problem.

| Metric | Measures |
| --- | --- |
| recall@k | is the right chunk retrieved at all — the one that matters most |
| MRR / nDCG | is it ranked near the top — reranking moves this |
| faithfulness | does the answer follow from the context — generation side |

## Chunking

No default exists. Size and overlap follow from your documents and your queries,
and getting them wrong cannot be fixed downstream.

- **Structured docs**: split on headings first, then size. A chunk straddling
  two sections answers neither question.
- **Prose**: 300–800 tokens, 10–20% overlap as a *starting point*. Measure.
- **Code**: split on function/class boundaries, never mid-body.
- **Tables**: repeat the header in every chunk or the rows are meaningless.
- **Always store the parent reference.**

Small chunks retrieve precisely and answer poorly; large chunks do the reverse.
The usual resolution is **small-to-big**: embed small, return the parent.

## Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chunks (
  id          bigserial PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content     text NOT NULL,
  embedding   vector(1536) NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}',
  tsv         tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);
```

The generated `tsvector` makes hybrid search cheap later. Add it now even if you
start with pure vector.

## Index choice — a real decision

| | `ivfflat` | `hnsw` |
| --- | --- | --- |
| Build time | fast | slow |
| Memory | low | **high** |
| Recall | good, tunable via `probes` | better |
| New rows | degrades until rebuilt | handles them |
| Needs data before building | **yes** | no |

```sql
-- hnsw: the default under a few million rows
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
SET hnsw.ef_search = 40;        -- raise for recall, lower for speed

-- ivfflat: when build time and memory matter more than recall
CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 1000);          -- about rows/1000, built AFTER loading data
SET ivfflat.probes = 10;
```

**Match the operator class to the distance function.** `vector_cosine_ops` with
`<->` (L2) silently gives an unindexed scan. Cosine is `<=>`.

## Hybrid beats pure vector

Vector search misses exact identifiers, error codes and rare proper nouns —
exactly what users search for.

```sql
WITH vec AS (
  SELECT id, RANK() OVER (ORDER BY embedding <=> $1) AS rank
  FROM chunks ORDER BY embedding <=> $1 LIMIT 50
),
kw AS (
  SELECT id, RANK() OVER (ORDER BY ts_rank_cd(tsv, plainto_tsquery($2)) DESC) AS rank
  FROM chunks WHERE tsv @@ plainto_tsquery($2) LIMIT 50
)
SELECT c.*, COALESCE(1.0/(60+vec.rank),0) + COALESCE(1.0/(60+kw.rank),0) AS score
FROM chunks c
LEFT JOIN vec ON vec.id = c.id
LEFT JOIN kw  ON kw.id  = c.id
WHERE vec.id IS NOT NULL OR kw.id IS NOT NULL
ORDER BY score DESC LIMIT 10;
```

Reciprocal Rank Fusion — no score normalisation needed, which is why it is the
default choice.

## Reranking

A cross-encoder over the top 50 usually buys more than a bigger embedding model,
for a fraction of the cost. Retrieve wide, rerank narrow, feed the top 5.

## Filtering

Metadata filters and ANN indexes fight: a restrictive `WHERE` makes the index
return too few candidates. Over-fetch then filter, or use partial indexes per
tenant when cardinality is low.

## Common failures

| Symptom | Cause |
| --- | --- |
| Confident wrong answers | retrieval missed — measure recall@k first |
| Exact IDs never found | pure vector; add keyword/hybrid |
| Fine in dev, slow in prod | index built before data, or `probes`/`ef_search` too high |
| Everything ranks alike | chunks too large, or embedding truncated at the model limit |
| Breaks after re-embedding | dimension mismatch, or index not rebuilt |

## Never

- Change embedding model without re-embedding **everything**. Two models'
  vectors are not comparable and nothing will error.
- Put a raw user string into SQL. Parameterise.
- Trust a retrieval eval built from questions written *after* seeing the docs.
