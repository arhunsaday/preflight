import { afterEach, expect, it, vi } from "vitest";
import { backend } from "./support/backend.js";
import { purgeExpired, createApp } from "../src/worker.js";
import { ResourceSchema } from "../src/schema.js";
import { makeShare } from "../src/sharing.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  vi.restoreAllMocks();
});
async function fixture() {
  const f = await backend();
  cleanups.push(f.close);
  return f;
}
const resource = ResourceSchema.parse({
  id: "prompt:hello",
  type: "prompt",
  name: "<script>bad</script>",
  source: "https://example.com",
  scope: "project",
  harnesses: ["claude-code"],
  content: "Hello",
});
const share = (extra: { team?: string; expiresAt?: string } = {}) =>
  makeShare([resource], { ownerId: "local", ...extra });

it("publishes inspectable shares owned by the caller and enforces revocation", async () => {
  const f = await fixture();
  const ada = await f.signIn("ada");
  const bob = await f.signIn("bob");
  expect((await f.request("/api/shares", { body: share() })).status).toBe(401);
  const published = await f.request("/api/shares", { body: share(), token: ada.token });
  expect(published.status).toBe(201);
  const { code, url } = (await published.json()) as { code: string; url: string };
  expect(code).toHaveLength(16);
  expect(url).toBe(`http://localhost/s/${code}`);
  const page = await f.request(`/s/${code}`);
  const html = await page.text();
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain('<html lang="en">');
  expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
  const payload = (await (await f.request(`/api/shares/${code}`)).json()) as { ownerId: string };
  expect(payload.ownerId).toBe(ada.user.id);
  expect(
    ((await (await f.request("/api/shares", { token: ada.token })).json()) as { shares: { code: string }[] }).shares.map((s) => s.code),
  ).toEqual([code]);
  expect(((await (await f.request("/api/shares", { token: bob.token })).json()) as { shares: unknown[] }).shares).toEqual([]);
  expect((await f.request(`/api/shares/${code}`, { method: "DELETE", token: bob.token })).status).toBe(403);
  expect((await f.request(`/api/shares/${code}`, { method: "DELETE", token: ada.token })).status).toBe(204);
  expect((await f.request(`/api/shares/${code}`)).status).toBe(404);
  expect(f.objects.size).toBe(0);
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shares").get()).toEqual({ n: 0 });
});

it("allocates share codes atomically, retrying on a collision", async () => {
  const f = await fixture();
  const ada = await f.signIn("ada");
  const original = crypto.getRandomValues.bind(crypto);
  let calls = 0;
  vi.spyOn(crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
    calls++;
    if (calls <= 2 && array instanceof Uint8Array) {
      array.fill(0);
      return array;
    }
    return original(array as Uint8Array) as unknown as T;
  });
  const first = (await (await f.request("/api/shares", { body: share(), token: ada.token })).json()) as { code: string };
  const second = (await (await f.request("/api/shares", { body: share(), token: ada.token })).json()) as { code: string };
  expect(first.code).toBe("2222222222222222");
  expect(second.code).not.toBe(first.code);
  expect(calls).toBeGreaterThanOrEqual(3);
  expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shares").get()).toEqual({ n: 2 });
});

it("expires shares through KV TTL, cleans up on read and in the scheduled purge", async () => {
  const f = await fixture();
  const ada = await f.signIn("ada");
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  const { code } = (await (await f.request("/api/shares", { body: share({ expiresAt: soon }), token: ada.token })).json()) as { code: string };
  expect(f.ttl.get(code)).toBeGreaterThan(3500);
  expect(f.ttl.get(code)).toBeLessThanOrEqual(3600);
  // Expire it in place: the next read removes R2, KV and D1 entries.
  const entry = JSON.parse(f.kv.get(code)!);
  f.kv.set(code, JSON.stringify({ ...entry, expiresAt: new Date(Date.now() - 1000).toISOString() }));
  expect((await f.request(`/s/${code}`)).status).toBe(404);
  expect(f.objects.size).toBe(0);
  expect(f.kv.has(code)).toBe(false);

  const second = (await (await f.request("/api/shares", { body: share({ expiresAt: soon }), token: ada.token })).json()) as { code: string };
  const keep = (await (await f.request("/api/shares", { body: share(), token: ada.token })).json()) as { code: string };
  expect(await purgeExpired(f.env, Date.now() + 2 * 3_600_000)).toEqual({ shares: 1 });
  expect(f.kv.has(second.code)).toBe(false);
  expect(f.kv.has(keep.code)).toBe(true);
  expect(f.objects.size).toBe(1);
  expect((await f.request("/api/shares", { body: share({ expiresAt: new Date(Date.now() - 1000).toISOString() }), token: ada.token })).status).toBe(400);
});

it("lets team members list team shares and team admins revoke them", async () => {
  const f = await fixture();
  const ada = await f.signIn("ada");
  const bob = await f.signIn("bob");
  const eve = await f.signIn("eve");
  const org = (await (await f.request("/api/orgs", { body: { name: "Crew", slug: "crew" }, token: ada.token })).json()) as { id: string };
  expect((await f.request("/api/shares", { body: share({ team: org.id }), token: bob.token })).status).toBe(403);
  const invite = (await (await f.request(`/api/orgs/${org.id}/invitations`, { body: { email: "bob@example.com", role: "member" }, token: ada.token })).json()) as { id: string };
  expect((await f.request(`/api/invitations/${invite.id}/accept`, { method: "POST", token: bob.token })).status).toBe(200);
  const published = (await (await f.request("/api/shares", { body: share({ team: org.id }), token: bob.token })).json()) as { code: string };
  const listing = (await (await f.request(`/api/shares?team=${org.id}`, { token: ada.token })).json()) as { shares: { code: string; team: string }[] };
  expect(listing.shares).toMatchObject([{ code: published.code, team: org.id }]);
  expect((await f.request(`/api/shares?team=${org.id}`, { token: eve.token })).status).toBe(404);
  expect((await f.request(`/api/shares/${published.code}`, { method: "DELETE", token: eve.token })).status).toBe(403);
  expect((await f.request(`/api/shares/${published.code}`, { method: "DELETE", token: ada.token })).status).toBe(204);
});

it("manages organizations: members, invitations, roles, the last admin and leaving", async () => {
  const f = await fixture();
  const ada = await f.signIn("ada");
  const bob = await f.signIn("bob");
  const eve = await f.signIn("eve");
  const created = await f.request("/api/orgs", { body: { name: "Crew", slug: "crew" }, token: ada.token });
  expect(created.status).toBe(201);
  const org = (await created.json()) as { id: string };
  expect((await f.request("/api/orgs", { body: { name: "Again", slug: "crew" }, token: bob.token })).status).toBe(409);
  expect(await (await f.request("/api/orgs", { token: ada.token })).json()).toMatchObject([{ id: org.id, role: "admin" }]);
  expect((await f.request(`/api/orgs/${org.id}`, { token: eve.token })).status).toBe(404);
  expect((await f.request(`/api/orgs/${org.id}/invitations`, { token: eve.token })).status).toBe(404);

  const invite = (await (await f.request(`/api/orgs/${org.id}/invitations`, { body: { email: "bob@example.com", role: "member" }, token: ada.token })).json()) as { id: string };
  expect(await (await f.request(`/api/orgs/${org.id}/invitations`, { token: ada.token })).json()).toMatchObject([{ id: invite.id, status: "pending", email: "bob@example.com" }]);
  expect(await (await f.request("/api/invitations", { token: eve.token })).json()).toEqual([]);
  expect((await f.request(`/api/invitations/${invite.id}/accept`, { method: "POST", token: eve.token })).status).toBe(404);
  expect(await (await f.request("/api/invitations", { token: bob.token })).json()).toMatchObject([{ id: invite.id, organizationName: "Crew" }]);
  expect((await f.request(`/api/invitations/${invite.id}/accept`, { method: "POST", token: bob.token })).status).toBe(200);
  expect((await f.request(`/api/invitations/${invite.id}/accept`, { method: "POST", token: bob.token })).status).toBe(404);
  const details = (await (await f.request(`/api/orgs/${org.id}`, { token: bob.token })).json()) as { members: { userId: string; role: string; user: { name: string } }[] };
  expect(details.members.map((m) => [m.user.name, m.role]).sort()).toEqual([["ada", "admin"], ["bob", "member"]]);

  // Members cannot manage; admins can, but never remove the last admin.
  expect((await f.request(`/api/orgs/${org.id}/invitations`, { body: { email: "eve@example.com" }, token: bob.token })).status).toBe(403);
  expect((await f.request(`/api/orgs/${org.id}/members/${bob.user.id}`, { method: "PATCH", body: { role: "admin" }, token: bob.token })).status).toBe(403);
  expect((await f.request(`/api/orgs/${org.id}/members/${ada.user.id}`, { method: "PATCH", body: { role: "member" }, token: ada.token })).status).toBe(400);
  expect((await f.request(`/api/orgs/${org.id}/leave`, { method: "POST", token: ada.token })).status).toBe(400);
  expect((await f.request(`/api/orgs/${org.id}/members/${bob.user.id}`, { method: "PATCH", body: { role: "owner" }, token: ada.token })).status).toBe(400);
  expect((await f.request(`/api/orgs/${org.id}/members/${bob.user.id}`, { method: "PATCH", body: { role: "admin" }, token: ada.token })).status).toBe(200);
  expect((await f.request(`/api/orgs/${org.id}/leave`, { method: "POST", token: ada.token })).status).toBe(204);
  expect((await f.request(`/api/orgs/${org.id}`, { token: ada.token })).status).toBe(404);

  const pending = (await (await f.request(`/api/orgs/${org.id}/invitations`, { body: { email: "eve@example.com", role: "member" }, token: bob.token })).json()) as { id: string };
  expect((await f.request(`/api/invitations/${pending.id}`, { method: "DELETE", token: eve.token })).status).toBe(404);
  expect((await f.request(`/api/invitations/${pending.id}`, { method: "DELETE", token: bob.token })).status).toBe(204);
  expect(await (await f.request("/api/invitations", { token: eve.token })).json()).toEqual([]);
  const again = (await (await f.request(`/api/orgs/${org.id}/invitations`, { body: { email: "eve@example.com", role: "member" }, token: bob.token })).json()) as { id: string };
  expect((await f.request(`/api/invitations/${again.id}/reject`, { method: "POST", token: eve.token })).status).toBe(200);
  expect(await (await f.request("/api/invitations", { token: eve.token })).json()).toEqual([]);
});

it("returns 400 for validation errors and a generic 500 for server faults", async () => {
  const f = await fixture();
  const ada = await f.signIn("ada");
  const invalid = await f.request("/api/orgs", { body: { name: "", slug: "Bad Slug" }, token: ada.token });
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({ error: "Invalid request" });
  expect((await f.request("/api/orgs", { body: "{not json", token: ada.token })).status).toBe(400);
  const broken = createApp({
    directory: () => {
      throw new Error("secret internal detail");
    },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const reply = await broken.request("http://localhost/api/account", {}, f.env);
  expect(reply.status).toBe(500);
  expect(await reply.text()).not.toContain("secret internal detail");
});
