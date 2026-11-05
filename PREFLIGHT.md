# Preflight desktop, CLI and terminal interface

Preflight manages declarative AI development setups with a scriptable CLI and an Ink terminal interface. Requires Node.js 22 or newer. The existing shell/Python development kit remains available.

## Run locally

```sh
npm ci
npm run build
node dist/cli.js --help
node dist/cli.js detect
node dist/cli.js doctor
node dist/cli.js init
node dist/cli.js ui
```

Use `npm link` to expose the `preflight` executable locally. This package has not been published to npm. Commands emit JSON by default; errors go to stderr and exit nonzero. Use `--root /absolute/project` and `--home /absolute/test-home` to target another project or an isolated harness home. Both paths should be real directories, not symlink aliases. `PREFLIGHT_HOME` changes the CLI's default harness home.

Detection and doctor are read-only and do not require `init`.

## Desktop application

Preflight is an Electron application over the same command engine and resource schemas. Its sidebar covers skills, MCPs, other resources, detected installations, catalogue, projects, profiles, loadouts, doctor, usage, benchmarks, sharing, team, account and activity. The command console exposes the remaining CLI operations without executing a shell. Dedicated forms use the same validation as CLI; edits, installations, connected checks and benchmark runs require a preview and confirmation.

```sh
npm ci
npm run desktop:dev            # development with hot reload
npm run desktop:check          # types and production bundles
npm run desktop:start          # run the previously built application
npm run desktop:pack           # native directory under desktop-release/
npm run desktop:dist           # platform installers
npm run desktop:smoke          # real Electron; disposable project, home and settings
```

Use the workspace selector to manage Global configuration without opening a project, or select a project through the native folder picker. The global desired configuration lives at `HOME/.preflight/global/preflight.config.json`; projects show inherited global resources and link back to their editor. Opening a folder does not initialize it or change its harness configuration. The selected project determines project scope; global scope targets your actual home directory. Review the exact paths in the preview before confirming. Cmd/Ctrl+K opens a palette of views, actions and workspaces; Cmd/Ctrl+R refreshes the workspace (it no longer reloads the page); Cmd/Ctrl+O opens a project; Cmd/Ctrl+1–8 jump to the main views; `/` filters the current list and `↑`/`↓` move through it; `?` lists every shortcut. The same commands are in the native menu bar, which no longer ships developer tools in packaged builds. The theme follows the system and can be pinned to light or dark from the sidebar or the palette. Operations serialize in the main process; project/account changes invalidate pending previews, and confirmation rechecks files and imported inputs. Normal quit is blocked while an engine operation is supervising subprocesses; there is no cancellation button yet.

The renderer has no Node access and uses an isolated, sandboxed preload with explicit methods. Account tokens are kept in the main process, encrypted with Electron safeStorage when available, otherwise session-only; they are not included in renderer snapshots, project config, or installer/agent environments. HTTPS is required except for loopback development. Browser sign-in goes through Clerk (GitHub or Google) on the Worker's `/auth/sign-in` page, with a loopback redirect and PKCE; the result is a Preflight API token (`pfk_…`) that stays outside the renderer. See `docs/content/docs/preflight/cloudflare-backend.mdx` for migrations, provider setup and login.

Sharing supports local JSON export/import and authenticated publish/revoke against the existing Worker. The Team page lists and creates teams (Clerk Organizations) and shows their members. Clerk emails invitations; recipient acceptance, cancellation, admin/member roles, member removal and leaving are available. The Worker authorizes every change and keeps at least one admin per team. A separate local coordination roster remains available offline and does not grant backend access. Benchmark views show saved real runs and scaffold/preview/run/compare manifests; an empty workspace has no fabricated results. External installers and agents retain their CLI boundaries and costs.

The macOS Apple Silicon directory build and packaged app are exercised locally; CI checks Node 22/24 and builds/tests native macOS, Windows NSIS and Linux AppImage/deb packages. Each platform has passed the real Electron and installer workflow. Builds are currently unsigned and not notarized; release signing, automatic updates and public installer distribution remain separate work. Tests may set `PREFLIGHT_DESKTOP_TEST_ROOT`, `PREFLIGHT_DESKTOP_TEST_HOME`, `PREFLIGHT_DESKTOP_TEST_DATA` to disposable paths. For packaged smoke, set `PREFLIGHT_DESKTOP_EXECUTABLE` to the native executable.

## Terminal interface

`preflight ui` requires a TTY and opens five views over the same commands: **Browse** for the active profile, **Catalogue** for search results, **Detected** for what the harnesses hold outside the profile, **Doctor** for findings and **Profiles**. Each pairs a bounded, virtualised list with a detail pane carrying identity, scope, per-harness support, provenance, measured invocations, requested tools, configuration and content — the inspection that belongs before an install, not after it. The layout follows the terminal: two panes side by side, stacked below 74 columns, and it re-renders on resize.

Every action names the CLI command it runs, in the action palette, the keyboard reference and the status line, and a test asserts each one resolves to a real command. Writes are previewed first: the dry run produces the resource diff, the files it would touch with their line counts, and any adapter warnings. Enter applies, Escape cancels. Read-only commands run directly.

| Key | Action |
| --- | --- |
| `1`–`5`, `Tab` | switch view |
| `↑` `↓` `j` `k`, `g` `G`, PgUp/PgDn | move, jump, scroll |
| `Enter` | inspect; adopt in Detected; switch profile in Profiles |
| `/` | filter the list; in Catalogue, run a search |
| `Ctrl+K` | action palette |
| `:` | run any CLI command |
| `n` `e` `d` `f` `m` `v` `i` | new, edit, delete, fork, move scope, verify, installation plan |
| `a` `O` | add a catalogue result or adopt a detected one, toggle remote sources |
| `s` `t` | cycle the scope and type filters |
| `y` `r` `o` `?` `q` | sync, reload, raw result, keyboard reference, quit |

The resource form validates against the same Zod schema as the CLI: `↑↓` moves between fields, `←→` cycles choices, `1`–`9` toggles harnesses, `\n` inserts a line break in content, and invalid fields are named where they are. Forms map to `create-json` and `update-json`. The status bar carries the active profile, harness detection, measured skill utilisation and the doctor's error and warning counts. The detail pane reports observed invocations per resource, or nothing at all when no transcripts were found, and whether the resource has reached the harness files: desired state that came from outside Preflight, such as a configuration pulled from git, reads as not applied until `y` reconciles it.

## State, ownership, and recovery

- `preflight.config.json`: desired profiles and resources, suitable for version control if secret-free.
- `preflight.lock.json`: last applied resources and managed-file hashes. Paths are machine-local; regenerate this lock on another machine.
- `.preflight/transactions/`: private before/after snapshots for local recovery.
- `.preflight/audit.jsonl`: actor, source share, transaction ID and changed paths. File contents are in the associated private journal.

Every Preflight configuration transaction supports `--dry-run` and `rollback`. Writes use temporary files and rename, a per-project writer lock, optimistic hash/content checks, and a persistent journal. Ordinary failures restore earlier writes. After process interruption, `recover --dry-run` previews restoration and `recover` restores pending transactions. Recovery refuses to overwrite intervening edits or steal a live process's lock. `rollback` reverses the latest transaction; reversing that rollback reapplies it.

Preflight refuses symlink write paths, unmanaged-file replacement, shared MCP name collisions, and changes to managed files made outside Preflight. Inspect and resolve drift deliberately; there is no force-overwrite switch. Keep `.preflight/` and `preflight.lock.json` out of shared Git history: journals can contain the previous contents of files that had credentials. Files written by Preflight use owner-only permissions. A per-project lock does not coordinate external editors or two independent projects; content checks catch detected conflicts but cannot provide a filesystem-wide transaction against other processes.

External package managers and Git remotes have their own side effects. `install` prints the exact executable/argv by default; `install --execute` delegates to the package manager and **is not reversed by Preflight rollback**. The same applies to `git pull` and `git push`. Review the printed plan before execution. Preflight never invokes a shell to run installer argv.

## Core loop

```sh
preflight search test
preflight search react --type skill --online
preflight search testing --github vercel-labs/skills
preflight search debugging --catalog /path/to/another/local/kit
preflight catalog-inspect skill:ponytail
preflight catalog-add skill:ponytail --dry-run
preflight catalog-add skill:ponytail
preflight move skill:ponytail global --dry-run
preflight move skill:ponytail global
preflight verify skill:ponytail
preflight delete skill:ponytail --dry-run
preflight rollback --dry-run
```

The bundled catalogue contains this repository's skills and support files, subagents, prompts, instincts, hook scripts, MCP templates and tool references. `npm run catalog:seed` refreshes it. No third-party catalogue content is silently downloaded or executed at startup.

Online search connects to the official MCP registry and the documented skills.sh API. The registry publishes one record per server version: Preflight keeps the record the registry marks current, skips records it marks withdrawn, and an entry whose shape this version cannot read is counted and reported rather than removing the whole source from the results. Registry results retain HTTP/SSE transport and required headers; pinned npm and PyPI stdio packages become `npx`/`uvx` launch configurations with required environment references. Unsupported package formats remain inspectable and are rejected during apply rather than wired as broken servers. The latter requires `VERCEL_OIDC_TOKEN`. GitHub discovery uses pinned commit URLs and optionally `GITHUB_TOKEN` to increase rate limits. A source failure is reported alongside successful results. Remote results are bounded to 100 per source; results can be narrowed with another query. GitHub search matches file paths; it is not a full-text code-search engine.

To install a remote result, save one resource object from search output into a JSON file, then run `inspect-file resource.json` and `create resource.json --dry-run`. `create` materializes remote skill content and bounded text support files before applying. Inspect reports source, pinned commit when available, raw content and configuration, including requested tools. Binary or oversized skill assets require the upstream installer.

CRUD applies to all nine resource types. Native adapter wiring is intentionally explicit:

| Resource | Claude Code | Cursor |
| --- | --- | --- |
| Skills and support files | `.claude/skills` | `.cursor/skills` |
| MCP | project `.mcp.json`; user `~/.claude.json` | `.cursor/mcp.json` |
| Subagents | `.claude/agents` | catalogued only |
| Hooks | `.claude/settings.json`; managed scripts in `.claude/hooks` | catalogued only |
| Commands | `.claude/commands` | `.cursor/commands` |
| Statusline | `.claude/settings.json`; managed script in `.claude/statusline` | catalogued only |
| Plugins | `.claude/settings.json` `enabledPlugins`; native CLI installs packages | catalogued only |
| Prompts and plain tools | catalogued; tools use delegated installers | catalogued; tools use delegated installers |

Project and user scopes use the same relative harness layout. Unsupported types remain inspectable/editable in desired state and produce explicit warnings; Preflight does not claim they are active in the target harness. An unreadable adapter is reported as “unsupported today” while healthy adapters continue.

Existing resources are never silently adopted. `unmanaged` lists what a harness holds that the active profile does not, and `adopt <id>` brings one under management **where it already lives**: the resource records the harness and the relative path it was found in, Preflight does not move the file, and a file whose content already matches is not rewritten at all — the transaction adds the configuration entry and the lockfile digest, so drift is detected from then on. `delete` afterwards removes the file, and `rollback` puts it back. An adopted path that tries to leave the harness directory is ignored in favour of Preflight's own managed path, and a file reached through a symbolic link is refused: it belongs to whatever installed it, and Preflight never writes through a link.

```sh
preflight unmanaged
preflight adopt skill:claude-code:global:my-existing-skill --dry-run
preflight adopt skill:claude-code:global:my-existing-skill
```

A resource file example:

```json
{
  "id": "mcp:example",
  "type": "mcp",
  "name": "example",
  "source": "https://example.com/mcp",
  "scope": "project",
  "harnesses": ["claude-code", "cursor"],
  "config": {
    "url": "https://example.com/mcp",
    "headers": {"Authorization": "Bearer ${EXAMPLE_TOKEN}"}
  }
}
```

```sh
preflight create resource.json --dry-run
preflight create resource.json
preflight inspect mcp:example
preflight update mcp:example patch.json --dry-run
preflight fork mcp:example mcp:staging
preflight profiles create minimal
preflight profiles create experiment --from default
preflight profiles diff default minimal
preflight profiles switch minimal --dry-run
preflight profiles switch minimal
preflight sync --dry-run
```

Delegated skill installation passes every target agent in the single `--agent <agents>` argument the `skills` CLI accepts. MCP delegation runs `mcpm install <name> --force`: `mcpm` has no `add`, and it asks for confirmation on a terminal Preflight does not give it, so the delegated run is forced — which is also how it reinstalls over an existing entry. Verified against `skills` 1.x and `mcpm` 2.15 by running both. For tools, use `config: {"manager":"brew","package":"trivy"}` or an npm package. Skills with a repository source can delegate to `npx skills`; MCP entries can delegate to `mcpm`. Claude plugins use a qualified `name@marketplace` resource name and delegate package installation to `claude plugin install` with user/project scope — verified against the CLI, whose `--scope` takes `user`, `project` or `local`. A plugin whose marketplace declares an install command needs a terminal: that prompt shows the third-party command to a person, and Preflight does not pass `-y` on your behalf. Run the printed plan yourself in that case. Their enable/disable settings and scope moves are reversible Preflight transactions; package downloads remain delegated. These external installers must be available or obtainable on the user's machine. Preflight's direct MCP configuration writes preserve neighboring entries and do not install the server binary.

## Doctor and observed usage

`doctor` reports broken/missing skill files, parse failures, managed-file drift, approximate context cost, identical trigger descriptions, broad permissions, possible credentials and missing wiring. It also reads Claude user/project `settings.json` and `settings.local.json`, reporting credential locations and possible shell access around Read denials without printing credential values. Context cost is a character-based estimate, not a tokenizer measurement. Trigger conflicts are exact-description matches, not semantic analysis. These checks are useful evidence, not a comprehensive security audit.

```sh
preflight usage --transcripts /path/to/claude/jsonl/transcripts
preflight prune --transcripts /path/to/claude/jsonl/transcripts
preflight verify mcp:example
preflight verify mcp:example --connect
```

Usage streams Claude-style JSONL transcript files and counts structured `tool_use` entries, including `Skill` and MCP tool names. Text mentions do not count. No transcripts means unknown usage; prune makes no proposal in that case. Prune proposes IDs only and never deletes automatically. Transcript files are counted, not deduplicated conversational sessions; unsupported transcript formats do not constitute evidence of nonuse.

`verify --connect` explicitly starts the configured MCP process or connects to its HTTP/SSE endpoint, initializes it and lists tools with bounded request timeouts. It invokes no tools. Environment references must resolve before connecting. `doctor --connect` does the same for every enabled MCP server in the active profile and folds the result into the findings, replacing “configured; connection not tested” with what actually happened. Without that flag the doctor never starts a configured program.

## Sharing

```sh
preflight share --out setup.share.json --owner local
preflight apply setup.share.json --dry-run
preflight apply setup.share.json
preflight share --id skill:ponytail --dry-run
```

The schema rejects recognizable credential patterns, secret-key literals, authorization headers, credential-bearing URLs and secret argv pairs. It accepts `${VARIABLE}` references, including `Bearer ${VARIABLE}`. It does not silently redact or transform source content. Heuristic scanning cannot identify every arbitrary secret; inspect exported payloads before publishing. Required variable names appear on the share page. Use resource descriptions to explain where credentials come from.

The Worker implements 16-character random case-insensitive codes (with compatibility for existing six-character codes) without ambiguous glyphs, public/unlisted metadata, optional expiry, revocation, escaped read-only landing pages and pre-apply comparison. Unlisted means no discovery listing, not access control; anyone with a code can read it. The service currently has no public directory.

`npm run backend:smoke` exercises real local Cloudflare D1/KV/R2: migrations, sessions, device approval, organizations, owned publication/listing/revocation and logout. `npm run smoke:worker` separately verifies legacy token deployments without D1. Wrangler is pinned in the lockfile. Tests create isolated storage and do not deploy.

Configure D1, KV and R2 bindings, the canonical HTTPS `BASE_URL`, a `BETTER_AUTH_SECRET` and GitHub/Google OAuth provider secrets. Apply D1 migrations, then deploy with Wrangler under your configured Cloudflare account. Full setup instructions: [Cloudflare backend and accounts](docs/content/docs/preflight/cloudflare-backend.mdx).

```sh
preflight auth login --service https://YOUR_BACKEND
preflight auth status
preflight share --expires 2027-01-01T00:00:00.000Z
preflight apply https://YOUR_BACKEND/s/abc234 --dry-run
preflight revoke abc234 --dry-run
preflight team list
preflight team create "My team" --slug my-team
preflight team members ORGANIZATION_ID
preflight auth logout
```

CLI credentials use the operating system's credential store; public metadata alone is saved in `HOME/.preflight/account.json`. Publishing and revoking require the authenticated owner's session. Public/unlisted reads are unauthenticated; organization membership does not make share links private. The Worker rate-limits sign-in, share and link routes per IP. The default backend is `https://api.preflight.arhun.fr`; set `PREFLIGHT_API_URL` to use another one. Revocation/expiry are not recoverable local file transactions; exported local payloads use the normal transaction pipeline.

## Loadouts, retrofit and Git

```sh
preflight loadouts list
preflight loadouts show junior-frontend --explain
preflight loadouts install junior-frontend --dry-run
preflight retrofit --dry-run
preflight git status
preflight git pull --dry-run
```

Loadouts compose the existing `claude-code/loadouts.json`, with later layers overriding reasons and prerequisite checks before installation. A loadout item that is not vendored in this repository declares the repository it comes from with `"external": "owner/repo"`, which `scripts/loadouts.py check` validates against `skills/install-third-party.sh`; those skills are absent from the bundled catalogue and are reported with the command that installs them. Missing resources and prerequisites are reported together, and installation does not partially apply them. Use `--catalog /path/to/a/complete/local/kit` when supplying additional resources. Retrofit reads manifests and script names without executing repository code, and generates `AGENTS.md` plus `.preflight/commands.json`. It refuses to replace an existing contract.

## Local configuration benchmarks

```sh
preflight bench scaffold --repo /path/to/pinned/repo --revision FULL_40_CHARACTER_COMMIT_SHA
preflight bench run --config current --tasks bench/tasks.json --name current --dry-run
preflight bench run --config current --tasks bench/tasks.json --name current
preflight bench run --config minimal.config.json --tasks bench/tasks.json --name minimal
preflight bench compare current minimal
```

Scaffold writes ten fixed implementation tasks (including retry, grouping and topological sort) for a Claude-compatible noninteractive CLI. Real runs may incur model-provider charges. It never invokes an agent during scaffolding or dry-run. Replace or extend the task manifest to evaluate work representative of your repository.

Every task gets a fresh clone at the full pinned revision, a separate harness home and the selected configuration. Verification commands run separately after the agent succeeds. A configuration that cannot be fully applied invalidates the run. Results report pass rate and elapsed process time. A task can write `{"tokens":123,"interventions":0}` to `PREFLIGHT_METRICS`; otherwise those values are `null`, not fabricated zeroes. `PREFLIGHT_CONFIG` points to the applied config. Comparison rejects different revisions or task-manifest hashes.

The separate checkout/home prevents changes leaking between tasks but is **not a security sandbox**: task processes retain ordinary OS access and inherited credentials. Use trusted tasks and a container when evaluating untrusted agents. Temporary checkouts are removed after each run; results live under `.preflight/bench`.

## Validation and remaining roadmap

`ACCEPTANCE.md` walks `PLAN.md` criterion by criterion with the evidence for each, and names the gaps that remain.

`npm run check` runs ESLint, strict application type checking, Vitest integration/unit/TUI tests, and the packaged build. The SDK has an upstream optional-property declaration mismatch; vendor declarations are skipped, with a narrow documented transport cast at the integration boundary. Application code remains strict. Existing Python and shell checks continue in CI.

The delivered local product includes the CLI/TUI, two adapters, transactional desired-state management, a seeded catalogue and remote providers, static/connected verification, usage proposals, share Worker, loadout resolution, retrofit, Git delegation and local A/B runner. Direct MCP.Directory ingestion, hosted multi-user auth/policy/catalogue, cloud sync, workflow maturity analytics, billing and marketplace features are not implemented. Those require the evidence or service setup described in `PLAN.md`; warnings and this support matrix make current limits explicit.

Adapter/source references: [Claude Code MCP scopes](https://code.claude.com/docs/en/mcp), [Cursor MCP](https://prod.cursor.com/help/customization/mcp), [Cursor skills](https://prod.cursor.com/help/customization/skills), [MCP registry API](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md), [skills.sh API](https://www.skills.sh/docs/api).

## Shared global configuration and discovery

```sh
preflight --global init --dry-run
preflight --global init
preflight --global list
preflight --global create resource.json --dry-run
preflight search filesystem --source mcp-registry --type mcp
preflight search react --source github --github vercel-labs/agent-skills --type skill
preflight ui --global
```

Resources created in the global workspace must use `scope: global`. Project resources remain in their own stores. Online discovery is separate from the bundled catalogue in desktop, with explicit sources, errors and a configuration step before installation.

### Context map

The desktop **Improve → Context map** shows a proportional treemap of available instructions, with category zoom, resource details, agent/scope filters and a sorted list. `preflight context [--mode potential|catalogue] [--agent claude-code|cursor] [--scope global|project]` produces the same local character estimates. Unknown MCP/runtime contributions remain explicit; this does not measure a live conversation. See [context map](docs/content/docs/preflight/context-map.mdx).
