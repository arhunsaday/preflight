import { expect, it } from "vitest";
import { parseToml, setTomlTable, tableHeaders } from "../src/toml-edit.js";

const config = `# Codex settings, edited by hand
model = "gpt-6.1-sol"  # keep this comment
model_reasoning_effort = "high"

[profiles.fast]
model = "gpt-6.1-mini"

# The docs server
[mcp_servers.docs]
command = "npx"
args = [
  "-y",
  "docs-mcp", # inline comment
]

[mcp_servers.docs.env]
LEVEL = "debug"

[projects."/home/me/work"]
trust_level = "trusted"
notes = """
[not.a.header]
"""
`;

it("finds headers but not brackets inside values, strings or comments", () => {
  expect(tableHeaders(config).map((h) => h.path.join("."))).toEqual([
    "profiles.fast",
    "mcp_servers.docs",
    "mcp_servers.docs.env",
    "projects./home/me/work",
  ]);
});

it("adds a table next to its siblings and removes it back to the same bytes", () => {
  const added = setTomlTable(config, ["mcp_servers", "search"], {
    url: "https://example.com/mcp",
    bearer_token_env_var: "SEARCH_TOKEN",
  });
  expect(added.startsWith(config.slice(0, config.indexOf("[projects")))).toBe(
    true,
  );
  expect(added).toContain(
    '[mcp_servers.search]\nurl = "https://example.com/mcp"',
  );
  expect(parseToml(added).model).toBe("gpt-6.1-sol");
  expect(added.indexOf("[mcp_servers.search]")).toBeLessThan(
    added.indexOf("[projects"),
  );
  expect(setTomlTable(added, ["mcp_servers", "search"], null)).toBe(config);
});

it("replaces a table with its sub-tables and keeps comments and unrelated tables", () => {
  const replaced = setTomlTable(config, ["mcp_servers", "docs"], {
    command: "uvx",
    args: ["docs"],
    env: { LEVEL: "info" },
  });
  expect(replaced).toContain(
    '# The docs server\n[mcp_servers.docs]\ncommand = "uvx"',
  );
  expect(replaced).not.toContain("[mcp_servers.docs.env]");
  expect(replaced).toContain('model = "gpt-6.1-sol"  # keep this comment');
  expect(replaced).toContain('[projects."/home/me/work"]');
  expect(parseToml(replaced).mcp_servers).toEqual({
    docs: { command: "uvx", args: ["docs"], env: { LEVEL: "info" } },
  });
});

it("appends to a file without siblings and to an empty file", () => {
  const empty = setTomlTable("", ["mcp_servers", "a b"], { command: "x" });
  expect(empty).toBe('[mcp_servers."a b"]\ncommand = "x"\n');
  expect(setTomlTable(empty, ["mcp_servers", "a b"], null)).toBe("");
  const plain = 'model = "o"\n';
  const out = setTomlTable(plain, ["mcp_servers", "a"], { command: "x" });
  expect(out).toBe('model = "o"\n\n[mcp_servers.a]\ncommand = "x"\n');
  expect(setTomlTable(out, ["mcp_servers", "a"], null)).toBe(plain);
});

it("refuses tables defined inline or as arrays", () => {
  expect(() =>
    setTomlTable(
      '[mcp_servers]\ndocs = { command = "x" }\n',
      ["mcp_servers", "docs"],
      {
        command: "y",
      },
    ),
  ).toThrow(/inline/);
  expect(() =>
    setTomlTable(
      'mcp_servers.docs.command = "x"\n',
      ["mcp_servers", "docs"],
      null,
    ),
  ).toThrow(/inline/);
  expect(() =>
    setTomlTable(
      '[[mcp_servers.docs]]\ncommand = "x"\n',
      ["mcp_servers", "docs"],
      null,
    ),
  ).toThrow(/array/);
});

it("keeps CRLF line endings", () => {
  const crlf = 'model = "o"\r\n';
  const out = setTomlTable(crlf, ["mcp_servers", "a"], { command: "x" });
  expect(out).toBe('model = "o"\r\n\r\n[mcp_servers.a]\r\ncommand = "x"\r\n');
  expect(setTomlTable(out, ["mcp_servers", "a"], null)).toBe(crlf);
});
