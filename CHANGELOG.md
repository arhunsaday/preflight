# Changelog

All notable changes to Preflight are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). The CLI (`@arhunsaday/preflight`)
and the desktop application share one version.

## [Unreleased]

### Added

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
- Content sources: `preflight source add github:owner/repo@ref` or a local folder, then `source list`, `show`, `update` and `remove`. Search, `catalog-add` and loadouts read the sources. In the desktop, **Discover > Sources** adds and removes a source. `preflight catalog build` writes a source's `catalog/index.json`.
- Instruction resources write a managed block in `CLAUDE.md` and `AGENTS.md`, and a Cursor rule file. Plugins from a source add their marketplace before they install.
- Installers for macOS (dmg, zip; arm64 and x64), Windows (NSIS) and Linux (AppImage, deb), built and published by the release workflow, with SHA-256 checksums.
- Automatic updates in the desktop application for signed macOS builds, Windows and Linux AppImage, with a non-intrusive banner and a Help menu item (Check for Updates).
- Homebrew formula and cask templates under `packaging/homebrew`.
- One-tag releases: `npm run release -- <patch|minor|major|X.Y.Z> --apply` and `.github/workflows/release.yml` (npm provenance through trusted publishing, GitHub Release, notarized macOS builds when the signing secrets are set).

[Unreleased]: https://github.com/arhunsaday/preflight/commits/main
