import { z } from "zod";
import { serviceUrl } from "./sharing.js";
const id = z.string().min(1).max(200).regex(/^[A-Za-z0-9_:-]+$/);
/** Clerk Organization roles: `admin` (org:admin) or `member` (org:member). */
const role = z.enum(["admin", "member"]);
export const CloudOperation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("shares"), team: id.optional() }).strict(),
  z.object({ action: z.literal("tokens") }).strict(),
  z.object({ action: z.literal("revoke-token"), tokenId: z.uuid() }).strict(),
  z.object({ action: z.literal("organizations") }).strict(),
  z
    .object({
      action: z.literal("create-organization"),
      name: z.string().trim().min(1).max(100),
      slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(100),
    })
    .strict(),
  z.object({ action: z.literal("organization"), organizationId: id }).strict(),
  z
    .object({
      action: z.literal("invite"),
      organizationId: id,
      email: z.string().email(),
      role,
    })
    .strict(),
  z.object({ action: z.literal("invitations"), organizationId: id }).strict(),
  z.object({ action: z.literal("incoming") }).strict(),
  z.object({ action: z.literal("accept"), invitationId: id }).strict(),
  z.object({ action: z.literal("reject"), invitationId: id }).strict(),
  z
    .object({
      action: z.literal("cancel-invitation"),
      invitationId: id,
      organizationId: id.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("update-role"),
      organizationId: id,
      memberId: id,
      role,
    })
    .strict(),
  z
    .object({
      action: z.literal("remove-member"),
      organizationId: id,
      memberId: id,
    })
    .strict(),
  z.object({ action: z.literal("leave"), organizationId: id }).strict(),
]);
export type CloudOperation = z.infer<typeof CloudOperation>;
const e = encodeURIComponent;
function route(operation: CloudOperation): {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
} {
  switch (operation.action) {
    case "shares":
      return {
        method: "GET",
        path: "/api/shares" + (operation.team ? `?team=${e(operation.team)}` : ""),
      };
    case "tokens":
      return { method: "GET", path: "/api/tokens" };
    case "revoke-token":
      return { method: "DELETE", path: `/api/tokens/${e(operation.tokenId)}` };
    case "organizations":
      return { method: "GET", path: "/api/orgs" };
    case "create-organization":
      return {
        method: "POST",
        path: "/api/orgs",
        body: { name: operation.name, slug: operation.slug },
      };
    case "organization":
      return { method: "GET", path: `/api/orgs/${e(operation.organizationId)}` };
    case "invite":
      return {
        method: "POST",
        path: `/api/orgs/${e(operation.organizationId)}/invitations`,
        body: { email: operation.email, role: operation.role },
      };
    case "invitations":
      return {
        method: "GET",
        path: `/api/orgs/${e(operation.organizationId)}/invitations`,
      };
    case "incoming":
      return { method: "GET", path: "/api/invitations" };
    case "accept":
    case "reject":
      return {
        method: "POST",
        path: `/api/invitations/${e(operation.invitationId)}/${operation.action}`,
      };
    case "cancel-invitation":
      return {
        method: "DELETE",
        path: operation.organizationId
          ? `/api/orgs/${e(operation.organizationId)}/invitations/${e(operation.invitationId)}`
          : `/api/invitations/${e(operation.invitationId)}`,
      };
    case "update-role":
      return {
        method: "PATCH",
        path: `/api/orgs/${e(operation.organizationId)}/members/${e(operation.memberId)}`,
        body: { role: operation.role },
      };
    case "remove-member":
      return {
        method: "DELETE",
        path: `/api/orgs/${e(operation.organizationId)}/members/${e(operation.memberId)}`,
      };
    case "leave":
      return {
        method: "POST",
        path: `/api/orgs/${e(operation.organizationId)}/leave`,
      };
  }
}
export async function cloudRequest(
  service: string,
  token: string,
  input: CloudOperation,
) {
  const { method, path, body } = route(CloudOperation.parse(input));
  const response = await fetch(`${serviceUrl(service)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const value: unknown =
    response.status === 204 ? { ok: true } : await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(value);
    throw new Error(
      `Cloud operation failed (HTTP ${response.status}): ${error.success ? error.data.error : "Request failed"}`,
    );
  }
  return value;
}
