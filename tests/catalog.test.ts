import { mkdtemp, realpath, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { localCatalog } from "../src/catalog.js";
it("includes supporting files in local skill inspection", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "adk-catalog-"));
  await mkdir(join(root, "skills", "demo", "scripts"), { recursive: true });
  await writeFile(
    join(root, "skills", "demo", "SKILL.md"),
    "---\nname: demo\ndescription: Demo\n---\nRun scripts/test.sh",
  );
  await writeFile(
    join(root, "skills", "demo", "scripts", "test.sh"),
    "echo test",
  );
  const resources = await localCatalog(root);
  expect(resources[0]?.config.files).toEqual([
    { path: "scripts/test.sh", contents: "echo test" },
  ]);
});
