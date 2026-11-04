import { execute } from "../src/commands.js";
import { snapshot } from "./engine.js";
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 4000000) throw new Error("Input too large");
}
try {
  const { args, context, auth } = JSON.parse(input);
  delete process.env.ADK_SHARE_TOKEN;
  delete process.env.ADK_SHARE_URL;
  delete process.env.ADK_OWNER_ID;
  if (auth && ["share", "apply", "revoke"].includes(args[0])) {
    if (args[0] !== "apply") process.env.ADK_SHARE_TOKEN = auth.token;
    process.env.ADK_SHARE_URL = auth.service;
    process.env.ADK_OWNER_ID = auth.ownerId;
  }
  const value =
    args[0] === "@snapshot"
      ? await snapshot(context)
      : await execute(args, context);
  process.stdout.write(JSON.stringify({ ok: true, value: value ?? null }));
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
}
