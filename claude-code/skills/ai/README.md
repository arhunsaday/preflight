# ai/

Building LLM features, not using them. These are for the code you ship.

| Skill | Covers |
| --- | --- |
| [`rag-pgvector`](rag-pgvector/) | Chunking, embeddings, `ivfflat` vs `hnsw`, hybrid search with RRF, reranking, and measuring retrieval separately from generation |
| [`langfuse-observability`](langfuse-observability/) | Tracing LangChain/LangGraph, prompt versioning, datasets from real traffic, evaluators, experiments |

They chain: `langfuse-observability` says to trace retrieval as its own span,
and `rag-pgvector` says most "hallucination" reports are retrieval failures.
Together that is the diagnostic path — the trace tells you *which half* is wrong
before you touch either.

## The rule both of them exist to enforce

**A prompt change with no eval is a deploy with no test.** Everything else in
these two skills is machinery for making that cheap enough to actually do.

## Also installed

`mcp-builder` (anthropics) for writing your own MCP servers, and the `langfuse`
skill for the full API surface.
