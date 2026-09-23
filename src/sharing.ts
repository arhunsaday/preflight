import {
  SharePayloadSchema,
  type Resource,
  type SharePayload,
} from "./schema.js";
import { diffResources } from "./diff.js";
export const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
export function shareCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}
export function makeShare(
  resources: Resource[],
  options: {
    ownerId: string;
    visibility?: "public" | "unlisted";
    expiresAt?: string;
  },
) {
  return SharePayloadSchema.parse({
    version: 1,
    resources,
    createdAt: new Date().toISOString(),
    visibility: "unlisted",
    ...options,
  });
}
export function previewShare(input: unknown, current: Resource[]) {
  const payload = SharePayloadSchema.parse(input);
  if (payload.expiresAt && Date.parse(payload.expiresAt) <= Date.now())
    throw new Error("Share expired");
  return diffResources(current, payload.resources);
}
export const requiredEnv = (payload: SharePayload) =>
  [
    ...new Set(JSON.stringify(payload).match(/\$\{[A-Z][A-Z0-9_]*\}/g) ?? []),
  ].map((v) => v.slice(2, -1));
export function serviceUrl(base: string) {
  const url = new URL(base);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("Share service requires HTTPS");
  return url.origin;
}
export async function publishShare(
  base: string,
  payload: SharePayload,
  token: string,
) {
  const response = await fetch(`${serviceUrl(base)}/api/shares`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(SharePayloadSchema.parse(payload)),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Share failed: HTTP ${response.status}`);
  return response.json();
}
export async function fetchShare(base: string, code: string) {
  if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/i.test(code))
    throw new Error("Invalid share code");
  const response = await fetch(
    `${serviceUrl(base)}/api/shares/${code.toLowerCase()}`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok)
    throw new Error(`Share unavailable: HTTP ${response.status}`);
  const payload = SharePayloadSchema.parse(await response.json());
  previewShare(payload, []);
  return payload;
}
