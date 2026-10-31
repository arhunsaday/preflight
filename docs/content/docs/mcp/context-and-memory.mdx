---
title: "Context & memory servers"
---
Two different problems, often confused.

| | Problem it solves | Lifetime |
| --- | --- | --- |
| **Dual Graph / GrapeRoot** | *Where in this codebase is the thing I need?* | per query |
| **ProjectMem** | *What did we decide, and what already failed?* | across sessions |

A structural index stops the agent grepping its way through the repo. A memory
store stops it re-deciding what was decided last month. Neither replaces the
other.

## GrapeRoot (Dual Graph MCP)

A local codebase intelligence layer — "the context layer for AI coding agents".
It builds a dual graph of the repository so the agent asks for the files that
matter instead of exploring.

### Install

```bash
curl -sSL https://graperoot.dev/install.sh | bash
source ~/.zshrc
graperoot .            # in the project root
```

**Keep that terminal open.** The launch command starts the local MCP server and
stays attached; closing the window stops the server. It writes the MCP config
for the agents it detects (Claude Code, Codex, Cursor, Gemini CLI, Copilot,
OpenCode, Antigravity).

Read the install script before piping it to `bash` — the same rule as any
`curl | bash`.

### The tool loop

```
graph_continue          → recommended files + dependency paths (call this FIRST)
graph_scan <pwd>        → if it returns needs_project=true
graph_read file::symbol → one call per file, never batched, notation verbatim
graph_register_edit     → after editing, with the changed files
```

The rule that makes it pay off: **`graph_continue` before any grep, glob or
file read.** Used after exploration it adds a round trip and saves nothing.

### Fallback

When it is unavailable, say so explicitly and degrade deliberately:

> Dual Graph MCP unavailable: `<reason>`. Falling back to targeted reads/search.

Then: no broad refactors, no recursive exploration, read only the exact files the
task needs.

### Tokens

`DUAL_GRAPH_MCP_URL` and `DUAL_GRAPH_MCP_TOKEN` come from a secret manager or a
local env file. Never committed.

Site: [graperoot.dev](https://graperoot.dev/) · setup: [graperoot.dev/setup](https://graperoot.dev/setup)

## ProjectMem

Open-source durable memory for coding agents — decisions, failed attempts,
gotchas, validation results, carried across sessions.

### Install

```bash
uv venv .venv --python python3          # Python 3.10+
uv pip install --python .venv/bin/python projectmem
.venv/bin/pjm init
```

### MCP config

```json
{
  "mcpServers": {
    "projectmem": {
      "command": "/absolute/path/to/repo/.venv/bin/python",
      "args": ["-m", "projectmem.mcp_server", "--root", "/absolute/path/to/repo"]
    }
  }
}
```

Machine-local paths — keep this out of the committed `.mcp.json`, or ship it as
`.mcp/projectmem.example.json` and let each dev copy it.

### Daily loop

```bash
.venv/bin/pjm brief       # before work — what do we already know
.venv/bin/pjm precheck    # warnings that apply to what you are about to touch
.venv/bin/pjm search <t>  # targeted lookup
.venv/bin/pjm decision …  # log an architectural choice
.venv/bin/pjm note …      # log a gotcha
```

### Files

```
.projectmem/
├── events.jsonl      # append-only log — the source of truth
├── summary.md        # DERIVED. never edit by hand; regenerated on each event
├── PROJECT_MAP.md    # structural. DO edit directly
├── policy.md         # what may and may not be logged
└── config.toml
```

`summary.md` is generated — edits are overwritten on the next event.
`PROJECT_MAP.md` is not, and its `## Project purpose` section is copied into the
summary on regeneration.

### What never goes in

Secrets, credentials, tokens, private keys, personal data, raw customer data,
and half-formed brainstorming. A memory store is read by every future session;
anything in it is effectively permanent.

Site: [projectmem.dev](https://projectmem.dev/)

## Alternatives

- [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) — persistent
  context as a plugin, no Python venv
- [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)
  — index-based, closer to GrapeRoot than to ProjectMem
