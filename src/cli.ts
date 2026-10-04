import { cliAuth, cliTeam, withCliAccount } from "./cli-auth.js";
import { homedir } from "node:os";
import { execute, canonicalContext } from "./commands.js";
import { resolve, join } from "node:path";
async function main() {
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw new Error("ADK requires Node.js 22 or newer");
  const args = process.argv.slice(2);
  const context = await canonicalContext(
    process.cwd(),
    process.env.ADK_HOME ?? homedir(),
  );
  if (args[0] === "auth" || args[0] === "team") {
    const result = await (args[0] === "auth" ? cliAuth : cliTeam)(
      args.slice(1),
      context.home,
    );
    if (result !== undefined)
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }
  if (args[0] === "ui") {
    if (!process.stdin.isTTY)
      throw new Error(
        "adk ui requires an interactive terminal; use adk --help for scriptable commands",
      );
    const rootIndex = args.indexOf("--root"),
      homeIndex = args.indexOf("--home");
    const selected = await canonicalContext(
      rootIndex < 0 ? context.root : resolve(args[rootIndex + 1]!),
      homeIndex < 0 ? context.home : resolve(args[homeIndex + 1]!),
    );
    if (args.includes("--global")) {
      selected.root = join(selected.home, ".adk", "global");
      Object.assign(selected, { globalOnly: true });
    }
    const { startUI } = await import("./ui/index.js");
    await startUI(selected);
    return;
  }
  const result = await withCliAccount(args, context.home, () =>
    execute(args.length ? args : ["--help"], context),
  );
  process.stdout.write(
    typeof result === "string"
      ? result
      : JSON.stringify(result ?? null, null, 2) + "\n",
  );
}
main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }) + "\n",
  );
  process.exitCode = 1;
});
