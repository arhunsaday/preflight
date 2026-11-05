import { z, ZodError } from "zod";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import type { D1Database } from "@cloudflare/workers-types";
import { SharePayloadSchema, PreflightConfigSchema } from "./schema.js";
import { shareCode, isShareCode, requiredEnv, previewShare } from "./sharing.js";
import {
  clerkDirectory,
  devDirectory,
  devSessionToken,
  frontendApi,
  PublicError,
  type Directory,
  type Role,
} from "./backend/identity.js";
import {
  consumeCode,
  createCode,
  issueToken,
  listTokens,
  loopbackRedirect,
  resolveToken,
  revokeToken,
  verifyPkce,
} from "./backend/tokens.js";
import { allow, type LimitGroup, type RateLimitBinding } from "./backend/ratelimit.js";
import { escapeHtml as escape, pageStyle, signInPage, signInScript } from "./backend/pages.js";

export interface Env {
  DB?: D1Database;
  SHARES: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>;
    delete(key: string): Promise<unknown>;
  };
  PAYLOADS: {
    put(key: string, value: string): Promise<unknown>;
    get(key: string): Promise<{ text(): Promise<string> } | null>;
    delete(key: string): Promise<unknown>;
  };
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_JWT_KEY?: string;
  PREFLIGHT_PUBLIC_URL?: string;
  /** "1" enables the signed local dev identity on loopback hosts only. */
  PREFLIGHT_DEV_AUTH?: string;
  PREFLIGHT_DEV_AUTH_SECRET?: string;
  RL_AUTH?: RateLimitBinding;
  RL_SHARES?: RateLimitBinding;
  RL_PUBLIC?: RateLimitBinding;
}
export interface Dependencies {
  /** Replaces the identity provider (tests inject a fake verifier here). */
  directory?: (env: Env) => Directory | null;
}
interface Caller {
  userId: string;
  authentication: "token" | "session";
  tokenId?: string;
  expiresAt?: string;
}
type App = { Bindings: Env; Variables: { caller: Caller } };
type C = Context<App>;

const DEV_SECRET_FALLBACK = "preflight-local-dev-auth-not-for-production";
const loopbackHost = (url: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
const devAuth = (env: Env, url: string) =>
  env.PREFLIGHT_DEV_AUTH === "1" && loopbackHost(url);
const publicOrigin = (c: C) =>
  c.env.PREFLIGHT_PUBLIC_URL && !devAuth(c.env, c.req.url)
    ? new URL(c.env.PREFLIGHT_PUBLIC_URL).origin
    : new URL(c.req.url).origin;
const clientIp = (c: C) => c.req.header("cf-connecting-ip") ?? "unknown";
/** Runs work after the response when the runtime allows it. */
function defer(c: C, work: Promise<unknown>) {
  const guarded = work.catch((error) => console.error("deferred", error));
  try {
    c.executionCtx.waitUntil(guarded);
  } catch {
    return guarded;
  }
}

const Id = z.string().min(1).max(200).regex(/^[A-Za-z0-9_:-]+$/);
const RoleInput = z
  .enum(["admin", "member", "org:admin", "org:member"])
  .transform((r): Role => (r.endsWith("admin") ? "admin" : "member"));

export function createApp(deps: Dependencies = {}) {
  const app = new Hono<App>();
  const directories = new WeakMap<Env, Directory | null>();
  const directory = (c: C): Directory | null => {
    if (deps.directory) return deps.directory(c.env);
    if (directories.has(c.env)) return directories.get(c.env)!;
    let value: Directory | null = null;
    if (devAuth(c.env, c.req.url))
      value = devDirectory(c.env.PREFLIGHT_DEV_AUTH_SECRET ?? DEV_SECRET_FALLBACK, {
        get: () => c.env.SHARES.get("__dev_directory"),
        put: async (v) => {
          await c.env.SHARES.put("__dev_directory", v);
        },
      });
    else if (c.env.CLERK_SECRET_KEY && c.env.CLERK_PUBLISHABLE_KEY)
      value = clerkDirectory({
        CLERK_SECRET_KEY: c.env.CLERK_SECRET_KEY,
        CLERK_PUBLISHABLE_KEY: c.env.CLERK_PUBLISHABLE_KEY,
        ...(c.env.CLERK_JWT_KEY ? { CLERK_JWT_KEY: c.env.CLERK_JWT_KEY } : {}),
        authorizedParties: [publicOrigin(c)],
      });
    directories.set(c.env, value);
    return value;
  };
  const needAuth = (c: C) => {
    const dir = directory(c);
    const db = c.env.DB;
    if (!dir || !db)
      throw new PublicError(503, "Authentication is not configured on this server");
    return { dir, db };
  };

  app.use("*", bodyLimit({ maxSize: 1_000_000 }));
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cache-Control", "no-store");
    c.header("X-Frame-Options", "DENY");
    c.header("Strict-Transport-Security", "max-age=31536000");
    if (!c.res.headers.has("Content-Security-Policy"))
      c.header(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      );
  });
  const limited = (group: LimitGroup, binding: (env: Env) => RateLimitBinding | undefined) =>
    async (c: C, next: () => Promise<void>) => {
      const ok = await allow(group, clientIp(c), {
        ...(binding(c.env) ? { binding: binding(c.env)! } : {}),
        ...(c.env.DB ? { db: c.env.DB } : {}),
      });
      if (!ok) return c.json({ error: "Too many requests; retry in a minute" }, 429);
      await next();
    };
  app.use("/auth/*", limited("auth", (e) => e.RL_AUTH));
  app.use("/api/auth/*", limited("auth", (e) => e.RL_AUTH));
  app.use("/api/shares", limited("shares", (e) => e.RL_SHARES));
  app.use("/api/shares/*", limited("shares", (e) => e.RL_SHARES));
  app.use("/s/*", limited("public", (e) => e.RL_PUBLIC));

  app.onError((error, c) => {
    if (error instanceof PublicError) return c.json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return c.json(
        {
          error: "Invalid request",
          issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400,
      );
    if (error instanceof SyntaxError) return c.json({ error: "Invalid JSON body" }, 400);
    if (error instanceof HTTPException) return error.getResponse();
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  });

  /** Authenticates `Authorization: Bearer pfk_…` or a Clerk session JWT. */
  const caller = async (c: C): Promise<Caller> => {
    const { dir, db } = needAuth(c);
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (token.startsWith("pfk_")) {
      const found = await resolveToken(db, token);
      if (found)
        return {
          userId: found.userId,
          authentication: "token",
          tokenId: found.id,
          expiresAt: found.expiresAt,
        };
    } else if (token) {
      const userId = await dir.verifySession(token);
      if (userId) return { userId, authentication: "session" };
    }
    throw new PublicError(401, "Unauthorized");
  };
  const membership = async (dir: Directory, userId: string, orgId: string) =>
    (await dir.memberships(userId)).find((m) => m.id === orgId) ?? null;
  const asAdmin = async (dir: Directory, userId: string, orgId: string) => {
    const m = await membership(dir, userId, orgId);
    if (!m) throw new PublicError(404, "Organization not found");
    if (m.role !== "admin")
      throw new PublicError(403, "Only organization admins can do this");
    return m;
  };
  /** Refuses changes that would leave an organization without an admin. */
  const keepAnAdmin = async (dir: Directory, orgId: string, userId: string) => {
    const members = await dir.members(orgId);
    const target = members.find((m) => m.id === userId);
    if (!target) throw new PublicError(404, "Member not found");
    if (
      target.role === "admin" &&
      members.filter((m) => m.role === "admin").length === 1
    )
      throw new PublicError(
        400,
        "An organization needs at least one admin; promote someone else first",
      );
  };

  app.get("/", (c) => c.redirect("/api/health"));
  app.get("/api/health", (c) =>
    c.json({
      service: "preflight",
      authentication: !c.env.DB
        ? "unconfigured"
        : devAuth(c.env, c.req.url)
          ? "dev"
          : c.env.CLERK_SECRET_KEY && c.env.CLERK_PUBLISHABLE_KEY
            ? "clerk"
            : "unconfigured",
    }),
  );

  // --- Browser sign-in -----------------------------------------------------
  app.get("/auth/sign-in.js", (c) =>
    c.body(signInScript, 200, { "Content-Type": "text/javascript; charset=utf-8" }),
  );
  app.get("/auth/sign-in", (c) => {
    needAuth(c);
    const dev = devAuth(c.env, c.req.url);
    const fapi = dev ? null : frontendApi(c.env.CLERK_PUBLISHABLE_KEY ?? "");
    if (!dev && !fapi) throw new PublicError(503, "Clerk publishable key is invalid");
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const clerk = fapi ? ` https://${fapi}` : "";
    c.header(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'self' 'nonce-${nonce}'${clerk} https://challenges.cloudflare.com; connect-src 'self'${clerk}; img-src 'self' https://img.clerk.com data:; style-src 'unsafe-inline'; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    );
    const client = c.req.query("client");
    return c.html(
      signInPage({
        mode: dev ? "dev" : "clerk",
        ...(fapi ? { frontendApi: fapi, publishableKey: c.env.CLERK_PUBLISHABLE_KEY! } : {}),
        ...(client ? { client } : {}),
        nonce,
      }),
    );
  });
  app.post("/auth/dev/session", async (c) => {
    if (!devAuth(c.env, c.req.url)) throw new PublicError(404, "Not found");
    const body = z
      .object({ name: z.string().trim().min(1).max(100), email: z.string().email().max(200) })
      .parse(await c.req.json());
    return c.json(
      await devSessionToken(c.env.PREFLIGHT_DEV_AUTH_SECRET ?? DEV_SECRET_FALLBACK, body),
    );
  });
  const Challenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
  app.post("/auth/exchange", async (c) => {
    const { dir, db } = needAuth(c);
    const body = z
      .object({
        session_token: z.string().min(1).max(8000),
        redirect_uri: z.string().max(200),
        state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
        code_challenge: Challenge,
        code_challenge_method: z.literal("S256"),
        client: z.enum(["cli", "desktop"]),
      })
      .parse(await c.req.json());
    const redirectUri = loopbackRedirect(body.redirect_uri);
    if (!redirectUri) throw new PublicError(400, "redirect_uri must be http://127.0.0.1:<port>/callback");
    const userId = await dir.verifySession(body.session_token);
    if (!userId) throw new PublicError(401, "Your sign-in session is not valid; sign in again");
    const code = await createCode(db, {
      userId,
      challenge: body.code_challenge,
      redirectUri,
      client: body.client,
    });
    if (redirectUri === "oob") return c.json({ code });
    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    target.searchParams.set("state", body.state);
    return c.json({ redirect: target.href });
  });
  app.post("/auth/token", async (c) => {
    const { dir, db } = needAuth(c);
    const body = z
      .object({
        grant_type: z.literal("authorization_code").optional(),
        code: z.string().min(20).max(200),
        code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
        redirect_uri: z.string().max(200),
        label: z.string().trim().max(100).optional(),
      })
      .parse(await c.req.json());
    const grant = await consumeCode(db, body.code);
    if (
      !grant ||
      grant.redirect_uri !== body.redirect_uri ||
      !(await verifyPkce(body.code_verifier, grant.code_challenge))
    )
      throw new PublicError(400, "Invalid or expired sign-in code");
    const issued = await issueToken(db, {
      userId: grant.user_id,
      client: grant.client,
      label: body.label || `Preflight ${grant.client}`,
    });
    return c.json({
      token: issued.token,
      tokenId: issued.id,
      expiresAt: issued.expiresAt,
      user: await dir.user(grant.user_id),
    });
  });

  // --- Account and tokens --------------------------------------------------
  app.get("/api/account", async (c) => {
    const who = await caller(c);
    const user = await needAuth(c).dir.user(who.userId);
    return c.json({
      ownerId: who.userId,
      authentication: who.authentication,
      user,
      ...(who.expiresAt ? { expiresAt: who.expiresAt } : {}),
      ...(who.tokenId ? { tokenId: who.tokenId } : {}),
    });
  });
  app.get("/api/tokens", async (c) => {
    const who = await caller(c);
    const tokens = await listTokens(needAuth(c).db, who.userId);
    return c.json({ tokens: tokens.map((t) => ({ ...t, current: t.id === who.tokenId })) });
  });
  app.delete("/api/tokens/:id", async (c) => {
    const who = await caller(c);
    const id = z.string().uuid().parse(c.req.param("id"));
    if (!(await revokeToken(needAuth(c).db, who.userId, id)))
      throw new PublicError(404, "Token not found");
    return c.body(null, 204);
  });
  app.post("/api/auth/logout", async (c) => {
    const who = await caller(c);
    if (!who.tokenId) throw new PublicError(400, "Only Preflight API tokens can be logged out here");
    await revokeToken(needAuth(c).db, who.userId, who.tokenId);
    return c.body(null, 204);
  });

  // --- Teams (Clerk Organizations) -----------------------------------------
  app.get("/api/orgs", async (c) => {
    const who = await caller(c);
    return c.json(await needAuth(c).dir.memberships(who.userId));
  });
  app.post("/api/orgs", async (c) => {
    const who = await caller(c);
    const body = z
      .object({
        name: z.string().trim().min(1).max(100),
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
      })
      .parse(await c.req.json());
    return c.json(await needAuth(c).dir.createOrg(who.userId, body.name, body.slug), 201);
  });
  app.get("/api/orgs/:id", async (c) => {
    const who = await caller(c);
    const { dir } = needAuth(c);
    const orgId = Id.parse(c.req.param("id"));
    const m = await membership(dir, who.userId, orgId);
    if (!m) throw new PublicError(404, "Organization not found");
    const members = await dir.members(orgId);
    return c.json({
      id: m.id,
      name: m.name,
      slug: m.slug,
      role: m.role,
      members: members.map((p) => ({
        id: p.id,
        userId: p.id,
        role: p.role,
        user: { name: p.name, email: p.email },
      })),
    });
  });
  app.get("/api/orgs/:id/invitations", async (c) => {
    const who = await caller(c);
    const { dir } = needAuth(c);
    const orgId = Id.parse(c.req.param("id"));
    await asAdmin(dir, who.userId, orgId);
    return c.json(await dir.invitations(orgId));
  });
  app.post("/api/orgs/:id/invitations", async (c) => {
    const who = await caller(c);
    const { dir } = needAuth(c);
    const orgId = Id.parse(c.req.param("id"));
    const body = z
      .object({ email: z.string().email().max(200), role: RoleInput.default("member") })
      .parse(await c.req.json());
    await asAdmin(dir, who.userId, orgId);
    return c.json(
      await dir.invite({
        orgId,
        inviterId: who.userId,
        email: body.email,
        role: body.role,
        redirectUrl: `${publicOrigin(c)}/auth/sign-in`,
      }),
      201,
    );
  });
  app.delete("/api/orgs/:id/invitations/:invitation", async (c) => {
    const who = await caller(c);
    const { dir } = needAuth(c);
    const orgId = Id.parse(c.req.param("id"));
    await asAdmin(dir, who.userId, orgId);
    await dir.revokeInvitation(orgId, Id.parse(c.req.param("invitation")), who.userId);
    return c.body(null, 204);
  });
  app.patch("/api/orgs/:id/members/:user", async (c) => {
    const who = await caller(c);
    const { dir } = needAuth(c);
    const orgId = Id.parse(c.req.param("id"));
    const userId = Id.parse(c.req.param("user"));
    const { role } = z.object({ role: RoleInput }).parse(await c.req.json());
    await asAdmin(dir, who.userId, orgId);
    if (role !== "admin") await keepAnAdmin(dir, orgId, userId);
    await dir.setRole(orgId, userId, role);
    return c.json({ userId, role });
  });
  const leaveOrRemove = async (c: C, orgId: string, userId: string, self: boolean) => {
    const who = await caller(c);
    const { dir } = needAuth(c);
    if (self || userId === who.userId) {
      if (!(await membership(dir, who.userId, orgId)))
        throw new PublicError(404, "Organization not found");
      userId = who.userId;
    } else await asAdmin(dir, who.userId, orgId);
    await keepAnAdmin(dir, orgId, userId);
    await dir.removeMember(orgId, userId);
    return c.body(null, 204);
  };
  app.delete("/api/orgs/:id/members/:user", (c) =>
    leaveOrRemove(c, Id.parse(c.req.param("id")), Id.parse(c.req.param("user")), false),
  );
  app.post("/api/orgs/:id/leave", (c) =>
    leaveOrRemove(c, Id.parse(c.req.param("id")), "", true),
  );
  app.get("/api/invitations", async (c) => {
    const who = await caller(c);
    return c.json(await needAuth(c).dir.userInvitations(who.userId));
  });
  app.post("/api/invitations/:id/:decision{accept|reject}", async (c) => {
    const who = await caller(c);
    const { dir } = needAuth(c);
    const id = Id.parse(c.req.param("id"));
    const invitation = (await dir.userInvitations(who.userId)).find((i) => i.id === id);
    if (!invitation || invitation.status !== "pending")
      throw new PublicError(404, "Invitation not found");
    if (c.req.param("decision") === "accept")
      await dir.addMember(invitation.organizationId, who.userId, invitation.role);
    await dir
      .revokeInvitation(invitation.organizationId, id, who.userId)
      .catch(() => undefined);
    return c.json({ organizationId: invitation.organizationId, status: c.req.param("decision") === "accept" ? "accepted" : "rejected" });
  });
  /** Revokes an invitation by id alone, looking in the caller's admin orgs. */
  app.delete("/api/invitations/:id", async (c) => {
    const who = await caller(c);
    const { dir } = needAuth(c);
    const id = Id.parse(c.req.param("id"));
    for (const m of await dir.memberships(who.userId)) {
      if (m.role !== "admin") continue;
      if ((await dir.invitations(m.id)).some((i) => i.id === id)) {
        await dir.revokeInvitation(m.id, id, who.userId);
        return c.body(null, 204);
      }
    }
    throw new PublicError(404, "Invitation not found");
  });

  // --- Shares --------------------------------------------------------------
  interface ShareRow {
    code: string;
    owner_id: string;
    org_id: string | null;
    object_key: string;
  }
  /** Removes a share: R2 payload first, then the KV pointer, then the D1 row. */
  const removeShare = async (env: Env, row: { code: string; object_key: string }) => {
    await env.PAYLOADS.delete(row.object_key);
    await env.SHARES.delete(row.code);
    if (env.DB) await env.DB.prepare("DELETE FROM shares WHERE code = ?").bind(row.code).run();
  };
  app.get("/api/shares", async (c) => {
    const who = await caller(c);
    const { dir, db } = needAuth(c);
    const team = c.req.query("team");
    if (team) {
      Id.parse(team);
      if (!(await membership(dir, who.userId, team)))
        throw new PublicError(404, "Organization not found");
    }
    const { results } = await db
      .prepare(
        `SELECT code, owner_id AS ownerId, org_id AS team, visibility, created_at AS createdAt, expires_at AS expiresAt, resource_count AS resourceCount FROM shares WHERE ${team ? "org_id" : "owner_id"} = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(team ?? who.userId, new Date().toISOString())
      .all<Record<string, unknown>>();
    const base = publicOrigin(c);
    return c.json({ shares: results.map((r) => ({ ...r, url: `${base}/s/${r.code}` })) });
  });
  app.post("/api/shares", async (c) => {
    const who = await caller(c);
    const { dir, db } = needAuth(c);
    const input = SharePayloadSchema.parse(await c.req.json());
    if (input.expiresAt && Date.parse(input.expiresAt) <= Date.now())
      throw new PublicError(400, "Expiry must be in the future");
    if (input.team && !(await membership(dir, who.userId, input.team)))
      throw new PublicError(403, "You are not a member of that team");
    const payload = {
      ...input,
      ownerId: who.userId,
      ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt).toISOString() } : {}),
    };
    const key = `${encodeURIComponent(who.userId)}/${crypto.randomUUID()}`;
    // The D1 primary key reserves the code atomically; retry on collision.
    let code = "";
    for (let attempt = 0; !code; attempt++) {
      if (attempt >= 8) throw new Error("Unable to allocate a share code");
      const candidate = shareCode();
      const inserted = await db
        .prepare(
          "INSERT INTO shares (code, owner_id, org_id, object_key, visibility, created_at, expires_at, resource_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING",
        )
        .bind(
          candidate,
          who.userId,
          payload.team ?? null,
          key,
          payload.visibility,
          new Date().toISOString(),
          payload.expiresAt ?? null,
          payload.resources.length,
        )
        .run();
      if ((inserted.meta.changes ?? 0) > 0) code = candidate;
    }
    const ttl = payload.expiresAt
      ? Math.max(60, Math.ceil((Date.parse(payload.expiresAt) - Date.now()) / 1000))
      : undefined;
    try {
      await c.env.PAYLOADS.put(key, JSON.stringify(payload));
      await c.env.SHARES.put(
        code,
        JSON.stringify({ key, ownerId: who.userId, expiresAt: payload.expiresAt ?? null }),
        ttl ? { expirationTtl: ttl } : undefined,
      );
    } catch (error) {
      await removeShare(c.env, { code, object_key: key }).catch(() => undefined);
      throw error;
    }
    return c.json({ code, url: `${publicOrigin(c)}/s/${code}` }, 201);
  });
  async function lookup(c: C, code: string) {
    if (!isShareCode(code)) return null;
    code = code.toLowerCase();
    const raw = await c.env.SHARES.get(code);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { key: string; ownerId: string; expiresAt?: string | null };
    const expired = (at?: string | null) => !!at && Date.parse(at) <= Date.now();
    if (expired(entry.expiresAt)) {
      await defer(c, removeShare(c.env, { code, object_key: entry.key }));
      return null;
    }
    const object = await c.env.PAYLOADS.get(entry.key);
    if (!object) return null;
    const payload = SharePayloadSchema.parse(JSON.parse(await object.text()));
    if (expired(payload.expiresAt)) {
      await defer(c, removeShare(c.env, { code, object_key: entry.key }));
      return null;
    }
    return { entry, payload };
  }
  app.get("/api/shares/:code", async (c) => {
    const result = await lookup(c, c.req.param("code"));
    return result ? c.json(result.payload) : c.json({ error: "Share not found or expired" }, 404);
  });
  app.delete("/api/shares/:code", async (c) => {
    const who = await caller(c);
    const { dir, db } = needAuth(c);
    const code = c.req.param("code").toLowerCase();
    if (!isShareCode(code)) throw new PublicError(404, "Not found");
    const row = await db
      .prepare("SELECT code, owner_id, org_id, object_key FROM shares WHERE code = ?")
      .bind(code)
      .first<ShareRow>();
    if (!row) throw new PublicError(404, "Not found");
    if (row.owner_id !== who.userId) {
      const m = row.org_id ? await membership(dir, who.userId, row.org_id) : null;
      if (m?.role !== "admin") throw new PublicError(403, "Only the owner or a team admin can revoke this share");
    }
    await removeShare(c.env, row);
    return c.body(null, 204);
  });
  const shareHtml = (title: string, body: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>${pageStyle}body{max-width:850px}article{border-top:1px solid #ccc;padding:1rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eeede7;color:#252923;padding:1rem}textarea{width:100%;height:12rem}</style></head><body><main>${body}</main></body></html>`;
  app.get("/s/:code", async (c) => {
    const code = c.req.param("code").toLowerCase();
    const found = await lookup(c, code);
    if (!found) return c.text("Share not found or expired", 404);
    const { payload } = found;
    return c.html(
      shareHtml(
        `Preflight share ${escape(code)}`,
        `<h1>Inspect this setup</h1><p>Code: <strong>${escape(code)}</strong> · ${escape(payload.visibility)}${payload.team ? " · team share" : ""}</p><p>Anyone with this link can read it.</p><p>Required environment variables: ${escape(requiredEnv(payload).join(", ") || "none")}</p>${payload.resources.map((r) => `<article><h2>${escape(r.name)}</h2><p>${escape(r.type)} · ${escape(r.scope)} · ${escape(r.source)}</p><pre>${escape(JSON.stringify(r, null, 2))}</pre></article>`).join("")}<h2>Compare with your setup</h2><p>Run <code>preflight apply ${escape(code)} --dry-run</code> for a local comparison. Or paste a secret-free preflight.config.json below; it is sent to this service for comparison.</p><form action="/s/${escape(code)}/preview" method="post"><textarea name="config" aria-label="Secret-free Preflight config" required></textarea><button>Preview diff</button></form>`,
      ),
    );
  });
  app.post("/s/:code/preview", async (c) => {
    const found = await lookup(c, c.req.param("code"));
    if (!found) return c.text("Not found", 404);
    const form = await c.req.parseBody();
    const config = PreflightConfigSchema.parse(JSON.parse(String(form.config)));
    const diff = previewShare(found.payload, config.profiles[config.activeProfile]!.resources);
    return c.html(
      shareHtml("Preflight diff", `<h1>Preview only</h1><pre>${escape(JSON.stringify(diff, null, 2))}</pre>`),
    );
  });
  return app;
}

/** Cron: purges expired shares (R2, KV, D1), codes, tokens and counters. */
export async function purgeExpired(env: Env, now = Date.now()) {
  if (!env.DB) return { shares: 0 };
  const { results } = await env.DB.prepare(
    "SELECT code, object_key FROM shares WHERE expires_at IS NOT NULL AND expires_at <= ? LIMIT 500",
  )
    .bind(new Date(now).toISOString())
    .all<{ code: string; object_key: string }>();
  for (const row of results) {
    await env.PAYLOADS.delete(row.object_key);
    await env.SHARES.delete(row.code);
    await env.DB.prepare("DELETE FROM shares WHERE code = ?").bind(row.code).run();
  }
  await env.DB.prepare("DELETE FROM auth_codes WHERE expires_at <= ?").bind(now).run();
  await env.DB.prepare("DELETE FROM api_tokens WHERE expires_at <= ?").bind(now).run();
  await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?")
    .bind(now - 3_600_000)
    .run();
  return { shares: results.length };
}

const app = createApp();
export default {
  fetch: app.fetch,
  request: app.request,
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(purgeExpired(env));
  },
};
