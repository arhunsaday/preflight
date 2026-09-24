import { expect, it } from "vitest";
import { registryMcpConfig } from "../src/registry.js";
it("turns a pinned npm package into runnable stdio configuration", () => {
  expect(
    registryMcpConfig({
      name: "example/server",
      packages: [
        {
          registryType: "npm",
          identifier: "@example/mcp",
          version: "1.2.3",
          transport: { type: "stdio" },
          environmentVariables: [
            { name: "TOKEN", isSecret: true, isRequired: true },
            { name: "OPTIONAL" },
            { name: "MODE", default: "read" },
          ],
          packageArguments: [
            {
              type: "named",
              name: "--root",
              valueHint: "root",
              isRequired: true,
            },
          ],
        },
      ],
    }),
  ).toEqual({
    command: "npx",
    args: ["-y", "@example/mcp@1.2.3", "--root=${ADK_ROOT}"],
    env: { TOKEN: "${TOKEN}", MODE: "read" },
  });
});
it("preserves SSE transport and secret header references", () => {
  expect(
    registryMcpConfig({
      name: "example/remote",
      remotes: [
        {
          type: "sse",
          url: "https://example.com/sse",
          headers: [
            {
              name: "Authorization",
              value: "Bearer {token}",
              variables: { token: { isSecret: true, isRequired: true } },
            },
          ],
        },
      ],
    }),
  ).toEqual({
    type: "sse",
    url: "https://example.com/sse",
    headers: { Authorization: "Bearer ${ADK_TOKEN}" },
  });
});
it("pins Python packages and does not invent unsupported launchers", () => {
  expect(
    registryMcpConfig({
      name: "example/py",
      packages: [
        {
          registryType: "pypi",
          identifier: "example-mcp",
          version: "2.0",
          transport: { type: "stdio" },
        },
      ],
    }),
  ).toMatchObject({ command: "uvx", args: ["example-mcp==2.0"] });
  expect(
    registryMcpConfig({
      name: "example/unknown",
      packages: [
        {
          registryType: "unknown",
          identifier: "x",
          version: "1",
          transport: { type: "stdio" },
        },
      ],
    }),
  ).toHaveProperty("unsupportedReason");
});
