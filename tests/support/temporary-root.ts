import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests create disposable projects and homes under os.tmpdir(). Point every
// worker at one run directory so a single teardown removes them all.
export default function setup(): () => void {
  const root = mkdtempSync(join(tmpdir(), "adk-test-run-"));
  process.env.TMPDIR = root;
  return () => rmSync(root, { recursive: true, force: true });
}
