import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { SharePayloadSchema, PreflightConfigSchema } from "./schema.js";
import { shareCode, requiredEnv, previewShare } from "./sharing.js";
interface Bindings {
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
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  );
  c.header("Referrer-Policy", "no-referrer");
});
app.onError((error, c) => c.json({ error: error.message }, 400));
app.post("/api/shares", async (c) => {
  if (
    !c.env.WRITE_TOKEN ||
    c.req.header("Authorization") !== `Bearer ${c.env.WRITE_TOKEN}`
  )
    return c.json({ error: "Unauthorized" }, 401);
  const payload = SharePayloadSchema.parse(await c.req.json());
  if (payload.ownerId !== c.env.OWNER_ID)
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
  return c.json({ code, url: `${new URL(c.req.url).origin}/s/${code}` }, 201);
});
async function lookup(env: Bindings, code: string) {
  if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/i.test(code)) return null;
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
  if (
    !c.env.WRITE_TOKEN ||
    c.req.header("Authorization") !== `Bearer ${c.env.WRITE_TOKEN}`
  )
    return c.json({ error: "Unauthorized" }, 401);
  const code = c.req.param("code").toLowerCase();
  const raw = await c.env.SHARES.get(code);
  if (!raw) return c.json({ error: "Not found" }, 404);
  const entry = JSON.parse(raw) as { ownerId: string; key: string };
  if (entry.ownerId !== c.env.OWNER_ID)
    return c.json({ error: "Owner mismatch" }, 403);
  await c.env.SHARES.delete(code);
  await c.env.PAYLOADS.delete(entry.key);
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
