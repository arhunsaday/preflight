# Instincts

Short, context-triggered rules. Each file is **one rule**, loaded when its
`trigger` matches what the agent is about to do — finer-grained than a single
large `AGENTS.md`, which the agent reads once and then dilutes.

## Format

```markdown
---
id: kebab-case-identifier
trigger: 'when <the concrete situation that should surface this rule>'
confidence: 0.0-1.0
domain: git | delivery | operations | testing | architecture | database | observability | security
source: hand-authored | local-repo-analysis | adapted from <url>@<sha>
---

# Imperative one-line title — the rule itself, not a topic

## Action

What to do. Concrete and checkable. Code snippets when the rule is about code.

## Why

The failure this prevents. Skip only when it is self-evident.

## Evidence            <!-- optional, for source: local-repo-analysis -->

What in the repo supports this — commit counts, file counts, sampled patterns.
```

## Field notes

- **`trigger`** is the load-bearing field. Write the *situation*, not the topic:
  `'when writing a commit message'`, not `'commits'`. It is what an agent
  pattern-matches against before acting.
- **`confidence`** — how strictly to apply it. `0.9+` is a hard rule; `0.7-0.85`
  is a strong default that a good reason can override. Below `0.7`, ask whether
  the rule is worth having at all.
- **`domain`** groups rules so a task can pull "all `database` instincts" without
  reading the rest.
- **`source`** keeps provenance honest. `local-repo-analysis` rules were derived
  by reading the codebase and should carry an `## Evidence` section; they go
  stale when the codebase moves, and the evidence is how you tell.
- **`id`** — prefix project-specific rules with the project name
  (`myapp-repository-pattern`) and leave universal ones unprefixed
  (`self-review-before-done`). At a glance you can then see what travels to the
  next project and what does not.

## Cross-references

Link related rules with `[[id]]`. A link to a rule that does not exist yet is
fine — it marks a gap worth filling rather than an error.

## Wiring it up

Instincts are a convention, not a built-in feature: nothing loads them
automatically. Point at them from the project's `AGENTS.md` so agents know they
exist — the template in this directory already does:

> Read matching `.claude/instincts/*.md` before non-trivial work.

## Writing new ones

Two ways, both worth doing:

1. **Hand-authored** — after a review catches the same class of mistake twice,
   write the rule instead of repeating the comment.
2. **Repo-derived** — ask an agent to read the last N commits and the dominant
   patterns in a layer, then emit instincts with `source: local-repo-analysis`
   and an `## Evidence` section. Review each one: derived rules describe what the
   codebase *does*, which is not always what it *should* do.
