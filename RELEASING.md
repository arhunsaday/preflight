# Releasing Preflight

One tag releases everything. The CLI (`@arhunsaday/preflight` on npm) and the
desktop app (GitHub Release) share the version in `package.json`.

## Every release

1. Describe the changes under `## [Unreleased]` in `CHANGELOG.md` (merge to `main`, CI green).
2. Dry run, then do it:

   ```sh
   npm run release -- patch            # or minor, major, X.Y.Z; prints the plan, writes nothing
   npm run release -- patch --apply    # bumps package.json + lockfile, dates the changelog, commits, tags vX.Y.Z
   git push origin HEAD vX.Y.Z         # the tag push starts .github/workflows/release.yml
   ```

3. Watch the **Release** workflow. In order: `verify` (tag = package.json, changelog section, `npm run check`, `desktop:check`, package contents) -> `draft` (draft GitHub Release with notes) -> `desktop` (macOS arm64+x64, Windows, Linux; uploads to the draft) -> `npm` (publish with provenance) -> `publish` (checksums, release goes public).
4. If the run fails after the draft exists, fix and re-run the failed jobs. A failure before `npm` leaves nothing on npm. If `npm` succeeded but `publish` failed, re-run `publish`.
5. Update the Homebrew tap (see `packaging/homebrew/README.md`).

Tags with a hyphen (`v0.2.0-beta.1`) publish to the npm dist-tag `next` and mark the GitHub release as a prerelease.

## First release: one-time setup

### npm

1. Make sure the scope `@arhunsaday` exists on npmjs.com (your user or an org) and you can publish to it.
2. The first publish must exist before a trusted publisher can be configured, so either:
   - set the `NPM_TOKEN` secret (below) for the first tag, then switch to trusted publishing; or
   - publish `0.1.0` once by hand: `npm login && npm publish --access public`, then tag as usual from `0.1.1`.
3. On npmjs.com open the package -> **Settings** -> **Trusted Publisher** -> GitHub Actions and enter:
   - Organization or user: `arhunsaday`
   - Repository: `preflight`
   - Workflow filename: `release.yml`
   - Environment: leave empty
4. Optional hardening: package Settings -> Publishing access -> "Require two-factor authentication and disallow tokens".
5. Fallback token: an npm **granular access token** (read and write on `@arhunsaday/preflight`, bypass 2FA) stored as the repository secret `NPM_TOKEN`. When it is set the workflow uses it; when it is absent the workflow publishes through OIDC. Delete it once trusted publishing works.

### GitHub

Repository **Settings -> Actions -> General**: allow actions, and set Workflow permissions to "Read and write" (the workflow also declares its own permissions). Tag pushes need no other setup; `GITHUB_TOKEN` creates the release.

### macOS signing and notarization (optional but recommended)

Without these secrets the macOS build is unsigned and the release notes say so; the macOS app then cannot auto-update (Squirrel.Mac requires a signature).

1. Join the Apple Developer Program (US$99/year).
2. Create a **Developer ID Application** certificate: developer.apple.com -> Certificates -> "+" -> Developer ID Application (needs a CSR from Keychain Access -> Certificate Assistant -> Request a Certificate from a Certificate Authority, saved to disk). Download and double-click to import it.
3. Export it: Keychain Access -> login -> My Certificates -> right-click "Developer ID Application: Your Name (TEAMID)" -> Export -> `.p12`, with a strong password.
4. Encode it: `base64 -i DeveloperID.p12 | pbcopy`.
5. App-specific password: appleid.apple.com -> Sign-In and Security -> App-Specific Passwords -> generate one named "preflight-notarize".
6. Team ID: developer.apple.com -> Membership details (10 characters).
7. Add the repository secrets (Settings -> Secrets and variables -> Actions):

   | Secret | Value |
   | --- | --- |
   | `CSC_LINK` | the base64 text of the `.p12` |
   | `CSC_KEY_PASSWORD` | the `.p12` password |
   | `APPLE_ID` | the Apple ID email |
   | `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password |
   | `APPLE_TEAM_ID` | the 10-character team ID |

   All five are needed; with any missing the workflow warns and builds unsigned.
8. Delete the `.p12` from disk after storing it.

Windows installers are not code-signed (no secret is wired); SmartScreen can warn.

### Homebrew (manual)

Create `arhunsaday/homebrew-tap` and add the formula and cask from `packaging/homebrew/`; see its README.

### Docs

`docs/` deploys separately; the install page is `docs/content/docs/preflight/install.mdx`.

## Secrets summary

| Secret | Used by | Required |
| --- | --- | --- |
| `GITHUB_TOKEN` | draft release, uploads, publish | automatic |
| `NPM_TOKEN` | npm publish fallback | no (trusted publishing is preferred) |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | macOS code signing | no (all five or unsigned) |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS notarization | no (all five or unsigned) |

## Local checks before tagging

```sh
npm run check && npm run desktop:check
npm pack --dry-run                      # (CI removes `main`, the Electron entry, before publishing) only dist/, PREFLIGHT.md, README.md, LICENSE, CHANGELOG.md, package.json
CSC_IDENTITY_AUTO_DISCOVERY=false npm run desktop:pack
```
