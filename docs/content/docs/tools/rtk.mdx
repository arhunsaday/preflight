---
title: "RTK \u2014 token reduction"
---
[rtk-ai/rtk](https://github.com/rtk-ai/rtk) (★81k) — "Rust Token Killer". A CLI
proxy that compresses command output **before the agent reads it**. Claimed
60–90% reduction on bash output across 100+ commands.

## Install

```bash
brew install rtk
```

Alternatives: `cargo install --git https://github.com/rtk-ai/rtk`,
`winget install rtk-ai.rtk`, or the install script (read it first).

## Claude Code integration

```bash
rtk init -g
```

Installs a native hook that transparently rewrites Bash commands —
`git status` becomes `rtk git status` — before execution. **Restart Claude Code
afterwards.** It runs natively on macOS, Linux and Windows with no shell
dependency.

Without the hook, prefix manually. The golden rule from the docs: **prefix every
command, including inside `&&` chains.**

```bash
# wrong
git add . && git commit -m "msg" && git push
# right
rtk git add . && rtk git commit -m "msg" && rtk git push
```

It is always safe: a command RTK has a filter for gets filtered, anything else
passes through unchanged.

## Savings by category

| Category | Commands | Claimed |
| --- | --- | --- |
| Tests | vitest, playwright, cargo test, pytest, jest, go test | **90–99%** |
| Build | cargo build/check, tsc, next build | 80–90% |
| Lint | eslint, biome, clippy, ruff, prettier | 70–84% |
| Package managers | pnpm install/list/outdated | 70–90% |
| GitHub | `gh` commands | 26–87% |
| Containers | docker ps/logs, kubectl | — |

`rtk vitest run` at 99.5% is the headline: it returns **only the failures**,
which is exactly what the agent needs and nothing else.

## The caveat that matters

**`Read`, `Grep` and `Glob` bypass the hook** — they are Claude Code's own
tools, not shell commands. So RTK helps with everything the agent runs in Bash
and nothing it reads natively. Where output volume is the problem, use shell
commands or call `rtk` directly.

Also: savings are on *bash output*, which is one contributor to input tokens.
The bill also carries conversation history, system prompt and output tokens, so
a 90% cut on command output is not a 90% cut on cost. RTK approximates tokens as
`bytes / 4` — it ships no tokenizer.

## Honest placement

RTK attacks the same problem as `/compact`, `.claudeignore` and capped hook
output, from a different angle. Of the four, `.claudeignore` and hook output caps
cost nothing and come first. RTK is worth it once you are running test suites
and builds through the agent all day — which, on this stack, is most days.

## Same authors, worth a look

| Tool | What |
| --- | --- |
| [rtk-ai/icm](https://github.com/rtk-ai/icm) | Permanent memory for AI agents. Single binary, zero dependencies |
| [rtk-ai/grit](https://github.com/rtk-ai/grit) | "Git for AI agents" — parallel agents without merge conflicts |

`grit` is interesting next to git worktrees: same problem, different shape.
