import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

const root = resolve(".");
const directory = await mkdtemp(join(root, "backend-smoke-"));
const base = `http://127.0.0.1:${process.env.ADK_AUTH_SMOKE_PORT ?? 8801}`;
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
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
let child;
let logs = "";
try {
  const migration = spawnSync(
    executable,
    [
      "--yes",
      "wrangler@4",
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
      "--yes",
      "wrangler@4",
      "dev",
      "--local",
      "--config",
      configPath,
      "--port",
      new URL(base).port,
      "--inspector-port",
      "9901",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
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
  assert.equal(
    (await call("/api/auth/sign-out", {}, session.access_token)).status,
    200,
  );
  assert.equal(
    (await call("/api/account", undefined, session.access_token)).status,
    401,
  );
  console.log(
    "Cloudflare runtime: D1 migrations, sessions, device authorization, organizations and logout passed.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  child?.kill("SIGTERM");
  await rm(directory, { recursive: true, force: true });
}
