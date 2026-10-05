import { isShareCode } from "../../../src/sharing";
import { z } from "zod";
import { useEffect, useState } from "react";
import {
  Share2,
  Download,
  Upload,
  KeyRound,
  CheckCircle2,
  LogOut,
  Users,
  Plus,
  Trash2,
  Link2,
} from "lucide-react";
import type { Workspace } from "../workspace";
import { Badge, Button, Notice, Json } from "../components/ui";
const HostedShare = z.object({
  code: z.string(),
  url: z.string().url(),
  visibility: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  resourceCount: z.number(),
});
export function Collaboration({ workspace: w }: { workspace: Workspace }) {
  const [hosted, setHosted] = useState<z.infer<typeof HostedShare>[]>([]);
  const [hostedLoaded, setHostedLoaded] = useState(false);
  const [code, setCode] = useState(""),
    [scope, setScope] = useState("all"),
    [visibility, setVisibility] = useState("unlisted"),
    [loadout, setLoadout] = useState(""),
    [share, setShare] = useState<unknown>(null);
  const options = [
    ...(scope === "all" ? [] : ["--scope", scope]),
    ...(loadout ? ["--loadout", loadout] : []),
    ...(visibility === "public" ? ["--public"] : []),
  ];
  return (
    <div className="page-scroll">
      <div className="section-intro">
        <div>
          <h2>A setup worth sharing</h2>
          <p>
            Share an inspectable configuration. Recipients review changes before
            applying them.
          </p>
        </div>
        <Share2 size={25} />
      </div>
      {w.state?.account.authentication === "session" && (
        <section className="form-section">
          <h3>Your hosted shares</h3>
          <Button
            disabled={!!w.busy}
            onClick={() =>
              void w.task("Loading your shares…", async () => {
                const response = z
                  .object({ shares: z.array(HostedShare) })
                  .parse(await window.adk.cloud({ action: "shares" }));
                setHosted(response.shares);
                setHostedLoaded(true);
              })
            }
          >
            Refresh my shares
          </Button>
          {hostedLoaded && !hosted.length && (
            <p className="hint">No hosted shares yet. Publish a setup below.</p>
          )}
          {hosted.map((item) => (
            <div className="connection-state" key={item.code}>
              <div>
                <h3>{item.code}</h3>
                <p>
                  {item.resourceCount} resources · {item.visibility}
                  {item.expiresAt ? ` · expires ${item.expiresAt}` : ""}
                </p>
              </div>
              <Button onClick={() => void window.adk.copyText(item.url)}>
                Copy link
              </Button>
              <Button onClick={() => void window.adk.openExternal(item.url)}>
                Open
              </Button>
              <Button
                disabled={!!w.busy}
                onClick={() => void w.run(["revoke", item.code])}
              >
                Preview revocation
              </Button>
            </div>
          ))}
        </section>
      )}
      <div className="sharing-workspace">
        <div className="form-section">
          <h3>Publish or export</h3>
          <p className="muted">
            Environment references travel with the configuration. Literal
            credentials are refused.
          </p>
          <div className="form-grid">
            <label>
              Resources
              <select
                value={loadout}
                onChange={(e) => setLoadout(e.target.value)}
              >
                <option value="">Active profile</option>
                {w.snapshot?.loadouts.map((n) => (
                  <option value={n} key={n}>
                    Loadout: {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Scope
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">All scopes</option>
                <option value="project">Project only</option>
                <option value="global">Global only</option>
              </select>
            </label>
            <label>
              Visibility
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                <option value="unlisted">Unlisted link</option>
                <option value="public">Public</option>
              </select>
            </label>
          </div>
          <div className="button-row">
            <Button
              variant="primary"
              disabled={!!w.busy || !w.state?.account.connected}
              onClick={async () => setShare(await w.run(["share", ...options]))}
            >
              <Upload size={15} />
              Preview publication
            </Button>
            <Button
              disabled={!!w.busy}
              onClick={async () => {
                const file = await window.adk.exportFile();
                if (file) await w.run(["share", ...options, "--out", file]);
              }}
            >
              <Download size={15} />
              Export JSON
            </Button>
          </div>
          {!w.state?.account.connected && (
            <p className="hint">
              Connect your share service in Account to publish. Local JSON
              exports work offline.
            </p>
          )}
          {share !== null && <Json value={share} />}
        </div>
        <div className="form-section">
          <h3>Import a shared setup</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void w.run(["apply", code]);
            }}
          >
            <label>
              Share URL, code or JSON file
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="https://preflight.example.com/s/abc234"
              />
            </label>
            <div className="button-row">
              <Button
                type="submit"
                disabled={!!w.busy || !w.snapshot?.initialized}
              >
                <Link2 size={15} />
                Preview import
              </Button>
              <Button
                type="button"
                disabled={!!w.busy}
                onClick={async () => {
                  const path = await window.adk.chooseFile();
                  if (path) setCode(path);
                }}
              >
                Choose file
              </Button>
            </div>
          </form>
          <div className="form-section">
            <h3>Revoke a hosted link</h3>
            <p className="muted">
              Revocation disables access to the link and is not a local rollback
              operation.
            </p>
            <Button
              disabled={
                !!w.busy || !w.state?.account.connected || !isShareCode(code)
              }
              onClick={() => void w.run(["revoke", code])}
            >
              Preview revocation
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
export function Account({ workspace: w }: { workspace: Workspace }) {
  const [service, setService] = useState(
      w.state?.account.service || "http://localhost:8787",
    ),
    [token, setToken] = useState("");
  const account = w.state?.account;
  const [device, setDevice] = useState<Awaited<
    ReturnType<typeof window.adk.beginSignIn>
  > | null>(null);
  const [loginError, setLoginError] = useState("");
  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Date.now() >= device.expiresAt) {
        setLoginError("Sign-in expired. Start again.");
        setDevice(null);
        return;
      }
      try {
        const result = await window.adk.pollSignIn(device.id);
        if (cancelled) return;
        if (result.status === "connected") {
          w.setState(await window.adk.state());
          setDevice(null);
        } else
          timer = setTimeout(poll, (result.interval ?? device.interval) * 1000);
      } catch (error) {
        if (!cancelled) {
          setLoginError(String(error));
          setDevice(null);
        }
      }
    };
    timer = setTimeout(poll, device.interval * 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      void window.adk.cancelSignIn(device.id);
    };
  }, [device, w.setState]);
  return (
    <div className="page-scroll account-page">
      <div className="section-intro">
        <div>
          <h2>Your Preflight account</h2>
          <p>
            Local configuration works without an account. Connect to publish and
            revoke hosted shares.
          </p>
        </div>
        <KeyRound size={25} />
      </div>
      {account?.connected ? (
        <div className="connection-state">
          <CheckCircle2 size={30} />
          <div>
            <h3>Connected as {account.user?.name ?? account.ownerId}</h3>
            <p>{account.service}</p>
            <Badge tone="green">
              {account.storage === "encrypted"
                ? "Credential encrypted on this device"
                : "Session-only credential"}
            </Badge>
          </div>
          <Button
            disabled={!!w.busy}
            onClick={() =>
              void w.task("Disconnecting…", async () => {
                w.setState(await window.adk.disconnect());
              })
            }
          >
            <LogOut size={15} />
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="form-section account-form">
          <label>
            Backend URL
            <input
              type="url"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="https://preflight.example.com"
            />
          </label>
          <p className="hint">
            Sign in with GitHub or Google in your browser. Confirm the device
            code there; credentials stay outside this interface.
          </p>
          {loginError && <Notice>{loginError}</Notice>}
          {device ? (
            <div>
              <h3>Confirm code: {device.userCode}</h3>
              <p>Waiting for browser approval…</p>
              <Button
                onClick={() =>
                  void window.adk.openExternal(device.verificationUri)
                }
              >
                Open sign-in page
              </Button>
              <Button onClick={() => setDevice(null)}>Cancel</Button>
            </div>
          ) : (
            <Button
              variant="primary"
              disabled={!!w.busy}
              onClick={() =>
                void w.task("Opening sign-in…", async () => {
                  setLoginError("");
                  setDevice(await window.adk.beginSignIn(service));
                })
              }
            >
              Sign in with browser
            </Button>
          )}
          <details>
            <summary>Legacy deployment token</summary>
            <form
              className="form-section account-form"
              onSubmit={(e) => {
                e.preventDefault();
                void w.task("Checking your credentials…", async () => {
                  w.setState(await window.adk.connect({ service, token }));
                  setToken("");
                });
              }}
            >
              <label>
                Service URL
                <input
                  required
                  type="url"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  placeholder="https://shares.example.com"
                />
              </label>
              <label>
                Owner token
                <input
                  required
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Deployment write token"
                />
              </label>
              <p className="hint">
                The token is checked against your service and stored using your
                operating system's encryption. If secure storage is unavailable,
                it lasts only for this session.
              </p>
              <Button type="submit" variant="primary" disabled={!!w.busy}>
                <KeyRound size={15} />
                Connect service
              </Button>
            </form>
          </details>
        </div>
      )}
      <Notice>
        Accounts and sessions use Better Auth on Cloudflare D1. Your backend
        administrator configures the available OAuth providers.
      </Notice>
    </div>
  );
}
const Organization = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});
function CloudTeams({ workspace: w }: { workspace: Workspace }) {
  const [organizations, setOrganizations] = useState<
    z.infer<typeof Organization>[]
  >([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [members, setMembers] = useState<unknown>(null);
  const load = async () =>
    setOrganizations(
      z
        .array(Organization)
        .parse(await window.adk.cloud({ action: "organizations" })),
    );
  if (w.state?.account.authentication !== "session")
    return (
      <Notice>
        Sign in with your browser in Account to manage cloud organizations. The
        local roster below works offline.
      </Notice>
    );
  return (
    <div className="form-section">
      <h2>Cloud organizations</h2>
      <p className="muted">
        Membership and roles are stored by Better Auth in your Cloudflare
        backend.
      </p>
      <Button
        disabled={!!w.busy}
        onClick={() => void w.task("Loading organizations…", load)}
      >
        Refresh organizations
      </Button>
      {organizations.map((organization) => (
        <div className="connection-state" key={organization.id}>
          <div>
            <h3>{organization.name}</h3>
            <p>{organization.slug}</p>
          </div>
          <Button
            onClick={() =>
              void w.task("Loading members…", async () =>
                setMembers(
                  await window.adk.cloud({
                    action: "organization",
                    organizationId: organization.id,
                  }),
                ),
              )
            }
          >
            View members
          </Button>
        </div>
      ))}
      {members !== null && <Json value={members} />}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void w.task("Creating organization…", async () => {
            await window.adk.cloud({
              action: "create-organization",
              name,
              slug,
            });
            setName("");
            setSlug("");
            await load();
          });
        }}
      >
        <label>
          Organization name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Organization slug
          <input
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="my-team"
          />
        </label>
        <Button disabled={!!w.busy} type="submit">
          Create organization
        </Button>
      </form>
    </div>
  );
}
export function Team({ workspace: w }: { workspace: Workspace }) {
  const team = w.state?.team;
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState<"owner" | "member" | "viewer">("member"),
    [teamName, setTeamName] = useState(team?.name ?? "My team");
  return (
    <div className="page-scroll">
      <CloudTeams workspace={w} />
      <div className="section-intro">
        <div>
          <h2>{team?.name ?? "My team"} · local roster</h2>
          <p>
            A local roster to coordinate configuration sharing with your
            teammates.
          </p>
        </div>
        <Users size={25} />
      </div>
      <Notice>
        This roster is saved on this device. It does not send invitations or
        grant access to the hosted service; shared links remain public or
        unlisted.
      </Notice>
      <form
        className="inline-form form-section"
        onSubmit={(e) => {
          e.preventDefault();
          void w.task("Saving team…", async () =>
            w.setState(
              await window.adk.team({
                name: teamName,
                members: team?.members ?? [],
              }),
            ),
          );
        }}
      >
        <label>
          Team name
          <input
            required
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={!!w.busy}>
          Save name
        </Button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Teammate</th>
            <th>Email</th>
            <th>Coordination role</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {team?.members.map((member, i) => (
            <tr key={`${member.email}-${i}`}>
              <td>
                <span className="avatar">
                  {member.name.slice(0, 1).toUpperCase()}
                </span>
                {member.name}
              </td>
              <td>{member.email}</td>
              <td>
                <Badge>{member.role}</Badge>
              </td>
              <td>
                <Button
                  variant="ghost"
                  aria-label={`Remove ${member.name}`}
                  disabled={!!w.busy}
                  onClick={() =>
                    void w.task("Updating roster…", async () =>
                      w.setState(
                        await window.adk.team({
                          name: team.name,
                          members: team.members.filter(
                            (_, index) => index !== i,
                          ),
                        }),
                      ),
                    )
                  }
                >
                  <Trash2 size={15} />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!team?.members.length && (
        <p className="hint">
          No teammates saved yet. Add someone to your local roster.
        </p>
      )}
      <div className="form-section">
        <h3>Add a teammate</h3>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void w.task("Saving teammate…", async () => {
              w.setState(
                await window.adk.team({
                  name: team?.name ?? teamName,
                  members: [...(team?.members ?? []), { name, email, role }],
                }),
              );
              setName("");
              setEmail("");
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
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="owner">Owner</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <Button disabled={!!w.busy} type="submit">
            <Plus size={15} />
            Add teammate
          </Button>
        </form>
      </div>
    </div>
  );
}
