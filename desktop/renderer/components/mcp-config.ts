import { z } from "zod";
export interface McpDraft {
  transport: string;
  url: string;
  command: string;
  args: string;
  variables: string;
  headers: string;
}
const strings = z.record(z.string(), z.string());
export function buildMcpConfig(input: string, draft: McpDraft) {
  const config = z.record(z.string(), z.unknown()).parse(JSON.parse(input));
  for (const key of ["url", "command", "args", "type", "env", "headers"])
    delete config[key];
  if (draft.transport === "stdio") {
    if (!draft.command.trim())
      throw new Error("Enter the executable used to start the MCP server.");
    return {
      ...config,
      command: draft.command.trim(),
      args: draft.args.split("\n").filter((arg) => arg.length > 0),
      env: strings.parse(JSON.parse(draft.variables)),
    };
  }
  const endpoint = new URL(draft.url);
  if (!["https:", "http:"].includes(endpoint.protocol))
    throw new Error("Use an HTTP or HTTPS server URL.");
  return {
    ...config,
    url: draft.url,
    type: draft.transport === "sse" ? "sse" : "http",
    headers: strings.parse(JSON.parse(draft.headers)),
  };
}
