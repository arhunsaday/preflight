# Teams, permissions and interface redesign

User authorizes implementation without further questions. Preserve existing app icon and all CLI/desktop transaction boundaries.

1. Finish backend CI: pinned Wrangler, isolated fixtures and process-group cleanup; confirm real Cloudflare jobs complete.
2. Share one validated cloud-operation client between main/CLI. Use Better Auth organization permissions, never a locally trusted role. Implement invitations, acceptance/rejection, cancellation, role updates, member removal and leaving with last-owner protection.
3. Browser invitation URLs retain their destination through OAuth. Show recipient/organization and require explicit acceptance. No pretend email sending: manual copyable links until mail delivery is configured.
4. Add organization/member/invitation tables, role descriptions, confirmation for access changes, clear server errors and meaningful empty states. Preserve offline roster as secondary.
5. Redesign with a Preflight-specific visual language: marine #172F3F, canvas #EEF3F2, petrol #176B68, amber #D3A453, rule #CED9DC, slate #506577. Manrope for interface/body/display, monospace only for file paths and command content. Preserve airplane mark. Main workspace overview uses an asymmetric briefing/inventory layout rather than repeated statistic cards; restrained tools keep the product useful.
6. Validate owner/admin/member/stranger/recipient cases, last-owner constraints, expired/cancelled/wrong-recipient invites and Cloudflare runtime. Exercise Electron at normal/compact widths, inspect screenshots, full checks and native CI. Push verified increments and update handoff.

Team membership governs organization management. Public/unlisted share links remain explicitly readable by anyone with a link; do not pretend they have private team ACLs.

Implementation status: steps 1–5 implemented; step 6 passes local source checks (123 tests), 33 Python tests, kit contracts, desktop build, real Electron owner/recipient/member/cancel flows and real Wrangler invitations/roles/KV/R2. Screenshots inspected at normal and compact sizes. Native CI for team/design commit `720af1a` passed all eight jobs: backend, Node 22/24, verify, docs and macOS/Windows/Linux Electron packaging. Run: https://github.com/arhunsaday/preflight/actions/runs/37344158861. Cancellation after grant redemption revokes the minted session; cloud replies are discarded if the account changes. Resource drafts survive preparation errors.
