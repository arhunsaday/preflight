import { createServer } from "node:http";
import { afterEach, expect, it } from "vitest";
import { backend, pkcePair, DEV_SECRET } from "./support/backend.js";
import { devSessionToken, frontendApi, type Directory } from "../src/backend/identity.js";
import { loopbackRedirect, sha256, TOKEN_TTL_MS } from "../src/backend/tokens.js";
import { accountIdentity, loopback, pkce, redeemCode, signInUrl, signOut } from "../src/auth-client.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});
async function fixture(options?: Parameters<typeof backend>[0]) {
  const f = await backend(options);
  cleanups.push(f.close);
  return f;
}
const exchangeBody = (session: string, challenge: string, redirect = "http://127.0.0.1:43123/callback") => ({
  session_token: session,
  redirect_uri: redirect,
  state: "state-state-state-1",
  code_challenge: challenge,
  code_challenge_method: "S256",
  client: "cli",
});

it("fails closed without Clerk keys, and keeps the dev identity to loopback hosts", async () => {
  const f = await fixture({ env: { PREFLIGHT_DEV_AUTH: "0" }, directory: () => null });
  expect((await f.request("/api/account", { token: "pfk_x" })).status).toBe(503);
  expect((await f.request("/auth/sign-in")).status).toBe(503);
  expect((await (await f.request("/api/health")).json()) as object).toMatchObject({
    authentication: "unconfigured",
  });
  // The real app (no injected directory) refuses dev auth on a public host.
  const { default: worker } = await import("../src/worker.js");
  const env = { ...f.env, PREFLIGHT_DEV_AUTH: "1" };
  const remote = await worker.request("https://api.example.com/auth/dev/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "x", email: "x@example.com" }),
  }, env);
  expect(remote.status).toBe(404);
  expect((await worker.request("https://api.example.com/auth/sign-in", {}, env)).status).toBe(503);
  const local = await worker.request("http://127.0.0.1:8787/auth/dev/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "x", email: "x@example.com" }),
  }, env);
  expect(local.status).toBe(200);
});

it("exchanges a verified session for a one-time PKCE code and a hashed API token", async () => {
  const f = await fixture();
  const { verifier, challenge } = await pkcePair();
  const session = await devSessionToken(DEV_SECRET, { name: "Ada", email: "ada@example.com" });
  for (const bad of [
    "https://127.0.0.1:43123/callback",
    "http://localhost:43123/callback",
    "http://127.0.0.1/callback",
    "http://127.0.0.1:43123/other",
    "http://127.0.0.1:43123/callback?x=1",
    "http://evil@127.0.0.1:43123/callback",
    "http://127.0.0.1:80/callback",
  ])
    expect((await f.request("/auth/exchange", { body: exchangeBody(session.token, challenge, bad) })).status, bad).toBe(400);
  expect(
    (await f.request("/auth/exchange", { body: exchangeBody("dev_forged.signature", challenge) })).status,
  ).toBe(401);
  expect(
    (await f.request("/auth/exchange", { body: { ...exchangeBody(session.token, challenge), code_challenge_method: "plain" } })).status,
  ).toBe(400);
  const exchanged = await f.request("/auth/exchange", { body: exchangeBody(session.token, challenge) });
  expect(exchanged.status).toBe(200);
  const redirect = new URL(((await exchanged.json()) as { redirect: string }).redirect);
  expect(redirect.origin + redirect.pathname).toBe("http://127.0.0.1:43123/callback");
  expect(redirect.searchParams.get("state")).toBe("state-state-state-1");
  const code = redirect.searchParams.get("code")!;
  const redeem = (body: object) => f.request("/auth/token", { body });
  const grant = { code, code_verifier: verifier, redirect_uri: "http://127.0.0.1:43123/callback" };
  const wrongVerifier = (await pkcePair()).verifier;
  expect((await redeem({ ...grant, code_verifier: wrongVerifier })).status).toBe(400);
  // A failed attempt consumed the code: codes are single use.
  expect((await redeem(grant)).status).toBe(400);

  const issued = await f.signIn("ada");
  expect(issued.token).toMatch(/^pfk_[A-Za-z0-9_-]{43}$/);
  const rows = f.sqlite.prepare("SELECT token_hash, expires_at FROM api_tokens").all() as { token_hash: string; expires_at: number }[];
  expect(rows).toHaveLength(1);
  expect(rows[0]!.token_hash).toBe(await sha256(issued.token));
  expect(JSON.stringify(f.sqlite.prepare("SELECT * FROM api_tokens").all())).not.toContain(issued.token);
  expect(rows[0]!.expires_at - Date.now()).toBeGreaterThan(TOKEN_TTL_MS - 60_000);
  const account = await f.request("/api/account", { token: issued.token });
  expect(await account.json()).toMatchObject({
    ownerId: issued.user.id,
    authentication: "token",
    user: { name: "ada", email: "ada@example.com" },
    tokenId: issued.tokenId,
  });
  expect((await f.request("/api/account", { token: issued.token + "x" })).status).toBe(401);
  expect((await f.request("/api/account")).status).toBe(401);
});

it("expires codes after five minutes and tokens after ninety idle days, sliding on use", async () => {
  const f = await fixture();
  const { verifier, challenge } = await pkcePair();
  const session = await devSessionToken(DEV_SECRET, { name: "Ada", email: "ada@example.com" });
  const exchanged = await f.request("/auth/exchange", { body: exchangeBody(session.token, challenge) });
  const code = new URL(((await exchanged.json()) as { redirect: string }).redirect).searchParams.get("code")!;
  f.sqlite.prepare("UPDATE auth_codes SET expires_at = ?").run(Date.now() - 1);
  expect(
    (await f.request("/auth/token", { body: { code, code_verifier: verifier, redirect_uri: "http://127.0.0.1:43123/callback" } })).status,
  ).toBe(400);

  const issued = await f.signIn("ada");
  const old = Date.now() - 2 * 3_600_000;
  f.sqlite.prepare("UPDATE api_tokens SET last_used_at = ?, expires_at = ?").run(old, Date.now() + 1000);
  expect((await f.request("/api/account", { token: issued.token })).status).toBe(200);
  const slid = f.sqlite.prepare("SELECT expires_at FROM api_tokens").get() as { expires_at: number };
  expect(slid.expires_at - Date.now()).toBeGreaterThan(TOKEN_TTL_MS - 60_000);
  f.sqlite.prepare("UPDATE api_tokens SET expires_at = ?").run(Date.now() - 1);
  expect((await f.request("/api/account", { token: issued.token })).status).toBe(401);
});

it("lists and revokes tokens, and logs out the current one", async () => {
  const f = await fixture();
  const first = await f.signIn("ada");
  const second = await f.signIn("ada");
  const other = await f.signIn("bob");
  const list = (await (await f.request("/api/tokens", { token: first.token })).json()) as {
    tokens: { id: string; current: boolean; label: string }[];
  };
  expect(list.tokens.map((t) => t.id).sort()).toEqual([first.tokenId, second.tokenId].sort());
  expect(list.tokens.find((t) => t.current)?.id).toBe(first.tokenId);
  expect((await f.request(`/api/tokens/${second.tokenId}`, { method: "DELETE", token: other.token })).status).toBe(404);
  expect((await f.request(`/api/tokens/${second.tokenId}`, { method: "DELETE", token: first.token })).status).toBe(204);
  expect((await f.request("/api/account", { token: second.token })).status).toBe(401);
  expect((await f.request("/api/auth/logout", { method: "POST", token: first.token })).status).toBe(204);
  expect((await f.request("/api/account", { token: first.token })).status).toBe(401);
  expect((await f.request("/api/account", { token: other.token })).status).toBe(200);
});

it("accepts a session JWT through the injected Clerk verifier", async () => {
  const fake: Partial<Directory> = {
    verifySession: async (token) => (token === "eyJ.valid.jwt" ? "user_clerk_1" : null),
    user: async (id) => ({ id, name: "Grace", email: "grace@example.com" }),
  };
  const f = await fixture({ directory: () => fake as Directory });
  const reply = await f.request("/api/account", { token: "eyJ.valid.jwt" });
  expect(await reply.json()).toMatchObject({ ownerId: "user_clerk_1", authentication: "session" });
  expect((await f.request("/api/account", { token: "eyJ.forged.jwt" })).status).toBe(401);
  expect((await f.request("/api/auth/logout", { method: "POST", token: "eyJ.valid.jwt" })).status).toBe(400);
});

it("rate limits sign-in endpoints per client, with the binding or the D1 fallback", async () => {
  const f = await fixture();
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await f.request("/auth/sign-in.js", { ip: "1.2.3.4" })).status;
  expect(last).toBe(429);
  expect((await f.request("/auth/sign-in.js", { ip: "5.6.7.8" })).status).toBe(200);
  const seen: string[] = [];
  const bound = await fixture({
    env: { RL_PUBLIC: { limit: async ({ key }) => (seen.push(key), { success: false }) } },
  });
  expect((await bound.request("/s/aaaaaa", { ip: "9.9.9.9" })).status).toBe(429);
  expect(seen).toEqual(["public:9.9.9.9"]);
});

it("serves the sign-in page with a nonce CSP for Clerk and the language set", async () => {
  // pk_test_ + base64("clerk.example.com$")
  const key = "pk_test_" + btoa("clerk.example.com$");
  expect(frontendApi(key)).toBe("clerk.example.com");
  expect(frontendApi("pk_test_" + btoa("evil.com/x$"))).toBeNull();
  const fake = { verifySession: async () => null } as unknown as Directory;
  const f = await fixture({
    env: { PREFLIGHT_DEV_AUTH: "0", CLERK_PUBLISHABLE_KEY: key, CLERK_SECRET_KEY: "sk_test" },
    directory: () => fake,
  });
  const page = await f.request("/auth/sign-in?client=cli");
  expect(page.status).toBe(200);
  const html = await page.text();
  expect(html).toContain('<html lang="en">');
  expect(html).toContain("https://clerk.example.com/npm/@clerk/clerk-js@5/dist/clerk.browser.js");
  const csp = page.headers.get("content-security-policy")!;
  const nonce = /'nonce-([a-f0-9]+)'/.exec(csp)![1];
  expect(html).toContain(`nonce="${nonce}"`);
  expect(csp).toContain("https://clerk.example.com");
  expect(page.headers.get("x-content-type-options")).toBe("nosniff");
});

it("validates loopback redirects strictly", () => {
  expect(loopbackRedirect("http://127.0.0.1:5000/callback")).toBe("http://127.0.0.1:5000/callback");
  expect(loopbackRedirect("oob")).toBe("oob");
  for (const bad of ["http://127.0.0.1:5000/callback/", "http://127.0.0.1:05000/callback", "http://[::1]:5000/callback", "javascript:alert(1)"])
    expect(loopbackRedirect(bad)).toBeNull();
});

it("signs in end to end through the client loopback server", async () => {
  const f = await fixture();
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const response = await f.app.fetch(
      new Request(`${service}${req.url}`, {
        method: req.method!,
        headers: req.headers as Record<string, string>,
        ...(body ? { body } : {}),
      }),
      f.env,
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  cleanups.push(() => server.close());
  const service = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const { verifier, challenge, state } = pkce();
  const callback = await loopback(state, 10_000);
  cleanups.push(callback.close);
  const url = new URL(signInUrl(service, { redirectUri: callback.redirectUri, state, challenge, client: "desktop" }));
  expect(url.pathname).toBe("/auth/sign-in");
  // Stand in for the browser page: dev identity, then /auth/exchange.
  const session = (await (await fetch(`${service}/auth/dev/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Lin", email: "lin@example.com" }),
  })).json()) as { token: string };
  const exchanged = (await (await fetch(`${service}/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_token: session.token,
      redirect_uri: url.searchParams.get("redirect_uri"),
      state: url.searchParams.get("state"),
      code_challenge: url.searchParams.get("code_challenge"),
      code_challenge_method: "S256",
      client: "desktop",
    }),
  })).json()) as { redirect: string };
  const wrongState = new URL(exchanged.redirect);
  wrongState.searchParams.set("state", "other-state-value-000");
  expect((await fetch(wrongState)).status).toBe(400);
  expect((await fetch(exchanged.redirect)).status).toBe(200);
  const code = await callback.code;
  const grant = await redeemCode(service, { code, verifier, redirectUri: callback.redirectUri, label: "desktop test" });
  expect(grant.user.name).toBe("Lin");
  expect((await accountIdentity(service, grant.token)).authentication).toBe("token");
  await signOut(service, grant.token);
  await expect(accountIdentity(service, grant.token)).rejects.toThrow(/HTTP 401/);
});
