import { z } from "zod";
import { createAuth } from "./backend/auth.js";
import type { AuthBindings } from "./backend/auth.js";
import { authPage, invitationAuthScript } from "./backend/auth-web.js";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { SharePayloadSchema, PreflightConfigSchema } from "./schema.js";
import {
  shareCode,
  isShareCode,
  requiredEnv,
  previewShare,
} from "./sharing.js";
interface Bindings extends AuthBindings {
  SHARES: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<unknown>;
    delete(key: string): Promise<unknown>;
  };
  PAYLOADS: {
    put(key: string, value: string): Promise<unknown>;
    get(key: string): Promise<{ text(): Promise<string> } | null>;
    delete(key: string): Promise<unknown>;
  };
  OWNER_ID: string;
  WRITE_TOKEN: string;
}
const app = new Hono<{ Bindings: Bindings }>();
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
app.use("*", bodyLimit({ maxSize: 1_000_000 }));
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Cache-Control", "no-store");
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  );
  c.header("Referrer-Policy", "no-referrer");
});
app.onError((error, c) => c.json({ error: error.message }, 400));
async function identity(env: Bindings, headers: Headers) {
  if (env.AUTH_DB) {
    const session = await createAuth(env).api.getSession({ headers });
    return session
      ? {
          ownerId: session.user.id,
          authentication: "session",
          user: {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
          },
          expiresAt: session.session.expiresAt.toISOString(),
        }
      : null;
  }
  return env.WRITE_TOKEN &&
    headers.get("Authorization") === `Bearer ${env.WRITE_TOKEN}`
    ? { ownerId: env.OWNER_ID, authentication: "deployment-token" }
    : null;
}
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  if (!c.env.AUTH_DB)
    return c.json({ error: "Standard authentication is not configured" }, 503);
  return createAuth(c.env).handler(c.req.raw);
});
app.get("/api/health", (c) =>
  c.json({
    service: "preflight",
    authentication: c.env.AUTH_DB ? "better-auth" : "deployment-token",
    providers: [
      ...(c.env.GITHUB_CLIENT_ID ? ["github"] : []),
      ...(c.env.GOOGLE_CLIENT_ID ? ["google"] : []),
    ],
  }),
);
app.get("/auth.js", (c) =>
  c.body(invitationAuthScript, 200, {
    "Content-Type": "text/javascript; charset=utf-8",
  }),
);
app.get("/device", async (c) => {
  const user = await identity(c.env, c.req.raw.headers);
  return c.html(
    authPage({
      providers: [
        ...(c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_SECRET
          ? ["github"]
          : []),
        ...(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET
          ? ["google"]
          : []),
      ],
      code: c.req.query("user_code") ?? "",
      signedIn: user?.authentication === "session",
      escape,
    }),
  );
});
app.get("/invite/:id", async (c) => {
  const invitationId = z.string().uuid().parse(c.req.param("id"));
  const user = await identity(c.env, c.req.raw.headers);
  return c.html(
    authPage({
      providers: [
        ...(c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_SECRET
          ? ["github"]
          : []),
        ...(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET
          ? ["google"]
          : []),
      ],
      code: "",
      invitationId,
      signedIn: user?.authentication === "session",
      escape,
    }),
  );
});
app.get("/sign-in", (c) => c.redirect("/device"));
app.get("/api/account", async (c) => {
  const user = await identity(c.env, c.req.raw.headers);
  return user ? c.json(user) : c.json({ error: "Unauthorized" }, 401);
});
app.get("/api/shares", async (c) => {
  const user = await identity(c.env, c.req.raw.headers);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (!c.env.AUTH_DB)
    return c.json(
      { error: "Share listing requires the standard Cloudflare backend" },
      503,
    );
  const { results } = await c.env.AUTH_DB.prepare(
    "SELECT code, visibility, created_at AS createdAt, expires_at AS expiresAt, resource_count AS resourceCount FROM share_record WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100",
  )
    .bind(user.ownerId)
    .all();
  const base = c.env.BASE_URL
    ? new URL(c.env.BASE_URL).origin
    : new URL(c.req.url).origin;
  return c.json({
    shares: results.map((r) => ({ ...r, url: `${base}/s/${r.code}` })),
  });
});
app.post("/api/shares", async (c) => {
  const user = await identity(c.env, c.req.raw.headers);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const payload = SharePayloadSchema.parse(await c.req.json());
  if (payload.ownerId !== user.ownerId)
    return c.json({ error: "Owner mismatch" }, 403);
  if (payload.expiresAt && Date.parse(payload.expiresAt) <= Date.now())
    return c.json({ error: "Expiry must be in the future" }, 400);
  let code = shareCode();
  for (let tries = 0; await c.env.SHARES.get(code); tries++) {
    if (tries > 8) throw new Error("Unable to allocate code");
    code = shareCode();
  }
  const key = `${encodeURIComponent(payload.ownerId)}/${crypto.randomUUID()}`;
  await c.env.PAYLOADS.put(key, JSON.stringify(payload));
  await c.env.SHARES.put(
    code,
    JSON.stringify({ key, ownerId: payload.ownerId }),
  );
  if (c.env.AUTH_DB) {
    try {
      await c.env.AUTH_DB.prepare(
        "INSERT INTO share_record (code, owner_id, object_key, visibility, created_at, expires_at, resource_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          code,
          user.ownerId,
          key,
          payload.visibility,
          payload.createdAt,
          payload.expiresAt ?? null,
          payload.resources.length,
        )
        .run();
    } catch (e) {
      await c.env.SHARES.delete(code);
      await c.env.PAYLOADS.delete(key);
      throw e;
    }
  }
  const base = c.env.BASE_URL
    ? new URL(c.env.BASE_URL).origin
    : new URL(c.req.url).origin;
  return c.json({ code, url: `${base}/s/${code}` }, 201);
});
async function lookup(env: Bindings, code: string) {
  if (!isShareCode(code)) return null;
  const raw = await env.SHARES.get(code.toLowerCase());
  if (!raw) return null;
  const entry = JSON.parse(raw) as { key: string; ownerId: string };
  const object = await env.PAYLOADS.get(entry.key);
  if (!object) return null;
  const payload = SharePayloadSchema.parse(JSON.parse(await object.text()));
  if (payload.expiresAt && Date.parse(payload.expiresAt) <= Date.now())
    return null;
  return { entry, payload };
}
app.get("/api/shares/:code", async (c) => {
  const result = await lookup(c.env, c.req.param("code"));
  return result
    ? c.json(result.payload)
    : c.json({ error: "Share not found or expired" }, 404);
});
app.delete("/api/shares/:code", async (c) => {
  const user = await identity(c.env, c.req.raw.headers);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const code = c.req.param("code").toLowerCase();
  const raw = await c.env.SHARES.get(code);
  if (!raw) return c.json({ error: "Not found" }, 404);
  const entry = JSON.parse(raw) as { ownerId: string; key: string };
  if (entry.ownerId !== user.ownerId)
    return c.json({ error: "Owner mismatch" }, 403);
  await c.env.SHARES.delete(code);
  await c.env.PAYLOADS.delete(entry.key);
  if (c.env.AUTH_DB)
    await c.env.AUTH_DB.prepare(
      "DELETE FROM share_record WHERE code = ? AND owner_id = ?",
    )
      .bind(code, user.ownerId)
      .run();
  return c.body(null, 204);
});
app.get("/s/:code", async (c) => {
  const code = c.req.param("code").toLowerCase();
  const found = await lookup(c.env, code);
  if (!found) return c.text("Share not found or expired", 404);
  const { payload } = found;
  return c.html(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>Preflight share ${escape(code)}</title><style>body{max-width:850px;margin:3rem auto;padding:0 1rem;font:16px system-ui;background:#faf9f6;color:#252923}article{border-top:1px solid #ccc;padding:1rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eeede7;padding:1rem}textarea{width:100%;height:12rem}button{padding:.6rem 1rem}</style><h1>Inspect this setup</h1><p>Code: <strong>${escape(code)}</strong> · ${escape(payload.visibility)} · Owner: ${escape(payload.ownerId)}</p><p>Required environment variables: ${escape(requiredEnv(payload).join(", ") || "none")}</p>${payload.resources.map((r) => `<article><h2>${escape(r.name)}</h2><p>${escape(r.type)} · ${escape(r.scope)} · ${escape(r.source)}</p><pre>${escape(JSON.stringify(r, null, 2))}</pre></article>`).join("")}<h2>Compare with your setup</h2><p>Run <code>preflight apply ${escape(code)} --dry-run</code> for a local comparison. Or paste a secret-free preflight.config.json below; it is sent to this service for comparison.</p><form action="/s/${escape(code)}/preview" method="post"><textarea name="config" aria-label="Secret-free Preflight config" required></textarea><button>Preview diff</button></form></html>`,
  );
});
app.post("/s/:code/preview", async (c) => {
  const found = await lookup(c.env, c.req.param("code"));
  if (!found) return c.text("Not found", 404);
  const form = await c.req.parseBody();
  const config = PreflightConfigSchema.parse(JSON.parse(String(form.config)));
  const diff = previewShare(
    found.payload,
    config.profiles[config.activeProfile]!.resources,
  );
  return c.html(
    `<html lang="en"><meta charset="utf-8"><title>Preflight diff</title><h1>Preview only</h1><pre>${escape(JSON.stringify(diff, null, 2))}</pre></html>`,
  );
});
export default app;
