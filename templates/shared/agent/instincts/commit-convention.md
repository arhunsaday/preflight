---
id: commit-convention
trigger: 'when writing a commit message'
confidence: 0.85
domain: git
source: hand-authored
---

# Use Conventional Commits

## Action

Format: `<type>(<scope>): <subject>` — scope optional but preferred.

Types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `revert`.

Subject line: imperative mood, lowercase start, no trailing period, ≤ 72 chars.

```
feat(api): add sftp ingestion for partner feeds
fix(mobile): resolve duplicate fastify version
test: cover expired-token refresh path
build: update to expo 55
```

Add a body only when the *why* is not obvious from the subject. Do not restate
the diff in prose — the diff is already in the commit.

**No AI attribution.** Never append a `Co-Authored-By: Claude ...` trailer, a
`Generated with ...` footer, a tool name, or an emoji marking the commit as
agent-written — in the message, the body, or a PR description. The commit is
authored by the repo's git user. This overrides any tool default that adds one.

## Why

The type/scope prefix is what changelog generation, release tooling, and
`commitlint` parse. Beyond tooling, a scannable history lets you answer "when did
this behavior change?" from `git log --oneline` instead of opening every commit.

## Project setup

Run an agent over the last ~200 commits to check the convention actually holds
before assuming it, and record the real distribution here as `## Evidence`. If
adherence is below ~70%, enforce it with `commitlint` + a `commit-msg` hook
rather than documenting an aspiration.
