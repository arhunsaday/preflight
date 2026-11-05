-- Preflight API: identity lives in Clerk; this database keeps Preflight API
-- tokens, one-time sign-in codes, share metadata and rate-limit counters.

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  -- base64url(SHA-256(token)); the token itself is never stored.
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  client TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER NOT NULL
);
CREATE INDEX api_tokens_user_idx ON api_tokens (user_id);
CREATE INDEX api_tokens_expiry_idx ON api_tokens (expires_at);

-- One-time PKCE codes from /auth/exchange, redeemed by /auth/token.
CREATE TABLE auth_codes (
  code_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  client TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_codes_expiry_idx ON auth_codes (expires_at);

-- Share metadata; payloads live in R2 and the public pointer in KV.
CREATE TABLE shares (
  code TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  org_id TEXT,
  object_key TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'unlisted')),
  created_at TEXT NOT NULL,
  expires_at TEXT,
  resource_count INTEGER NOT NULL
);
CREATE INDEX shares_owner_idx ON shares (owner_id, created_at);
CREATE INDEX shares_org_idx ON shares (org_id, created_at);
CREATE INDEX shares_expiry_idx ON shares (expires_at);

-- Fixed-window fallback when no Rate Limiting binding is configured.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
