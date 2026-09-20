# ai-dev-kit

My AI development setup, versioned: skills, hooks, slash commands, subagents,
MCP configuration, project templates, and the documentation around them.

```bash
git clone https://github.com/arhunsaday/ai-dev-kit ~/Repos/ai-dev-kit
cd ~/Repos/ai-dev-kit && ./bootstrap.sh
```

Full documentation: **`cd docs && npm start`** (Docusaurus).

## The three lifecycles

Mixing these is what makes a setup rot, so the kit keeps them apart:

| | Lives in | Updated by |
| --- | --- | --- |
| **What I own** | `claude-code/` here | me, in git |
| **What others own** | `~/.claude/` via the `skills` CLI | `npx skills update` |
| **What a project owns** | the project's repo | `bootstrap.sh --project`, then edited there |

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
│   ├── skills/                  24 skills in 6 categories
│   ├── hooks/                   9 hooks — see hooks/README.md
│   ├── commands/                /plan-challenge  /papercut  /skills-sync
│   ├── agents/                  explorer · reviewer · security
│   └── statusline/              repo · branch · model · diff · context gauge
├── skills/THIRD-PARTY.md        what the CLI manages, and what to add
├── templates/shared/agent/      project drop-in (AGENTS.md, instincts, git hooks)
└── docs/                        the documentation site
```

## What is in it

| | Count | |
| --- | --- | --- |
| Skills | 24 | communication · delivery · quality · architecture · design · tools |
| Hooks | 9 | 4 blocking (secrets, dangerous commands, protected files, red-tests-no-PR) |
| Slash commands | 3 | plan-challenge · papercut · skills-sync |
| Subagents | 3 | explorer (sonnet) · reviewer (opus) · security (opus) |
| Doc pages | 30 | setup · Claude Code · MCP · workflows · stack · tools |
| Instincts | 5 | context-triggered rules for the project template |

Every skill records where it came from:

```yaml
source:
  upstream: JuliusBrussee/caveman@7bb7130
  via: me-cedric/agent-compass@0.7.0 -> +Work/parcus-plus@391e7f7
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

## Credits

Much of the delivery and quality tooling originates in
[me-cedric/agent-compass](https://github.com/me-cedric/agent-compass), reaching
here via `parcus-plus` and `konvoy-paag`. `caveman` is
[JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) (MIT),
`ponytail` is [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)
(MIT). Per-file provenance is in each `SKILL.md`.
