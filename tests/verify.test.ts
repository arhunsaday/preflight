import { expect, it } from "vitest";
import { resolveEnvironment, verifyResource } from "../src/verify.js";
import { ResourceSchema } from "../src/schema.js";
it("requires referenced environment variables before connecting", () => {
  expect(() =>
    resolveEnvironment({ env: { TOKEN: "${MISSING_ADK_TEST_TOKEN}" } }),
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
