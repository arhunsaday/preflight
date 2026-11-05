import { gunzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

const text = (block: Buffer, start: number, length: number) =>
  block
    .subarray(start, start + length)
    .toString("utf8")
    .replace(/\0[\s\S]*$/, "");

function octal(block: Buffer, start: number, length: number) {
  const value = text(block, start, length).trim();
  return value ? parseInt(value, 8) : 0;
}

function paxPath(data: Buffer) {
  // Records are "<length> <key>=<value>\n".
  let offset = 0;
  let path: string | undefined;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space < 0) break;
    const length = parseInt(data.subarray(offset, space).toString(), 10);
    if (!length) break;
    const record = data.subarray(space + 1, offset + length - 1).toString();
    const equals = record.indexOf("=");
    if (record.slice(0, equals) === "path") path = record.slice(equals + 1);
    offset += length;
  }
  return path;
}

/**
 * Extracts a gzipped tarball such as a GitHub archive into a directory.
 * Only regular files and directories are written: links, devices and paths
 * that would leave the destination are skipped. The first path component
 * (GitHub's "<repo>-<sha>/" folder) is removed.
 */
export async function extractTarball(
  archive: Buffer,
  destination: string,
  limits = { files: 20000, bytes: 200_000_000 },
) {
  const data = gunzipSync(archive, { maxOutputLength: limits.bytes });
  const root = resolve(destination);
  let offset = 0;
  let nextPath: string | undefined;
  let files = 0;
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const body = data.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      nextPath = paxPath(body);
      continue;
    }
    if (type === "L") {
      nextPath = body.toString("utf8").replace(/\0+$/, "");
      continue;
    }
    if (type === "g") continue;
    const prefix = text(header, 345, 155);
    const name =
      nextPath ?? (prefix ? `${prefix}/` : "") + text(header, 0, 100);
    nextPath = undefined;
    if (type !== "0" && type !== "5") continue;
    const parts = name
      .split("/")
      .filter((p) => p && p !== ".")
      .slice(1);
    if (!parts.length || parts.some((p) => p === ".." || p === ".")) continue;
    const target = resolve(root, ...parts);
    if (!target.startsWith(root + sep)) continue;
    if (type === "5") {
      await mkdir(target, { recursive: true });
      continue;
    }
    if (++files > limits.files) throw new Error("Archive has too many files");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }
  return { files, root: join(root) };
}
