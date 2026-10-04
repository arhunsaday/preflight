import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
import { it, expect } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import app from "../src/worker.js";
import { ResourceSchema } from "../src/schema.js";
import { makeShare } from "../src/sharing.js";

async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(await readFile(`migrations/${name}`, "utf8"));
  const database = {
    prepare(sql: string) {
      let args: (string | number | null)[] = [];
      const statement = {
        bind(...values: (string | number | null)[]) {
          args = values;
          return statement;
        },
        async all() {
          return {
            results: sqlite.prepare(sql).all(...args),
            success: true,
            meta: {},
          };
        },
        async raw() {
          return sqlite
            .prepare(sql)
            .all(...args)
            .map((row) => Object.values(row));
        },
        async first() {
          return sqlite.prepare(sql).get(...args) ?? null;
        },
        async run() {
          const result = sqlite.prepare(sql).run(...args);
          return {
            results: [],
            success: true,
            meta: {
              changes: Number(result.changes),
              last_row_id: Number(result.lastInsertRowid),
            },
          };
        },
      };
      return statement;
    },
    async batch(statements: { all(): Promise<unknown> }[]) {
      return Promise.all(statements.map((s) => s.all()));
    },
  } as unknown as D1Database;
  const records = new Map<string, string>();
  const env = {
    AUTH_DB: database,
    BASE_URL: "http://localhost",
    BETTER_AUTH_SECRET: "local-test-secret-at-least-thirty-two-characters",
    AUTH_LOCAL_TEST: "1",
    OWNER_ID: "legacy",
    WRITE_TOKEN: "legacy-token",
    SHARES: {
      get: async (k: string) => records.get(k) ?? null,
      put: async (k: string, v: string) => {
        records.set(k, v);
      },
      delete: async (k: string) => {
        records.delete(k);
      },
    },
    PAYLOADS: {
      put: async (k: string, v: string) => {
        records.set(k, v);
      },
      get: async (k: string) =>
        records.has(k) ? { text: async () => records.get(k)! } : null,
      delete: async (k: string) => {
        records.delete(k);
      },
    },
  };
  const request = (path: string, body?: unknown, token?: string) =>
    app.request(
      `http://localhost${path}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          ...(body
            ? { "Content-Type": "application/json", Origin: "http://localhost" }
            : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      env,
    );
  return { env, request, close: () => sqlite.close() };
}
it("uses real Better Auth sessions, protects per-user shares and logs out", async () => {
  const { request, env, close } = await fixture();
  try {
    const signup = await request("/api/auth/sign-up/email", {
      name: "Ada",
      email: "ada@example.com",
      password: "safe-test-password-123",
    });
    const signed = (await signup.json()) as {
      token: string;
      user: { id: string };
    };
    expect(signup.status, JSON.stringify(signed)).toBe(200);
    expect(signed.token).toBeTruthy();
    expect(
      (await request("/api/account", undefined, "legacy-token")).status,
    ).toBe(401);
    expect(
      await (await request("/api/account", undefined, signed.token)).json(),
    ).toMatchObject({
      ownerId: signed.user.id,
      authentication: "session",
      user: { name: "Ada" },
    });
    const payload = makeShare(
      [
        ResourceSchema.parse({
          id: "prompt:auth",
          type: "prompt",
          name: "auth",
          source: "local:test",
          scope: "project",
          harnesses: ["claude-code"],
          content: "test",
        }),
      ],
      { ownerId: signed.user.id },
    );
    const publish = await request("/api/shares", payload, signed.token);
    expect(publish.status).toBe(201);
    const share = (await publish.json()) as { code: string; url: string };
    expect(share.url).toBe(`http://localhost/s/${share.code}`);
    expect(
      await (await request("/api/shares", undefined, signed.token)).json(),
    ).toMatchObject({ shares: [{ code: share.code, resourceCount: 1 }] });
    const other = (await (
      await request("/api/auth/sign-up/email", {
        name: "Bob",
        email: "bob@example.com",
        password: "safe-test-password-123",
      })
    ).json()) as { token: string };
    expect(
      (
        await app.request(
          `http://localhost/api/shares/${share.code}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${other.token}` },
          },
          env,
        )
      ).status,
    ).toBe(403);
    expect((await request("/api/auth/sign-out", {}, signed.token)).status).toBe(
      200,
    );
    expect(
      (await request("/api/account", undefined, signed.token)).status,
    ).toBe(401);
  } finally {
    close();
  }
});
it("uses the standard device-code grant with explicit browser approval and one-time redemption", async () => {
  const { request, close } = await fixture();
  try {
    const signed = (await (
      await request("/api/auth/sign-up/email", {
        name: "Ada",
        email: "ada@example.com",
        password: "safe-test-password-123",
      })
    ).json()) as { token: string };
    const codes = (await (
      await request("/api/auth/device/code", { client_id: "preflight-desktop" })
    ).json()) as {
      device_code: string;
      user_code: string;
      verification_uri_complete: string;
    };
    expect(codes.verification_uri_complete).toContain("/device?user_code=");
    expect(
      (await request("/api/auth/device/code", { client_id: "unknown" })).status,
    ).toBe(400);
    expect(
      (await request("/api/auth/device/approve", { userCode: codes.user_code }))
        .status,
    ).toBe(401);
    expect(
      (
        await request(
          `/api/auth/device?user_code=${codes.user_code}`,
          undefined,
          signed.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/api/auth/device/approve",
          { userCode: codes.user_code },
          signed.token,
        )
      ).status,
    ).toBe(200);
    const grant = {
      client_id: "preflight-desktop",
      device_code: codes.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    };
    const redeemed = await request("/api/auth/device/token", grant);
    const token = (await redeemed.json()) as { access_token: string };
    expect(redeemed.status, JSON.stringify(token)).toBe(200);
    expect(
      (await request("/api/account", undefined, token.access_token)).status,
    ).toBe(200);
    expect((await request("/api/auth/device/token", grant)).status).toBe(400);
  } finally {
    close();
  }
});

it("keeps organization membership private to authorized members", async () => {
  const { request, close } = await fixture();
  try {
    const owner = (await (
      await request("/api/auth/sign-up/email", {
        name: "Owner",
        email: "owner@example.com",
        password: "safe-test-password-123",
      })
    ).json()) as { token: string };
    const stranger = (await (
      await request("/api/auth/sign-up/email", {
        name: "Stranger",
        email: "stranger@example.com",
        password: "safe-test-password-456",
      })
    ).json()) as { token: string };
    const created = await request(
      "/api/auth/organization/create",
      { name: "Setup team", slug: "setup-team" },
      owner.token,
    );
    expect(created.status).toBe(200);
    const organization = (await created.json()) as { id: string };
    const path = `/api/auth/organization/get-full-organization?organizationId=${encodeURIComponent(organization.id)}`;
    expect((await request(path, undefined, owner.token)).status).toBe(200);
    expect((await request(path, undefined, stranger.token)).status).toBe(403);
    await expect(
      (
        await request("/api/auth/organization/list", undefined, stranger.token)
      ).json(),
    ).resolves.toEqual([]);
  } finally {
    close();
  }
});
