# Homebrew cask template for the Preflight desktop app (macOS dmg).
# Copy to Casks/preflight.rb in the arhunsaday/homebrew-tap repository and
# update version and both checksums for each release.
cask "preflight" do
  arch arm: "arm64", intel: "x64"

  version "0.1.0"
  # From the release's SHA256SUMS: Preflight-<version>-mac-arm64.dmg / -mac-x64.dmg
  sha256 arm:   "REPLACE_WITH_ARM64_DMG_SHA256",
         intel: "REPLACE_WITH_X64_DMG_SHA256"

  url "https://github.com/arhunsaday/preflight/releases/download/v#{version}/Preflight-#{version}-mac-#{arch}.dmg",
      verified: "github.com/arhunsaday/preflight/"
  name "Preflight"
  desc "Visibility and control for AI coding setups"
  homepage "https://preflight.arhun.fr"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :monterey"

  app "Preflight.app"

  zap trash: [
    "~/Library/Application Support/Preflight",
    "~/Library/Caches/dev.preflight.desktop",
    "~/Library/Caches/dev.preflight.desktop.ShipIt",
    "~/Library/Preferences/dev.preflight.desktop.plist",
    "~/Library/Saved Application State/dev.preflight.desktop.savedState",
  ]
end
