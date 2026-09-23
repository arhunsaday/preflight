import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { z } from "zod";
import { analyze } from "./analysis.js";
import type { Resource } from "./schema.js";
export function resolveEnvironment(
  value: unknown,
  env: Record<string, string | undefined> = process.env,
): unknown {
  if (typeof value === "string")
    return value.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_match, name: string) => {
      if (env[name] === undefined)
        throw new Error(`Missing environment variable: ${name}`);
      return env[name]!;
    });
  if (Array.isArray(value))
    return value.map((item) => resolveEnvironment(item, env));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveEnvironment(item, env),
      ]),
    );
  return value;
}
export async function verifyResource(resource: Resource, connect = false) {
  const findings = analyze([resource]);
  if (!connect || resource.type !== "mcp")
    return { id: resource.id, connected: false, findings };
  const config = z
    .object({
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string(), z.string()).optional(),
      url: z.string().url().optional(),
      headers: z.record(z.string(), z.string()).optional(),
      type: z.string().optional(),
    })
    .parse(resolveEnvironment(resource.config));
  const client = new Client({ name: "adk", version: "0.1.0" });
  const transport = config.url
    ? config.type === "sse"
      ? new SSEClientTransport(new URL(config.url), {
          requestInit: { headers: config.headers ?? {} },
        })
      : new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: config.headers ?? {} },
        })
    : config.command
      ? new StdioClientTransport({
          command: config.command,
          args: config.args ?? [],
          env: {
            ...Object.fromEntries(
              Object.entries(process.env).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
              ),
            ),
            ...config.env,
          },
          stderr: "pipe",
        })
      : undefined;
  if (!transport) throw new Error("MCP requires command or URL");
  try {
    // SDK declares sessionId inconsistently under exactOptionalPropertyTypes; runtime implements Transport.
    await client.connect(transport as Transport, { timeout: 10000 });
    const tools = await client.listTools(undefined, { timeout: 10000 });
    return {
      id: resource.id,
      connected: true,
      tools: tools.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
    };
  } finally {
    await client.close();
  }
}
