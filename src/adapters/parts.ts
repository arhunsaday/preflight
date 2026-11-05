import { managedBlocks } from "../agents-md.js";
import { parseToml, tomlGet } from "../toml-edit.js";
import { digest } from "./common.js";

/**
 * Lockfile digests for shared files. Preflight owns some tables of a TOML file
 * or some managed blocks of an instruction file; the digest covers only those,
 * so the user's own edits around them are not reported as drift.
 */

export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : item,
  ) ?? "null";

const Part = (part: string) =>
  JSON.parse(part) as
    { kind: "toml"; tables: string[][] } | { kind: "md"; blocks: string[] };

export const tomlPart = (tables: string[][]) =>
  JSON.stringify({ kind: "toml", tables });
export const mdPart = (blocks: string[]) =>
  JSON.stringify({ kind: "md", blocks });

/** The digest of the owned part of `text`, or of the whole text without a part. */
export function partDigest(
  part: string | undefined,
  text: string | null,
): string | null {
  if (text === null) return null;
  if (!part) return digest(text);
  try {
    const parsed = Part(part);
    if (parsed.kind === "toml") {
      const doc = text.trim() ? parseToml(text) : {};
      return digest(
        canonical(parsed.tables.map((path) => tomlGet(doc, path) ?? null)),
      );
    }
    const blocks = managedBlocks(text);
    return digest(
      canonical(
        parsed.blocks.map(
          (id) => blocks.find((b) => b.id === id)?.content ?? null,
        ),
      ),
    );
  } catch {
    // A file that no longer parses has changed.
    return digest(`unreadable:${text}`);
  }
}
