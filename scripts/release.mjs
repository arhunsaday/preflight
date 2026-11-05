#!/usr/bin/env node
// One-tag releases: bump the single version (CLI and desktop share package.json),
// turn the changelog's [Unreleased] section into the release, commit and tag.
//
//   npm run release -- patch|minor|major|X.Y.Z [--apply] [--allow-dirty]
//
// Dry run by default. With --apply it commits and tags locally; pushing the
// tag (printed at the end) is what starts .github/workflows/release.yml.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = "https://github.com/arhunsaday/preflight";
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function nextVersion(current, request) {
  if (SEMVER.test(request)) return request;
  const match = SEMVER.exec(current);
  if (!match) throw new Error(`Current version "${current}" is not X.Y.Z`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (request === "major") return `${major + 1}.0.0`;
  if (request === "minor") return `${major}.${minor + 1}.0`;
  if (request === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown version "${request}": use patch, minor, major or X.Y.Z`);
}

export function compareVersions(a, b) {
  const x = SEMVER.exec(a).slice(1).map(Number);
  const y = SEMVER.exec(b).slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Turn "## [Unreleased]" into "## [version] - date" and open a fresh Unreleased. */
export function updateChangelog(text, version, date) {
  const heading = /^## \[Unreleased\][^\n]*$/m;
  if (!heading.test(text)) throw new Error("CHANGELOG.md has no '## [Unreleased]' heading");
  const start = text.search(heading);
  const rest = text.slice(start).replace(heading, "");
  const end = rest.search(/^## \[|^\[[^\]]+\]: /m);
  const body = (end === -1 ? rest : rest.slice(0, end)).trim();
  if (!body) throw new Error("The [Unreleased] section is empty: describe the release first");
  if (new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\]`, "m").test(text))
    throw new Error(`CHANGELOG.md already has a ${version} section`);
  const previous = [...text.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)]
    .map((m) => m[1])
    .sort(compareVersions)
    .pop();
  let out = text.replace(heading, `## [Unreleased]\n\n## [${version}] - ${date}`);
  const link = previous
    ? `[${version}]: ${REPO}/compare/v${previous}...v${version}`
    : `[${version}]: ${REPO}/releases/tag/v${version}`;
  const unreleased = `[Unreleased]: ${REPO}/compare/v${version}...HEAD`;
  if (/^\[Unreleased\]: .*$/m.test(out)) out = out.replace(/^\[Unreleased\]: .*$/m, `${unreleased}\n${link}`);
  else out = `${out.trimEnd()}\n\n${unreleased}\n${link}\n`;
  return out;
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

export function release({ root, request, apply = false, allowDirty = false, date, log = console.log }) {
  const packagePath = resolve(root, "package.json");
  const changelogPath = resolve(root, "CHANGELOG.md");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const version = nextVersion(pkg.version, request);
  const tag = `v${version}`;
  const order = compareVersions(version, pkg.version);
  if (order < 0) throw new Error(`${version} is older than the current ${pkg.version}`);
  const tags = git(root, "tag", "--list", tag);
  if (tags) throw new Error(`Tag ${tag} already exists`);
  // The checked-in version (0.1.0) is the first release: no bump needed, still tag it.
  const bump = order > 0;
  if (!allowDirty && git(root, "status", "--porcelain", "--untracked-files=no"))
    throw new Error("Working tree has uncommitted changes (use --allow-dirty to ignore)");
  const changelog = updateChangelog(readFileSync(changelogPath, "utf8"), version, date);
  log(`${apply ? "Releasing" : "Dry run:"} ${pkg.version} -> ${version} (tag ${tag})`);
  log(`  package.json   ${bump ? `version ${pkg.version} -> ${version}` : "version already " + version}`);
  log(`  CHANGELOG.md   [Unreleased] -> [${version}] - ${date}`);
  log(`  git            commit "release: ${tag}" and tag ${tag}`);
  if (!apply) {
    log("Nothing was written. Re-run with --apply to commit and tag.");
    return { version, tag, applied: false };
  }
  const files = ["CHANGELOG.md"];
  if (bump) {
    const raw = readFileSync(packagePath, "utf8").replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
    writeFileSync(packagePath, raw);
    files.push("package.json");
    try {
      const lockPath = resolve(root, "package-lock.json");
      const lock = JSON.parse(readFileSync(lockPath, "utf8"));
      lock.version = version;
      if (lock.packages?.[""]) lock.packages[""].version = version;
      writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
      files.push("package-lock.json");
    } catch {
      /* no lockfile */
    }
  }
  writeFileSync(changelogPath, changelog);
  git(root, "add", ...files);
  git(root, "commit", "-m", `release: ${tag}`);
  git(root, "tag", "-a", tag, "-m", `Preflight ${version}`);
  log(`Committed and tagged ${tag}. Start the release with:`);
  log(`  git push origin HEAD ${tag}`);
  return { version, tag, applied: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const request = args.find((a) => !a.startsWith("--"));
  if (!request) {
    console.error("Usage: npm run release -- <patch|minor|major|X.Y.Z> [--apply] [--allow-dirty]");
    process.exit(2);
  }
  try {
    release({
      root: resolve(fileURLToPath(import.meta.url), "../.."),
      request,
      apply: args.includes("--apply"),
      allowDirty: args.includes("--allow-dirty"),
      date: new Date().toISOString().slice(0, 10),
    });
  } catch (error) {
    console.error(`release: ${error.message}`);
    process.exit(1);
  }
}
