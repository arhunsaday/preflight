import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { artifactManifest, packagedExecutable } from "./desktop-artifacts.mjs";
const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const os = { darwin: "mac", win32: "win", linux: "linux" }[process.platform];

test("manifest hashes current native installers and excludes stale packages", async () => {
  const root = await mkdtemp(join(tmpdir(), "preflight-artifact-"));
  try {
    const name = `Preflight-${version}-${os}-${process.arch}.zip`;
    const bytes = Buffer.from("installer fixture bytes");
    await writeFile(join(root, name), bytes);
    await writeFile(join(root, "Preflight-0.0.0-mac-arm64.zip"), "stale");
    const manifest = await artifactManifest(root);
    assert.deepEqual(manifest.artifacts, [
      {
        file: name,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    ]);
    assert.equal(
      await readFile(join(root, "SHA256SUMS"), "utf8"),
      `${manifest.artifacts[0].sha256}  ${name}\n`,
    );
    assert.deepEqual(
      JSON.parse(await readFile(join(root, "manifest.json"), "utf8")),
      manifest,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an empty release fails instead of advertising an empty download", async () => {
  const root = await mkdtemp(join(tmpdir(), "preflight-artifact-"));
  try {
    await assert.rejects(artifactManifest(root), /No desktop installers/);
    await assert.rejects(packagedExecutable(root), /No native/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
