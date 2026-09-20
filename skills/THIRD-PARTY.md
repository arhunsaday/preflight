# Third-party skills

Skills other people maintain. **None of them are copied into this repo.** They
are installed and updated by the [`skills`](https://github.com/vercel-labs/skills)
CLI, and the resulting `skills-lock.json` is what gets committed.

## Why not vendor them

Vendoring is how the first fifteen skills in this kit ended up frozen at
`agent-compass@0.7.0` from 30 July while upstream moved to `0.9.3` — two minor
versions and thirty-odd new skills away — with nothing in the repo recording
that a newer version existed. A copied file has no upstream. A lockfile entry
does.

The split:

| | Where | Updated by |
| --- | --- | --- |
| **Skills I own** | [`claude-code/skills/`](../claude-code/skills/) | me, in git |
| **Skills others own** | `~/.claude/skills/` via the CLI | `npx skills update` |

Never edit an installed third-party skill in place — the next update silently
reverts it. Fork it into `claude-code/skills/` instead and set `source: upstream:`
to where it came from.

## The CLI

```bash
npx -y skills@latest add <owner>/<repo>          # install (interactive picker)
npx -y skills@latest add <owner>/<repo> --all    # all skills, all agents, no prompts
npx -y skills@latest add <owner>/<repo> -s name  # just one
npx -y skills@latest add <owner>/<repo> -l       # list what's in there, install nothing
npx -y skills@latest list                        # what's installed, and from where
npx -y skills@latest update -y                   # update everything
npx -y skills@latest find [query]                # search the registry
npx -y skills@latest use <repo>@<skill>          # one-shot prompt, no install
npx -y skills@latest experimental_install        # restore from skills-lock.json
```

`-g` installs globally (`~/.claude/`), which is the default for this setup.
Project-scoped installs land in the repo's `.claude/`.

Browse at **[skills.sh](https://www.skills.sh/)**. `/skills-sync` runs the
update and reports what actually changed in the instructions, which matters —
a skill is a prompt, so a changed prompt is changed behaviour.

## Currently installed

Tracked in `~/Dotfiles/skills-lock.json`.

| Skill | Source |
| --- | --- |
| `api-and-interface-design` | `addyosmani/agent-skills` |
| `browser-testing-with-devtools` | `addyosmani/agent-skills` |
| `ci-cd-and-automation` | `addyosmani/agent-skills` |
| `code-review-and-quality` | `addyosmani/agent-skills` |
| `code-simplification` | `addyosmani/agent-skills` |
| `constraint-driven-development` | `addyosmani/agent-skills` |

## Recommended, not yet installed

Verified 2026-09-20. Star counts in this ecosystem are noisy — these are ordered
by how useful they are to *this* setup, not by popularity.

### Engineering

```bash
npx -y skills@latest add addyosmani/agent-skills          # ★97k — the rest of the set
npx -y skills@latest add anthropics/skills                # official: docx, pptx, xlsx, pdf, artifacts
npx -y skills@latest add mattpocock/skills                # ★200k — TypeScript, very active
npx -y skills@latest add obra/superpowers                 # tdd, brainstorming, debugging
```

### Design

```bash
npx -y skills@latest add elayadesign/ai-design-skills
npx -y skills@latest add jakubkrehel/skills -s better-ui
npx -y skills@latest add dmmulroy/anti-slop               # oxlint rules against low-evidence code
npx -y skills@latest add s1dashu/ip-as-logo-skill         # logo generation from a described IP
```

### Infrastructure

```bash
npx -y skills@latest add LukasNiessen/kubernetes-skill    # k8s for Claude Code + Codex
```

Pair that last one with [`k8sgpt`](https://github.com/k8sgpt-ai/k8sgpt) (★8k) —
a CLI that diagnoses a cluster and explains failures in plain language. Not a
skill; a tool the skill can call.

### Catalogs to mine

| List | Contents |
| --- | --- |
| [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | Curated skills, resources, tooling |
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | 1000+ skills from official and community sources |
| [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | 21 categories: hooks, statuslines, orchestration, memory |
| [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) | MCP servers |
| [wshobson/agents](https://github.com/wshobson/agents) | Multi-harness subagent marketplace |
| [sickn33/agentic-awesome-skills](https://github.com/sickn33/agentic-awesome-skills) | Local agent-first control plane |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | Copilot instructions, agents, skills |
| [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | A single CLAUDE.md, widely copied. Read, don't install — no commits since April |

Finding things across all of them:

```bash
npx -y skills@latest find "<topic>"
npx -y skills@latest find --owner anthropics
```

## Before installing anything

A skill is a **prompt that runs with your tool permissions**. Read the
`SKILL.md` before installing, exactly as you would read a shell script before
piping it to `bash`. Check in particular: what `allowed-tools` it requests, and
whether it instructs the agent to run network commands or write outside the
project.
