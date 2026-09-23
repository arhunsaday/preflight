import { homedir } from "node:os";
import { execute, canonicalContext } from "./commands.js";
import { resolve } from "node:path";
async function main() {
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw new Error("ADK requires Node.js 22 or newer");
  const args = process.argv.slice(2);
  const context = await canonicalContext(
    process.cwd(),
    process.env.ADK_HOME ?? homedir(),
  );
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
    const { startUI } = await import("./ui.js");
    await startUI(selected);
    return;
  }
  const result = await execute(args.length ? args : ["--help"], context);
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
