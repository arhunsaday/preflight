# Preflight workspace and discovery redesign

User outcome: understand where global skills/MCP configuration lives, edit it without a project, search real online sources, and add/configure resources with predictable scope and preview. User authorizes autonomous UX redesign, no questions required.

The current CLI supports global target paths but stores desired global resources inside a project's config. Introduce one shared global desired-state workspace at HOME/.adk/global, available with CLI --global and desktop Global context. Selecting it does not initialize harness files. Its transaction service rejects project-scoped resources. Project contexts retain current behavior for compatibility; global entries already managed there are not silently migrated. Display inherited resources from the shared global store separately and route editing to Global.

Navigation: context selector (Global / selected project), Overview, Skills, MCP servers, Other resources, Detected; Discover separate from configuration; Projects; health/usage/profiles/loadouts; benchmarks/sharing/account/local team; activity/advanced console. Overview explains actual config and harness paths, counts, setup/adoption, global versus project inheritance and actionable next steps. No fake telemetry or hosted account features.

Discover: bundled/offline versus online, explicit type and source selector, submitted query, source failures/requirements visible, no hidden online toggle. Search runs against CLI sources; details permit inspection, then configurable destination scope/harnesses before preview. Source URLs remain provenance; unsupported installers stay explicit. Add should not silently assume project or global.

MCP editor: transport HTTP/SSE or stdio, URL or executable/arguments, env references (no credential persistence to arbitrary stores), server config preview and advanced JSON escape hatch. Skills expose instruction editor; types and scopes fixed for edits where identity changes would strand files. Target context and real paths appear before writing.

Delivery: regressions for isolated global state/receipt switching/no project writes; source filtering; renderer smoke through no-project global init, MCP form, scope selection, project inheritance and discovery failures. Preserve user adk.config.json. Continue incremental pushes; keep native platform CI running. Signing/OIDC/team backend remain explicit future work.
