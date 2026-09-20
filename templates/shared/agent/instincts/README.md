# Instincts

Short, situational lessons. Each file is **one rule**. Accepted rules can be
selected by task keywords; proposed and retired rules never enter selection.
This is a local convention, not model training or a native agent feature.

## Format

```markdown
---
id: kebab-case-identifier
trigger: 'when <the concrete situation that should surface this rule>'
domain: testing
scope: universal
status: proposed
source: local-review
evidence: "Describe the observed failure or reviewed convention; omit sensitive data."
---

# Imperative one-line title — the rule itself, not a topic

## Action

What to do. Concrete and checkable. Code snippets when the rule is about code.

## Why

The failure this prevents. Skip only when it is self-evident.

## Evidence            <!-- optional expansion of the required metadata -->

What in the repo supports this — commit counts, file counts, sampled patterns.
```

## Field notes

- **`trigger`** is the load-bearing field. Write the *situation*, not the topic:
  `'when writing a commit message'`, not `'commits'`. It is what an agent
  pattern-matches against before acting.
- **`confidence`** is optional legacy metadata, not measured reliability or
  policy priority. It has no effect on selection or enforcement.
- **`scope`** is `universal` or a stack/project slug (for example `react`).
  A selector includes universal rules plus the explicitly requested scope.
- **`status`** is `proposed`, `accepted`, or `retired`. Acceptance/retirement
  records `last_reviewed` (ISO date) and `reviewed_by`. Reviewer identity is
  self-declared provenance, not authentication; agents must identify themselves.
- **`evidence`** names the observation or convention backing the rule. Existing
  seed rules are marked as a migration review, not a measured success rate.
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

Generated projects receive a standalone Python 3 CLI. From the project root:

```bash
python3 scripts/instincts.py list
python3 scripts/instincts.py select --task "writing unit tests" --limit 3
python3 scripts/instincts.py select --task "review UI keyboard behavior" --scope react
python3 scripts/instincts.py check
```

Selection returns paths and metadata, not full rule bodies. Read the selected
files. It is deterministic keyword overlap, not semantic retrieval; it can miss
synonyms. If a task matters and selection is empty, inspect `list` and choose
manually. It returns at most five rules by default (maximum twenty). No hooks
inject context automatically. Explicit user instructions and project policy win
over conflicting lessons. Stale reviews warn after 180 days but remain active
until reviewed or retired.

## Capture → review → accept → retire

```bash
python3 scripts/instincts.py propose keyboard-path \
  --trigger "when reviewing UI keyboard behavior" --domain frontend --scope react \
  --action "Verify focus order and Escape behavior before reporting completion." \
  --source local-review --evidence "Two dialog reviews missed keyboard dismissal."
# Read and edit .claude/instincts/keyboard-path.md; test its advice before accepting.
python3 scripts/instincts.py accept keyboard-path --reviewed-by maintainer
python3 scripts/instincts.py retire keyboard-path --reviewed-by maintainer
```

Capture only a sanitized lesson and evidence summary, not raw transcripts, secrets,
or customer data. This CLI is not a secret scanner. Proposals are local files;
inspect them before committing. Existing IDs are never overwritten by `propose`.
`accept` is the explicit promotion step, not an automatic follow-up to capture.
Retirement preserves the file; a revised retired lesson needs a new ID.

For shared kit rules, use `./bootstrap.sh instincts COMMAND --directory
templates/shared/agent/instincts` from the kit root. For project rules, use the
copied script above. Promoting a project lesson to the kit is a separate manual
review: remove project-specific assumptions and preserve attribution first.

Frontmatter is deliberately limited to one scalar per line. The CLI writes JSON
quoted strings (valid YAML); plain and single-quoted scalars remain supported.
Nested YAML, lists, and multiline scalars are not supported. Existing custom
rules need the new required fields before using the selector/checker.

## Writing new ones

Two ways, both worth doing:

1. **Hand-authored** — after a review catches the same class of mistake twice,
   write the rule instead of repeating the comment.
2. **Repo-derived** — ask an agent to read the last N commits and the dominant
   patterns in a layer, then emit instincts with `source: local-repo-analysis`
   and an `## Evidence` section. Review each one: derived rules describe what the
   codebase *does*, which is not always what it *should* do.
