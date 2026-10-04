import { stat, readdir, readFile, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

export async function packagedExecutable(directory = "desktop-release") {
  const folders =
    process.platform === "darwin"
      ? [process.arch === "arm64" ? "mac-arm64" : "mac", "mac-universal"]
      : process.platform === "win32"
        ? [process.arch === "arm64" ? "win-arm64-unpacked" : "win-unpacked"]
        : [
            process.arch === "arm64"
              ? "linux-arm64-unpacked"
              : "linux-unpacked",
          ];
  const executable =
    process.platform === "darwin"
      ? "Preflight.app/Contents/MacOS/Preflight"
      : process.platform === "win32"
        ? "Preflight.exe"
        : "preflight";
  for (const folder of folders) {
    const candidate = resolve(directory, folder, executable);
    if (
      await stat(candidate)
        .then((s) => s.isFile())
        .catch(() => false)
    )
      return candidate;
  }
  throw new Error(
    `No native ${process.platform}/${process.arch} package found. Run npm run desktop:pack first.`,
  );
}

export async function artifactManifest(directory = "desktop-release") {
  const root = resolve(directory);
  const { version } = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const os = { darwin: "mac", win32: "win", linux: "linux" }[process.platform];
  const prefix = `Preflight-${version}-${os}-${process.arch}.`;
  const names = (await readdir(root, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith(prefix) &&
        /\.(dmg|zip|exe|AppImage|deb)$/.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  if (!names.length)
    throw new Error(
      "No desktop installers found; refusing to emit an empty manifest.",
    );
  const artifacts = [];
  for (const name of names) {
    const path = join(root, name);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    artifacts.push({
      file: basename(path),
      bytes: (await stat(path)).size,
      sha256: hash.digest("hex"),
    });
  }
  const manifest = {
    version,
    platform: process.platform,
    arch: process.arch,
    signatureVerification: "not-performed",
    artifacts,
  };
  await writeFile(
    join(root, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    join(root, "SHA256SUMS"),
    artifacts.map((a) => `${a.sha256}  ${a.file}\n`).join(""),
  );
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  console.log(JSON.stringify(await artifactManifest(), null, 2));
}
