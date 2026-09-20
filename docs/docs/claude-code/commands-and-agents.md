---
sidebar_position: 4
---

# Slash commands & subagents

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
| `/plan-challenge [topic]` | Interviews you with `AskUserQuestion`, challenges your assumptions, writes a plan another agent can execute |
| `/papercut [friction]` | Logs small frictions to `PAPERCUTS.md` — the retries, undocumented steps, misleading errors |
| `/skills-sync` | Updates third-party skills and reports what changed **in the instructions**, not just version numbers |

`/papercut` is worth the habit. None of those frictions deserve a ticket
individually; together they show exactly where a repo needs sanding down.

### Skill vs command

| | Fires when | Use for |
| --- | --- | --- |
| **Skill** | the model decides its description matches | capabilities that should apply automatically |
| **Command** | you type it | procedures you want to trigger deliberately |

A procedure you want *control* over is a command. `/plan-challenge` is a command
because planning should never start on its own.

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
