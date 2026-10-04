import { expect, it } from "vitest";
import app from "../src/worker.js";
import { ResourceSchema } from "../src/schema.js";
import { makeShare } from "../src/sharing.js";
const payload = makeShare(
  [
    ResourceSchema.parse({
      id: "prompt:hello",
      type: "prompt",
      name: "<script>bad</script>",
      source: "https://example.com",
      scope: "project",
      harnesses: ["claude-code"],
      content: "Hello",
    }),
  ],
  { ownerId: "owner" },
);
it("publishes inspectable shares, enforces ownership and revocation", async () => {
  const data = new Map<string, string>();
  const env = {
    SHARES: {
      get: async (k: string) => data.get(k) ?? null,
      put: async (k: string, v: string) => {
        data.set(k, v);
      },
      delete: async (k: string) => {
        data.delete(k);
      },
    },
    PAYLOADS: {
      put: async (k: string, v: string) => {
        data.set(k, v);
      },
      get: async (k: string) =>
        data.has(k) ? { text: async () => data.get(k)! } : null,
      delete: async (k: string) => {
        data.delete(k);
      },
    },
    OWNER_ID: "owner",
    WRITE_TOKEN: "test-token",
  };
  expect(
    (
      await app.request(
        "/api/shares",
        { method: "POST", body: JSON.stringify(payload) },
        env,
      )
    ).status,
  ).toBe(401);
  const response = await app.request(
    "/api/shares",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    env,
  );
  expect(response.status).toBe(201);
  const result = (await response.json()) as { code: string };
  const page = await app.request(`/s/${result.code}`, {}, env);
  expect(await page.text()).toContain("&lt;script&gt;");
  expect(
    (
      await app.request(
        `/api/shares/${result.code}`,
        { method: "DELETE", headers: { Authorization: "Bearer test-token" } },
        env,
      )
    ).status,
  ).toBe(204);
  expect(
    (await app.request(`/api/shares/${result.code}`, {}, env)).status,
  ).toBe(404);
});

it("authenticates a deployment owner without publishing or leaking credentials", async () => {
  const env = { OWNER_ID: "platform", WRITE_TOKEN: "private-owner-token" };
  expect((await app.request("/api/account", {}, env)).status).toBe(401);
  expect(
    (
      await app.request(
        "/api/account",
        { headers: { Authorization: "Bearer wrong" } },
        env,
      )
    ).status,
  ).toBe(401);
  const reply = await app.request(
    "/api/account",
    { headers: { Authorization: "Bearer private-owner-token" } },
    env,
  );
  expect(reply.status).toBe(200);
  expect(await reply.json()).toEqual({
    ownerId: "platform",
    authentication: "deployment-token",
  });
});
