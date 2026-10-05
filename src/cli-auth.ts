import { cloudRequest, type CloudOperation } from "./cloud-client.js";
import { Command } from "commander";
import { readFile, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  beginDeviceSignIn,
  pollDeviceSignIn,
  accountIdentity,
  signOut,
} from "./auth-client.js";
import { serviceUrl } from "./sharing.js";
import { linkedComponent } from "./transaction.js";
const Metadata = z.object({
  service: z.string(),
  ownerId: z.string(),
  expiresAt: z.string(),
  user: z
    .object({ id: z.string(), name: z.string(), email: z.string() })
    .optional(),
});
export async function storedAccount(home: string) {
  try {
    return Metadata.parse(
      JSON.parse(await readFile(join(home, ".adk", "account.json"), "utf8")),
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
export async function cliAuth(args: string[], home: string) {
  let result: unknown;
  const program = new Command().name("adk auth").exitOverride();
  program
    .command("login")
    .requiredOption("--service <url>", "Cloudflare backend URL")
    .option("--no-browser", "display the login URL without opening a browser")
    .action(async (options) => {
      const service = serviceUrl(options.service);
      const device = await beginDeviceSignIn(service, "preflight-cli");
      process.stderr.write(
        `Open ${device.verification_uri_complete}\nConfirm device code: ${device.user_code}\n`,
      );
      if (options.browser) {
        const { default: open } = await import("open");
        await open(device.verification_uri_complete);
      }
      const expiresAt = Date.now() + device.expires_in * 1000;
      while (Date.now() < expiresAt) {
        await new Promise((resolve) =>
          setTimeout(resolve, device.interval * 1000),
        );
        const poll = await pollDeviceSignIn(service, "preflight-cli", device);
        if (poll.status === "pending") continue;
        const identity = await accountIdentity(service, poll.token);
        const path = join(home, ".adk", "account.json");
        if (await linkedComponent(path)) {
          await signOut(service, poll.token);
          throw new Error("Refusing symlink credential metadata path");
        }
        const entry = await credential(home, service);
        try {
          entry.setPassword(poll.token);
        } catch {
          await signOut(service, poll.token);
          throw new Error(
            "The OS credential store is unavailable. Enable Keychain, Windows Credential Manager or Linux Secret Service/keyring and retry.",
          );
        }
        await mkdir(join(home, ".adk"), { recursive: true, mode: 0o700 });
        const temp = `${path}.${randomUUID()}.tmp`;
        const metadata = {
          service,
          ownerId: identity.ownerId,
          expiresAt: identity.expiresAt ?? poll.expiresAt,
          ...(identity.user ? { user: identity.user } : {}),
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
          await signOut(service, poll.token);
          throw error;
        }
        result = {
          connected: true,
          ...metadata,
          storage: "os-credential-store",
        };
        return;
      }
      throw new Error("Sign-in expired; run adk auth login again.");
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
  program.command("logout").action(async () => {
    const stored = await storedAccount(home);
    if (stored) {
      const entry = await credential(home, stored.service);
      const token = entry.getPassword();
      if (token) {
        await signOut(stored.service, token);
        entry.deletePassword();
      }
      await rm(join(home, ".adk", "account.json"), { force: true });
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
    process.env.ADK_SHARE_TOKEN ||
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
      ? (process.env.ADK_SHARE_URL ?? account.service)
      : args[serviceIndex]!.startsWith("--service=")
        ? args[serviceIndex]!.slice(10)
        : args[serviceIndex + 1]!;
  if (serviceUrl(target) !== serviceUrl(account.service))
    throw new Error(
      "Sign in to the selected service before sending it account credentials.",
    );
  const token = (await credential(home, account.service)).getPassword();
  if (!token)
    throw new Error("Stored account has no credential; run adk auth login.");
  const keys = ["ADK_SHARE_TOKEN", "ADK_SHARE_URL", "ADK_OWNER_ID"] as const;
  const before = keys.map((key) => process.env[key]);
  process.env.ADK_SHARE_TOKEN = token;
  process.env.ADK_SHARE_URL = account.service;
  process.env.ADK_OWNER_ID = account.ownerId;
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
    const account = await storedAccount(home);
    if (!account)
      throw new Error("Run adk auth login before managing organizations.");
    const token = (await credential(home, account.service)).getPassword();
    if (!token) throw new Error("Run adk auth login to restore your session.");
    return cloudRequest(account.service, token, operation);
  };
  const program = new Command().name("adk team").exitOverride();
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
    .option("--role <role>", "owner, admin or member", "member")
    .action(async (organizationId, email, options) => {
      result = await request({
        action: "invite",
        organizationId,
        email,
        role: options.role,
      });
      const invitation = z.object({ id: z.string() }).parse(result);
      const account = await storedAccount(home);
      result = {
        ...(result as object),
        url: `${serviceUrl(account!.service)}/invite/${encodeURIComponent(invitation.id)}`,
        delivery: "copy-link",
      };
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
