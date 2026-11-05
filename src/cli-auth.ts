import { cloudRequest, type CloudOperation } from "./cloud-client.js";
import { Command } from "commander";
import { readFile, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { hostname } from "node:os";
import { createInterface } from "node:readline/promises";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  accountIdentity,
  defaultService,
  loopback,
  pkce,
  redeemCode,
  signInUrl,
  signOut,
} from "./auth-client.js";
import { serviceUrl } from "./sharing.js";
import { linkedComponent } from "./transaction.js";
const Metadata = z.object({
  service: z.string(),
  ownerId: z.string(),
  expiresAt: z.string(),
  tokenId: z.string().optional(),
  user: z
    .object({ id: z.string(), name: z.string(), email: z.string() })
    .optional(),
});
export async function storedAccount(home: string) {
  try {
    return Metadata.parse(
      JSON.parse(await readFile(join(home, ".preflight", "account.json"), "utf8")),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
async function credential(home: string, service: string) {
  const { Entry } = await import("@napi-rs/keyring");
  const account = createHash("sha256")
    .update(home)
    .update(service)
    .digest("hex");
  return new Entry("dev.preflight.cli", account);
}
/** Signs in through the browser; returns a redeemed Preflight API token. */
async function browserSignIn(service: string, browser: boolean) {
  const { verifier, challenge, state } = pkce();
  const label = `Preflight CLI on ${hostname()}`.slice(0, 100);
  if (!browser) {
    const redirectUri = "oob";
    const url = signInUrl(service, { redirectUri, state, challenge, client: "cli" });
    process.stderr.write(`Open this URL in a browser and sign in:\n${url}\n`);
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    try {
      const code = await prompt.question("Paste the code shown after sign-in: ");
      return await redeemCode(service, { code, verifier, redirectUri, label });
    } finally {
      prompt.close();
    }
  }
  const server = await loopback(state);
  try {
    const url = signInUrl(service, {
      redirectUri: server.redirectUri,
      state,
      challenge,
      client: "cli",
    });
    process.stderr.write(`Opening your browser to sign in:\n${url}\n`);
    const { default: open } = await import("open");
    await open(url).catch(() =>
      process.stderr.write("Could not open a browser; open the URL above.\n"),
    );
    const code = await server.code;
    return await redeemCode(service, {
      code,
      verifier,
      redirectUri: server.redirectUri,
      label,
    });
  } finally {
    server.close();
  }
}
async function storedToken(home: string) {
  const account = await storedAccount(home);
  if (!account) throw new Error("Run preflight auth login first.");
  const token = (await credential(home, account.service)).getPassword();
  if (!token) throw new Error("Run preflight auth login to restore your session.");
  return { account, token };
}
export async function cliAuth(args: string[], home: string) {
  let result: unknown;
  const program = new Command().name("preflight auth").exitOverride();
  program
    .command("login")
    .option("--service <url>", "Preflight API URL (default: PREFLIGHT_API_URL or https://api.preflight.arhun.fr)")
    .option("--no-browser", "print the sign-in URL and paste the code by hand")
    .action(async (options) => {
      const service = options.service ? serviceUrl(options.service) : defaultService();
      const path = join(home, ".preflight", "account.json");
      if (await linkedComponent(path))
        throw new Error("Refusing symlink credential metadata path");
      const grant = await browserSignIn(service, options.browser);
      const entry = await credential(home, service);
      try {
        entry.setPassword(grant.token);
      } catch {
        await signOut(service, grant.token).catch(() => undefined);
        throw new Error(
          "The OS credential store is unavailable. Enable Keychain, Windows Credential Manager or Linux Secret Service/keyring and retry.",
        );
      }
      await mkdir(join(home, ".preflight"), { recursive: true, mode: 0o700 });
      const temp = `${path}.${randomUUID()}.tmp`;
      const metadata = {
        service,
        ownerId: grant.user.id,
        expiresAt: grant.expiresAt,
        tokenId: grant.tokenId,
        user: grant.user,
      };
      try {
        await writeFile(temp, JSON.stringify(metadata, null, 2), {
          mode: 0o600,
          flag: "wx",
        });
        await rename(temp, path);
      } catch (error) {
        entry.deletePassword();
        await rm(temp, { force: true });
        await signOut(service, grant.token).catch(() => undefined);
        throw error;
      }
      result = { connected: true, ...metadata, storage: "os-credential-store" };
    });
  program.command("status").action(async () => {
    const stored = await storedAccount(home);
    if (!stored) {
      result = { connected: false };
      return;
    }
    const token = (await credential(home, stored.service)).getPassword();
    if (!token) {
      result = { connected: false, service: stored.service };
      return;
    }
    const identity = await accountIdentity(stored.service, token);
    result = {
      connected: true,
      service: stored.service,
      ...identity,
      storage: "os-credential-store",
    };
  });
  program
    .command("tokens")
    .description("List your Preflight API tokens")
    .action(async () => {
      const { account, token } = await storedToken(home);
      result = await cloudRequest(account.service, token, { action: "tokens" });
    });
  program
    .command("revoke <token-id>")
    .description("Revoke one of your Preflight API tokens")
    .action(async (tokenId) => {
      const { account, token } = await storedToken(home);
      await cloudRequest(account.service, token, { action: "revoke-token", tokenId });
      result = { revoked: tokenId };
    });
  program.command("logout").action(async () => {
    const stored = await storedAccount(home);
    if (stored) {
      const entry = await credential(home, stored.service);
      const token = entry.getPassword();
      if (token) {
        await signOut(stored.service, token);
        entry.deletePassword();
      }
      await rm(join(home, ".preflight", "account.json"), { force: true });
    }
    result = { connected: false };
  });
  try {
    await program.parseAsync(args, { from: "user" });
  } catch (error) {
    if ((error as { code?: string }).code !== "commander.helpDisplayed")
      throw error;
  }
  return result;
}
export async function withCliAccount<T>(
  args: string[],
  home: string,
  execute: () => Promise<T>,
) {
  const command = args[0] === "--global" ? args[1] : args[0];
  if (
    !["share", "revoke"].includes(command ?? "") ||
    process.env.PREFLIGHT_SHARE_TOKEN ||
    (command === "share" && args.includes("--out"))
  )
    return execute();
  const account = await storedAccount(home);
  if (!account) return execute();
  const serviceIndex = args.findIndex(
    (arg) => arg === "--service" || arg.startsWith("--service="),
  );
  const target =
    serviceIndex < 0
      ? (process.env.PREFLIGHT_SHARE_URL ?? account.service)
      : args[serviceIndex]!.startsWith("--service=")
        ? args[serviceIndex]!.slice(10)
        : args[serviceIndex + 1]!;
  if (serviceUrl(target) !== serviceUrl(account.service))
    throw new Error(
      "Sign in to the selected service before sending it account credentials.",
    );
  const token = (await credential(home, account.service)).getPassword();
  if (!token)
    throw new Error("Stored account has no credential; run preflight auth login.");
  const keys = ["PREFLIGHT_SHARE_TOKEN", "PREFLIGHT_SHARE_URL", "PREFLIGHT_OWNER_ID"] as const;
  const before = keys.map((key) => process.env[key]);
  process.env.PREFLIGHT_SHARE_TOKEN = token;
  process.env.PREFLIGHT_SHARE_URL = account.service;
  process.env.PREFLIGHT_OWNER_ID = account.ownerId;
  try {
    return await execute();
  } finally {
    keys.forEach((key, i) => {
      if (before[i] === undefined) delete process.env[key];
      else process.env[key] = before[i];
    });
  }
}

export async function cliTeam(args: string[], home: string) {
  let result: unknown;
  const request = async (operation: CloudOperation) => {
    const { account, token } = await storedToken(home);
    return cloudRequest(account.service, token, operation);
  };
  const program = new Command().name("preflight team").exitOverride();
  program
    .command("list")
    .description("List your cloud organizations")
    .action(async () => {
      result = await request({ action: "organizations" });
    });
  program
    .command("create <name>")
    .requiredOption("--slug <slug>")
    .action(async (name, options) => {
      result = await request({
        action: "create-organization",
        name,
        slug: options.slug,
      });
    });
  program
    .command("members <organization-id>")
    .action(async (organizationId) => {
      result = await request({ action: "organization", organizationId });
    });
  program
    .command("invite <organization-id> <email>")
    .option("--role <role>", "admin or member", "member")
    .action(async (organizationId, email, options) => {
      result = await request({
        action: "invite",
        organizationId,
        email,
        role: options.role,
      });
      result = { ...(result as object), delivery: "email" };
    });
  program
    .command("invitations <organization-id>")
    .action(async (organizationId) => {
      result = await request({ action: "invitations", organizationId });
    });
  program.command("inbox").action(async () => {
    result = await request({ action: "incoming" });
  });
  for (const action of ["accept", "reject", "cancel-invitation"] as const)
    program
      .command(`${action} <invitation-id>`)
      .action(async (invitationId) => {
        result = await request({ action, invitationId });
      });
  program
    .command("shares <organization-id>")
    .description("List the shares published to a team")
    .action(async (team) => {
      result = await request({ action: "shares", team });
    });
  program
    .command("role <organization-id> <member-id> <role>")
    .action(async (organizationId, memberId, role) => {
      result = await request({
        action: "update-role",
        organizationId,
        memberId,
        role,
      });
    });
  program
    .command("remove <organization-id> <member-id>")
    .action(async (organizationId, memberId) => {
      result = await request({
        action: "remove-member",
        organizationId,
        memberId,
      });
    });
  program.command("leave <organization-id>").action(async (organizationId) => {
    result = await request({ action: "leave", organizationId });
  });
  try {
    await program.parseAsync(args, { from: "user" });
  } catch (error) {
    if ((error as { code?: string }).code !== "commander.helpDisplayed")
      throw error;
  }
  return result;
}
