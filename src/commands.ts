import { Command } from "commander";
import { readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { verifyResource } from "./verify.js";
import { AdkService } from "./service.js";
import { type Context } from "./adapters.js";
import {
  ResourceSchema,
  ResourceTypeSchema,
  ScopeSchema,
  SharePayloadSchema,
  AdkConfigSchema,
  type Resource,
} from "./schema.js";
import {
  fetchShare,
  makeShare,
  previewShare,
  publishShare,
  serviceUrl,
} from "./sharing.js";
import {
  type CatalogSource,
  searchSources,
  localCatalog,
  mcpRegistry,
  skillsSource,
  githubSource,
  inspectRemote,
} from "./catalog.js";
import { measureUsage } from "./analysis.js";
import { resolveLoadout, materializeLoadout } from "./loadouts.js";
import { installationPlan, runCommand, gitSync } from "./operations.js";
import { fixedTaskSet } from "./bench-tasks.js";
import { runBench, compareRuns, BenchRun } from "./bench.js";
import { retrofit } from "./retrofit.js";
import { applyFiles, readText, jsonText, recover } from "./transaction.js";
import bundled from "../catalog/resources.json" with { type: "json" };
import loadouts from "../catalog/loadouts.json" with { type: "json" };
export const catalogResources = () => z.array(ResourceSchema).parse(bundled);
export async function execute(
  args: string[],
  context: Context,
): Promise<unknown> {
  let result: unknown;
  const program = new Command();
  program
    .name("adk")
    .description("Inspect, manage, scope, share and verify your AI setup")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => {
        result = text;
      },
      writeErr: () => {},
    })
    .option("--dry-run", "preview all changes without writing")
    .option("--json", "machine-readable output (default)")
    .option("--root <path>", "project root", context.root)
    .option("--home <path>", "harness home", context.home);
  const ctx = () => ({
    root: resolve(program.opts().root),
    home: resolve(program.opts().home),
  });
  const service = () => new AdkService(ctx());
  const dry = () => !!program.opts().dryRun;
  const command = (
    name: string,
    description: string,
    // Commander passes heterogeneous positional arguments and option objects.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    action: (...args: any[]) => Promise<unknown>,
  ) =>
    program
      .command(name)
      .description(description)
      .action(async (...values) => {
        result = await action(...values);
      });
  const input = async (path: string) =>
    JSON.parse(await readFile(resolve(ctx().root, path), "utf8"));
  const catalog = async (path?: string) =>
    path ? localCatalog(resolve(ctx().root, path)) : catalogResources();
  const shareBase = (value?: string) =>
    value ?? process.env.ADK_SHARE_URL ?? "http://localhost:8787";
  command("init", "Create a project configuration", async () =>
    service().init(dry()),
  );
  command("list", "List desired resources", async () => service().list());
  command("detect", "Read installed harness resources", async () =>
    service().detect(),
  );
  command(
    "verify <id>",
    "Verify a resource; --connect initializes MCP and lists tools",
    async (id, options) =>
      verifyResource(await service().inspect(id), !!options.connect),
  ).option("--connect");
  command(
    "doctor",
    "Analyze installed setup and managed-file drift; --connect tests MCP servers",
    async (options) => {
      const findings = await service().doctor();
      if (!options.connect) return findings;
      // Opt-in only: the static doctor never starts a configured program.
      const probes = (await service().list()).filter(
        (r) => r.type === "mcp" && r.enabled,
      );
      // A server we actually reached is no longer merely "not tested", so the
      // static finding for its detected counterpart is replaced, not kept.
      const probed = new Set(probes.map((r) => r.name));
      const detected = new Map(
        (await service().detect())
          .flatMap((state) => state.resources)
          .map((r) => [r.id, r.name]),
      );
      for (let i = findings.length - 1; i >= 0; i--) {
        const finding = findings[i]!;
        if (
          finding.code === "mcp-unverified" &&
          probed.has(detected.get(finding.resourceId ?? "") ?? "")
        )
          findings.splice(i, 1);
      }
      for (const resource of probes)
        try {
          const result = await verifyResource(resource, true);
          findings.push(
            ...(result.findings ?? []).filter(
              (f) => f.code !== "mcp-unverified",
            ),
            {
              code: result.connected ? "mcp-connected" : "mcp-unreachable",
              severity: result.connected ? "info" : "error",
              message: result.connected
                ? `Connected and listed ${result.tools?.length ?? 0} tools.`
                : "Configured but did not connect.",
              resourceId: resource.id,
            },
          );
        } catch (error) {
          findings.push({
            code: "mcp-unreachable",
            severity: "error",
            message: String(error),
            resourceId: resource.id,
          });
        }
      return findings;
    },
  ).option("--connect", "start or call each configured MCP server");
  command(
    "unmanaged",
    "List detected resources this profile does not manage",
    async () => service().unmanaged(),
  );
  command(
    "adopt <id>",
    "Manage a detected resource where it already lives",
    async (id) => service().adopt(id, dry()),
  );
  command(
    "inspect <id>",
    "Show content, permissions, configuration and provenance",
    async (id) => service().inspect(id),
  );
  command(
    "inspect-json <json>",
    "Inspect and materialize a resource from inline JSON",
    async (json) => inspectRemote(ResourceSchema.parse(JSON.parse(json))),
  );
  command("create <file>", "Create a resource from a JSON file", async (file) =>
    service().create(
      await inspectRemote(ResourceSchema.parse(await input(file))),
      dry(),
    ),
  );
  command(
    "create-json <json>",
    "Create a resource from inline JSON",
    async (json) => service().create(JSON.parse(json), dry()),
  );
  command(
    "update <id> <file>",
    "Update a resource with a JSON patch",
    async (id, file) =>
      service().update(
        id,
        z.record(z.string(), z.unknown()).parse(await input(file)),
        dry(),
      ),
  );
  command(
    "update-json <id> <json>",
    "Update a resource with inline JSON",
    async (id, json) =>
      service().update(
        id,
        z.record(z.string(), z.unknown()).parse(JSON.parse(json)),
        dry(),
      ),
  );
  command(
    "delete <id>",
    "Remove a resource and its managed wiring",
    async (id) => service().remove(id, dry()),
  );
  command(
    "fork <id> <new-id>",
    "Duplicate a resource under a new identity",
    async (id, newId) => service().fork(id, newId, dry()),
  );
  command(
    "move <id> <scope>",
    "Move between global and project scopes",
    async (id, scope) =>
      service().update(id, { scope: ScopeSchema.parse(scope) }, dry()),
  );
  command(
    "sync",
    "Reconcile desired configuration to harness files",
    async () => service().sync(dry()),
  );
  command("recover", "Recover an interrupted local transaction", async () =>
    recover(ctx().root, dry()),
  );
  command("rollback", "Reverse the latest local transaction", async () =>
    service().rollback(dry()),
  );
  command("audit", "Show the append-only local change history", async () =>
    service().audit(),
  );
  const profiles = program
    .command("profiles")
    .description("Create, switch and compare profiles");
  profiles.command("list").action(async () => {
    result = await service().store.read();
  });
  profiles
    .command("create <name>")
    .option("--from <name>")
    .action(async (name, options) => {
      result = await service().profileCreate(name, options.from, dry());
    });
  profiles.command("switch <name>").action(async (name) => {
    result = await service().profileSwitch(name, dry());
  });
  profiles.command("diff <left> <right>").action(async (left, right) => {
    result = await service().profileDiff(left, right);
  });
  const search = command(
    "search [query]",
    "Search the typed catalogue and optional remote sources",
    async (query = "", options) => {
      const local = await catalog(options.catalog);
      const sources: CatalogSource[] = [
        { id: "catalog", search: async () => local },
      ];
      if (options.online) sources.push(mcpRegistry, skillsSource);
      if (options.github)
        sources.push(
          githubSource(
            options.github,
            options.type ? ResourceTypeSchema.parse(options.type) : "skill",
          ),
        );
      return searchSources(
        query,
        sources,
        options.type ? ResourceTypeSchema.parse(options.type) : undefined,
      );
    },
  );
  search
    .option("--online")
    .option("--github <owner/repo>")
    .option("--type <type>")
    .option("--catalog <directory>");
  command(
    "inspect-file <file>",
    "Validate and inspect a catalogue resource JSON file",
    async (file) => inspectRemote(ResourceSchema.parse(await input(file))),
  );
  command(
    "catalog-inspect <id>",
    "Inspect a bundled catalogue item",
    async (id) => {
      const r = catalogResources().find((r) => r.id === id);
      if (!r) throw new Error("Catalogue resource not found");
      return inspectRemote(r);
    },
  );
  command(
    "catalog-add <id>",
    "Add an inspected bundled resource",
    async (id) => {
      const r = catalogResources().find((r) => r.id === id);
      if (!r) throw new Error("Catalogue resource not found");
      return service().create(r, dry());
    },
  );
  command(
    "install <id>",
    "Preview or execute a delegated package-manager installation",
    async (id, options) => {
      const resource = await service().inspect(id);
      const plan = installationPlan(resource);
      if (dry() || !options.execute)
        return {
          resource,
          plan,
          note:
            "Use --execute to run this external package manager. Package-manager side effects are outside ADK rollback." +
            (resource.type === "plugin"
              ? " A plugin whose marketplace declares an install command needs a terminal: that confirmation shows the command to a person, and ADK does not accept it on your behalf."
              : ""),
        };
      const output = await runCommand(plan, ctx().root, 120000, {
        ...process.env,
        HOME: ctx().home,
        ...(resource.type === "plugin"
          ? { CLAUDE_CONFIG_DIR: join(ctx().home, ".claude") }
          : {}),
      });
      if (output.code)
        throw new Error(`Installer exited ${output.code}: ${output.stderr}`);
      return { plan, output, detected: await service().detect() };
    },
  ).option("--execute", "run the package manager");
  command(
    "usage",
    "Measure observed skill and MCP invocation counts",
    async (options) =>
      measureUsage(
        resolve(options.transcripts ?? join(ctx().home, ".claude", "projects")),
        (await service().detect()).flatMap((s) => s.resources),
      ),
  ).option("--transcripts <directory>");
  command(
    "prune",
    "Propose unused skills from measured transcripts; never deletes automatically",
    async (options) =>
      measureUsage(
        resolve(options.transcripts ?? join(ctx().home, ".claude", "projects")),
        await service().list(),
      ),
  ).option("--transcripts <directory>");
  command(
    "share",
    "Publish an inspectable configuration or export a payload",
    async (options) => {
      let resources: Resource[];
      if (options.id) resources = [await service().inspect(options.id)];
      else if (options.loadout) {
        const plan = materializeLoadout(
          loadouts,
          options.loadout,
          await catalog(options.catalog),
        );
        if (plan.missing.length)
          throw new Error(
            `Loadout is not shareable until it resolves: ${plan.missing.join(", ")}`,
          );
        resources = plan.resources;
      } else resources = await service().list();
      if (options.scope)
        resources = resources.filter(
          (resource) => resource.scope === ScopeSchema.parse(options.scope),
        );
      if (!resources.length)
        throw new Error("Nothing to share with these options");
      const payload = makeShare(resources, {
        ownerId: options.owner ?? process.env.ADK_OWNER_ID ?? "local",
        visibility: options.public ? "public" : "unlisted",
        ...(options.expires ? { expiresAt: options.expires } : {}),
      });
      if (dry()) return payload;
      if (options.out) {
        const path = resolve(ctx().root, options.out);
        return applyFiles(
          ctx().root,
          [{ path, before: await readText(path), after: jsonText(payload) }],
          { actor: process.env.USER ?? "local" },
        );
      }
      if (!process.env.ADK_SHARE_TOKEN)
        throw new Error(
          "Set ADK_SHARE_TOKEN for publishing or use --out payload.json",
        );
      return publishShare(
        shareBase(options.service),
        payload,
        process.env.ADK_SHARE_TOKEN,
      );
    },
  )
    .option("--id <id>", "share one resource")
    .option("--loadout <name>", "share a resolved loadout")
    .option("--scope <scope>", "share only global or project resources")
    .option("--catalog <directory>", "resolve a loadout from another kit")
    .option("--owner <owner>")
    .option("--public")
    .option("--expires <ISO-date>")
    .option("--out <path>")
    .option("--service <url>");
  command(
    "apply <file-or-code>",
    "Preview or apply a share through the policy and audit pipeline",
    async (value, options) => {
      const payload = /^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/i.test(value)
        ? await fetchShare(shareBase(options.service), value)
        : SharePayloadSchema.parse(await input(value));
      previewShare(payload, await service().list());
      return service().import(payload.resources, dry(), value);
    },
  ).option("--service <url>");
  command("revoke <code>", "Revoke a hosted share", async (code, options) => {
    if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/i.test(code))
      throw new Error("Invalid code");
    const url = `${serviceUrl(shareBase(options.service))}/api/shares/${code.toLowerCase()}`;
    if (dry()) return { method: "DELETE", url };
    if (!process.env.ADK_SHARE_TOKEN) throw new Error("Set ADK_SHARE_TOKEN");
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.ADK_SHARE_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Revoke failed: HTTP ${response.status}`);
    return { revoked: code };
  }).option("--service <url>");
  const loadout = program.command("loadouts");
  loadout.command("list").action(() => {
    result = {
      loadouts: Object.keys(loadouts.loadouts),
      presets: loadouts.presets,
    };
  });
  loadout
    .command("show <name>")
    .option("--explain")
    .action((name) => {
      result = resolveLoadout(loadouts, name);
    });
  loadout
    .command("install <name>")
    .option("--catalog <directory>")
    .action(async (name, options) => {
      const plan = materializeLoadout(
        loadouts,
        name,
        await catalog(options.catalog),
      );
      if (plan.missing.length) {
        if (dry()) {
          result = plan;
          return;
        }
        throw new Error(
          `Missing loadout resources/prerequisites: ${plan.missing.join(", ")}`,
        );
      }
      result = await service().import(plan.resources, dry(), `loadout:${name}`);
    });
  command(
    "retrofit",
    "Detect the stack and generate a project contract",
    async () => retrofit(ctx().root, dry()),
  );
  command(
    "git <operation>",
    "Git status, fast-forward pull, or push (never force)",
    async (operation) =>
      gitSync(
        ctx().root,
        z.enum(["status", "pull", "push"]).parse(operation),
        dry(),
      ),
  );
  const bench = program.command("bench");
  bench
    .command("scaffold")
    .requiredOption("--repo <path>")
    .requiredOption("--revision <sha>")
    .option("--agent <binary>", "Claude-compatible agent binary", "claude")
    .option("--out <path>", "task manifest", "bench/tasks.json")
    .action(async (options) => {
      const tasks = fixedTaskSet(
        resolve(ctx().root, options.repo),
        options.revision,
        options.agent,
      );
      const path = resolve(ctx().root, options.out);
      result = await applyFiles(
        ctx().root,
        [{ path, before: await readText(path), after: jsonText(tasks) }],
        { actor: process.env.USER ?? "local", dryRun: dry() },
      );
    });
  bench
    .command("run")
    .requiredOption("--config <path-or-current>")
    .requiredOption("--tasks <path>")
    .option("--name <name>", "result name", "current")
    .action(async (options) => {
      result = await runBench(
        ctx().root,
        options.name,
        options.config === "current"
          ? join(ctx().root, "adk.config.json")
          : resolve(ctx().root, options.config),
        resolve(ctx().root, options.tasks),
        dry(),
      );
    });
  bench.command("compare <left> <right>").action(async (left, right) => {
    if (!/^[a-z0-9_-]+$/i.test(left) || !/^[a-z0-9_-]+$/i.test(right))
      throw new Error("Invalid benchmark name");
    result = compareRuns(
      BenchRun.parse(await input(`.adk/bench/${left}.json`)),
      BenchRun.parse(await input(`.adk/bench/${right}.json`)),
    );
  });
  command(
    "validate <file>",
    "Validate a desired-state configuration",
    async (file) => AdkConfigSchema.parse(await input(file)),
  );
  try {
    await program.parseAsync(args, { from: "user" });
  } catch (error) {
    if ((error as { code?: string }).code !== "commander.helpDisplayed")
      throw error;
  }
  return result;
}
export async function canonicalContext(root: string, home: string) {
  return { root: await realpath(root), home: await realpath(home) };
}
