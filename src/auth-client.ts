import { z } from "zod";
import { serviceUrl } from "./sharing.js";
export const AccountIdentity = z.object({
  ownerId: z.string().min(1),
  authentication: z.enum(["session", "deployment-token"]),
  user: z
    .object({ id: z.string(), name: z.string(), email: z.string() })
    .optional(),
  expiresAt: z.string().optional(),
});
export const DeviceCode = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  verification_uri_complete: z.string().url(),
  expires_in: z.number().positive(),
  interval: z.number().positive(),
});
export type DeviceAuthorization = z.infer<typeof DeviceCode>;
export async function beginDeviceSignIn(
  base: string,
  client: "preflight-desktop" | "preflight-cli",
) {
  const service = serviceUrl(base);
  const response = await fetch(`${service}/api/auth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: client }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `Sign-in is unavailable (HTTP ${response.status}). Configure the Cloudflare authentication backend.`,
    );
  const device = DeviceCode.parse(await response.json());
  const verification = new URL(device.verification_uri_complete);
  if (
    verification.username ||
    verification.password ||
    new URL(device.verification_uri_complete).origin !== service ||
    new URL(device.verification_uri_complete).pathname !== "/device"
  )
    throw new Error("The service returned an untrusted sign-in URL");
  return device;
}
export async function pollDeviceSignIn(
  base: string,
  client: string,
  device: DeviceAuthorization,
) {
  const response = await fetch(`${serviceUrl(base)}/api/auth/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: client,
      device_code: device.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = z
      .object({ error: z.string(), error_description: z.string().optional() })
      .parse(data);
    if (error.error === "authorization_pending")
      return { status: "pending" as const, interval: device.interval };
    if (error.error === "slow_down") {
      device.interval += 5;
      return { status: "pending" as const, interval: device.interval };
    }
    throw new Error(error.error_description ?? error.error);
  }
  const result = z
    .object({
      access_token: z.string().min(1),
      expires_in: z.number().positive(),
    })
    .parse(data);
  return {
    status: "connected" as const,
    token: result.access_token,
    expiresAt: new Date(Date.now() + result.expires_in * 1000).toISOString(),
  };
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
export async function signOut(base: string, token: string) {
  const response = await fetch(`${serviceUrl(base)}/api/auth/sign-out`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: "{}",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`Sign-out failed (HTTP ${response.status})`);
}
