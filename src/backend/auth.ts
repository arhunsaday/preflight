import { betterAuth } from "better-auth";
import { bearer, deviceAuthorization, organization } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";
import * as schema from "./auth-schema.js";
import { serviceUrl } from "../sharing.js";
export interface AuthBindings {
  AUTH_DB?: D1Database;
  BETTER_AUTH_SECRET?: string;
  BASE_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_LOCAL_TEST?: string;
}
export function createAuth(env: AuthBindings) {
  if (!env.AUTH_DB || !env.BETTER_AUTH_SECRET || !env.BASE_URL)
    throw new Error(
      "Configure AUTH_DB, BETTER_AUTH_SECRET and BASE_URL for authentication.",
    );
  const baseURL = serviceUrl(env.BASE_URL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(baseURL).hostname,
  );
  return betterAuth({
    appName: "Preflight",
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.AUTH_DB, { schema }), {
      provider: "sqlite",
      schema,
    }),
    trustedOrigins: [baseURL],
    emailAndPassword: { enabled: local && env.AUTH_LOCAL_TEST === "1" },
    socialProviders: {
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
            },
          }
        : {}),
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
    },
    plugins: [
      bearer(),
      deviceAuthorization({
        verificationUri: `${baseURL}/device`,
        validateClient: (id) =>
          ["preflight-cli", "preflight-desktop"].includes(id),
      }),
      organization(),
    ],
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    rateLimit: { enabled: true, storage: "database" },
  });
}
