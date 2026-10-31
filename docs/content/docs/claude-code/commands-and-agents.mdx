---
title: "Slash commands & subagents"
---
## Slash commands

A markdown file in `~/.claude/commands/` becomes `/<filename>`. It is a prompt
template — you invoke it, so it always fires, unlike a skill.

```markdown
---
description: Shown in the / menu
argument-hint: "[what to pass]"
allowed-tools: Read, Grep, Bash
---

Instructions. $ARGUMENTS is substituted.
```

### In this kit

| Command | Does |
| --- | --- |
| `/papercut [friction]` | Logs small frictions to `PAPERCUTS.md` — the retries, undocumented steps, misleading errors |
| `/skills-sync` | Updates third-party skills and reports what changed **in the instructions**, not just version numbers |

`/papercut` is worth the habit. None of those frictions deserve a ticket
individually; together they show exactly where a repo needs sanding down.

### Skill vs command

| | Fires when | Use for |
| --- | --- | --- |
| **Skill** | the model decides its description matches | capabilities that should apply automatically |
| **Command** | you type it | procedures you want to trigger deliberately |

A procedure you want *control* over is a command. `/papercut` is a command
because sweeping a session for frictions should never start on its own.

There was a `/plan-challenge` here. It was cut once `grilling` turned up doing
the same job better — the lesson being to check what is installed before writing
a fourth version of it.

## Subagents

A markdown file in `~/.claude/agents/`. Each runs in **its own context window**
with its own tools and model.

```markdown
---
name: reviewer
description: When to dispatch this agent
tools: Read, Grep, Glob, Bash
model: opus
---

System prompt for the agent.
```

### In this kit

| Agent | Model | For |
| --- | --- | --- |
| `explorer` | sonnet | Read-only search that returns **conclusions**, not file dumps |
| `reviewer` | opus | Correctness, regressions, wiring, tests, docs |
| `security` | opus | Trust boundaries, authz, secrets, data exposure — concrete exploitability only |

### Why they exist

Context economy. The main session should get "auth is wired in
`src/auth/guard.ts:42`, used by 6 modules", not forty files. That is the whole
argument for `explorer`.

House rules (also in `CLAUDE.md`): **never Fable**, **never more than 5 at a
time**, one task each.

### More

[wshobson/agents](https://github.com/wshobson/agents) is a large multi-harness
subagent marketplace worth mining.

## Reference

- [Slash commands](https://code.claude.com/docs/en/slash-commands)
- [Subagents](https://code.claude.com/docs/en/sub-agents)
- [Delegating research to subagents](https://code.claude.com/docs/en/common-workflows#delegate-research-to-subagents)
