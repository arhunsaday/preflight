# Desktop UX execution plan

- [ ] Add shared global context and CLI --global; test scope isolation and project-bound receipts.
- [x] Make global/project context explicit in controller, preload and renderer; preserve legacy settings.
- [x] Add Overview and inherited global resources, coherent context labels and paths.
- [x] Separate Discover, source/type search controls, source failures and configurable install target.
- [x] Replace generic MCP JSON entry with guided transport fields plus advanced editor; simplify skills and fix edit identity.
- [ ] Exercise real Electron UX, screenshots, full checks, native CI; update ADK.md/HANDOFF and push.

## Execution brief — user-authorized full UX/CLI redesign

Primary objective: one coherent manager for the user's global AI setup and project-specific setups. Desktop and CLI first; preserve TUI compatibility and shared transaction semantics. Apply all improvements in the tranche below, validate against real Electron and native CI, and push increments. No additional user questions or approvals required.

### Tranche A — one workspace model
- Shared global store, explicit context and paths, no project required.
- Enforced scope isolation, backward-compatible legacy project-managed globals.
- Project inheritance overview; resource actions distinguish inherited from owned.
- CLI global flag and source selection documented with working examples.

### Tranche B — discovery to installation
- Separate offline catalogue and online discovery, source/type filters and GitHub repo input.
- Errors and prerequisites visible per source; searches do not hide failed sources as empty results.
- Review/configure imported resources, explicit target agents/scope, duplicate detection.
- Guided MCP HTTP/SSE/stdio with arguments and environment references; advanced config retained.
- Contextual skill editor and fixed edit identity; preview includes exact paths and transaction effects.

### Tranche C — practical desktop workflows
- Overview with actual storage paths, health and shortcuts; onboarding usable with no project.
- Clear context switcher; global resources remain reachable from projects.
- All remaining CLI capabilities accessible; diagnostics and recovery retained.
- Usability improvements for empties, loading, selected resource, filter reset and responsive panels.

### Tranche D — confidence and delivery
- Regression tests for global isolation, context changes, source selection, JSON/editor round-trips.
- Real Electron smoke of new flows; screenshots inspected at large/small widths.
- Native Windows/Linux/macOS packaging and downloadable CI artifacts with integrity hashes.
- Full checks and remote CI; update release guide, acceptance gaps and handoff.

## Boundaries

Do not add placeholder hosted authentication, billing or team permissions. Standard Better Auth replaces owner tokens as the primary account flow; the local roster and old-deployment compatibility remain labelled. Signing/notarization needs real account credentials; public deployment, paid agent runs and human multi-machine acceptance remain external validation. New harness adapters require explicit capability/file contracts and independent fixtures; do not pretend all harnesses are supported merely by rendering their icons.

## Added requirement — standard authentication and Cloudflare backend

User explicitly requires standard auth, Cloudflare backend stack and generated share URLs. Replace owner-token authentication as the primary UI with Better Auth, GitHub/Google OAuth, D1 accounts/sessions/organizations and the library's RFC8628 device authorization for first-party desktop/CLI login. Use bearer session tokens only in main/CLI credential storage; never expose them to the renderer. Browser approval requires explicit confirmation of device code. KV/R2 sharing remains for payload storage; authorization derives share ownership from the authenticated user, not a trusted owner id in a request. Support full generated /s/code URLs as import inputs and visible copy/open links on publication. Provide migrations, Wrangler bindings, configuration examples and local end-to-end auth tests. Deployments need real provider credentials and Cloudflare resources; do not invent them or claim a public service exists before deployment. Legacy deployment-token compatibility must be clearly secondary and disabled when standard auth is configured.

Implemented and locally verified: standard auth, D1 migrations, browser/device flow, CLI OS credential storage, cloud organization list/create/members, owned-share API/list UI, copy/open links and full URL import. Remaining organization UX: invitations/role administration. Production deployment and provider registration are not claimed.
