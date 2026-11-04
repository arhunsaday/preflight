# Preflight Desktop

Build a real installable desktop client for the existing CLI, prioritizing the reference's quiet native three-pane workspace. Use Electron, React and Vite with Radix accessible dialogs and Lucide icons. The user authorized autonomous implementation and incremental pushes; preserve their existing configuration and lockfile edits.

## Product contract

Sidebar: Skills, MCP servers, Other resources, Catalogue, Projects, Loadouts, Benchmarks, Doctor, Usage, Profiles, Collaboration, Team, Account, Activity and Command console. All existing CLI commands remain reachable through a tokenized command console; common operations get dedicated controls. Actual data comes from the active project, its harness home and the bundled catalogue. No fabricated dashboard metrics or pretend sign-in.

Resources have list/detail, filtering, source/content/configuration inspection, create/edit, fork, adoption, enable/disable, scope moves, remove, verify, installer preview and explicit execution. Every mutating CLI operation previews first and applies only after a concrete confirmation. Init handles an uninitialized project. Projects are explicitly opened via a native directory picker and remembered separately from project config. Switching projects never initializes or changes their files implicitly.

Benchmarks support scaffold, run preview, explicit run, list actual result files and compare. Loadouts show explanations and missing dependencies before installation. Doctor and usage display observed findings, preserving unknown usage. Profiles support creation, switch and comparison. Collaboration previews shared resources before importing, exports files and publishes/revokes against the existing share Worker. Account connects using the existing deployment-level owner token, validates it by an authenticated capability endpoint and encrypts it using Electron safeStorage. Team is a local persisted roster for sharing coordination: explicitly say membership is not server-enforced access control. Hosted OIDC and authoritative organization roles require a future backend, and must not be represented as working authentication.

## Architecture

Keep the CLI public interface unchanged. Isolated sandboxed renderer has no Node access. A narrow validated preload bridge calls the trusted main process. Main process owns registered project paths, native dialogs, settings and encrypted credentials. CLI engine runs in a separate child process, using the same execute/service modules; no shell string execution. Commands cannot override root/home from the renderer. Main process issues single-use, expiring preview receipts tied to the current project and args; renderer cannot directly request execution. Single writer across desktop operations. CLI's own optimistic transactions still guard against external edits. Process crash is reported. Native window blocks navigation/popups and validates IPC sender frames.

Desktop settings persist atomically with mode 0600 in app userData; credentials are excluded from snapshots, logs, renderer state and project files. If secure encryption is unavailable, credentials are session-only. HTTPS for remote service, HTTP allowed only loopback by shared serviceUrl rules. Worker auth endpoint returns owner identity without changing data; it has no public signup.

## Visual contract

Product name Preflight (remote repository name); subtitle AI development workspace. Cool grey sidebar #f5f6f8, white surfaces #ffffff, border #e4e7ec, ink #202938, muted #637083, restrained blue #2563eb. System native typography, 13–14px controls, 22px view title. Sidebar 218px; resource list ~360px; detail flexible. Native macOS title bar and draggable toolbar; no fake traffic lights. Dense rows, subtle selection, harness badges, real counts, helpful empty/error/loading states. Native accessible buttons, labels, focus ring; Radix dialogs trap focus. Layout collapses sensibly under 1000px and works at window minimum 840px. Display unknown measurements as unknown.

## Acceptance

Existing checks stay green. Test invalid IPC/override attempts, uninitialized/corrupt projects, preview single use and expiry/context binding, settings persistence, token isolation, Worker authentication and actual CLI roundtrip. Build renderer/main/preload/engine, package an unsigned local native directory build, exercise real Electron via Playwright against a disposable root/home (init, catalogue add preview, confirmed add, edit/move, doctor, profiles, loadout, console, project switching). Capture screenshots and inspect layout; no personal harness writes during tests.
