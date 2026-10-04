---
title: Cloudflare backend and accounts
---

Preflight uses Better Auth for user accounts, OAuth providers, sessions, device authorization and organization membership. Cloudflare Workers runs the API, D1 stores authentication and share ownership, KV stores share lookup metadata, and R2 stores configuration payloads. Local configuration management works offline without this backend.

## Configure a deployment

Create a Cloudflare D1 database named `preflight-auth`, a KV namespace and an R2 bucket. Put their identifiers in `wrangler.jsonc`; the committed identifiers are placeholders. Set `BASE_URL` to the canonical HTTPS origin. Set `BETTER_AUTH_SECRET` using `wrangler secret put BETTER_AUTH_SECRET`, with a cryptographically generated secret of at least 32 characters.

Register a GitHub OAuth application and/or a Google OAuth client. Callback URLs are `https://YOUR_ORIGIN/api/auth/callback/github` and `https://YOUR_ORIGIN/api/auth/callback/google`. Store `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as Worker secrets for the providers you enable. The browser sign-in page only offers configured providers.

Apply the committed migrations with `npm run backend:migrate`. Deploy the Worker with Wrangler after reviewing the bindings and production origin. No deployment or provider registration happens automatically during local builds.

Never enable `AUTH_LOCAL_TEST` in production. Password signup exists solely for the loopback smoke test and is disabled on non-loopback origins even if that flag is set. Production login uses the configured OAuth providers.

## Desktop and CLI login

In Account, enter the backend origin and choose **Sign in with browser**. Compare the device code and approve the device in your browser. The desktop keeps the session credential in its main process, using operating-system encryption when available; otherwise it lasts for the app session. Credentials are never returned to the renderer.

```sh
adk auth login --service https://YOUR_ORIGIN
adk auth status
adk share
adk auth logout
adk team list
adk team create "My team" --slug my-team
adk team members ORGANIZATION_ID
```

CLI credentials use macOS Keychain, Windows Credential Manager or Linux Secret Service/keyring. Only public account metadata is written to `~/.adk/account.json`. There is no plaintext credential fallback. `--no-browser` displays the verification URL instead of opening it. Sign in to the selected backend before changing `--service`; credentials are never automatically sent to a different backend.

## Sharing

Publication returns a hosted inspection URL such as `https://YOUR_ORIGIN/s/abc234`. Import that URL with `adk apply URL --dry-run`, review its changes, then apply it. Share payloads reject literal secrets and preserve environment-variable references. The authenticated user owns each share; another account cannot revoke it. `GET /api/shares` lists the signed-in user's shares. Public and unlisted links are accessible to anyone who has the link; unlisted does not mean private or restricted to an organization.

Better Auth's organization endpoints under `/api/auth/organization/*` manage real organization membership. The desktop Team screen can list/create cloud organizations and inspect membership. Its separate local roster remains an offline coordination feature and does not grant backend access or send invitations. Invitation and role-management screens remain to be implemented.

Legacy deployments without `AUTH_DB` retain deployment-token compatibility. When `AUTH_DB` is present, legacy write tokens are rejected and user sessions are required.

## Local verification

```sh
npm run check
npm run desktop:check
node scripts/backend-smoke.mjs
npm run smoke:worker
```

The backend smoke test creates isolated local D1/KV/R2 storage, applies real migrations and exercises sessions, device authorization, organization creation and logout in Wrangler's Cloudflare runtime. It does not deploy or contact OAuth providers.
