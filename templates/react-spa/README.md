# React SPA template

Agent configuration for a React single-page app — Vite or Next, TypeScript,
Tailwind, TanStack Query/Router.

> Renamed from `react-sap`, which I read as a typo for SPA. If it meant SAP
> (enterprise), say so and this becomes a different template.

```bash
~/Repos/ai-dev-kit/bootstrap.sh --project .   # the generic drop-in first
cp templates/react-spa/AGENTS.section.md      # then paste the section below
```

## What to add to the project's AGENTS.md

[`AGENTS.section.md`](AGENTS.section.md) — the React-specific half of the
contract: structure, state rules, the validation matrix.

## Skills to have loaded

| Skill | From |
| --- | --- |
| `interface-cheatsheet` | this kit |
| `react-admin-dashboard-patterns` | this kit (`stack/`) |
| `memory-snapshot-perf` | this kit (`tools/`) |
| `frontend-ui-engineering`, `frontend-design` | installed, `addyosmani` / `anthropics` |
| `landing-page-design`, `better-ui` | installed |
| `browser-testing-with-devtools` | installed |

## MCP

`playwright` for real-browser testing, `figma-mcp-go` (or Figma-Context-MCP) for
design handoff.
