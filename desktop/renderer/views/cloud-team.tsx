import { useEffect, useState } from "react";
import { z } from "zod";
import { Users, Mail, RefreshCw, Plus, ShieldCheck } from "lucide-react";
import type { CloudOperation } from "../../../src/cloud-client";
import type { Workspace } from "../workspace";
import { Badge, Button, Dialog, Empty, Notice } from "../components/ui";

const Organization = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});
const Member = z.object({
  id: z.string(),
  userId: z.string(),
  role: z.string(),
  user: z.object({ name: z.string(), email: z.string() }),
});
const Invitation = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string().nullable(),
  status: z.string(),
  expiresAt: z.string(),
  organizationName: z.string().optional(),
});
const Details = Organization.extend({
  members: z.array(Member),
  invitations: z.array(Invitation).optional(),
});
type Review = { operation: CloudOperation; title: string; description: string };
const roles = {
  admin: "Manages members, roles and invitations.",
  member: "Can view the organization, its members and its team shares.",
};

export function CloudTeams({ workspace: w }: { workspace: Workspace }) {
  const [organizations, setOrganizations] = useState<
    z.infer<typeof Organization>[]
  >([]);
  const [selected, setSelected] = useState<z.infer<typeof Details> | null>(
    null,
  );
  const [invitations, setInvitations] = useState<z.infer<typeof Invitation>[]>(
    [],
  );
  const [incoming, setIncoming] = useState<z.infer<typeof Invitation>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState(""),
    [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState(""),
    [role, setRole] = useState<"member" | "admin">("member");
  const [review, setReviewState] = useState<Review | null>(null);
  const setReview = (value: Review | null) => {
    if (value) w.setError("");
    setReviewState(value);
  };
  const connected = w.state?.account.authentication === "token";
  const service = w.state?.account.service;
  const myRole = selected?.members.find(
    (m) => m.userId === w.state?.account.user?.id,
  )?.role;
  const manage = myRole === "admin";
  const lastOwner =
    manage && selected?.members.filter((m) => m.role === "admin").length === 1;
  const load = async () => {
    const [groups, inbox] = await Promise.all([
      window.preflight.cloud({ action: "organizations" }),
      window.preflight.cloud({ action: "incoming" }),
    ]);
    setOrganizations(z.array(Organization).parse(groups));
    setIncoming(
      z
        .array(Invitation)
        .parse(inbox)
        .filter(
          (i) => i.status === "pending" && Date.parse(i.expiresAt) > Date.now(),
        ),
    );
    setLoaded(true);
  };
  const open = async (organizationId: string) => {
    const [details, pending] = await Promise.all([
      window.preflight.cloud({ action: "organization", organizationId }),
      window.preflight.cloud({ action: "invitations", organizationId }),
    ]);
    setSelected(Details.parse(details));
    setInvitations(z.array(Invitation).parse(pending));
  };
  useEffect(() => {
    setSelected(null);
    setOrganizations([]);
    setIncoming([]);
    setLoaded(false);
    if (!connected) return;
    let active = true;
    void Promise.all([
      window.preflight.cloud({ action: "organizations" }),
      window.preflight.cloud({ action: "incoming" }),
    ])
      .then(([groups, inbox]) => {
        if (active) {
          setOrganizations(z.array(Organization).parse(groups));
          setIncoming(
            z
              .array(Invitation)
              .parse(inbox)
              .filter(
                (i) =>
                  i.status === "pending" &&
                  Date.parse(i.expiresAt) > Date.now(),
              ),
          );
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) w.setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [connected, service, w.state?.account.user?.id, w.setError]);
  if (!connected)
    return (
      <Notice>
        Sign in with your browser in Account to manage cloud teams, invitations
        and access. The offline roster below is kept on this device.
      </Notice>
    );
  return (
    <section className="team-workspace">
      <div className="section-intro">
        <div>
          <h2>Your crew</h2>
          <p>One place for your organizations, invitations and access.</p>
        </div>
        <Button
          disabled={!!w.busy}
          onClick={() =>
            void w.task("Refreshing teams…", async () => {
              await load();
              if (selected) await open(selected.id);
            })
          }
        >
          <RefreshCw size={15} />
          Refresh
        </Button>
      </div>
      {!!incoming.length && (
        <div className="invitation-inbox">
          <Mail size={23} />
          <div>
            <h3>Invitations for you</h3>
            {incoming.map((i) => (
              <div className="invitation-row" key={i.id}>
                <span>
                  {i.organizationName ?? "Organization"}{" "}
                  <Badge>{i.role ?? "member"}</Badge>
                </span>
                <Button
                  onClick={() =>
                    setReview({
                      operation: { action: "accept", invitationId: i.id },
                      title: "Join this organization?",
                      description: `You will join ${i.organizationName ?? "the organization"} as ${i.role ?? "member"}.`,
                    })
                  }
                >
                  Review invitation
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setReview({
                      operation: { action: "reject", invitationId: i.id },
                      title: "Decline invitation?",
                      description:
                        "This invitation will be declined for your account.",
                    })
                  }
                >
                  Decline
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="team-layout">
        <aside className="team-directory">
          <h3>Organizations</h3>
          {!loaded && <p className="muted">Loading your organizations…</p>}
          {loaded && !organizations.length && (
            <p className="hint">
              Create your first team, or accept an invitation.
            </p>
          )}
          {organizations.map((o) => (
            <button
              className={`team-choice ${selected?.id === o.id ? "selected" : ""}`}
              key={o.id}
              onClick={() =>
                void w.task("Opening organization…", () => open(o.id))
              }
            >
              <span className="team-monogram">
                {o.name.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <strong>{o.name}</strong>
                <small>{o.slug}</small>
              </span>
            </button>
          ))}
          <details
            className="team-create"
            open={creating}
            onToggle={(event) => setCreating(event.currentTarget.open)}
          >
            <summary>
              <Plus size={14} />
              Create organization
            </summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void w.task("Creating organization…", async () => {
                  const group = Organization.parse(
                    await window.preflight.cloud({
                      action: "create-organization",
                      name,
                      slug,
                    }),
                  );
                  await load();
                  await open(group.id);
                  setName("");
                  setSlug("");
                  setCreating(false);
                });
              }}
            >
              <label>
                Name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Unique slug
                <input
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="my-team"
                />
              </label>
              <Button variant="primary" type="submit" disabled={!!w.busy}>
                Create organization
              </Button>
            </form>
          </details>
        </aside>
        <div className="team-content">
          {selected ? (
            <>
              <div className="team-heading">
                <span className="team-monogram large">
                  {selected.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <h2>{selected.name}</h2>
                  <p>
                    {selected.members.length}{" "}
                    {selected.members.length === 1 ? "member" : "members"}
                  </p>
                </div>
                <Badge tone="green">Your role: {myRole ?? "member"}</Badge>
              </div>
              <div className="role-guide">
                <ShieldCheck size={20} />
                <p>
                  {roles[(myRole ?? "member") as keyof typeof roles] ??
                    "Permissions are enforced by your organization."}{" "}
                  Members see the team's shares in their list; share links stay
                  readable by anyone who has the link.
                </p>
              </div>
              <h3>Members</h3>
              <table className="member-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Access</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.members.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="person-cell">
                          <span className="avatar">
                            {m.user.name.slice(0, 1)}
                          </span>
                          <span>
                            <strong>
                              {m.user.name}
                              {m.userId === w.state?.account.user?.id
                                ? " (you)"
                                : ""}
                            </strong>
                            <small>{m.user.email}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        {manage ? (
                          <select
                            aria-label={`Role for ${m.user.name}`}
                            value={m.role}
                            disabled={!!w.busy}
                            onChange={(e) =>
                              setReview({
                                operation: {
                                  action: "update-role",
                                  organizationId: selected.id,
                                  memberId: m.id,
                                  role: e.target.value as "admin" | "member",
                                },
                                title: "Change team access?",
                                description: `Change ${m.user.name} from ${m.role} to ${e.target.value}. ${roles[e.target.value as keyof typeof roles]}`,
                              })
                            }
                          >
                            <option
                              value="member"
                              disabled={
                                lastOwner &&
                                m.userId === w.state?.account.user?.id
                              }
                            >
                              Member
                            </option>
                            <option
                              value="admin"
                              disabled={
                                lastOwner &&
                                m.userId === w.state?.account.user?.id
                              }
                            >
                              Administrator
                            </option>
                          </select>
                        ) : (
                          <Badge>{m.role}</Badge>
                        )}
                      </td>
                      <td>
                        {manage &&
                          m.userId !== w.state?.account.user?.id && (
                            <Button
                              variant="ghost"
                              onClick={() =>
                                setReview({
                                  operation: {
                                    action: "remove-member",
                                    organizationId: selected.id,
                                    memberId: m.id,
                                  },
                                  title: "Remove this member?",
                                  description: `${m.user.name} will lose access to ${selected.name}. Existing public share links are unaffected.`,
                                })
                              }
                            >
                              Remove
                            </Button>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {manage && (
                <section className="team-invites">
                  <h3>Invite someone</h3>
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void w.task("Creating invitation…", async () => {
                        await window.preflight.cloud({
                          action: "invite",
                          organizationId: selected.id,
                          email,
                          role,
                        });
                        setEmail("");
                        await open(selected.id);
                      });
                    }}
                  >
                    <label>
                      Email
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="teammate@example.com"
                      />
                    </label>
                    <label>
                      Access
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as typeof role)}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </label>
                    <Button variant="primary" disabled={!!w.busy} type="submit">
                      Create invitation
                    </Button>
                  </form>
                  <p className="hint">
                    Clerk emails the invitation. The recipient accepts it here
                    or with preflight inbox after signing in with that email.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Invitation</th>
                        <th>Access</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invitations.map((i) => (
                        <tr key={i.id}>
                          <td>
                            {i.email}
                            <small>
                              Expires{" "}
                              {new Date(i.expiresAt).toLocaleDateString()}
                            </small>
                          </td>
                          <td>{i.role}</td>
                          <td>
                            <Badge>
                              {i.status === "pending" &&
                              Date.parse(i.expiresAt) <= Date.now()
                                ? "expired"
                                : i.status}
                            </Badge>
                          </td>
                          <td>
                            {i.status === "pending" &&
                              Date.parse(i.expiresAt) > Date.now() && (
                                <div className="button-row">
                                  <Button
                                    variant="ghost"
                                    onClick={() =>
                                      setReview({
                                        operation: {
                                          action: "cancel-invitation",
                                          invitationId: i.id,
                                          organizationId: selected.id,
                                        },
                                        title: "Cancel this invitation?",
                                        description: `The invitation for ${i.email} will stop working.`,
                                      })
                                    }
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!invitations.length && (
                    <p className="hint">No invitations yet.</p>
                  )}
                </section>
              )}
              {lastOwner && (
                <p className="hint">
                  Make another member an administrator before leaving or
                  changing your own role.
                </p>
              )}
              <Button
                variant="ghost"
                disabled={!!w.busy || lastOwner}
                onClick={() =>
                  setReview({
                    operation: { action: "leave", organizationId: selected.id },
                    title: "Leave this organization?",
                    description: `You will lose membership in ${selected.name}. Promote another administrator first if you are the last one.`,
                  })
                }
              >
                Leave organization
              </Button>
            </>
          ) : (
            <Empty
              title="Pick your crew"
              description="Choose an organization to manage people, invitations and access."
              action={<Users size={28} />}
            />
          )}
        </div>
      </div>
      <Dialog
        open={!!review}
        onClose={() => {
          if (!w.busy) setReview(null);
        }}
        title={review?.title ?? "Review access"}
        description={review?.description ?? ""}
      >
        {w.error && <Notice>{w.error}</Notice>}
        <div className="button-row">
          <Button onClick={() => setReview(null)} disabled={!!w.busy}>
            Keep current access
          </Button>
          <Button
            variant="primary"
            disabled={!!w.busy}
            onClick={() =>
              void w.task("Updating organization…", async () => {
                if (!review) return;
                await window.preflight.cloud(review.operation);
                setReview(null);
                await load();
                if (selected && review.operation.action !== "leave")
                  await open(selected.id);
                else setSelected(null);
              })
            }
          >
            Confirm change
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
