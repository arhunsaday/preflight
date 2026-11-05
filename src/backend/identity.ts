// Identity and teams behind one small interface, so the Worker can run on
// Clerk in production and on a local, signed dev identity in tests and smokes.
import { createClerkClient, verifyToken } from "@clerk/backend";

export type Role = "admin" | "member";
export interface Person {
  id: string;
  name: string;
  email: string;
}
export interface Org {
  id: string;
  name: string;
  slug: string;
}
export interface Member extends Person {
  role: Role;
}
export interface Invitation {
  id: string;
  organizationId: string;
  organizationName?: string;
  email: string;
  role: Role;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
}
export interface Directory {
  /** Returns the user id of a valid session token, or null. */
  verifySession(token: string): Promise<string | null>;
  user(userId: string): Promise<Person>;
  memberships(userId: string): Promise<(Org & { role: Role })[]>;
  createOrg(userId: string, name: string, slug: string): Promise<Org>;
  members(orgId: string): Promise<Member[]>;
  invitations(orgId: string): Promise<Invitation[]>;
  invite(input: {
    orgId: string;
    inviterId: string;
    email: string;
    role: Role;
    redirectUrl: string;
  }): Promise<Invitation>;
  revokeInvitation(orgId: string, invitationId: string, userId: string): Promise<void>;
  /** Pending invitations addressed to one of the user's verified emails. */
  userInvitations(userId: string): Promise<Invitation[]>;
  addMember(orgId: string, userId: string, role: Role): Promise<void>;
  setRole(orgId: string, userId: string, role: Role): Promise<void>;
  removeMember(orgId: string, userId: string): Promise<void>;
}

/** An error whose message is safe to show to the caller. */
export class PublicError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 503,
    message: string,
  ) {
    super(message);
  }
}

const clerkRole = (role: Role) => `org:${role}`;
const fromClerkRole = (role: string): Role =>
  role === "org:admin" || role === "admin" ? "admin" : "member";
const iso = (ms: number) => new Date(ms).toISOString();

/** Maps Clerk Backend API client errors (4xx) to messages safe to return. */
async function clerkCall<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const e = error as {
      status?: number;
      errors?: { longMessage?: string; message?: string }[];
    };
    if (typeof e.status === "number" && e.status >= 400 && e.status < 500) {
      const message =
        e.errors?.[0]?.longMessage ?? e.errors?.[0]?.message ?? "Request refused";
      const status = ([400, 401, 403, 404, 409, 429] as const).find(
        (s) => s === e.status,
      );
      throw new PublicError(status ?? 400, message);
    }
    throw error;
  }
}

export function clerkDirectory(env: {
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_JWT_KEY?: string;
  authorizedParties: string[];
}): Directory {
  const clerk = createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
  });
  const person = async (userId: string): Promise<Person> => {
    const user = await clerkCall(() => clerk.users.getUser(userId));
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    return {
      id: user.id,
      name: user.fullName || user.username || email || user.id,
      email,
    };
  };
  const invitation = (i: {
    id: string;
    organizationId: string;
    emailAddress: string;
    role: string;
    status?: string | undefined;
    expiresAt: number;
    publicOrganizationData?: { name?: string } | null | undefined;
  }): Invitation => ({
    id: i.id,
    organizationId: i.organizationId,
    ...(i.publicOrganizationData?.name
      ? { organizationName: i.publicOrganizationData.name }
      : {}),
    email: i.emailAddress,
    role: fromClerkRole(i.role),
    status: (["pending", "accepted", "revoked", "expired"] as const).find(
      (s) => s === i.status,
    ) ?? "pending",
    expiresAt: iso(i.expiresAt),
  });
  return {
    async verifySession(token) {
      try {
        const payload = await verifyToken(token, {
          secretKey: env.CLERK_SECRET_KEY,
          ...(env.CLERK_JWT_KEY ? { jwtKey: env.CLERK_JWT_KEY } : {}),
          authorizedParties: env.authorizedParties,
        });
        return typeof payload.sub === "string" ? payload.sub : null;
      } catch {
        return null;
      }
    },
    user: person,
    async memberships(userId) {
      const list = await clerkCall(() =>
        clerk.users.getOrganizationMembershipList({ userId, limit: 100 }),
      );
      return list.data.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: fromClerkRole(m.role),
      }));
    },
    async createOrg(userId, name, slug) {
      const org = await clerkCall(() =>
        clerk.organizations.createOrganization({ name, slug, createdBy: userId }),
      );
      return { id: org.id, name: org.name, slug: org.slug };
    },
    async members(orgId) {
      const list = await clerkCall(() =>
        clerk.organizations.getOrganizationMembershipList({
          organizationId: orgId,
          limit: 100,
        }),
      );
      return list.data.flatMap((m) => {
        const u = m.publicUserData;
        if (!u) return [];
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
        return [
          {
            id: u.userId,
            name: name || u.identifier,
            email: u.identifier,
            role: fromClerkRole(m.role),
          },
        ];
      });
    },
    async invitations(orgId) {
      const list = await clerkCall(() =>
        clerk.organizations.getOrganizationInvitationList({
          organizationId: orgId,
          limit: 100,
        }),
      );
      return list.data.map(invitation);
    },
    async invite({ orgId, inviterId, email, role, redirectUrl }) {
      return invitation(
        await clerkCall(() =>
          clerk.organizations.createOrganizationInvitation({
            organizationId: orgId,
            inviterUserId: inviterId,
            emailAddress: email,
            role: clerkRole(role),
            redirectUrl,
          }),
        ),
      );
    },
    async revokeInvitation(orgId, invitationId, userId) {
      await clerkCall(() =>
        clerk.organizations.revokeOrganizationInvitation({
          organizationId: orgId,
          invitationId,
          requestingUserId: userId,
        }),
      );
    },
    async userInvitations(userId) {
      const list = await clerkCall(() =>
        clerk.users.getOrganizationInvitationList({
          userId,
          status: "pending",
          limit: 100,
        }),
      );
      return list.data.map(invitation);
    },
    async addMember(orgId, userId, role) {
      await clerkCall(() =>
        clerk.organizations.createOrganizationMembership({
          organizationId: orgId,
          userId,
          role: clerkRole(role),
        }),
      );
    },
    async setRole(orgId, userId, role) {
      await clerkCall(() =>
        clerk.organizations.updateOrganizationMembership({
          organizationId: orgId,
          userId,
          role: clerkRole(role),
        }),
      );
    },
    async removeMember(orgId, userId) {
      await clerkCall(() =>
        clerk.organizations.deleteOrganizationMembership({
          organizationId: orgId,
          userId,
        }),
      );
    },
  };
}

/**
 * The Clerk frontend API host encoded in a publishable key
 * (`pk_test_` or `pk_live_` + base64 of `host$`).
 */
export function frontendApi(publishableKey: string) {
  const match = /^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/.exec(publishableKey);
  if (!match) return null;
  try {
    const host = atob(match[2]!.replace(/-/g, "+").replace(/_/g, "/")).replace(
      /\$$/,
      "",
    );
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
      host,
    )
      ? host
      : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dev identity: only for PREFLIGHT_DEV_AUTH=1 on a loopback host. Session
// tokens are `dev_<payload>.<hmac>` signed with a local secret, and teams live
// in a JSON document behind a tiny key-value store.

interface DevState {
  users: Record<string, Person>;
  orgs: Record<string, Org & { members: Record<string, Role> }>;
  invitations: Record<string, Invitation>;
}
export interface DevStore {
  get(): Promise<string | null>;
  put(value: string): Promise<void>;
}
const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data))),
  );
}
export async function devUserId(email: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(email.toLowerCase())),
  );
  return `user_dev_${base64url(digest).slice(0, 20)}`;
}
export async function devSessionToken(
  secret: string,
  person: { name: string; email: string },
) {
  const id = await devUserId(person.email);
  const payload = base64url(
    encoder.encode(
      JSON.stringify({ sub: id, name: person.name, email: person.email, iat: Date.now() }),
    ),
  );
  return { token: `dev_${payload}.${await hmac(secret, payload)}`, userId: id };
}

export function devDirectory(secret: string, store: DevStore): Directory {
  const load = async (): Promise<DevState> =>
    JSON.parse((await store.get()) ?? '{"users":{},"orgs":{},"invitations":{}}');
  const update = async <T>(change: (s: DevState) => T) => {
    const state = await load();
    const value = change(state);
    await store.put(JSON.stringify(state));
    return value;
  };
  const org = (s: DevState, id: string) => {
    const found = s.orgs[id];
    if (!found) throw new PublicError(404, "Organization not found");
    return found;
  };
  const live = (i: Invitation): Invitation =>
    i.status === "pending" && Date.parse(i.expiresAt) <= Date.now()
      ? { ...i, status: "expired" }
      : i;
  return {
    async verifySession(token) {
      const match = /^dev_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
      if (!match) return null;
      const expected = await hmac(secret, match[1]!);
      if (!constantTimeEqual(expected, match[2]!)) return null;
      const claims = JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(
            atob(match[1]!.replace(/-/g, "+").replace(/_/g, "/")),
            (c) => c.charCodeAt(0),
          ),
        ),
      ) as { sub: string; name: string; email: string; iat: number };
      if (Date.now() - claims.iat > 10 * 60_000) return null;
      await update((s) => {
        s.users[claims.sub] = { id: claims.sub, name: claims.name, email: claims.email };
      });
      return claims.sub;
    },
    async user(userId) {
      const user = (await load()).users[userId];
      if (!user) throw new PublicError(404, "User not found");
      return user;
    },
    async memberships(userId) {
      return Object.values((await load()).orgs).flatMap((o) =>
        o.members[userId]
          ? [{ id: o.id, name: o.name, slug: o.slug, role: o.members[userId]! }]
          : [],
      );
    },
    async createOrg(userId, name, slug) {
      return update((s) => {
        if (Object.values(s.orgs).some((o) => o.slug === slug))
          throw new PublicError(409, "That slug is already taken");
        const id = `org_dev_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
        s.orgs[id] = { id, name, slug, members: { [userId]: "admin" } };
        return { id, name, slug };
      });
    },
    async members(orgId) {
      const s = await load();
      return Object.entries(org(s, orgId).members).map(([id, role]) => ({
        ...(s.users[id] ?? { id, name: id, email: "" }),
        role,
      }));
    },
    async invitations(orgId) {
      return Object.values((await load()).invitations)
        .filter((i) => i.organizationId === orgId)
        .map(live);
    },
    async invite({ orgId, email, role }) {
      return update((s) => {
        const o = org(s, orgId);
        const invitation: Invitation = {
          id: `orginv_dev_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
          organizationId: orgId,
          organizationName: o.name,
          email: email.toLowerCase(),
          role,
          status: "pending",
          expiresAt: iso(Date.now() + 30 * 86_400_000),
        };
        s.invitations[invitation.id] = invitation;
        return invitation;
      });
    },
    async revokeInvitation(orgId, invitationId) {
      await update((s) => {
        const i = s.invitations[invitationId];
        if (!i || i.organizationId !== orgId || i.status !== "pending")
          throw new PublicError(404, "Invitation not found");
        i.status = "revoked";
      });
    },
    async userInvitations(userId) {
      const s = await load();
      const email = s.users[userId]?.email.toLowerCase();
      return Object.values(s.invitations)
        .map(live)
        .filter((i) => i.email === email && i.status === "pending");
    },
    async addMember(orgId, userId, role) {
      await update((s) => {
        const o = org(s, orgId);
        if (o.members[userId]) throw new PublicError(409, "Already a member");
        o.members[userId] = role;
        for (const i of Object.values(s.invitations))
          if (
            i.organizationId === orgId &&
            i.status === "pending" &&
            i.email === s.users[userId]?.email.toLowerCase()
          )
            i.status = "accepted";
      });
    },
    async setRole(orgId, userId, role) {
      await update((s) => {
        const o = org(s, orgId);
        if (!o.members[userId]) throw new PublicError(404, "Member not found");
        o.members[userId] = role;
      });
    },
    async removeMember(orgId, userId) {
      await update((s) => {
        const o = org(s, orgId);
        if (!o.members[userId]) throw new PublicError(404, "Member not found");
        delete o.members[userId];
      });
    },
  };
}

/** Compares two strings in time independent of where they differ. */
export function constantTimeEqual(a: string, b: string) {
  const left = encoder.encode(a),
    right = encoder.encode(b);
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++)
    difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return difference === 0;
}
