# Homebrew formula template for the Preflight CLI (npm based).
# Copy to Formula/preflight.rb in the arhunsaday/homebrew-tap repository and
# fill url + sha256 for each release (see packaging/homebrew/README.md).
class Preflight < Formula
  desc "Search, inspect, scope, share and verify AI development configurations"
  homepage "https://preflight.arhun.fr"
  url "https://registry.npmjs.org/@arhunsaday/preflight/-/preflight-0.1.0.tgz"
  sha256 "REPLACE_WITH_NPM_TARBALL_SHA256"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "doctor", shell_output("#{bin}/preflight --help")
    assert_path_exists libexec/"lib/node_modules/@arhunsaday/preflight/package.json"
  end
end
