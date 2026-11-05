import { spawn } from "node:child_process";
import type { Resource } from "./schema.js";
import { pluginMarketplace } from "./adapters.js";
export interface Command {
  command: string;
  args: string[];
  /** Commands that must succeed first, such as adding a plugin marketplace. */
  before?: Command[];
}
export function installationPlan(resource: Resource): Command {
  if (resource.type === "skill") {
    const source =
      typeof resource.config.repository === "string"
        ? resource.config.repository
        : resource.source;
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(source))
      throw new Error(
        "Skill delegation requires an HTTPS GitHub repository source",
      );
    return {
      command: "npx",
      args: [
        "--yes",
        "skills",
        "add",
        source,
        "--skill",
        resource.name,
        // `--agent <agents>` takes one argument naming every agent.
        "--agent",
        resource.harnesses.join(","),
        ...(resource.scope === "global" ? ["--global"] : []),
        "--yes",
      ],
    };
  }
  if (resource.type === "plugin") {
    if (
      resource.harnesses.length !== 1 ||
      resource.harnesses[0] !== "claude-code"
    )
      throw new Error(
        "Plugin installation currently supports Claude Code only",
      );
    if (!/^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9._-]*$/i.test(resource.name))
      throw new Error("Plugin name must be name@marketplace");
    const scope = resource.scope === "global" ? "user" : "project";
    const marketplace = pluginMarketplace(resource);
    const where = !marketplace
      ? undefined
      : marketplace.source.source === "github"
        ? marketplace.source.repo
        : marketplace.source.source === "directory"
          ? marketplace.source.path
          : marketplace.source.url;
    if (where?.startsWith("-"))
      throw new Error("Invalid plugin marketplace source");
    return {
      command: "claude",
      args: ["plugin", "install", resource.name, "--scope", scope],
      // `marketplace add` is idempotent: an already known marketplace is
      // reported and left as it is.
      ...(where
        ? {
            before: [
              {
                command: "claude",
                args: ["plugin", "marketplace", "add", where, "--scope", scope],
              },
            ],
          }
        : {}),
    };
  }
  if (resource.type === "mcp")
    // mcpm names this `install <SERVER_NAME>`; there is no `add`. It asks for
    // confirmation and aborts without a terminal, so the delegated run passes
    // --force, which is also how it re-installs over an existing entry.
    return { command: "mcpm", args: ["install", resource.name, "--force"] };
  if (resource.type === "tool") {
    const manager = resource.config.manager;
    const pkg = resource.config.package;
    if (
      !["brew", "npm"].includes(String(manager)) ||
      typeof pkg !== "string" ||
      !/^[@a-z0-9][a-z0-9@/._-]*$/i.test(pkg)
    )
      throw new Error(
        "Tool requires manager brew/npm and a package identifier",
      );
    if (manager === "brew") return { command: "brew", args: ["install", pkg] };
    return {
      command: "npm",
      args: [
        "install",
        ...(resource.scope === "global" ? ["--global"] : []),
        "--",
        pkg,
      ],
    };
  }
  throw new Error(`No delegated installer for ${resource.type}`);
}
export function runCommand(
  command: Command,
  cwd: string,
  timeoutMs = 120000,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn(command.command, command.args, {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "",
      stderr = "",
      timedOut = false;
    const stop = () => {
      timedOut = true;
      try {
        if (process.platform !== "win32" && child.pid)
          process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* Process already exited. */
      }
    };
    const timer = setTimeout(stop, timeoutMs);
    child.stdout.on("data", (data) => {
      stdout += data.toString();
      if (stdout.length > 2_000_000) stop();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
      if (stderr.length > 2_000_000) stop();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: timedOut ? 124 : (code ?? 1),
        stdout,
        stderr,
        durationMs: Date.now() - start,
      });
    });
  });
}
export async function gitSync(
  root: string,
  operation: "status" | "pull" | "push",
  dryRun = false,
) {
  const command = {
    command: "git",
    args:
      operation === "status"
        ? ["status", "--short"]
        : operation === "pull"
          ? ["pull", "--ff-only"]
          : ["push"],
  };
  if (dryRun) return command;
  const result = await runCommand(command, root);
  if (result.code) throw new Error(result.stderr);
  return result;
}
