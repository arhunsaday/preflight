// Runs the Worker on a local Wrangler runtime (D1, KV, R2, rate limits, cron)
// with PREFLIGHT_DEV_AUTH=1, so the full sign-in, token, team and share flows
// run without a Clerk account. Nothing leaves the machine.
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { readJsonc } from "./jsonc.mjs";

const root = resolve(".");
const directory = await mkdtemp(join(root, "backend-smoke-"));
const base = `http://127.0.0.1:${process.env.PREFLIGHT_AUTH_SMOKE_PORT ?? 8801}`;
const config = await readJsonc("wrangler.jsonc");
config.main = join(root, "src/worker.ts");
config.vars = {
  ...config.vars,
  PREFLIGHT_PUBLIC_URL: base,
  PREFLIGHT_DEV_AUTH: "1",
  PREFLIGHT_DEV_AUTH_SECRET: "local-smoke-dev-secret",
};
config.d1_databases[0].migrations_dir = join(root, "migrations");
const configPath = join(directory, "wrangler.json");
await writeFile(configPath, JSON.stringify(config));
const executable = process.execPath;
const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
const d1 = (sql) => {
  const run = spawnSync(
    executable,
    [wrangler, "d1", "execute", "preflight", "--local", "--config", configPath, "--command", sql],
    { encoding: "utf8", timeout: 60000 },
  );
  assert.equal(run.status, 0, run.stderr + run.stdout);
};
let child;
let logs = "";
try {
  let portOccupied = false;
  try {
    await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
    portOccupied = true;
  } catch {}
  assert.ok(!portOccupied, "Smoke-test port is occupied; choose PREFLIGHT_AUTH_SMOKE_PORT before testing.");
  const migration = spawnSync(
    executable,
    [wrangler, "d1", "migrations", "apply", "preflight", "--local", "--config", configPath],
    { encoding: "utf8", input: "y\n", timeout: 120000 },
  );
  assert.equal(migration.status, 0, migration.stderr + migration.stdout);
  child = spawn(
    executable,
    [wrangler, "dev", "--local", "--test-scheduled", "--config", configPath, "--port", new URL(base).port, "--inspector-port", "9901"],
    { stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" },
  );
  child.stdout.on("data", (chunk) => (logs += chunk));
  child.stderr.on("data", (chunk) => (logs += chunk));
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try {
      ready = (await fetch(`${base}/api/health`)).ok;
    } catch {}
    if (!ready) await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(ready, logs);
  const call = async (path, { method, body, token } = {}) =>
    fetch(`${base}${path}`, {
      method: method ?? (body ? "POST" : "GET"),
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const json = async (response, status) => {
    const text = await response.text();
    assert.equal(response.status, status, text);
    return text ? JSON.parse(text) : null;
  };
  assert.equal((await json(await call("/api/health"), 200)).authentication, "dev");
  const page = await call("/auth/sign-in?client=cli");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<html lang="en">/);
  assert.match(page.headers.get("content-security-policy"), /nonce-/);

  // Browser sign-in, as the page does it: dev identity → exchange → token.
  const signIn = async (name) => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const redirectUri = "http://127.0.0.1:45678/callback";
    const session = await json(await call("/auth/dev/session", { body: { name, email: `${name}@example.com` } }), 200);
    const exchange = {
      session_token: session.token,
      redirect_uri: redirectUri,
      state: "smoke-state-0123456789",
      code_challenge: challenge,
      code_challenge_method: "S256",
      client: "cli",
    };
    assert.equal((await call("/auth/exchange", { body: { ...exchange, redirect_uri: "https://evil.example/callback" } })).status, 400);
    const { redirect } = await json(await call("/auth/exchange", { body: exchange }), 200);
    const code = new URL(redirect).searchParams.get("code");
    assert.equal(new URL(redirect).searchParams.get("state"), exchange.state);
    const grant = { code, code_verifier: verifier, redirect_uri: redirectUri, label: "smoke" };
    const issued = await json(await call("/auth/token", { body: grant }), 200);
    assert.equal((await call("/auth/token", { body: grant })).status, 400, "codes are single use");
    assert.match(issued.token, /^pfk_/);
    return issued;
  };
  const owner = await signIn("owner");
  const stranger = await signIn("stranger");
  const account = await json(await call("/api/account", { token: owner.token }), 200);
  assert.equal(account.authentication, "token");
  assert.equal(account.user.email, "owner@example.com");
  assert.equal((await call("/api/account", { token: "pfk_not-a-real-token" })).status, 401);
  assert.equal((await json(await call("/api/tokens", { token: owner.token }), 200)).tokens.length, 1);

  // Teams.
  const org = await json(await call("/api/orgs", { body: { name: "Smoke team", slug: "smoke-team" }, token: owner.token }), 201);
  assert.equal((await call(`/api/orgs/${org.id}`, { token: stranger.token })).status, 404);
  const invitation = await json(
    await call(`/api/orgs/${org.id}/invitations`, { body: { email: "stranger@example.com", role: "member" }, token: owner.token }),
    201,
  );
  assert.equal((await json(await call("/api/invitations", { token: stranger.token }), 200))[0].id, invitation.id);
  assert.equal((await call(`/api/invitations/${invitation.id}/accept`, { method: "POST", token: owner.token })).status, 404);
  await json(await call(`/api/invitations/${invitation.id}/accept`, { method: "POST", token: stranger.token }), 200);
  const full = await json(await call(`/api/orgs/${org.id}`, { token: stranger.token }), 200);
  assert.equal(full.members.length, 2);
  const roleChange = (token, userId, role) =>
    call(`/api/orgs/${org.id}/members/${userId}`, { method: "PATCH", body: { role }, token });
  assert.equal((await roleChange(stranger.token, stranger.user.id, "admin")).status, 403);
  assert.equal((await roleChange(owner.token, owner.user.id, "member")).status, 400, "last admin is kept");
  assert.equal((await call(`/api/orgs/${org.id}/leave`, { method: "POST", token: owner.token })).status, 400);
  assert.equal((await roleChange(owner.token, stranger.user.id, "admin")).status, 200);

  // Shares.
  const payload = (extra = {}) => ({
    version: 1,
    ownerId: "local",
    visibility: "unlisted",
    createdAt: new Date().toISOString(),
    resources: [
      {
        id: "prompt:smoke",
        type: "prompt",
        name: "Smoke prompt",
        source: "local:smoke",
        scope: "global",
        harnesses: ["claude-code"],
        content: "Use ${SMOKE_ENV} as an environment reference.",
      },
    ],
    ...extra,
  });
  const share = await json(await call("/api/shares", { body: payload({ team: org.id }), token: owner.token }), 201);
  assert.equal(share.url, `${base}/s/${share.code}`);
  const landing = await fetch(share.url);
  assert.equal(landing.status, 200);
  assert.equal(landing.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await json(await call("/api/shares", { token: owner.token }), 200)).shares[0].code, share.code);
  assert.equal((await json(await call(`/api/shares?team=${org.id}`, { token: stranger.token }), 200)).shares[0].code, share.code);
  const outsider = await signIn("outsider");
  assert.equal((await call(`/api/shares?team=${org.id}`, { token: outsider.token })).status, 404);
  assert.equal((await call(`/api/shares/${share.code}`, { method: "DELETE", token: outsider.token })).status, 403);
  assert.equal((await call(`/api/shares/${share.code}`, { method: "DELETE", token: stranger.token })).status, 204, "team admin revokes");
  assert.equal((await fetch(share.url)).status, 404);

  // Expiry: the scheduled purge removes expired shares from D1, KV and R2.
  const expiring = await json(
    await call("/api/shares", { body: payload({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }), token: owner.token }),
    201,
  );
  assert.equal((await fetch(expiring.url)).status, 200);
  d1(`UPDATE shares SET expires_at = '2000-01-01T00:00:00.000Z' WHERE code = '${expiring.code}'`);
  assert.equal((await fetch(`${base}/__scheduled?cron=17+*+*+*+*`)).status, 200);
  let purged = false;
  for (let i = 0; i < 20 && !purged; i++) {
    purged = (await fetch(expiring.url)).status === 404;
    if (!purged) await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(purged, "scheduled purge removes expired shares");

  // Logout revokes the current token only.
  assert.equal((await call("/api/auth/logout", { method: "POST", token: owner.token })).status, 204);
  assert.equal((await call("/api/account", { token: owner.token })).status, 401);
  assert.equal((await call("/api/account", { token: stranger.token })).status, 200);
  console.log(
    "Cloudflare runtime: D1 migrations, dev sign-in with PKCE, API tokens, teams, invitations, roles, owned and team KV/R2 shares, scheduled purge and logout passed.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  if (child?.pid && child.exitCode === null) {
    try {
      if (process.platform === "win32") child.kill("SIGTERM");
      else process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  await rm(directory, { recursive: true, force: true });
}
