# Multi-tool compatibility

One canonical contract, thin pointers for every tool. The contract is
**`AGENTS.md`**; everything below points at it and adds only what is specific to
its own tool.

| Tool | File | Notes |
| --- | --- | --- |
| **Claude Code** | `CLAUDE.md` | Also reads `AGENTS.md` natively |
| **Codex** (OpenAI) | `AGENTS.md`, `CODEX.md` | `AGENTS.md` is its *native* format — nothing to translate |
| **Cursor** | `.cursor/rules/project.mdc` | MDC with `alwaysApply: true`. Legacy `.cursorrules` still works but is deprecated |
| **GitHub Copilot** | `.github/copilot-instructions.md` | Plus scoped `.github/instructions/<area>.instructions.md` with an `applyTo:` glob |
| **Gemini CLI** | `GEMINI.md` | |
| **Windsurf** | `.windsurfrules` | |
| **Zed** | `.rules` | Zed reads `AGENTS.md` too in recent versions |
| **Grok / xAI** | `AGENTS.md` | Grok Code follows the `AGENTS.md` convention |
| **Cline / Roo** | `.clinerules` | |
| **OpenCode** | `AGENTS.md` | Native |
| **Aider** | `CONVENTIONS.md` | Add with `--read CONVENTIONS.md` |

## Why `AGENTS.md` is the anchor

It is the closest thing to a cross-vendor standard — Codex, OpenCode, Zed, Grok
and Claude Code all read it directly, and the others need only a two-line
pointer. Putting the conventions anywhere else means translating them N times
and watching the copies drift.

## Generating the pointers

`sync-agent-files.sh` in this folder writes every pointer file from the single
`AGENTS.md`, so adding a tool is one line rather than another file to maintain:

```bash
./sync-agent-files.sh            # write every pointer
./sync-agent-files.sh --check    # CI: fail if a pointer drifted
```

## What does NOT transfer

| Feature | Claude Code | Elsewhere |
| --- | --- | --- |
| Skills (`SKILL.md`) | yes | Copilot and Cursor have their own shapes; `npx skills` installs to several |
| Hooks | yes | Cursor has hooks; most others have nothing |
| Subagents | yes | Copilot has agents; Cursor has background agents |
| MCP | yes | Cursor, Codex, Copilot, Gemini, Windsurf — all yes, different config files |

MCP is the most portable capability in the list. Hooks are the least.
