/**
 * Managed blocks in instruction files such as AGENTS.md. Preflight writes its
 * instructions between marker comments and never touches the text around them:
 *
 *   <!-- preflight:begin instructions:review -->
 *   ...
 *   <!-- preflight:end instructions:review -->
 */

const begin = (id: string) => `<!-- preflight:begin ${id} -->`;
const end = (id: string) => `<!-- preflight:end ${id} -->`;
const marker = /<!-- preflight:(begin|end) ([^\s>]+) -->/g;

export interface ManagedBlock {
  id: string;
  content: string;
  start: number;
  end: number;
}

/** The managed blocks of a document; unbalanced markers are an error. */
export function managedBlocks(text: string): ManagedBlock[] {
  const blocks: ManagedBlock[] = [];
  let open: { id: string; start: number; body: number } | null = null;
  for (const match of text.matchAll(marker)) {
    const [whole, kind, id] = match as unknown as [string, string, string];
    const at = match.index;
    if (kind === "begin") {
      if (open) throw new Error(`Managed block ${open.id} is not closed`);
      open = { id, start: at, body: at + whole.length };
    } else {
      if (!open || open.id !== id)
        throw new Error(`Unexpected end of managed block ${id}`);
      if (blocks.some((b) => b.id === id))
        throw new Error(`Managed block ${id} appears twice`);
      blocks.push({
        id,
        content: text
          .slice(open.body, at)
          .replace(/^\r?\n/, "")
          .replace(/\r?\n$/, ""),
        start: open.start,
        end: at + whole.length,
      });
      open = null;
    }
  }
  if (open) throw new Error(`Managed block ${open.id} is not closed`);
  return blocks;
}

/** The document without its managed blocks: what the user wrote. */
export function unmanagedText(text: string) {
  let out = "";
  let cursor = 0;
  for (const block of managedBlocks(text)) {
    out += text.slice(cursor, block.start);
    cursor = block.end;
  }
  return out + text.slice(cursor);
}

/**
 * Set (or with `null` remove) one managed block. A new block is appended after
 * a blank line; removing it restores the original bytes. A file Preflight
 * created and emptied again is removed (`null`).
 */
export function setManagedBlock(
  text: string | null,
  id: string,
  content: string | null,
): string | null {
  if (!/^[^\s>]+$/.test(id)) throw new Error(`Invalid managed block id: ${id}`);
  if (content !== null && /<!-- preflight:(?:begin|end) /.test(content))
    throw new Error("Instructions cannot contain Preflight block markers");
  const source = text ?? "";
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const existing = managedBlocks(source).find((b) => b.id === id);
  const body =
    content === null
      ? ""
      : begin(id) +
        eol +
        content.replace(/\r?\n$/, "").replace(/\r?\n/g, eol) +
        eol +
        end(id);
  let result: string;
  if (existing) {
    if (content !== null)
      result =
        source.slice(0, existing.start) + body + source.slice(existing.end);
    else {
      let head = source.slice(0, existing.start);
      let tail = source.slice(existing.end);
      tail = tail.replace(/^\r?\n/, "");
      if (!tail) head = head.replace(/(\r?\n)\r?\n$/, "$1");
      result = head + tail;
    }
  } else if (content !== null) {
    let head = source;
    if (head && !head.endsWith("\n")) head += eol;
    if (head) head += eol;
    result = head + body + eol;
  } else result = source;
  return !result.trim() && (text === null || text.trim()) ? null : result;
}
