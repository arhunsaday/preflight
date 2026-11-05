import { Command, Option } from "commander";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { verifyResource } from "./verify.js";
import { ConfigStore } from "./state.js";
import { buildContextReport, contextResources } from "./context-map.js";
import { PreflightService } from "./service.js";
import { type Context } from "./adapters.js";
import {
  ResourceSchema,
  ResourceTypeSchema,
  HarnessIdSchema,
  ScopeSchema,
  SharePayloadSchema,
  PreflightConfigSchema,
  type Resource,
} from "./schema.js";
import {
  fetchShare,
  isShareCode,
  makeShare,
  previewShare,
  publishShare,
  serviceUrl,
} from "./sharing.js";
import {
  type CatalogSource,
  searchSources,
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
import { buildCatalog, CatalogIndexSchema } from "./catalog-build.js";
import {
  addSource,
  allSourceCatalogs,
  loadoutIndex,
  NO_SOURCE_HINT,
  readSources,
  removeSource,
  sourceCatalog,
  sourcesPath,
  updateSource,
  type SourceCatalog,
} from "./sources.js";
/** Resources from every configured content source (none by default). */
export const catalogResources = async (home: string) =>
  (await allSourceCatalogs(home)).resources;
/** A content directory read directly: its catalog/index.json, or its files. */
async function directoryCatalog(path: string): Promise<SourceCatalog> {
  let index;
  try {
    index = CatalogIndexSchema.parse(
      JSON.parse(await readFile(join(path, "catalog", "index.json"), "utf8")),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    index = await buildCatalog(path);
  }
  const resources = index.resources.flatMap((r) => {
    const parsed = ResourceSchema.safeParse(r);
    return parsed.success ? [parsed.data] : [];
  });
  return {
    source: index.name,
    resources,
    ...(index.loadouts ? { loadouts: index.loadouts } : {}),
    errors: [],
  };
}
export async function execute(
  args: string[],
  context: Context,
): Promise<unknown> {
  let result: unknown;
  const program = new Command();
  program.addHelpText(
    "after",
    "\nAccount commands:\n  preflight auth login --service <url> [--no-browser]\n  preflight auth status\n  preflight auth logout\n  preflight team list|create|members\n",
  );
  program
    .name("preflight")
    .description("Inspect, manage, scope, share and verify your AI setup")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => {
        result = text;
      },
      writeErr: () => {},
    })
    .option(
      "--global",
      "manage the shared global configuration at HOME/.preflight/global",
    )
    .option("--dry-run", "preview all changes without writing")
    .option("--json", "machine-readable output (default)")
    .option("--root <path>", "project root", context.root)
    .option("--home <path>", "harness home", context.home);
  const ctx = (): Context => {
    const home = resolve(program.opts().home);
    const globalOnly = !!program.opts().global || !!context.globalOnly;
    return {
      root: globalOnly
        ? join(home, ".preflight", "global")
        : resolve(program.opts().root),
      home,
      ...(globalOnly ? { globalOnly: true } : {}),
    };
  };
  const service = () => new PreflightService(ctx());
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
  const catalogs = async (path?: string) =>
    path
      ? {
          catalogs: [await directoryCatalog(resolve(ctx().root, path))],
          errors: [] as string[],
        }
      : allSourceCatalogs(ctx().home);
  const catalog = async (path?: string) =>
    (await catalogs(path)).catalogs.flatMap((c) => c.resources);
  const findCatalogue = async (id: string) => {
    const r = (await catalogResources(ctx().home)).find((r) => r.id === id);
    if (!r)
      throw new Error(
        (await readSources(ctx().home)).length
          ? "Catalogue resource not found"
          : `Catalogue resource not found. ${NO_SOURCE_HINT}`,
      );
    return r;
  };
  const loadoutsFor = async (path?: string) => {
    const found = await catalogs(path);
    return loadoutIndex(found.catalogs);
  };
  const shareBase = (value?: string) =>
    value ?? process.env.PREFLIGHT_SHARE_URL ?? "http://localhost:8787";
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
      const selected = z
        .enum([
          "all",
          "sources",
          "bundled",
          "mcp-registry",
          "skills.sh",
          "github",
        ])
        .parse(options.source ?? "all");
      const configured =
        selected === "all" || selected === "sources" || selected === "bundled"
          ? await catalogs(options.catalog)
          : { catalogs: [], errors: [] };
      const sources: CatalogSource[] = configured.catalogs.map((c) => ({
        id: c.source,
        search: async () => c.resources,
      }));
      if (options.online || ["mcp-registry", "skills.sh"].includes(selected)) {
        if (
          ["all", "mcp-registry"].includes(selected) &&
          options.type !== "skill"
        )
          sources.push(mcpRegistry);
        if (["all", "skills.sh"].includes(selected) && options.type !== "mcp")
          sources.push(skillsSource);
      }
      if (selected === "github" && !options.github)
        throw new Error("Specify --github owner/repo for GitHub search");
      if (options.github && ["all", "github"].includes(selected))
        sources.push(
          githubSource(
            options.github,
            options.type ? ResourceTypeSchema.parse(options.type) : "skill",
          ),
        );
      const found = await searchSources(
        query,
        sources,
        options.type ? ResourceTypeSchema.parse(options.type) : undefined,
      );
      found.errors.unshift(...configured.errors);
      return {
        ...found,
        ...(!options.catalog &&
        ["all", "sources", "bundled"].includes(selected) &&
        !configured.catalogs.length
          ? { hint: NO_SOURCE_HINT }
          : {}),
      };
    },
  );
  search
    .option(
      "--source <source>",
      "all, sources (configured content sources), mcp-registry, skills.sh or github",
    )
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
    "Inspect an item from a configured source",
    async (id) => inspectRemote(await findCatalogue(id)),
  );
  command(
    "catalog-add <id>",
    "Add an inspected resource from a configured source",
    async (id) => service().create(await findCatalogue(id), dry()),
  );
  const catalogCommand = program
    .command("catalog")
    .description("Build the catalogue of a content repository");
  catalogCommand
    .command("build <directory>")
    .description(
      "Scan a content repository and write catalog/index.json (resources and loadouts)",
    )
    .option("--repo <owner/repo>", "GitHub repository the sources link to")
    .option("--ref <ref>", "branch, tag or commit the links use", "main")
    .option(
      "--out <path>",
      "output file (default <directory>/catalog/index.json)",
    )
    .option("--check", "fail when the file on disk is not up to date")
    .action(async (directory, options) => {
      const dir = resolve(ctx().root, directory);
      const index = await buildCatalog(dir, {
        ...(options.repo ? { repo: options.repo } : {}),
        ref: options.ref,
      });
      const out = resolve(
        ctx().root,
        options.out ?? join(dir, "catalog", "index.json"),
      );
      const text = JSON.stringify(index, null, 2) + "\n";
      const summary = {
        path: out,
        resources: index.resources.length,
        byType: index.resources.reduce<Record<string, number>>((acc, r) => {
          const type = (r as { type: string }).type;
          acc[type] = (acc[type] ?? 0) + 1;
          return acc;
        }, {}),
        loadouts: Object.keys(index.loadouts?.loadouts ?? {}).length,
      };
      if (options.check) {
        const current = await readFile(out, "utf8").catch(() => null);
        if (current !== text)
          throw new Error(
            `${out} is out of date; run preflight catalog build ${directory}`,
          );
        result = { ...summary, upToDate: true };
        return;
      }
      if (dry()) {
        result = { ...summary, dryRun: true };
        return;
      }
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, text);
      result = summary;
    });
  const source = program
    .command("source")
    .description("Content sources the catalogue and loadouts come from");
  source
    .command("add <spec>")
    .description(
      "Add github:owner/repo@ref (pinned to its commit) or a local directory",
    )
    .option("--name <name>")
    .action(async (spec, options) => {
      result = await addSource(ctx().home, ctx().root, spec, {
        ...(options.name ? { name: options.name } : {}),
        dryRun: dry(),
      });
    });
  source.command("list").action(async () => {
    const sources = await readSources(ctx().home);
    const found = await allSourceCatalogs(ctx().home);
    result = {
      file: sourcesPath(ctx().home),
      sources: sources.map((s) => {
        const c = found.catalogs.find((c) => c.source === s.name);
        return {
          ...s,
          resources: c?.resources.length ?? 0,
          loadouts: Object.keys(c?.loadouts?.loadouts ?? {}).length,
        };
      }),
      errors: found.errors,
      ...(sources.length ? {} : { hint: NO_SOURCE_HINT }),
    };
  });
  source.command("remove <name>").action(async (name) => {
    result = await removeSource(ctx().home, name, dry());
  });
  source
    .command("update [name]")
    .description(
      "Fetch the commit a source's ref names now, or move it with --ref",
    )
    .option("--ref <ref>")
    .action(async (name, options) => {
      result = await updateSource(ctx().home, name, {
        ...(options.ref ? { ref: options.ref } : {}),
        dryRun: dry(),
      });
    });
  source
    .command("show <name>")
    .description("List what one source provides")
    .action(async (name) => {
      const found = (await readSources(ctx().home)).find(
        (s) => s.name === name,
      );
      if (!found) throw new Error(`No source named ${name}`);
      const c = await sourceCatalog(ctx().home, found);
      result = {
        source: found,
        resources: c.resources.map((r) => ({
          id: r.id,
          type: r.type,
          name: r.name,
        })),
        loadouts: Object.keys(c.loadouts?.loadouts ?? {}),
        errors: c.errors,
      };
    });
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
            "Use --execute to run this external package manager. Package-manager side effects are outside Preflight rollback." +
            (resource.type === "plugin"
              ? " A plugin whose marketplace declares an install command needs a terminal: that confirmation shows the command to a person, and Preflight does not accept it on your behalf."
              : ""),
        };
      const env = {
        ...process.env,
        HOME: ctx().home,
        ...(resource.type === "plugin"
          ? { CLAUDE_CONFIG_DIR: join(ctx().home, ".claude") }
          : {}),
      };
      const steps = [];
      for (const step of plan.before ?? []) {
        const output = await runCommand(step, ctx().root, 120000, env);
        if (output.code)
          throw new Error(
            `${step.command} ${step.args.slice(0, 3).join(" ")} exited ${output.code}: ${output.stderr}`,
          );
        steps.push(output);
      }
      const output = await runCommand(plan, ctx().root, 120000, env);
      if (output.code)
        throw new Error(`Installer exited ${output.code}: ${output.stderr}`);
      return {
        plan,
        ...(steps.length ? { before: steps } : {}),
        output,
        detected: await service().detect(),
      };
    },
  ).option("--execute", "run the package manager");
  command(
    "context",
    "Estimate available instruction context; MCP runtime contributions remain unknown",
    async (options) => {
      const read = async (store: ConfigStore) =>
        store.resources().catch((error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw error;
        });
      const owned = await read(service().store);
      const inherited = ctx().globalOnly
        ? []
        : await read(new ConfigStore(join(ctx().home, ".preflight", "global")));
      const detected = (await service().unmanaged(inherited))
        .map((entry) => entry.resource)
        .filter((r) => !ctx().globalOnly || r.scope === "global");
      return buildContextReport(contextResources(detected, inherited, owned), {
        mode: options.mode,
        ...(options.agent ? { harness: options.agent } : {}),
        ...(options.scope ? { scope: options.scope } : {}),
      });
    },
  )
    .addOption(
      new Option("--mode <scenario>")
        .choices(["potential", "catalogue"])
        .default("potential"),
    )
    .addOption(new Option("--agent <agent>").choices(HarnessIdSchema.options))
    .addOption(new Option("--scope <scope>").choices(["global", "project"]));
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
        const entry = (await loadoutsFor(options.catalog)).find(
          options.loadout,
        );
        const plan = materializeLoadout(
          entry.data,
          entry.name,
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
        ownerId: options.owner ?? process.env.PREFLIGHT_OWNER_ID ?? "local",
        visibility: options.public ? "public" : "unlisted",
        ...(options.expires ? { expiresAt: options.expires } : {}),
      });
      if (options.out) {
        const path = resolve(ctx().root, options.out);
        return applyFiles(
          ctx().root,
          [{ path, before: await readText(path), after: jsonText(payload) }],
          { actor: process.env.USER ?? "local", dryRun: dry() },
        );
      }
      if (dry()) return payload;
      if (!process.env.PREFLIGHT_SHARE_TOKEN)
        throw new Error(
          "Set PREFLIGHT_SHARE_TOKEN for publishing or use --out payload.json",
        );
      return publishShare(
        shareBase(options.service),
        payload,
        process.env.PREFLIGHT_SHARE_TOKEN,
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
      let sharedUrl: URL | undefined;
      if (/^https?:\/\//i.test(value)) {
        sharedUrl = new URL(value);
        serviceUrl(sharedUrl.origin);
        if (
          sharedUrl.username ||
          sharedUrl.password ||
          !sharedUrl.pathname.startsWith("/s/") ||
          !isShareCode(sharedUrl.pathname.slice(3))
        )
          throw new Error("Use a Preflight share URL ending in /s/<code>");
      }
      const payload = sharedUrl
        ? await fetchShare(sharedUrl.origin, sharedUrl.pathname.slice(3))
        : isShareCode(value)
          ? await fetchShare(shareBase(options.service), value)
          : SharePayloadSchema.parse(await input(value));
      previewShare(payload, await service().list());
      return service().import(payload.resources, dry(), value);
    },
  ).option("--service <url>");
  command("revoke <code>", "Revoke a hosted share", async (code, options) => {
    if (!isShareCode(code)) throw new Error("Invalid code");
    const url = `${serviceUrl(shareBase(options.service))}/api/shares/${code.toLowerCase()}`;
    if (dry()) return { method: "DELETE", url };
    if (!process.env.PREFLIGHT_SHARE_TOKEN)
      throw new Error("Set PREFLIGHT_SHARE_TOKEN");
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.PREFLIGHT_SHARE_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Revoke failed: HTTP ${response.status}`);
    return { revoked: code };
  }).option("--service <url>");
  const loadout = program
    .command("loadouts")
    .description("Loadouts from configured sources (or --catalog <directory>)");
  loadout
    .command("list")
    .option("--catalog <directory>")
    .action(async (options) => {
      const index = await loadoutsFor(options.catalog);
      const loadouts = index.entries.filter((e) => !e.preset);
      result = {
        loadouts: loadouts.map((e) => e.name),
        presets: Object.fromEntries(
          index.entries
            .filter((e) => e.preset)
            .map((e) => [e.name, e.data.presets?.[e.name] ?? []]),
        ),
        details: Object.fromEntries(
          loadouts.map((e) => {
            const value = e.data.loadouts[e.name] as {
              description?: string;
              extends?: string;
            };
            return [
              e.name,
              {
                source: e.source,
                ...(value?.description
                  ? { description: value.description }
                  : {}),
                ...(value?.extends ? { extends: value.extends } : {}),
              },
            ];
          }),
        ),
        ...(index.entries.length ? {} : { hint: NO_SOURCE_HINT }),
      };
    });
  loadout
    .command("show <name>")
    .option("--explain")
    .option("--catalog <directory>")
    .action(async (name, options) => {
      const entry = (await loadoutsFor(options.catalog)).find(name);
      result = resolveLoadout(entry.data, entry.name);
    });
  loadout
    .command("install <name>")
    .option("--catalog <directory>")
    .action(async (name, options) => {
      const entry = (await loadoutsFor(options.catalog)).find(name);
      const plan = materializeLoadout(
        entry.data,
        entry.name,
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
          ? join(ctx().root, "preflight.config.json")
          : resolve(ctx().root, options.config),
        resolve(ctx().root, options.tasks),
        dry(),
      );
    });
  bench.command("compare <left> <right>").action(async (left, right) => {
    if (!/^[a-z0-9_-]+$/i.test(left) || !/^[a-z0-9_-]+$/i.test(right))
      throw new Error("Invalid benchmark name");
    result = compareRuns(
      BenchRun.parse(await input(`.preflight/bench/${left}.json`)),
      BenchRun.parse(await input(`.preflight/bench/${right}.json`)),
    );
  });
  command(
    "validate <file>",
    "Validate a desired-state configuration",
    async (file) => PreflightConfigSchema.parse(await input(file)),
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
