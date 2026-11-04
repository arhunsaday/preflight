# Preflight workspace and discovery redesign

User outcome: understand where global skills/MCP configuration lives, edit it without a project, search real online sources, and add/configure resources with predictable scope and preview. User authorizes autonomous UX redesign, no questions required.

The current CLI supports global target paths but stores desired global resources inside a project's config. Introduce one shared global desired-state workspace at HOME/.preflight/global, available with CLI --global and desktop Global context. Selecting it does not initialize harness files. Its transaction service rejects project-scoped resources. Project contexts retain current behavior for compatibility; global entries already managed there are not silently migrated. Display inherited resources from the shared global store separately and route editing to Global.

Navigation: context selector (Global / selected project), Overview, Skills, MCP servers, Other resources, Detected; Discover separate from configuration; Projects; health/usage/profiles/loadouts; benchmarks/sharing/account/local team; activity/advanced console. Overview explains actual config and harness paths, counts, setup/adoption, global versus project inheritance and actionable next steps. No fake telemetry or hosted account features.

Discover: bundled/offline versus online, explicit type and source selector, submitted query, source failures/requirements visible, no hidden online toggle. Search runs against CLI sources; details permit inspection, then configurable destination scope/harnesses before preview. Source URLs remain provenance; unsupported installers stay explicit. Add should not silently assume project or global.

MCP editor: transport HTTP/SSE or stdio, URL or executable/arguments, env references (no credential persistence to arbitrary stores), server config preview and advanced JSON escape hatch. Skills expose instruction editor; types and scopes fixed for edits where identity changes would strand files. Target context and real paths appear before writing.

Delivery: regressions for isolated global state/receipt switching/no project writes; source filtering; renderer smoke through no-project global init, MCP form, scope selection, project inheritance and discovery failures. Preserve user preflight.config.json. Continue incremental pushes; keep native platform CI running. Signing/notarization and production deployment require real external credentials; standard OAuth and organization backend are implemented as specified below.

## Standard cloud account stack

Use Better Auth 1.7 with its Drizzle adapter, D1 SQL migrations, GitHub/Google OAuth, bearer sessions for first-party clients, deviceAuthorization (RFC8628), and organization membership. Cloudflare Worker/Hono hosts auth and account/organization/share APIs. R2 stores resource payloads; KV resolves links; D1 indexes shares by authenticated owner. Standard auth is authoritative whenever AUTH_DB exists; an old deployment token never authenticates against that mode. Legacy compatibility exists only on old deployments without AUTH_DB.

Desktop starts browser login and retains the secret device code and session token only in main; renderer receives display code, URL, status and public identity. CLI uses the same grant and OS credential storage. OAuth provider secrets are deployment secrets, not desktop configuration. Generated /s/code links can be copied/opened and imported directly. Organization invitations are real server-side records with role checks; manual link delivery is explicit when email transport is not configured.

Sources: https://better-auth.com/docs/plugins/device-authorization, https://better-auth.com/docs/plugins/bearer, https://better-auth.com/docs/adapters/drizzle. Schema is generated from library configuration, then versioned as D1 migrations. Local integration tests use real Better Auth and SQLite; deploy/runtime smoke uses local Wrangler D1/KV/R2. Production OAuth needs real registered provider credentials; local test password mode is restricted to explicit loopback deployments.
