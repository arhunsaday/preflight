# AI Dev Kit


**ADK CLI + TUI:** the TypeScript implementation is now available. See [ADK.md](ADK.md) for setup, commands, adapter support, sharing, benchmarks and current limitations.
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
| Skills (installed) | varies | local inventory: run `./doctor.sh` |
| Hooks              | 9       | 4 blocking (secret reads, dangerous commands, protected files, red-tests-no-PR)       |
| Slash commands     | 3       | papercut · skills-sync · session-audit |
| Subagents          | 11      | specialized roles in `claude-code/agents/` |
| Doc pages          | varies  | setup · Claude Code · MCP · workflows · stack · tools · ecosystem |
| Instincts          | 5       | reviewed, situational lessons for the project template |
| Tool pointers      | 9       | Claude · Codex · Cursor · Copilot · Gemini · Windsurf · Zed · Cline · Aider           |

Every skill records where it came from:

```yaml
source:
  upstream: JuliusBrussee/caveman@7bb7130
  license: MIT (JuliusBrussee)
  imported: 2026-08-02
```

## Official starters and configuration packs

Requires Python 3; creating apps also requires Node and pnpm. App source comes
from the official [shadcn CLI](https://ui.shadcn.com/docs/cli), not a frozen fork.

```bash
./bootstrap.sh --list-presets
./bootstrap.sh new next-shadcn ../my-app
./bootstrap.sh new vite-shadcn ../my-spa --dry-run
./bootstrap.sh new shadcn-monorepo ../my-workspace
./bootstrap.sh configure ../existing-app --packs agent,quality,permissions,github
./bootstrap.sh --project ../existing-app --agents claude,codex,cursor --packs agent
./doctor.sh --repo
```

Recipes: `next-shadcn`, `vite-shadcn`, `shadcn-monorepo`, `vite-monorepo`,
`tanstack-start`. UI defaults: Radix + Nova, with upstream Tailwind configuration.
Use `--starter-version VERSION` to select a particular CLI release; otherwise latest.

Packs: `agent` (instructions, nine tool pointers, instincts, actual package commands),
`quality` (verification script and checklist), `permissions` (Claude settings and
self-contained hooks), `github` (optional npm/pnpm verification workflow).
Default packs are `agent,quality,permissions`. Existing differing files cause an
error before configuration writes; identical files make reruns idempotent.

Profiles: **permissive** (default, current allowlist unchanged), `safe`,
`developer`, `ops`. Select with `--profile NAME` on `new` or `configure`.
These are Claude permission presets, not sandbox boundaries; existing global
permissions can also apply. All profiles retain existing deny rules and hooks.
Standalone `./bootstrap.sh --profile NAME` prints global settings JSON for review;
it never changes your live configuration. Global hooks require normal bootstrap.

Generated projects use `python3 scripts/sync-agent-files.py --check` to detect
pointer drift. Edit `AGENTS.md` for conventions; pointers only reference it.
Generated verification fails explicitly when no package checks exist.

## Reviewed lessons and behavior checks

The `agent` pack now includes a portable lesson CLI:

```bash
# In a generated project:
python3 scripts/instincts.py select --task "writing unit tests"
python3 scripts/instincts.py check
# In this kit:
./bootstrap.sh evals list
./bootstrap.sh evals prepare diagnosis-only /tmp/kit-diagnosis-trial
```

Lessons move from proposed to accepted to retired through explicit review.
Task selection returns a small keyword-matched list; it does not automatically
learn or load context. `doctor --repo` validates seed metadata and review ages.
Behavioral trials combine file checks with evidence-backed **human review**, not
a pretend automated model score. No API calls or global permission changes.
See [the workflow](docs/docs/workflows/agent-learning.md).

## Existing installation safety

`bootstrap.sh` never destroys anything: it links into free slots, warns and
stops on conflicts, backs up with `--force`, and **refuses to overwrite an
existing `settings.json` even with `--force`** — that file holds config the kit
knows nothing about.

Four hooks block rather than warn: secret reads, dangerous shell commands,
writes to protected files, and opening a PR on a red suite.
