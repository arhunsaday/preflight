import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nextVersion, updateChangelog, release } from "./release.mjs";

const sample = `# Changelog

## [Unreleased]

### Added

- Thing.

[Unreleased]: https://github.com/arhunsaday/preflight/commits/main
`;

test("nextVersion", () => {
  assert.equal(nextVersion("0.1.0", "patch"), "0.1.1");
  assert.equal(nextVersion("0.1.9", "minor"), "0.2.0");
  assert.equal(nextVersion("0.1.9", "major"), "1.0.0");
  assert.equal(nextVersion("0.1.9", "2.0.0"), "2.0.0");
  assert.throws(() => nextVersion("0.1.0", "wat"));
});

test("updateChangelog releases the unreleased section", () => {
  const first = updateChangelog(sample, "0.1.0", "2026-11-04");
  assert.match(first, /## \[Unreleased\]\n\n## \[0\.1\.0\] - 2026-11-04\n\n### Added/);
  assert.match(first, /\[0\.1\.0\]: .*releases\/tag\/v0\.1\.0/);
  const second = updateChangelog(
    first.replace("## [Unreleased]\n", "## [Unreleased]\n\n- More.\n"),
    "0.2.0",
    "2026-12-01",
  );
  assert.match(second, /\[0\.2\.0\]: .*compare\/v0\.1\.0\.\.\.v0\.2\.0/);
  assert.match(second, /\[Unreleased\]: .*compare\/v0\.2\.0\.\.\.HEAD/);
});

test("updateChangelog refuses an empty unreleased section", () => {
  assert.throws(() => updateChangelog("## [Unreleased]\n\n## [0.1.0] - x\n- a\n", "0.2.0", "d"), /empty/);
});

test("release is a dry run unless applied, then commits and tags", () => {
  const root = mkdtempSync(join(tmpdir(), "release-"));
  const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "0.1.0" }, null, 2) + "\n");
  writeFileSync(join(root, "CHANGELOG.md"), sample);
  git("add", ".");
  git("commit", "-qm", "init");
  const quiet = () => {};
  release({ root, request: "0.1.0", date: "2026-11-04", log: quiet });
  assert.equal(git("tag", "--list"), "");
  assert.equal(readFileSync(join(root, "CHANGELOG.md"), "utf8"), sample);
  release({ root, request: "0.1.0", apply: true, date: "2026-11-04", log: quiet });
  assert.equal(git("tag", "--list"), "v0.1.0");
  assert.equal(git("log", "-1", "--format=%s"), "release: v0.1.0");
  assert.throws(() => release({ root, request: "0.1.0", date: "d", log: quiet }), /already exists/);
  writeFileSync(join(root, "CHANGELOG.md"), readFileSync(join(root, "CHANGELOG.md"), "utf8").replace("## [Unreleased]\n", "## [Unreleased]\n\n- Fix.\n"));
  git("commit", "-qam", "fix");
  release({ root, request: "patch", apply: true, date: "2026-11-05", log: quiet });
  assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, "0.1.1");
  assert.equal(git("tag", "--list", "v0.1.1"), "v0.1.1");
});
