import { z } from "zod";
import { serviceUrl } from "./sharing.js";
const id = z.string().min(1).max(200);
const role = z.enum(["owner", "admin", "member"]);
export const CloudOperation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("shares") }).strict(),
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
    .object({ action: z.literal("cancel-invitation"), invitationId: id })
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
export async function cloudRequest(
  service: string,
  token: string,
  input: CloudOperation,
) {
  const operation = CloudOperation.parse(input);
  let path: string;
  let body: unknown;
  const prefix = "/api/auth/organization/";
  switch (operation.action) {
    case "shares":
      path = "/api/shares";
      break;
    case "organizations":
      path = prefix + "list";
      break;
    case "create-organization":
      path = prefix + "create";
      body = { name: operation.name, slug: operation.slug };
      break;
    case "organization":
      path =
        prefix +
        "get-full-organization?organizationId=" +
        encodeURIComponent(operation.organizationId);
      break;
    case "invite":
      path = prefix + "invite-member";
      body = {
        organizationId: operation.organizationId,
        email: operation.email,
        role: operation.role,
      };
      break;
    case "invitations":
      path =
        prefix +
        "list-invitations?organizationId=" +
        encodeURIComponent(operation.organizationId);
      break;
    case "incoming":
      path = prefix + "list-user-invitations";
      break;
    case "accept":
    case "reject":
    case "cancel-invitation":
      path =
        prefix +
        (operation.action === "cancel-invitation"
          ? "cancel-invitation"
          : operation.action + "-invitation");
      body = { invitationId: operation.invitationId };
      break;
    case "update-role":
      path = prefix + "update-member-role";
      body = {
        organizationId: operation.organizationId,
        memberId: operation.memberId,
        role: operation.role,
      };
      break;
    case "remove-member":
      path = prefix + "remove-member";
      body = {
        organizationId: operation.organizationId,
        memberIdOrEmail: operation.memberId,
      };
      break;
    case "leave":
      path = prefix + "leave";
      body = { organizationId: operation.organizationId };
      break;
  }
  const response = await fetch(`${serviceUrl(service)}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = z
      .object({ message: z.string().optional(), error: z.string().optional() })
      .safeParse(value);
    throw new Error(
      `Cloud operation failed (HTTP ${response.status}): ${error.success ? (error.data.message ?? error.data.error ?? "Request failed") : "Request failed"}`,
    );
  }
  return value;
}
