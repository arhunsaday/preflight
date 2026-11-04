# Homebrew tap

`preflight.rb` (CLI, built from the npm tarball) and `preflight-desktop.rb`
(desktop dmg cask) are templates. The tap repository is `arhunsaday/homebrew-tap`
and is created by hand; the release workflow does not touch it.

## Create the tap (once)

1. On GitHub, create a public repository named exactly `homebrew-tap` under `arhunsaday`.
2. Add `Formula/preflight.rb` (from `preflight.rb`) and `Casks/preflight.rb` (from `preflight-desktop.rb`).
3. Fill the checksums (below), commit and push.
4. Check: `brew install arhunsaday/tap/preflight` and `brew install --cask arhunsaday/tap/preflight`.

## Update for each release

```sh
v=0.1.0
curl -sL "https://registry.npmjs.org/@arhunsaday/preflight/-/preflight-$v.tgz" | shasum -a 256   # formula
curl -sL "https://github.com/arhunsaday/preflight/releases/download/v$v/SHA256SUMS" | grep mac    # cask
```

Edit `version`, `url` and the `sha256` values, then `brew audit --new --cask arhunsaday/tap/preflight` and
`brew audit --strict arhunsaday/tap/preflight`. The cask sets `auto_updates true` because signed macOS builds
update themselves; for an unsigned release remove that line.
