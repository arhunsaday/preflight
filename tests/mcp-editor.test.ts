import { it, expect } from "vitest";
import { buildMcpConfig } from "../desktop/renderer/components/mcp-config.js";
const draft = {
  transport: "stdio",
  url: "",
  command: "npx",
  args: "-y\n/path with spaces\n",
  variables: '{"API_KEY":"${MY_API_KEY}"}',
  headers: "{}",
};
it("preserves argument boundaries, secret references and registry metadata", () => {
  expect(
    buildMcpConfig(
      '{"url":"https://old.example/mcp","headers":{"Old":"value"},"registryId":"pinned"}',
      draft,
    ),
  ).toEqual({
    command: "npx",
    args: ["-y", "/path with spaces"],
    env: { API_KEY: "${MY_API_KEY}" },
    registryId: "pinned",
  });
});
it("replaces stdio-only keys when changing to remote transport", () => {
  expect(
    buildMcpConfig('{"command":"node","args":["old"],"env":{"OLD":"value"}}', {
      ...draft,
      transport: "sse",
      url: "https://example.com/sse",
      headers: '{"Authorization":"Bearer ${TOKEN}"}',
    }),
  ).toEqual({
    url: "https://example.com/sse",
    type: "sse",
    headers: { Authorization: "Bearer ${TOKEN}" },
  });
});
it("rejects malformed variable maps and non-web endpoints", () => {
  expect(() =>
    buildMcpConfig("{}", { ...draft, variables: '{"KEY":42}' }),
  ).toThrow();
  expect(() =>
    buildMcpConfig("{}", {
      ...draft,
      transport: "http",
      url: "file:///tmp/socket",
    }),
  ).toThrow(/HTTP/);
});
