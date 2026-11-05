import { cliAuth, cliTeam, withCliAccount } from "./cli-auth.js";
import { homedir } from "node:os";
import { execute, canonicalContext } from "./commands.js";
import { renderText } from "./render-text.js";
import { outputMode, commandPath, type OutputMode } from "./output.js";
import { resolve, join } from "node:path";
let mode: OutputMode = "json";
async function main() {
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw new Error("Preflight requires Node.js 22 or newer");
  const args = process.argv.slice(2);
  const context = await canonicalContext(
    process.cwd(),
    process.env.PREFLIGHT_HOME ?? homedir(),
  );
  mode = outputMode(args, !!process.stdout.isTTY);
  if (args[0] === "inbox") args.splice(0, 1, "team", "inbox");
  if (args[0] === "auth" || args[0] === "team") {
    const result = await (args[0] === "auth" ? cliAuth : cliTeam)(
      args.slice(1),
      context.home,
    );
    if (result !== undefined)
      process.stdout.write(
        mode === "text"
          ? renderText(commandPath(args), result)
          : JSON.stringify(result, null, 2) + "\n",
      );
    return;
  }
  if (args[0] === "ui") {
    if (!process.stdin.isTTY)
      throw new Error(
        "preflight ui requires an interactive terminal; use preflight --help for scriptable commands",
      );
    const rootIndex = args.indexOf("--root"),
      homeIndex = args.indexOf("--home");
    const selected = await canonicalContext(
      rootIndex < 0 ? context.root : resolve(args[rootIndex + 1]!),
      homeIndex < 0 ? context.home : resolve(args[homeIndex + 1]!),
    );
    if (args.includes("--global")) {
      selected.root = join(selected.home, ".preflight", "global");
      Object.assign(selected, { globalOnly: true });
    }
    const { startUI } = await import("./ui/index.js");
    await startUI(selected, { classic: args.includes("--classic") });
    return;
  }
  // doctor and instructions have their own text form (--text); every other
  // command goes through renderText. JSON stays the contract for pipes.
  const command = commandPath(args)[0];
  const own = command === "doctor" || command === "instructions";
  if (own && mode === "text" && !args.includes("--text")) args.push("--text");
  if (!own || mode === "json")
    for (let i = args.length - 1; i >= 0; i--)
      if (args[i] === "--text") args.splice(i, 1);
  if (!args.length && mode === "text") {
    const help = await execute(["--help"], context);
    process.stdout.write(`${help}\nStart here: preflight status\n`);
    return;
  }
  const result = await withCliAccount(args, context.home, () =>
    execute(args.length ? args : ["--help"], context),
  );
  process.stdout.write(
    typeof result === "string"
      ? result
      : mode === "text"
        ? renderText(commandPath(args), result)
        : JSON.stringify(result ?? null, null, 2) + "\n",
  );
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    mode === "text"
      ? `error: ${message}\n`
      : JSON.stringify({ error: message }) + "\n",
  );
  process.exitCode = 1;
});
