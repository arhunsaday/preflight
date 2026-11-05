# Changelog

All notable changes to Preflight are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). The CLI (`@arhunsaday/preflight`)
and the desktop application share one version.

## [Unreleased]

### Added

- `preflight ui` opens a keyboard dashboard: a tab for each detected harness, a list of sections (Overview, Skills, MCP, Subagents, Hooks, Plugins, Instructions, Profiles, Doctor, Usage) and a detail pane. `p` switches profile with a preview, `d` runs the doctor, `/` filters. `m` or `--classic` opens the resource manager.
- `preflight status`: one line per harness (Claude Code, Codex, Cursor) with install state, active profile, resource counts and doctor findings, for global and project scope.
- Global option `-o, --output <json|text|auto>`: `auto` prints text at a terminal and JSON in a pipe; `--json` and `--text` stay as aliases. Piped output is unchanged.
- Manual skills and one-click switches: `preflight skill manual|auto <name...>` sets or clears `disable-model-invocation` (a manual skill costs 0 listing tokens and runs as `/name`); `preflight disable|enable <resource...>` switches skills, MCP servers, plugins, hooks and subagents off and on, with a preview and the token cost. The doctor reports `skill-manual-candidate`. In Resources (Detected) and the Context map, each row has an On / Manual / Off switch.
- `preflight` command line: `detect`, `doctor`, `init`, `list`, `search`, `add`, `remove`, `install`, `share`, `import`, `loadout`, `bench` and more. Commands print JSON by default; previews are required before anything is written.
- Adapters for Claude Code, Codex and Cursor covering skills, MCP servers, subagents, hooks, plugins and instruction files, with `preflight.config.json` / lock file ownership and recovery.
- Doctor: findings, drift between declared and installed state, observed usage, and the context cost of each resource. Context map showing what every harness loads into a session.
- Loadouts and profiles, Git retrofit of existing setups, discovery from content sources (Preflight ships no skills, plugins or loadouts of its own) and shared global configuration.
- Terminal interface (`preflight ui`) built with Ink.
- Desktop application (Electron) over the same engine: skills, MCP servers, resources, projects, profiles, loadouts, doctor, context map, command console, benchmarks, sharing, teams and account sign-in. Edits, installs and benchmark runs always show a preview first.
- Sharing through a Cloudflare Worker backend: publish, import and revoke scoped configurations; browser sign-in with a device code; tokens kept in the OS keychain or session-only.
- Local configuration benchmarks.
- Benchmark result checklist: after `bench run` and `bench compare`, Preflight checks repetitions, spread between runs, limits reached, whether the success check passed and whether both sides used the same model, effort and budget. A compare with a failing check says not to publish the result. The checks follow the pstack `benchmark-checklist` skill.
- `preflight bench arena`: run one task set with two loadouts or profiles in disposable copies, alternate the order, and get one report with success rate, tokens, cost, duration and the checklist. A winner appears only when no check fails. In the desktop, **Benchmarks** has an Arena form and a result view.
- `preflight reflect` ranks the recent sessions where the agent struggled (failed or blocked tool calls, repeated commands, Stop hook loops, hook errors, long searches before the first edit, costly sessions). It writes a redacted trajectory for each top session and proposes lesson drafts. `preflight reflect lesson add`, `verdict` and `dismiss` keep lessons in `.preflight/lessons`; `--apply` writes a rule into a managed block after a preview. In the desktop, **Usage > Reflect** shows the ranked sessions, their trajectories and the lesson drafts with Accept and Dismiss.
- Content sources: `preflight source add github:owner/repo@ref` or a local folder, then `source list`, `show`, `update` and `remove`. Search, `catalog-add` and loadouts read the sources. In the desktop, **Discover > Sources** adds and removes a source. `preflight catalog build` writes a source's `catalog/index.json`.
- Instruction resources write a managed block in `CLAUDE.md` and `AGENTS.md`, and a Cursor rule file. Plugins from a source add their marketplace before they install.
- Installers for macOS (dmg, zip; arm64 and x64), Windows (NSIS) and Linux (AppImage, deb), built and published by the release workflow, with SHA-256 checksums.
- Automatic updates in the desktop application for signed macOS builds, Windows and Linux AppImage, with a non-intrusive banner and a Help menu item (Check for Updates).
- Homebrew formula and cask templates under `packaging/homebrew`.
- One-tag releases: `npm run release -- <patch|minor|major|X.Y.Z> --apply` and `.github/workflows/release.yml` (npm provenance through trusted publishing, GitHub Release, notarized macOS builds when the signing secrets are set).
- Install from any repository: `preflight install owner/repo` scans a GitHub repository or a local folder with no `catalog/index.json`, previews what goes to each agent (and why an agent cannot take a resource), and writes with `--select` or `--all` and `--apply`. Each resource records its repository, commit and path. In the desktop, **Discover > From GitHub** does the same.

[Unreleased]: https://github.com/arhunsaday/preflight/commits/main
