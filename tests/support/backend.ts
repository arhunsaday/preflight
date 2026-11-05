// In-process fixture for the Worker: real SQLite behind a D1-shaped adapter,
// in-memory KV and R2, and an injectable identity directory.
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
import type { D1Database } from "@cloudflare/workers-types";
import { createApp, type Env, type Dependencies } from "../../src/worker.js";
import { devDirectory, devSessionToken, type Directory } from "../../src/backend/identity.js";

export const DEV_SECRET = "test-dev-secret";

export async function backend(
  options: { directory?: Dependencies["directory"]; env?: Partial<Env> } = {},
) {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
    sqlite.exec(await readFile(`migrations/${name}`, "utf8"));
  const statement = (sql: string) => {
    let args: (string | number | null)[] = [];
    const s = {
      bind(...values: (string | number | null)[]) {
        args = values;
        return s;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...args), success: true, meta: {} };
      },
      async first() {
        return sqlite.prepare(sql).get(...args) ?? null;
      },
      async run() {
        const r = sqlite.prepare(sql).run(...args);
        return { results: [], success: true, meta: { changes: Number(r.changes) } };
      },
    };
    return s;
  };
  const db = { prepare: statement } as unknown as D1Database;
  const kv = new Map<string, string>();
  const ttl = new Map<string, number | undefined>();
  const objects = new Map<string, string>();
  let devState: string | null = null;
  const directory: Directory = devDirectory(DEV_SECRET, {
    get: async () => devState,
    put: async (v) => {
      devState = v;
    },
  });
  const env: Env = {
    DB: db,
    PREFLIGHT_DEV_AUTH: "1",
    PREFLIGHT_DEV_AUTH_SECRET: DEV_SECRET,
    SHARES: {
      get: async (k) => kv.get(k) ?? null,
      put: async (k, v, o) => {
        kv.set(k, v);
        ttl.set(k, o?.expirationTtl);
      },
      delete: async (k) => {
        kv.delete(k);
      },
    },
    PAYLOADS: {
      put: async (k, v) => {
        objects.set(k, v);
      },
      get: async (k) => (objects.has(k) ? { text: async () => objects.get(k)! } : null),
      delete: async (k) => {
        objects.delete(k);
      },
    },
    ...options.env,
  };
  const app = createApp({ directory: options.directory ?? (() => directory) });
  const request = (
    path: string,
    init: { method?: string; body?: unknown; token?: string; ip?: string } = {},
    base = "http://localhost",
  ) =>
    app.request(
      `${base}${path}`,
      {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers: {
          ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
          ...(init.ip ? { "cf-connecting-ip": init.ip } : {}),
        },
        ...(init.body === undefined
          ? {}
          : { body: typeof init.body === "string" ? init.body : JSON.stringify(init.body) }),
      },
      env,
    );
  /** Full browser sign-in for a dev person; returns the API token grant. */
  const signIn = async (name: string, ip = "10.0.0.1") => {
    const { verifier, challenge } = await pkcePair();
    const session = await devSessionToken(DEV_SECRET, { name, email: `${name}@example.com` });
    const redirectUri = "http://127.0.0.1:43123/callback";
    const exchanged = await request("/auth/exchange", {
      ip,
      body: {
        session_token: session.token,
        redirect_uri: redirectUri,
        state: "state-state-state-1",
        code_challenge: challenge,
        code_challenge_method: "S256",
        client: "cli",
      },
    });
    const { redirect } = (await exchanged.json()) as { redirect: string };
    const code = new URL(redirect).searchParams.get("code")!;
    const issued = await request("/auth/token", {
      ip,
      body: { code, code_verifier: verifier, redirect_uri: redirectUri, label: "test" },
    });
    return (await issued.json()) as {
      token: string;
      tokenId: string;
      user: { id: string; name: string; email: string };
    };
  };
  return { env, app, request, signIn, sqlite, kv, ttl, objects, directory, close: () => sqlite.close() };
}

export async function pkcePair() {
  const { createHash, randomBytes } = await import("node:crypto");
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
