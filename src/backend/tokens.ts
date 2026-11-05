// Preflight API tokens and one-time sign-in codes, stored hashed in D1.
import type { D1Database } from "@cloudflare/workers-types";
import { constantTimeEqual } from "./identity.js";

export const TOKEN_PREFIX = "pfk_";
export const TOKEN_TTL_MS = 90 * 86_400_000;
export const CODE_TTL_MS = 5 * 60_000;
/** Sliding expiry is refreshed at most this often, to keep writes rare. */
const TOUCH_INTERVAL_MS = 60 * 60_000;

const encoder = new TextEncoder();
export const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export const randomSecret = (bytes = 32) =>
  base64url(crypto.getRandomValues(new Uint8Array(bytes)));
export async function sha256(value: string) {
  return base64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))),
  );
}
/** RFC 7636 S256: BASE64URL(SHA256(verifier)) compared in constant time. */
export async function verifyPkce(verifier: string, challenge: string) {
  return constantTimeEqual(await sha256(verifier), challenge);
}

/** Loopback redirect for CLI and desktop: exactly http://127.0.0.1:<port>/callback. */
export function loopbackRedirect(value: string) {
  if (value === "oob") return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const port = Number(url.port);
  return url.protocol === "http:" &&
    url.hostname === "127.0.0.1" &&
    Number.isInteger(port) &&
    port >= 1024 &&
    port <= 65535 &&
    url.pathname === "/callback" &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password &&
    value === `http://127.0.0.1:${port}/callback`
    ? value
    : null;
}

export async function createCode(
  db: D1Database,
  input: { userId: string; challenge: string; redirectUri: string; client: string },
  now = Date.now(),
) {
  const code = randomSecret();
  await db
    .prepare(
      "INSERT INTO auth_codes (code_hash, user_id, code_challenge, redirect_uri, client, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      await sha256(code),
      input.userId,
      input.challenge,
      input.redirectUri,
      input.client,
      now,
      now + CODE_TTL_MS,
    )
    .run();
  return code;
}

/** Consumes a code exactly once; returns its row when still valid. */
export async function consumeCode(db: D1Database, code: string, now = Date.now()) {
  const row = await db
    .prepare("DELETE FROM auth_codes WHERE code_hash = ? RETURNING *")
    .bind(await sha256(code))
    .first<{
      user_id: string;
      code_challenge: string;
      redirect_uri: string;
      client: string;
      expires_at: number;
    }>();
  return row && row.expires_at > now ? row : null;
}

export async function issueToken(
  db: D1Database,
  input: { userId: string; label: string; client: string },
  now = Date.now(),
) {
  const token = TOKEN_PREFIX + randomSecret();
  const id = crypto.randomUUID();
  const expiresAt = now + TOKEN_TTL_MS;
  await db
    .prepare(
      "INSERT INTO api_tokens (id, user_id, token_hash, label, client, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, input.userId, await sha256(token), input.label, input.client, now, now, expiresAt)
    .run();
  return { token, id, expiresAt: new Date(expiresAt).toISOString() };
}

/** Resolves a `pfk_` token to its owner, sliding its expiry forward. */
export async function resolveToken(db: D1Database, token: string, now = Date.now()) {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const hash = await sha256(token);
  const row = await db
    .prepare(
      "SELECT id, user_id, token_hash, last_used_at, expires_at FROM api_tokens WHERE token_hash = ?",
    )
    .bind(hash)
    .first<{
      id: string;
      user_id: string;
      token_hash: string;
      last_used_at: number | null;
      expires_at: number;
    }>();
  if (!row || !constantTimeEqual(row.token_hash, hash) || row.expires_at <= now)
    return null;
  let expiresAt = row.expires_at;
  if (!row.last_used_at || now - row.last_used_at > TOUCH_INTERVAL_MS) {
    expiresAt = now + TOKEN_TTL_MS;
    await db
      .prepare("UPDATE api_tokens SET last_used_at = ?, expires_at = ? WHERE id = ?")
      .bind(now, expiresAt, row.id)
      .run();
  }
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export async function listTokens(db: D1Database, userId: string, now = Date.now()) {
  const { results } = await db
    .prepare(
      "SELECT id, label, client, created_at, last_used_at, expires_at FROM api_tokens WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 100",
    )
    .bind(userId, now)
    .all<{
      id: string;
      label: string;
      client: string;
      created_at: number;
      last_used_at: number | null;
      expires_at: number;
    }>();
  const date = (ms: number | null) => (ms ? new Date(ms).toISOString() : null);
  return results.map((r) => ({
    id: r.id,
    label: r.label,
    client: r.client,
    createdAt: date(r.created_at),
    lastUsedAt: date(r.last_used_at),
    expiresAt: date(r.expires_at),
  }));
}

export async function revokeToken(db: D1Database, userId: string, id: string) {
  const result = await db
    .prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
