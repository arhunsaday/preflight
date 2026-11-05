// Per-client rate limits: the Cloudflare Rate Limiting binding when it is
// configured, else a fixed-window counter in D1.
import type { D1Database } from "@cloudflare/workers-types";

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
export const limits = {
  auth: { limit: 30, periodMs: 60_000 },
  shares: { limit: 60, periodMs: 60_000 },
  public: { limit: 120, periodMs: 60_000 },
} as const;
export type LimitGroup = keyof typeof limits;

export async function allow(
  group: LimitGroup,
  client: string,
  options: { binding?: RateLimitBinding; db?: D1Database },
  now = Date.now(),
) {
  const key = `${group}:${client}`;
  if (options.binding) return (await options.binding.limit({ key })).success;
  if (!options.db) return true;
  const { limit, periodMs } = limits[group];
  const window = now - (now % periodMs);
  const row = await options.db
    .prepare(
      "INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END, window_start = excluded.window_start RETURNING count",
    )
    .bind(key, window)
    .first<{ count: number }>();
  return (row?.count ?? 0) <= limit;
}
