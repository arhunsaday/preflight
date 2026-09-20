# Plan — a TUI for managing an AI development setup

**TL;DR.** SkillDock and bridle already cover installation, sync and
multi-harness translation; competing there is a losing trade. The unclaimed
ground is everything *around* installing: deciding what to install and why,
auditing a setup that already exists, retrofitting a legacy repo, and sharing
what a team learns. Build the spine in three weeks, the wedge in six, and treat
every integration as replaceable — the integration treadmill is what kills
projects in this space, not missing features.

---

## 1. Who already does what

| Tool | ★ | Form | Covers | Leaves open |
| --- | --- | --- | --- | --- |
| **SkillDock** | 586 | Desktop (macOS/Win) | Skills, MCP, plugins · **30+ agents** · marketplaces (skills.sh, ClawHub, MCP.Directory) · git-aware sync with diff/push · team publishing | No TUI, no role-based selection, no audit, no project bootstrap, no secret scanning |
| **bridle** | 440 | TUI + CLI (Rust) | Skills, agents, commands, MCP, profiles · 6 harnesses · **format translation** · profile diff | Uninstall experimental, TUI incomplete, no sync, no discovery, no wizard |
| **mcpm.sh** | 1006 | CLI | MCP only, but deep: registry, 10+ clients, profiles, usage analytics, `share` tunnels | MCP only |
| **treg** | 1730 | Registry + proxy | Agent tool credentials, 3000+ endpoints, team secrets held server-side, self-hostable | Not a config manager |
| **skillreaper** | 57 | CLI | Prune by **measured usage**, quarantine + restore | Cannot install |
| **`npx skills`** | — | CLI | Skills install/update into a store 47 agents read | Skills only |

**The read.** SkillDock plus bridle already deliver roughly 60% of the surface
described. What nobody offers: selection by role and stack, auditing an existing
setup, retrofitting an existing repo, installable workflows, and team knowledge
that is not just shared files.

That gap is the product. Everything else is table stakes you should acquire as
cheaply as possible — ideally by shelling out to the tools above rather than
reimplementing them.

---

## 2. The feature inventory

Everything discussed, grouped by what it actually is. Priorities in §3.

### Configuration

Profiles by permission posture. **Loadouts by role × stack** — the prototype in
`claude-code/loadouts.json`. Per-project versus global scope. Format translation
across harnesses. Diffing two setups. Import from an existing machine.

### Discovery and installation

Search across skills.sh, the MCP registry, ClawHub, MCP.Directory and GitHub.
Install skills, MCP servers, subagents, hooks, slash commands, plugins,
statuslines. Install **desktop and CLI tools too** — Graft, k8sgpt, gitleaks,
act, trivy — not only agent artifacts. Version pinning, update checking,
uninstall, rollback.

### Audit and improvement

Doctor: what is installed, wired, broken, missing. **Usage measurement** — which
skills actually fire, as skillreaper does. Prune proposals with reasons. Context
cost accounting. Conflict detection: two skills claiming one trigger. Security
posture: permissions too wide, hooks missing, secrets reachable.

### Project lifecycle

Bootstrap a new repo with the agent contract. **Retrofit an existing repo** —
detect stack, generate `AGENTS.md` and the command registry from what is really
there. Per-project skills and MCP. Git hooks. CI wiring.

### Workflows

Installable loop patterns: CI sweeper, PR babysitter, dependency sweeper, issue
triage, changelog drafter. **L1 → L2 → L3 maturity** — report-only, then
assisted, then unattended. Scheduling. Run history and cost per loop. Launching
a PR review.

### Team and cloud

Auth and joining a team. Shared catalog of approved skills and MCP configs.
Config sync across machines. **Shared papercuts** and instincts, so one person's
friction becomes everyone's rule. Credential-leak detection across configs.
Policy: what an organisation forbids. Usage and cost visibility.

### Knowledge

Prompt library. DESIGN.md catalogue. Agentic pattern catalogue. Context
engineering guides. Per-stack starter kits.

---

## 3. Priorities

### P0 — the spine, without which nothing else matters

**A state model and a resolver.** One declarative file describes the desired
setup; the tool computes the difference against reality and applies it. Every
other feature is a producer or consumer of that file. Get this wrong and
everything built on top inherits the mistake.

**Read-only first.** Detect and report before writing anything: which agents are
on this machine, what is installed, what is broken. This is also the cheapest
thing to ship and the fastest way to learn whether the model is right.

**Apply with dry-run, diff and rollback.** Never a write without a preview.
Quarantine rather than delete, as skillreaper does.

**Adapters as a boundary.** Each harness behind one interface; an adapter that
fails degrades to "this harness is unsupported today" rather than breaking the
run. This single decision is what keeps the integration treadmill survivable.

### P1 — the wedge

**Loadouts.** Role × stack → an explained set. The prototype already resolves,
composes and validates; it needs an installer behind it.

**Doctor.** Audit plus measured usage plus prune proposals. This is the feature
with no competitor and immediate value on day one, because everyone reading this
already has a setup that has rotted.

**Retrofit.** Point it at an existing repo: detect the stack, generate the
contract and the command registry, propose the right project-scoped skills.
SkillDock cannot do this and it is the first thing a new user actually wants.

**Search and install across registries.** Table stakes — but delegate: `npx
skills` for skills, `mcpm` for MCP. Ship the aggregated search, not a new
package manager.

**Workflows with maturity levels.** Nobody packages loop patterns. The L1→L3
progression is the part that makes them safe enough to adopt.

### P2 — team and cloud

**Sync via a git repo first**, not a server. Most of the value, none of the
backend. A hosted option can come later for people who will not run a repo.

**Shared papercuts and instincts.** The genuinely novel idea in the whole plan:
a team's frictions compound into rules automatically. Nothing else does this.

**Secret scanning across agent configs.** Narrow, valuable, and a natural
enterprise wedge — MCP config files are full of tokens and nobody is looking.

**Auth, org policy, approved catalogue.** Only once a team is actually asking.

### P3 — after evidence

Hosted backend. Cost analytics. Marketplace. Anything with a billing
relationship attached.

---

## 4. Decisions that determine whether this survives

**The integration treadmill is the real risk.** Six harnesses, each free to
change its config format. The mitigation is architectural: adapters behind one
interface, a conformance test per adapter, and a product that stays useful when
one is stale. Say out loud which harnesses are supported and which are
best-effort.

**Delegate installation.** `npx skills`, `mcpm`, `brew`. Every package manager
reimplemented is a permanent maintenance cost for a commodity.

**A setup tool optimises for installing more; the data says the problem is the
opposite.** Measured on this machine: 96 skills loaded, 3 ever invoked. If the
wizard's success metric is "things installed", it makes users worse. Make the
measured number visible in the UI from the first release.

**TUI or desktop.** SkillDock is a desktop app and that is a real advantage for
discovery. A TUI wins on being where the developer already is, and on
scriptability. Ink is the right choice if the CLI is the product and the TUI is
a view over it — which it should be, because everything must be automatable.

**Every write must be reversible**, because you will get defaults wrong for
somebody's setup.

---

## 5. Catalogue seeding

What the tool should be able to install, drawn from the lists worth mining.

| Source | ★ | What to take |
| --- | --- | --- |
| [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | 117k | **73+ DESIGN.md files** from real sites (Vercel, Figma, Apple). Nine sections each — palette, typography, components, elevation, do/don't. Directly installable per project |
| [prompts.chat](https://github.com/f/prompts.chat) | 171k | The prompt library, for the prompts feature |
| [awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) | 25k | **100+ specialised subagents.** The single best catalogue for the subagent gap |
| [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) | 41k | Rules by stack — the seed for per-stack project contracts |
| [awesome-agentic-patterns](https://github.com/nibzard/awesome-agentic-patterns) | 5k | **~50 patterns in 5 groups** — see below |
| [awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) | 139k | Reference implementations: agents, RAG, multi-agent teams, memory, voice |
| [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | 54k | 21 categories — the closest thing to a taxonomy for the catalogue itself |
| [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) | 95k | MCP catalogue |
| [awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) · [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | 75k · 35k | Skills, breadth |
| [awesome-copilot](https://github.com/github/awesome-copilot) | 37k | Copilot instructions, agents, skills |
| [awesome-vibe-coding](https://github.com/filipecalegario/awesome-vibe-coding) · [Awesome-Context-Engineering](https://github.com/davidkimai/Awesome-Context-Engineering) | 5k · 3k | Practices and context guides, for the knowledge section |
| [agentation.com](https://www.agentation.com/) | — | Broader agent tooling directory |

**The pattern catalogue is the most under-exploited of these.** ~50 named
patterns across Orchestration (plan-then-execute, sub-agent spawning,
budget-aware routing with hard cost caps, multi-agent debate), Context (budget
as a governed resource, auto-compaction, dynamic injection, semantic filtering),
Reliability (agent circuit breaker, output verification loop, evals with mocked
tools, canary rollout with automatic rollback), Tool Use (progressive discovery,
code-over-API, LLM-friendly API design) and Human-in-the-Loop (approval
frameworks, chain-of-thought interruption, team-shared agent configuration as
code).

Those are exactly the "workflows, not configuration" the tool is supposed to
install, and they already have names other people use.

---

## 6. Sequence

**Weeks 1–3, the spine.** State model, detection, doctor read-only, two adapters
(Claude Code and one other) behind the interface. Ship the CLI. No TUI yet.

**Weeks 4–6, the wedge.** Loadouts with an installer. Retrofit. Aggregated
search delegating to existing package managers. The TUI as a view over commands
that already work.

**Weeks 7–10, compounding.** Workflows with maturity levels. Git-based sync.
Measured pruning. Catalogue seeded from §5.

**After that, only with evidence.** Team features when a team asks. A backend
when git sync provably is not enough.

**The checkpoint at week 3:** does the doctor tell you something about your own
setup that you did not know? If not, the state model is wrong and no amount of
TUI will rescue it.

---

## 7. What to verify before building

A few assumptions worth testing in an afternoon each, because each one can
invalidate a chunk of the plan.

Can one config format really express six harnesses, or does translation lose
something that matters? Build the adapter interface against Claude Code and one
very different harness before committing.

Will anyone accept a loadout someone else wrote? Show `loadouts show
junior-frontend --explain` to two developers and watch whether they argue with
the reasons or ignore them.

Is git-based sync enough? Try it across two machines for a week before designing
a backend.

Does measured pruning agree with judgement? Run skillreaper next to
`registry.json` and compare. The prototype's parking list was opinion; if the
measurement disagrees sharply, the loadout reasons need revisiting too.
