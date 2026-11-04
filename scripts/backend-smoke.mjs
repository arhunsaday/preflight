import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

const root = resolve(".");
const directory = await mkdtemp(join(root, "backend-smoke-"));
const base = `http://127.0.0.1:${process.env.PREFLIGHT_AUTH_SMOKE_PORT ?? 8801}`;
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
config.main = join(root, "src/worker.ts");
config.vars = {
  BASE_URL: base,
  BETTER_AUTH_SECRET: "local-smoke-secret-at-least-32-characters",
  AUTH_LOCAL_TEST: "1",
};
config.d1_databases[0].migrations_dir = join(root, "migrations");
const configPath = join(directory, "wrangler.json");
await writeFile(configPath, JSON.stringify(config));
const executable = process.execPath;
const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
let child;
let logs = "";
try {
  let portOccupied = false;
  try {
    await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
    portOccupied = true;
  } catch {}
  assert.ok(
    !portOccupied,
    "Smoke-test port is occupied; choose PREFLIGHT_AUTH_SMOKE_PORT before testing.",
  );
  const migration = spawnSync(
    executable,
    [
      wrangler,
      "d1",
      "migrations",
      "apply",
      "preflight-auth",
      "--local",
      "--config",
      configPath,
    ],
    { encoding: "utf8", input: "y\n", timeout: 120000 },
  );
  assert.equal(migration.status, 0, migration.stderr + migration.stdout);
  child = spawn(
    executable,
    [
      wrangler,
      "dev",
      "--local",
      "--config",
      configPath,
      "--port",
      new URL(base).port,
      "--inspector-port",
      "9901",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      ready = (await fetch(`${base}/api/health`)).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(ready, logs);
  const call = (path, body, token) =>
    fetch(`${base}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: base,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const signup = await call("/api/auth/sign-up/email", {
    name: "Smoke",
    email: "smoke@example.com",
    password: "local-smoke-password-123",
  });
  assert.equal(signup.status, 200, await signup.clone().text());
  const account = await signup.json();
  assert.equal(
    (await call("/api/account", undefined, account.token)).status,
    200,
  );
  assert.equal(
    (await call("/api/account", undefined, "deployment-token")).status,
    401,
  );
  const deviceResponse = await call("/api/auth/device/code", {
    client_id: "preflight-cli",
  });
  assert.equal(deviceResponse.status, 200, await deviceResponse.clone().text());
  const device = await deviceResponse.json();
  assert.ok(device.verification_uri_complete.startsWith(`${base}/device?`));
  assert.equal(
    (
      await call(
        `/api/auth/device?user_code=${device.user_code}`,
        undefined,
        account.token,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/auth/device/approve",
        { userCode: device.user_code },
        account.token,
      )
    ).status,
    200,
  );
  const redemption = await call("/api/auth/device/token", {
    client_id: "preflight-cli",
    device_code: device.device_code,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });
  assert.equal(redemption.status, 200, await redemption.clone().text());
  const session = await redemption.json();
  assert.equal(
    (await call("/api/account", undefined, session.access_token)).status,
    200,
  );
  const organization = await call(
    "/api/auth/organization/create",
    { name: "Smoke team", slug: "smoke-team" },
    session.access_token,
  );
  assert.equal(organization.status, 200, await organization.clone().text());
  const publication = await call(
    "/api/shares",
    {
      version: 1,
      ownerId: account.user.id,
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
    },
    session.access_token,
  );
  assert.equal(publication.status, 201, await publication.clone().text());
  const share = await publication.json();
  assert.equal(share.url, `${base}/s/${share.code}`);
  assert.equal((await fetch(share.url)).status, 200);
  const listing = await (
    await call("/api/shares", undefined, session.access_token)
  ).json();
  assert.equal(listing.shares[0].code, share.code);
  const stranger = await (
    await call("/api/auth/sign-up/email", {
      name: "Stranger",
      email: "stranger@example.com",
      password: "local-smoke-password-456",
    })
  ).json();
  const verified = spawnSync(
    executable,
    [
      wrangler,
      "d1",
      "execute",
      "preflight-auth",
      "--local",
      "--config",
      configPath,
      "--command",
      "UPDATE user SET email_verified = 1",
    ],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.equal(verified.status, 0, verified.stderr + verified.stdout);
  const group = await organization.json();
  const invitedResponse = await call(
    "/api/auth/organization/invite-member",
    { organizationId: group.id, email: "stranger@example.com", role: "member" },
    session.access_token,
  );
  assert.equal(
    invitedResponse.status,
    200,
    await invitedResponse.clone().text(),
  );
  const invited = await invitedResponse.json();
  assert.equal(
    (
      await call(
        "/api/auth/organization/accept-invitation",
        { invitationId: invited.id },
        session.access_token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/auth/organization/accept-invitation",
        { invitationId: invited.id },
        stranger.token,
      )
    ).status,
    200,
  );
  const full = await (
    await call(
      `/api/auth/organization/get-full-organization?organizationId=${group.id}`,
      undefined,
      session.access_token,
    )
  ).json();
  const joined = full.members.find((m) => m.userId === stranger.user.id);
  assert.ok(joined);
  assert.equal(
    (
      await call(
        "/api/auth/organization/update-member-role",
        { organizationId: group.id, memberId: joined.id, role: "admin" },
        stranger.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/auth/organization/update-member-role",
        { organizationId: group.id, memberId: joined.id, role: "admin" },
        session.access_token,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/auth/organization/leave",
        { organizationId: group.id },
        session.access_token,
      )
    ).status,
    400,
  );
  const revoke = (token) =>
    fetch(`${base}/api/shares/${share.code}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  assert.equal((await revoke(stranger.token)).status, 403);
  assert.equal((await revoke(session.access_token)).status, 204);
  assert.equal((await fetch(share.url)).status, 404);
  assert.deepEqual(
    (await (await call("/api/shares", undefined, session.access_token)).json())
      .shares,
    [],
  );
  assert.equal(
    (await call("/api/auth/sign-out", {}, session.access_token)).status,
    200,
  );
  assert.equal(
    (await call("/api/account", undefined, session.access_token)).status,
    401,
  );
  console.log(
    "Cloudflare runtime: D1 migrations, sessions, device authorization, organizations, invitations, roles, owned KV/R2 shares and logout passed.",
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
