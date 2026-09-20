---
sidebar_position: 1
slug: /
title: Intro
---

# Intro

My AI development setup, versioned. Skills, hooks, slash commands, subagents,
MCP configuration, and the workflows around them — installed onto a machine with
one script, dropped into a project with another.

## The idea

Three kinds of thing, three different lifecycles, and mixing them is what makes
a setup rot:

|                         | Lives in                          | Updated by                        |
| ----------------------- | --------------------------------- | --------------------------------- |
| **What I own**          | this repo, in git                 | me                                |
| **What others own**     | `~/.claude/` via the `skills` CLI | `npx skills update`               |
| **What a project owns** | the project's own repo            | copied in once, then edited there |

The first fifteen skills here arrived by copy-paste and froze at a version two
releases behind upstream, with nothing recording that a newer one existed. The
split above exists so that cannot happen again.

## Start here

- **[Install](setup/install)** — get it onto a machine
- **[What lands where](setup/what-lands-where)** — the map
- **[Claude Code fundamentals](claude-code/fundamentals)** — models, context, the mechanisms
- **[Beyond vibecoding](beyond-vibecoding)** — what you still have to know

## What is in it

| Area                                                 | Contents                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Skills](claude-code/skills)                         | 24, in 6 categories, each with recorded provenance                                     |
| [Hooks](claude-code/hooks)                           | 9 — secret blocking, dangerous-command blocking, format, lint, test, audit log, sounds |
| [Commands & agents](claude-code/commands-and-agents) | 3 slash commands, 3 subagents                                                          |
| [MCP](mcp/)                                          | My servers, plus the ones worth adding                                                 |
| [Workflows](workflows/planning)                      | Planning, architecture, coding, debugging, review, devops, observability               |
| [Stack notes](stack/frontend)                        | Frontend, backend, devops, AI — what to use with each                                  |

## Official documentation

This site is deliberately thin. Where Anthropic documents something, it links
there rather than paraphrasing it into staleness.

- [Claude Code docs](https://code.claude.com/docs/en/overview)
- [Best practices](https://code.claude.com/docs/en/best-practices)
- [Prompt engineering](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview)
- [Model Context Protocol](https://modelcontextprotocol.io)
