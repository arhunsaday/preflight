export function tokenize(line: string) {
  const tokens: string[] = [];
  let value = "",
    quote = "",
    active = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = "";
      else value += ch;
      active = true;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      active = true;
    } else if (/\s/.test(ch)) {
      if (active) {
        tokens.push(value);
        value = "";
        active = false;
      }
    } else {
      value += ch;
      active = true;
    }
  }
  if (quote) throw new Error("Unclosed quote");
  if (active) tokens.push(value);
  return tokens;
}
export const commandGroups = [
  {
    name: "Resources",
    commands: [
      "list",
      "detect",
      "unmanaged",
      "adopt <id>",
      "inspect <id>",
      "create <file>",
      "update <id> <file>",
      "delete <id>",
      "fork <id> <new-id>",
      "move <id> <scope>",
      "verify <id>",
      "install <id> --execute",
    ],
  },
  {
    name: "Configuration",
    commands: [
      "init",
      "sync",
      "recover",
      "rollback",
      "audit",
      "profiles list",
      "profiles create <name>",
      "profiles switch <name>",
      "profiles diff <left> <right>",
      "validate <file>",
    ],
  },
  {
    name: "Discover",
    commands: [
      "search <query> --online",
      "search <query> --github <owner/repo>",
      "catalog-inspect <id>",
      "catalog-add <id>",
      "loadouts list",
      "loadouts show <name> --explain",
      "loadouts install <name>",
    ],
  },
  {
    name: "Evidence",
    commands: [
      "doctor",
      "doctor --connect",
      "doctor --processes",
      "doctor --measure",
      "doctor --days 60",
      "instructions lint",
      "instructions draft --scope global",
      "instructions draft --scope project --write",
      "usage",
      "context --mode potential",
      "context --mode catalogue --agent claude-code",
      "prune",
      "bench scaffold --repo <path> --revision <sha>",
      "bench run --config current --tasks <path> --name <name>",
      "bench compare <left> <right>",
    ],
  },
  {
    name: "Collaboration",
    commands: [
      "share --out <file>",
      "share --loadout <name>",
      "share --scope project",
      "apply <file-or-code>",
      "revoke <code>",
      "git status",
      "git pull",
      "git push",
      "retrofit",
    ],
  },
];
