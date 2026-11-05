import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** The fixture content source tests read their catalogue and loadouts from. */
export const fixtureCatalog = resolve(
  import.meta.dirname,
  "../fixtures/catalog",
);

/** Configure the fixture as a local source in a disposable HOME. */
export async function useFixtureSource(home: string) {
  await mkdir(join(home, ".preflight"), { recursive: true });
  await writeFile(
    join(home, ".preflight", "sources.json"),
    JSON.stringify({
      version: 1,
      sources: [
        {
          name: "fixture",
          kind: "local",
          path: fixtureCatalog,
          addedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }),
  );
}
