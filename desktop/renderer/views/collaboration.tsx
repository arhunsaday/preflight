import { useState } from "react";
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
export function Collaboration({ workspace: w }: { workspace: Workspace }) {
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
              Share code or JSON file
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="abc234 or /path/to/share.json"
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
                !!w.busy ||
                !w.state?.account.connected ||
                !/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/i.test(code)
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
  return (
    <div className="page-scroll account-page">
      <div className="section-intro">
        <div>
          <h2>Connect your share service</h2>
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
            <h3>Connected as {account.ownerId}</h3>
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
            operating system's encryption. If secure storage is unavailable, it
            lasts only for this session.
          </p>
          <Button type="submit" variant="primary" disabled={!!w.busy}>
            <KeyRound size={15} />
            Connect service
          </Button>
        </form>
      )}
      <Notice>
        The current Worker authenticates a deployment owner. Hosted user signup,
        OIDC sign-in and organization access policies are not provided by this
        service.
      </Notice>
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
      <div className="section-intro">
        <div>
          <h2>{team?.name ?? "My team"}</h2>
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
