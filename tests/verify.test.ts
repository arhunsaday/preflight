import { expect, it } from "vitest";
import { resolveEnvironment, verifyResource } from "../src/verify.js";
import { ResourceSchema } from "../src/schema.js";
it("requires referenced environment variables before connecting", () => {
  expect(() =>
    resolveEnvironment({ env: { TOKEN: "${MISSING_PREFLIGHT_TEST_TOKEN}" } }),
  ).toThrow(/MISSING/);
  expect(
    resolveEnvironment(
      { url: "https://example.com/${TEST}" },
      { TEST: "value" },
    ),
  ).toEqual({ url: "https://example.com/value" });
});
it("reports configuration without executing MCP commands by default", async () => {
  const resource = ResourceSchema.parse({
    id: "mcp:test",
    type: "mcp",
    name: "test",
    source: "local:test",
    scope: "project",
    harnesses: ["claude-code"],
    config: { command: "nonexistent-binary" },
  });
  expect(await verifyResource(resource, false)).toMatchObject({
    connected: false,
  });
});

it("reports an MCP server the doctor could not reach, only when asked", async () => {
  const { execute } = await import("../src/commands.js");
  const { mkdtemp, realpath } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(await realpath(tmpdir()), "preflight-connect-"));
  const context = { root, home: join(root, "home") };
  await execute(["init"], context);
  await execute(
    [
      "create-json",
      JSON.stringify({
        id: "mcp:needs-a-secret",
        type: "mcp",
        name: "needs-a-secret",
        source: "https://example.com/mcp",
        scope: "project",
        harnesses: ["claude-code"],
        config: {
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer ${PREFLIGHT_TEST_ABSENT_TOKEN}" },
        },
      }),
    ],
    context,
  );
  const codes = async (argv: string[]) =>
    ((await execute(argv, context)) as { code: string }[]).map((f) => f.code);
  expect(await codes(["doctor"])).not.toContain("mcp-unreachable");
  const connected = await codes(["doctor", "--connect"]);
  expect(connected).toContain("mcp-unreachable");
  expect(connected).not.toContain("mcp-unverified");
});
