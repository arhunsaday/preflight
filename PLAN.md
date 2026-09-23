# Plan — a TUI for managing an AI development setup

**TL;DR.** The product is a searchable, CRUD-able index of everything an AI
coding setup is made of — skills, MCP servers, subagents, hooks, prompts,
tools — with a scope switch between global and per-project, a share link anyone
can inspect before applying, and enough measurement to tell whether a change
helped. SkillDock and bridle already do installation and multi-harness
translation; the unclaimed ground is *search + scope + share + evidence*. Build
it in TypeScript with Ink so the TUI is a view over a CLI that is fully
scriptable. The integration treadmill is what kills projects here, so every
harness sits behind an adapter that can go stale without breaking the product.

---

## 1. Who already does what

| Tool | ★ | Form | Covers | Leaves open |
| --- | --- | --- | --- | --- |
| **SkillDock** | 586 | Desktop (macOS/Win) | Skills, MCP, plugins · **30+ agents** · marketplaces (skills.sh, ClawHub, MCP.Directory) · git-aware sync with diff/push · team publishing | No TUI, no scope switching, no audit, no share links, no benchmarking |
| **bridle** | 440 | TUI + CLI (Rust) | Skills, agents, commands, MCP, profiles · 6 harnesses · **format translation** · profile diff | Uninstall experimental, TUI incomplete, no sync, no discovery, no wizard |
| **mcpm.sh** | 1006 | CLI | MCP only, but deep: registry, 10+ clients, profiles, usage analytics, `share` tunnels | MCP only |
| **treg** | 1730 | Registry + proxy | Agent tool credentials, 3000+ endpoints, team secrets held server-side, self-hostable | Not a config manager |
| **skillreaper** | 57 | CLI | Prune by **measured usage**, quarantine + restore | Cannot install |
| **`npx skills`** | — | CLI | Skills install/update into a store ~47 agents read | Skills only |

**The read.** SkillDock plus bridle already deliver roughly 60% of the surface.
Nobody offers search across everything, a real scope switch, inspectable share
links, or any way to tell whether a config is better than another one.

Everything else is table stakes to acquire as cheaply as possible — ideally by
shelling out to the tools above rather than reimplementing them.

---

## 2. The core loop

This is the product. Everything in §6 is an extension of it.

```
search  →  inspect  →  install  →  scope  →  verify
```

**Search across every resource type and every source.** Skills (skills.sh,
GitHub), MCP servers (the official registry, MCP.Directory), subagents, hooks,
slash commands, prompts, plugins, statuslines, and **plain tools** — Graft,
k8sgpt, gitleaks, act, trivy. One search box, typed results.

**Inspect before installing.** A skill is a prompt that runs with your tool
permissions; an MCP server returns data straight into your context. Show the
`SKILL.md`, the requested `allowed-tools`, the source repo and its last commit —
*before* the install, not after.

**Full CRUD on everything.** Create, read, update, delete for each resource
type. Editing a skill you own, forking one you do not, duplicating an MCP entry
for a second environment. The current setup cannot do any of this without a text
editor.

**Scope is a first-class operation, not a setting.** Every resource is global
(`~/.claude`, `~/.agents`) or project (`<repo>/.claude`), and **moving one
between scopes is a single action**. This matters more than it sounds: a NestJS
skill loaded globally competes for attention in every Go session and makes every
other match worse. Measured on the reference machine, moving nine stack skills
to project scope removed them from 100% of unrelated sessions.

**Verify after.** Did it land, is it wired, does it conflict with something
already there.

---

## 3. Architecture and stack

### Language and runtime

**TypeScript on Node 22+.** Not a performance decision — the work is filesystem
I/O and JSON. It is an ecosystem decision: the `skills` CLI, the MCP SDK and
most harness tooling are already TypeScript, and `npx adk` gives zero-install
distribution. bridle is Rust and there is no point competing on speed for
something that spends its life reading small files.

### One package, two entry points

```
adk <command>      the CLI — everything is scriptable
adk ui             the TUI — a view over the same commands
```

**The CLI is the product; the TUI is a client of it.** Any action reachable in
the interface must exist as a command with the same name, because the moment the
TUI is the only way to do something, the tool cannot be automated or tested.

### TUI: Ink

[Ink](https://github.com/vadimdemedes/ink) — React for the terminal. Chosen
because the component model fits list/detail/form CRUD screens directly, and
because `ink-testing-library` makes the interface testable, which a hand-rolled
ANSI renderer would not be.

Companions: `ink-text-input`, `ink-select-input`, `ink-table`, `ink-spinner`.

**Known cost, budget for it:** Ink re-renders the whole tree on state change.
A list of 500 skills will flicker and drop frames. Virtualise long lists from
the first screen rather than discovering it at 300 items — it is the one
performance trap in this stack and it is entirely predictable.

### State model

One declarative file describes the *desired* setup; a lockfile records what is
actually installed. Every command computes a diff and applies it.

```
adk.config.json     desired state, committed to git
adk.lock.json       resolved state, what is actually on disk
```

**One Zod schema drives everything** — CLI flag parsing, TUI form validation,
and later the backend API. A single source of truth for shape means a field
added once appears everywhere and cannot drift between layers.

**No local database.** Plain files, readable and diffable in git. The moment a
SQLite file holds state, sync-by-git stops working and you have bought a
migration problem for nothing.

### Adapters — the decision that determines survival

Each harness sits behind one interface:

```ts
interface HarnessAdapter {
  id: string                            // "claude-code", "cursor", "codex"
  detect(): Promise<boolean>            // is it installed on this machine
  paths(): HarnessPaths                 // where its skills/mcp/hooks live
  read(): Promise<HarnessState>         // current state, normalised
  write(plan: Plan): Promise<Result>    // apply, honouring dry-run
  capabilities: Capability[]            // skills? hooks? subagents? mcp?
}
```

Three rules that keep the treadmill survivable:

1. **A conformance test suite per adapter**, run in CI against fixtures.
2. **A failing adapter degrades to "unsupported today"** and never breaks the
   run for other harnesses.
3. **`capabilities` is honest.** Most harnesses have no hook system. The UI must
   grey out what a target cannot do rather than pretending.

Start with Claude Code and one deliberately different harness — Cursor or
Codex — because building the second adapter is what reveals whether the
interface is real or just a description of the first one.

### Installation is delegated

`npx skills` for skills, `mcpm` for MCP, `brew`/`npm` for tools. The product
owns *search, selection, scope and verification*; it does not own package
management. Every package manager reimplemented is a permanent maintenance cost
for a commodity.

### Backend — only for sharing, and only when needed

Nothing else needs a server. Local operation, project config and git sync all
work without one.

When the share service arrives: **Hono on Cloudflare Workers, with KV for short
codes and R2 for payloads**. A share is a small JSON document and a landing
page; that is a Worker and a bucket, not a platform. Postgres only if team
features actually materialise.

---

## 4. Sharing

```bash
adk share                      # → https://adk.sh/s/7f3k2   code: 7f3k2
adk apply 7f3k2 --dry-run      # diff against the current setup
adk apply 7f3k2
```

**The share page shows exactly what it contains before anything is applied** —
every skill with its source repo, every MCP server with its host and required
env vars, every hook with whether it blocks, every prompt. Plus the diff against
the viewer's own setup: what is new, what is already there, what would be
replaced.

A share link that cannot be read before it runs is an invitation to paste
someone else's tool permissions into your machine.

**Secrets never travel.** The payload carries references and config *shape* —
`"GRAFANA_TOKEN": "${GRAFANA_TOKEN}"` — never values. The receiver is told which
variables to supply and where to get them. This is non-negotiable and it should
be enforced by the schema, not by a warning in the docs: a share containing
anything shaped like a credential is rejected at creation.

**Short codes are the actual feature.** A URL is for a link; a code is for
saying out loud in a standup. Six characters, case-insensitive, no ambiguous
glyphs.

**Scope of what can be shared:** a whole config, a loadout, a single skill, an
MCP block, a project drop-in. Expiry optional; public or unlisted; revocable.

---

## 5. Preparing for team and enterprise

Team features are later and paid. The job now is to **not build anything that
blocks them**, which costs almost nothing if decided upfront and is expensive to
retrofit.

- **Every resource has a stable ID and a source URI.** Without this, "the org
  approves these 40 skills" cannot be expressed.
- **The share service is multi-tenant from the first line** — a share belongs to
  an owner, even when there is exactly one owner and no auth. Adding tenancy to
  a single-tenant store later is a migration; having it unused is free.
- **Apply is a pipeline with a policy hook in it**, doing nothing today. Org
  policy later becomes a filter at that point rather than a rewrite.
- **Auth is deferred but not designed away.** When it comes: OIDC through a
  provider. Never homegrown.
- **Audit trail from the start.** Every apply writes what changed, from which
  share, by whom. Cheap now, impossible to backfill.

The natural first paid feature is **secret scanning across agent configs** —
MCP config files are full of tokens and nobody is looking at them. It is narrow,
obviously valuable to a security team, and needs the backend that sharing
already justifies.

---

## 6. Observability, analysis and benchmarking

### Usage measurement

Parse local transcripts, count which skills and MCP tools actually fire. On the
reference machine: **96 skills loaded, 3 ever invoked** across 80 sessions —
3% utilisation, matching skillreaper's own reported figure on its author's
setup.

Surface that number in the UI from the first release. A tool whose success
metric is "things installed" makes its users worse; the measured number is the
correction.

### Config analysis

Context cost per session, in tokens. Trigger conflicts — how many skills claim
the same situation. Security posture: permissions too wide, secrets reachable
via shell when the Read tool is denied, blocking hooks missing. Broken symlinks,
unwired hooks, MCP servers that fail to connect.

This is the doctor, and it has no competitor.

### Benchmarking a config

**The honest state of the art: there isn't one.** Searching for agent benchmark
harnesses returns a field topping out at ★23 — `Swival/calibra`,
`linny006/agent-eval-harness`, `psdhali/agent-evals`. Nothing is established.
SWE-bench Verified is the real standard but needs Docker, hours, and money per
run.

So do not integrate a public benchmark first. **Build a local fixed task set:**
10–20 tasks against a pinned repo, run config A and config B, compare pass rate,
tokens, wall-clock and human interventions.

```bash
adk bench run --config current --tasks ./bench/tasks
adk bench compare current minimal
```

That A/B is the one that matters, because the question is never "is this config
good" but "is it better than the one I had". Public benchmarks come later, if
ever — and the interface should be shaped so one can be plugged in as another
task source.

---

## 7. Priorities

### P0 — the core loop

Search across all resource types and sources. Inspect before install. **CRUD on
skills, MCP servers, subagents, hooks, prompts, tools.** Global ↔ project scope
switching as a first-class action. Config profiles: create, switch, diff. Tool
installation delegated to existing package managers. Dry-run, diff and rollback
on every write. Adapters for two harnesses behind the interface, with
conformance tests.

Read-only detection ships first: what is installed, what is broken, what is
unwired. It is the cheapest thing to build and the fastest way to find out
whether the state model is right.

### P1 — the wedge

Doctor: usage measurement, context cost, conflicts, security posture, prune
proposals. Share links with short codes and a full pre-apply preview. Loadouts
(role × stack → explained set) — the prototype in `claude-code/loadouts.json`
already resolves, composes and validates. Retrofit an existing repo: detect the
stack, generate the contract and command registry. Local benchmark A/B.

### P2 — team and cloud

Git-based sync first; a hosted option only for people who will not run a repo.
Shared papercuts and instincts, so one person's friction becomes everyone's
rule — the genuinely novel idea in this plan. Secret scanning across configs.
Then auth, org policy and an approved catalogue, once a team is actually asking.

### P3 — after evidence

Workflow/loop patterns with L1→L3 maturity levels. Cost analytics. Marketplace.
Anything with a billing relationship attached.

---

## 8. What determines whether this survives

**The integration treadmill is the real risk**, not missing features. Six
harnesses, each free to change its config format. Mitigated by the adapter
interface, a conformance test each, and a product that stays useful when one is
stale. Say out loud which harnesses are supported and which are best-effort.

**A setup tool optimises for installing more; the data says the problem is the
opposite.** 96 loaded, 3 used. Make the measured number visible or the tool
makes people worse.

**Every write reversible**, because the defaults will be wrong for somebody.

**The TUI must never be the only path.** The moment an action exists only in the
interface, the tool stops being automatable — and scriptability is the one thing
a TUI has over SkillDock's desktop app.

---

## 9. Catalogue seeding

| Source | ★ | What to take |
| --- | --- | --- |
| [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | 117k | **73+ DESIGN.md files** from real sites (Vercel, Figma, Apple). Nine sections each. Installable per project |
| [prompts.chat](https://github.com/f/prompts.chat) | 171k | The prompt library |
| [awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) | 25k | **100+ specialised subagents** — the best catalogue for the subagent gap |
| [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) | 41k | Rules by stack; seed for per-stack project contracts |
| [awesome-agentic-patterns](https://github.com/nibzard/awesome-agentic-patterns) | 5k | ~50 named patterns in 5 groups — see below |
| [awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) | 139k | Reference implementations: agents, RAG, multi-agent, memory, voice |
| [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | 54k | 21 categories — the closest thing to a taxonomy for the catalogue itself |
| [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) | 95k | MCP catalogue |
| [awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) · [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | 75k · 35k | Skills, breadth |
| [awesome-copilot](https://github.com/github/awesome-copilot) | 37k | Copilot instructions, agents, skills |
| [awesome-cli-coding-agents](https://github.com/bradAGI/awesome-cli-coding-agents) | 1.3k | **Directory of terminal-native agents** — the adapter target list |
| [awesome-vibe-coding](https://github.com/filipecalegario/awesome-vibe-coding) · [Awesome-Context-Engineering](https://github.com/davidkimai/Awesome-Context-Engineering) | 5k · 3k | Practices and context guides |
| [agentation.com](https://www.agentation.com/) | — | Broader agent tooling directory |

**The pattern catalogue is the most under-exploited.** ~50 named patterns across
Orchestration (plan-then-execute, sub-agent spawning, budget-aware routing with
hard cost caps, multi-agent debate), Context (budget as a governed resource,
auto-compaction, semantic filtering), Reliability (agent circuit breaker, output
verification loop, evals with mocked tools, canary rollout with automatic
rollback), Tool Use (progressive discovery, code-over-API) and Human-in-the-Loop
(approval frameworks, chain-of-thought interruption, team-shared configuration
as code).

They already have names other people use, which matters for a catalogue.

---

## 10. Sequence

**Weeks 1–3 — the spine.** State model and Zod schema. Detection and read-only
doctor. Two adapters behind the interface with conformance tests. CLI only, no
TUI yet.

**Weeks 4–7 — the core loop.** Search across sources. Inspect. CRUD. Scope
switching. Install via delegation. Dry-run and rollback. The TUI in Ink as a
view over commands that already work.

**Weeks 8–10 — the wedge.** Usage measurement and config analysis. Share links
with short codes and pre-apply preview. Loadouts with an installer. Local
benchmark A/B.

**Weeks 11+ — compounding.** Retrofit. Git sync. Catalogue seeding. Team
features only when a team asks.

**Checkpoint at week 3:** does the doctor tell you something about your own
setup you did not already know? If not, the state model is wrong and no amount
of Ink will rescue it.

---

## 11. What to verify before building

Each of these is an afternoon, and each can invalidate a chunk of the plan.

**Can one schema express two very different harnesses?** Build the adapter
interface against Claude Code and Cursor before committing to it. If the second
adapter needs fields the first never used, the interface is a description of
Claude Code wearing a costume.

**Does Ink hold up at 500 rows?** Render a list of every installed skill and
scroll it. If it flickers, virtualisation moves from week 5 to week 1.

**Will anyone accept a loadout someone else wrote?** Show `loadouts show
junior-frontend --explain` to two developers and watch whether they argue with
the reasons or ignore them.

**Is git-based sync enough?** Two machines, one week, before designing a
backend.

**Does measured pruning agree with judgement?** Run skillreaper next to
`registry.json` and compare. The parking list was opinion; if measurement
disagrees sharply, the loadout reasons need revisiting too.
