import { expect, it, vi, afterEach } from "vitest";
import { mkdtemp, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execute } from "../src/commands.js";
afterEach(() => vi.unstubAllGlobals());
it("imports a generated share URL through the existing preview pipeline without sending credentials", async () => {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "preflight-share-url-"),
  );
  const context = { root, home: join(root, "home") };
  await execute(["init"], context);
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          version: 1,
          ownerId: "owner",
          visibility: "unlisted",
          createdAt: new Date().toISOString(),
          resources: [
            {
              id: "prompt:shared",
              type: "prompt",
              name: "Shared",
              scope: "project",
              source: "local:shared",
              harnesses: ["claude-code"],
              content: "Shared instruction",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  await execute(
    ["apply", "https://setup.example.com/s/abc234", "--dry-run"],
    context,
  );
  expect(fetcher).toHaveBeenCalledWith(
    "https://setup.example.com/api/shares/abc234",
    { signal: expect.any(AbortSignal) },
  );
  expect(fetcher.mock.calls[0]![1]).not.toHaveProperty("headers");
  await expect(
    execute(
      ["apply", "https://setup.example.com/unrelated", "--dry-run"],
      context,
    ),
  ).rejects.toThrow(/share URL/);
  await expect(
    execute(
      [
        "apply",
        "https://user:password@setup.example.com/s/abc234",
        "--dry-run",
      ],
      context,
    ),
  ).rejects.toThrow(/share URL/);
});
