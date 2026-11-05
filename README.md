# Preflight

Preflight gives you visibility on and control of your AI coding setup (Claude
Code, Codex, Cursor): skills, MCP servers, subagents, hooks, slash commands,
plugins, instructions and status lines, declared in a file, applied through a
reversible transaction, and checked before you rely on it. It is a CLI, an Ink
terminal interface and an Electron desktop app over the same engine.

```bash
npm install -g @arhunsaday/preflight
preflight doctor                    # what is installed, drift, context cost (read-only)
preflight init                      # create preflight.config.json
preflight ui                        # terminal interface
```

## Preflight ships no content

The package contains the tool only. Skills, plugins, hooks, loadouts and the
global `CLAUDE.md` come from **content sources**, repositories you add once:

```bash
preflight source add github:arhunsaday/agent-kit@main   # pinned to that commit
preflight search caveman                                # results show source:agent-kit
preflight loadouts list
preflight --dry-run loadouts install base
preflight source update agent-kit                       # move to the ref's new commit
```

[agent-kit](https://github.com/arhunsaday/agent-kit) is my own: it is also the
`arhun-plugins` Claude Code marketplace and a skills repository for
`npx skills add`. Any repository with the same layout, or with a
`catalog/index.json` built by `preflight catalog build <dir>`, works as a
source. A local folder works too: `preflight source add ~/Repos/agent-kit`.

## Documentation

- [PREFLIGHT.md](PREFLIGHT.md): commands, adapters, sharing, benchmarks and limits
- [ACCEPTANCE.md](ACCEPTANCE.md): what the plan asked for against what is built
- The site in `docs/` (Fumadocs on Next.js: `cd docs && npm install && npm run dev`),
  including [Sources](docs/content/docs/preflight/sources.mdx)

## Developing

```bash
npm ci
npm run check            # lint, typecheck, tests, build
npm run desktop:check    # desktop typecheck and build
npm run desktop:dev      # run the desktop app
```

Tests use the small content source in `tests/fixtures/catalog/`, never your
real `~/.claude`. `PREFLIGHT_REAL_CLAUDE=1 npx vitest run tests/sources.test.ts`
also installs the fixture plugin with the real `claude` CLI in a disposable
home.
