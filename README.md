# AI Dev Kit

My AI development setup, versioned: skills, hooks, slash commands, subagents,
MCP configuration, project templates, and the documentation around them.

```bash
git clone https://github.com/arhunsaday/ai-dev-kit ~/Repos/ai-dev-kit
cd ~/Repos/ai-dev-kit && ./bootstrap.sh
```

Full documentation: at [https://ai.arhun.fr](https://ai.arhun.fr).

## The three lifecycles

Mixing these is what makes a setup rot, so the kit keeps them apart:

|                         | Lives in                          | Updated by                                  |
| ----------------------- | --------------------------------- | ------------------------------------------- |
| **What I own**          | `claude-code/` here               | me, in git                                  |
| **What others own**     | `~/.claude/` via the `skills` CLI | `npx skills update`                         |
| **What a project owns** | the project's repo                | `bootstrap.sh --project`, then edited there |

The first fifteen skills in this repo arrived by copy-paste and froze two
versions behind upstream with nothing recording that a newer one existed. That
is the mistake the split prevents.

## Layout

```
ai-dev-kit/
├── bootstrap.sh                 install / --project / --unlink / --dry-run
├── claude-code/                 → symlinked into ~/.claude/
│   ├── CLAUDE.md                global instructions (every session, every project)
│   ├── settings.json            hooks + statusline + permissions (merge by hand)
│   ├── skills/                  51 skills in 9 categories
│   ├── hooks/                   9 hooks — see hooks/README.md
│   ├── commands/                /papercut  /skills-sync  /session-audit
│   ├── agents/                  explorer · reviewer · security
│   └── statusline/              repo · branch · model · diff · context gauge
├── skills/                      THIRD-PARTY.md + install-third-party.sh (reproducibility)
├── prompts/  standards/         paste-anywhere prompts · language conventions
├── templates/shared/agent/      project drop-in (AGENTS.md, instincts, git hooks)
└── docs/                        Docusaurus site (Vercel)
```

## What is in it

|                    | Count   |                                                                                       |
| ------------------ | ------- | ------------------------------------------------------------------------------------- |
| Skills (mine)      | **51**  | communication · delivery · quality · architecture · design · stack · ai · ops · tools |
| Skills (installed) | **103** | in the shared `~/.agents/skills/` store — read by ~50 agents                          |
| Hooks              | 9       | 4 blocking (secret reads, dangerous commands, protected files, red-tests-no-PR)       |
| Slash commands     | 3       | papercut · skills-sync · session-audit |
| Subagents          | 3       | explorer (sonnet) · reviewer (opus) · security (opus)                                 |
| Doc pages          | **34**  | setup · Claude Code · MCP · workflows · stack · tools · ecosystem                     |
| Instincts          | 6       | context-triggered rules for the project template                                      |
| Tool pointers      | 9       | Claude · Codex · Cursor · Copilot · Gemini · Windsurf · Zed · Cline · Aider           |

Every skill records where it came from:

```yaml
source:
  upstream: JuliusBrussee/caveman@7bb7130
  license: MIT (JuliusBrussee)
  imported: 2026-08-02
```

## Safety

`bootstrap.sh` never destroys anything: it links into free slots, warns and
stops on conflicts, backs up with `--force`, and **refuses to overwrite an
existing `settings.json` even with `--force`** — that file holds config the kit
knows nothing about.

Four hooks block rather than warn: secret reads, dangerous shell commands,
writes to protected files, and opening a PR on a red suite.
