// Browser sign-in for the CLI and desktop: RFC 8252 loopback redirect with
// PKCE (S256), redeemed for a Preflight API token (`pfk_…`).
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { serviceUrl } from "./sharing.js";

export const DEFAULT_SERVICE = "https://api.preflight.arhun.fr";
/** The backend URL: `PREFLIGHT_API_URL` when set, else the hosted service. */
export const defaultService = () =>
  serviceUrl(process.env.PREFLIGHT_API_URL || DEFAULT_SERVICE);

export const Person = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});
export const AccountIdentity = z.object({
  ownerId: z.string().min(1),
  authentication: z.enum(["token", "session"]),
  user: Person.optional(),
  expiresAt: z.string().optional(),
  tokenId: z.string().optional(),
});
export type AccountIdentity = z.infer<typeof AccountIdentity>;
export const TokenGrant = z.object({
  token: z.string().startsWith("pfk_"),
  tokenId: z.string(),
  expiresAt: z.string(),
  user: Person,
});
export type TokenGrant = z.infer<typeof TokenGrant>;

const b64url = (bytes: Buffer) => bytes.toString("base64url");
export function pkce() {
  const verifier = b64url(randomBytes(32));
  return {
    verifier,
    challenge: b64url(createHash("sha256").update(verifier).digest()),
    state: b64url(randomBytes(24)),
  };
}

export function signInUrl(
  service: string,
  input: {
    redirectUri: string;
    state: string;
    challenge: string;
    client: "cli" | "desktop";
  },
) {
  const url = new URL("/auth/sign-in", serviceUrl(service));
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("client", input.client);
  return url.href;
}

const page = (title: string, text: string) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;max-width:520px;margin:15vh auto;padding:0 16px"><h1>${title}</h1><p>${text}</p></body></html>`;

/**
 * Listens on 127.0.0.1 (random port) for one `/callback?code&state` redirect.
 * Resolves with the code when `state` matches; ignores everything else.
 */
export async function loopback(state: string, timeoutMs = 5 * 60_000) {
  let settle!: { resolve: (code: string) => void; reject: (e: Error) => void };
  const code = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
  });
  code.catch(() => undefined);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const headers = {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "Cache-Control": "no-store",
    };
    if (req.method !== "GET" || url.pathname !== "/callback") {
      res.writeHead(404, headers).end(page("Not found", "Nothing here."));
      return;
    }
    const received = url.searchParams.get("code");
    if (url.searchParams.get("state") !== state || !received) {
      res
        .writeHead(400, headers)
        .end(page("Sign-in not completed", "This sign-in link does not match the request. Start again from Preflight."));
      return;
    }
    res
      .writeHead(200, headers)
      .end(page("Preflight is connected", "You can close this tab and return to Preflight."));
    settle.resolve(received);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback server failed");
  const timer = setTimeout(
    () => settle.reject(new Error("Sign-in timed out; run the sign-in again.")),
    timeoutMs,
  );
  timer.unref?.();
  const close = () => {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections?.();
  };
  void code.finally(close).catch(() => undefined);
  return {
    redirectUri: `http://127.0.0.1:${address.port}/callback`,
    code,
    close: () => {
      settle.reject(new Error("Sign-in was cancelled."));
      close();
    },
  };
}

async function failure(response: Response, fallback: string) {
  const body = z
    .object({ error: z.string() })
    .safeParse(await response.json().catch(() => null));
  return new Error(
    `${body.success ? body.data.error : fallback} (HTTP ${response.status})`,
  );
}

export async function redeemCode(
  service: string,
  input: { code: string; verifier: string; redirectUri: string; label: string },
) {
  const response = await fetch(`${serviceUrl(service)}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: input.code.trim(),
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri,
      label: input.label.slice(0, 100),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw await failure(response, "Sign-in failed");
  return TokenGrant.parse(await response.json());
}

export async function accountIdentity(base: string, token: string) {
  const response = await fetch(`${serviceUrl(base)}/api/account`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `Session unavailable (HTTP ${response.status}); sign in again.`,
    );
  return AccountIdentity.parse(await response.json());
}

/** Revokes the API token on the server. */
export async function signOut(base: string, token: string) {
  const response = await fetch(`${serviceUrl(base)}/api/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok && response.status !== 401)
    throw new Error(`Sign-out failed (HTTP ${response.status})`);
}
