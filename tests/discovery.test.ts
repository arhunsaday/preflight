import { it, expect, vi, afterEach } from "vitest";
import { execute } from "../src/commands.js";
import { mcpRegistry, skillsSource } from "../src/catalog.js";
const context = { root: process.cwd(), home: process.cwd() };
afterEach(() => vi.restoreAllMocks());
it("selects only the requested online source and forwards its failures", async () => {
  const mcp = vi
    .spyOn(mcpRegistry, "search")
    .mockRejectedValue(new Error("registry unavailable"));
  const skills = vi.spyOn(skillsSource, "search").mockResolvedValue([]);
  const reply = await execute(
    ["search", "filesystem", "--source", "mcp-registry", "--type", "mcp"],
    context,
  );
  expect(mcp).toHaveBeenCalledWith("filesystem");
  expect(skills).not.toHaveBeenCalled();
  expect(reply).toMatchObject({
    resources: [],
    errors: ["mcp-registry: Error: registry unavailable"],
  });
});
it("offline discovery never contacts remote sources", async () => {
  const mcp = vi.spyOn(mcpRegistry, "search");
  const skills = vi.spyOn(skillsSource, "search");
  const reply = await execute(
    ["search", "ponytail", "--source", "bundled"],
    context,
  );
  expect(reply).toMatchObject({
    resources: [expect.objectContaining({ name: "ponytail" })],
    errors: [],
  });
  expect(mcp).not.toHaveBeenCalled();
  expect(skills).not.toHaveBeenCalled();
});
it("requires a repository when GitHub is explicitly selected", async () => {
  await expect(
    execute(["search", "react", "--source", "github"], context),
  ).rejects.toThrow(/--github/);
});
