import { createAuth } from "../src/backend/auth.js";
import type { D1Database } from "@cloudflare/workers-types";
// Schema generation only; no database queries or credentials are used here.
export const auth = createAuth({
  AUTH_DB: {} as D1Database,
  BASE_URL: "http://localhost:8787",
  BETTER_AUTH_SECRET: "schema-generation-only-not-a-deployment-secret",
});
