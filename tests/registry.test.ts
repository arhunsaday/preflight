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
    args: ["-y", "@example/mcp@1.2.3", "--root=${PREFLIGHT_ROOT}"],
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
    headers: { Authorization: "Bearer ${PREFLIGHT_TOKEN}" },
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
it("searches records whose optional repository metadata is empty", async () => {
  const { vi } = await import("vitest");
  const { mcpRegistry } = await import("../src/catalog.js");
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          servers: [
            {
              server: {
                name: "example/no-repository",
                repository: {},
                remotes: [
                  { type: "streamable-http", url: "https://example.com/mcp" },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
  );
  try {
    expect((await mcpRegistry.search("no-repository"))[0]).toMatchObject({
      source: "https://registry.modelcontextprotocol.io",
      config: { url: "https://example.com/mcp" },
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

it("keeps unversioned package metadata inspectable without producing an unpinned launcher", () => {
  expect(
    registryMcpConfig({
      name: "example/unversioned",
      packages: [
        {
          registryType: "npm",
          identifier: "example",
          transport: { type: "stdio" },
        },
      ],
    }),
  ).toMatchObject({ unsupportedReason: expect.any(String) });
});

it("keeps the version the registry marks current and drops withdrawn ones", async () => {
  const { vi } = await import("vitest");
  const { mcpRegistry, searchSources } = await import("../src/catalog.js");
  const entry = (version: string, status: string, isLatest: boolean) => ({
    server: {
      name: "example/versioned",
      description: "versioned server",
      packages: [
        {
          registryType: "npm",
          identifier: "example-mcp",
          version,
          transport: { type: "stdio" },
        },
      ],
    },
    _meta: {
      "io.modelcontextprotocol.registry/official": { status, isLatest },
    },
  });
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          servers: [
            entry("9.9.9", "deleted", true),
            entry("2.0.0", "active", true),
            entry("1.0.0", "active", false),
            { server: { shape: "from tomorrow" } },
          ],
        }),
        { status: 200 },
      ),
  );
  try {
    const found = await searchSources("versioned", [mcpRegistry]);
    expect(found.resources).toHaveLength(1);
    expect(found.resources[0]!.config).toMatchObject({
      command: "npx",
      args: ["-y", "example-mcp@2.0.0"],
    });
    expect(found.errors).toEqual([
      "mcp-registry: skipped 1 entry this version cannot read",
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
});
