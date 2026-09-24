import { z } from "zod";
const Input = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  value: z.string().optional(),
  default: z.string().optional(),
  valueHint: z.string().optional(),
  isRequired: z.boolean().optional(),
  isSecret: z.boolean().optional(),
  variables: z
    .record(
      z.string(),
      z.object({
        value: z.string().optional(),
        default: z.string().optional(),
        isSecret: z.boolean().optional(),
      }),
    )
    .optional(),
});
type InputValue = z.infer<typeof Input>;
const envName = (name: string) =>
  `ADK_${name.replace(/^-+/, "").replace(/[^a-z0-9_]/gi, "_").toUpperCase()}`;
const reference = (name: string) => "${" + name + "}";
function inputValue(input: InputValue, fallback: string): string | undefined {
  let value = input.isSecret
    ? reference(envName(input.name ?? input.valueHint ?? fallback))
    : (input.value ?? input.default);
  if (value === undefined && input.isRequired)
    value = reference(envName(input.name ?? input.valueHint ?? fallback));
  if (value === undefined) return undefined;
  return value.replace(/(?<!\$)\{([a-z0-9_]+)\}/gi, (match, name: string) => {
    const variable = input.variables?.[name];
    if (!variable) return match;
    return variable.isSecret
      ? reference(envName(name))
      : (variable.value ?? variable.default ?? reference(envName(name)));
  });
}
function argumentsFor(inputs: InputValue[]) {
  return inputs.flatMap((input, index) => {
    const value = inputValue(input, `ARG_${index + 1}`);
    if (value === undefined) return [];
    return input.type === "named" && input.name
      ? [`${input.name}=${value}`]
      : [value];
  });
}
const Transport = z.object({
  type: z.string(),
  url: z.string().optional(),
  headers: z.array(Input).optional(),
});
const Package = z.object({
  registryType: z.string(),
  registryBaseUrl: z.string().optional(),
  identifier: z.string(),
  version: z.string(),
  transport: Transport,
  runtimeArguments: z.array(Input).default([]),
  packageArguments: z.array(Input).default([]),
  environmentVariables: z.array(Input).default([]),
});
export const RegistryServer = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    repository: z.object({ url: z.string() }).optional(),
    remotes: z.array(Transport).optional(),
    packages: z.array(Package).optional(),
  })
  .passthrough();
export function registryMcpConfig(input: unknown): Record<string, unknown> {
  const server = RegistryServer.parse(input);
  const remote = server.remotes?.find(
    (r) => r.url && ["sse", "streamable-http"].includes(r.type),
  );
  if (remote) {
    const headers = Object.fromEntries(
      (remote.headers ?? []).flatMap((header) => {
        if (!header.name) return [];
        const value = inputValue(header, header.name);
        return value === undefined ? [] : [[header.name, value]];
      }),
    );
    return {
      type: remote.type === "sse" ? "sse" : "http",
      url: remote.url,
      ...(Object.keys(headers).length ? { headers } : {}),
    };
  }
  const pkg = server.packages?.find(
    (p) =>
      p.transport.type === "stdio" &&
      ["npm", "pypi"].includes(p.registryType) &&
      (!p.registryBaseUrl ||
        p.registryBaseUrl.replace(/\/$/, "") ===
          (p.registryType === "npm"
            ? "https://registry.npmjs.org"
            : "https://pypi.org")),
  );
  if (
    !pkg ||
    !/^[@a-z0-9][a-z0-9@/._-]*$/i.test(pkg.identifier) ||
    !pkg.version ||
    !/^[a-z0-9][a-z0-9.+_-]*$/i.test(pkg.version) ||
    pkg.version === "latest"
  )
    return {
      registry: server,
      unsupportedReason:
        "No supported, pinned npm/PyPI stdio package or HTTP/SSE remote; inspect upstream installation instructions.",
    };
  const env = Object.fromEntries(
    pkg.environmentVariables.flatMap((variable) => {
      if (!variable.name || !/^[A-Z][A-Z0-9_]*$/i.test(variable.name))
        return [];
      const value = variable.isSecret
        ? variable.isRequired
          ? reference(variable.name)
          : undefined
        : (variable.value ??
          variable.default ??
          (variable.isRequired ? reference(variable.name) : undefined));
      return value === undefined ? [] : [[variable.name, value]];
    }),
  );
  const runtime = argumentsFor(pkg.runtimeArguments);
  const args =
    pkg.registryType === "npm"
      ? [
          ...(runtime.includes("-y") || runtime.includes("--yes")
            ? []
            : ["-y"]),
          ...runtime,
          `${pkg.identifier}@${pkg.version}`,
        ]
      : [...runtime, `${pkg.identifier}==${pkg.version}`];
  return {
    command: pkg.registryType === "npm" ? "npx" : "uvx",
    args: [...args, ...argumentsFor(pkg.packageArguments)],
    ...(Object.keys(env).length ? { env } : {}),
  };
}
