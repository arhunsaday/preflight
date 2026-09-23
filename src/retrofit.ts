import { join } from "node:path";
import { readText, applyFiles, jsonText } from "./transaction.js";
export async function detectStack(root: string) {
  const stack: string[] = [];
  const commands: Record<string, string> = {};
  const pkg = await readText(join(root, "package.json"));
  if (pkg) {
    const data = JSON.parse(pkg);
    stack.push("node");
    const deps = { ...data.dependencies, ...data.devDependencies };
    for (const name of [
      "react",
      "next",
      "typescript",
      "@nestjs/core",
      "expo",
      "vue",
    ])
      if (deps[name]) stack.push(name);
    for (const key of Object.keys(data.scripts ?? {}))
      if (/^[a-z0-9:_-]+$/i.test(key)) commands[key] = `npm run ${key}`;
  }
  for (const [file, language] of [
    ["go.mod", "go"],
    ["Cargo.toml", "rust"],
    ["pyproject.toml", "python"],
  ] as const)
    if (await readText(join(root, file))) stack.push(language);
  return { stack, commands };
}
export async function retrofit(root: string, dryRun = false) {
  const detected = await detectStack(root);
  const contractPath = join(root, "AGENTS.md");
  const registryPath = join(root, ".adk", "commands.json");
  const before = await readText(contractPath);
  if (before !== null)
    throw new Error(
      "AGENTS.md already exists; inspect it before generating a replacement",
    );
  return applyFiles(
    root,
    [
      {
        path: contractPath,
        before,
        after: `# Project contract\n\nDetected stack: ${detected.stack.join(", ") || "unknown — document before implementation"}.\n\nRead existing conventions before editing. Keep changes focused. Never commit credentials.\n\n## Verification commands\n\n${Object.entries(
          detected.commands,
        )
          .map(([key, value]) => `- ${key}: \`${value}\``)
          .join(
            "\n",
          )}\n\nRun the relevant checks before claiming completion. Report checks that could not run.\n`,
      },
      {
        path: registryPath,
        before: await readText(registryPath),
        after: jsonText(detected),
      },
    ],
    { actor: process.env.USER ?? "local", dryRun },
  );
}
