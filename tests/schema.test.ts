import { describe, expect, it } from "vitest";
import { AdkConfigSchema, SharePayloadSchema } from "../src/schema.js";

describe("configuration schema", () => {
  it("accepts every supported resource type with stable identity and source", () => {
    const types = [
      "skill",
      "mcp",
      "subagent",
      "hook",
      "prompt",
      "tool",
      "plugin",
      "statusline",
      "command",
    ];
    const config = AdkConfigSchema.parse({
      version: 1,
      activeProfile: "default",
      profiles: {
        default: {
          resources: types.map((type) => ({
            id: `${type}:example`,
            type,
            name: `Example ${type}`,
            source: "file:///example",
            scope: "project",
            harnesses: ["claude-code"],
            enabled: true,
            config: {},
          })),
        },
      },
    });
    expect(config.profiles.default?.resources).toHaveLength(types.length);
  });

  it("rejects literal secret values in shares but accepts environment references", () => {
    const base = {
      version: 1,
      ownerId: "local",
      visibility: "unlisted",
      createdAt: "2026-09-23T00:00:00.000Z",
      resources: [
        {
          id: "mcp:grafana",
          type: "mcp",
          name: "Grafana",
          source: "https://example.test/grafana",
          scope: "project",
          harnesses: ["claude-code"],
          enabled: true,
          config: { env: { GRAFANA_TOKEN: "${GRAFANA_TOKEN}" } },
        },
      ],
    };
    expect(SharePayloadSchema.parse(base)).toBeTruthy();
    expect(() =>
      SharePayloadSchema.parse({
        ...base,
        resources: [
          {
            ...base.resources[0],
            config: { env: { GRAFANA_TOKEN: "literal-value" } },
          },
        ],
      }),
    ).toThrow(/secret/i);
  });
});
it("rejects bearer headers, URL credentials and command-line secrets", () => {
  for (const config of [
    { headers: { Authorization: "Bearer ordinary-credential" } },
    { url: "https://user:password@example.com/mcp" },
    { args: ["--token", "ordinary-credential"] },
  ]) {
    expect(() =>
      SharePayloadSchema.parse({
        version: 1,
        ownerId: "local",
        visibility: "unlisted",
        createdAt: new Date().toISOString(),
        resources: [
          {
            id: "mcp:secret",
            type: "mcp",
            name: "secret",
            source: "local:test",
            scope: "project",
            harnesses: ["claude-code"],
            config,
          },
        ],
      }),
    ).toThrow(/secret/i);
  }
});
it("allows pinned GitHub commit provenance in shares", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  expect(() =>
    SharePayloadSchema.parse({
      version: 1,
      ownerId: "local",
      visibility: "unlisted",
      createdAt: new Date().toISOString(),
      resources: [
        {
          id: "skill:pinned",
          type: "skill",
          name: "Pinned",
          source: `https://github.com/example/repo/blob/${sha}/SKILL.md`,
          scope: "project",
          harnesses: ["claude-code"],
          config: { commit: sha },
        },
      ],
    }),
  ).not.toThrow();
});
