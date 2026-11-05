import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import {
  buildCatalog,
  CatalogIndexSchema,
  type CatalogIndex,
} from "./catalog-build.js";
export type CatalogLoadouts = NonNullable<CatalogIndex["loadouts"]>;
import { ResourceSchema, type Resource } from "./schema.js";
import { extractTarball } from "./tar.js";

/**
 * Content sources: repositories of skills, plugins, hooks, loadouts and
 * instructions that Preflight reads its catalogue from. The npm package ships
 * none; a person adds them with `preflight source add`.
 *
 *   github:owner/repo@ref  fetched as a tarball at the commit the ref names,
 *                          cached under ~/.preflight/sources/<name>/<commit>
 *   ./path or /abs/path    read in place, every time
 */
export const SourceSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/i),
    kind: z.enum(["github", "local"]),
    repo: z
      .string()
      .regex(/^[\w.-]+\/[\w.-]+$/)
      .optional(),
    ref: z.string().optional(),
    commit: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .optional(),
    path: z.string().optional(),
    addedAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();
export type Source = z.infer<typeof SourceSchema>;
const SourcesFile = z
  .object({ version: z.literal(1), sources: z.array(SourceSchema) })
  .strict();

export const EXAMPLE_SOURCE = "github:arhunsaday/agent-kit@main";
export const NO_SOURCE_HINT = `No content source is configured. Add one, for example: preflight source add ${EXAMPLE_SOURCE}`;

export const sourcesPath = (home: string) =>
  join(home, ".preflight", "sources.json");
const cacheRoot = (home: string) => join(home, ".preflight", "sources");

export async function readSources(home: string): Promise<Source[]> {
  try {
    return SourcesFile.parse(
      JSON.parse(await readFile(sourcesPath(home), "utf8")),
    ).sources;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}
async function writeSources(home: string, sources: Source[]) {
  const path = sourcesPath(home);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(
    temp,
    JSON.stringify({ version: 1, sources }, null, 2) + "\n",
    { mode: 0o600 },
  );
  await rename(temp, path);
}

export interface SourceSpec {
  kind: "github" | "local";
  repo?: string;
  ref?: string;
  path?: string;
  name: string;
}
export function parseSourceSpec(spec: string, cwd: string): SourceSpec {
  const github =
    /^(?:github:|https:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?(?:@([\w./-]+))?\/?$/.exec(
      spec,
    );
  if (github) {
    const ref = github[2];
    if (ref && (ref.includes("..") || ref.startsWith("-")))
      throw new Error("Invalid ref");
    return {
      kind: "github",
      repo: github[1]!,
      ...(ref ? { ref } : {}),
      name: github[1]!.split("/")[1]!.toLowerCase(),
    };
  }
  const local = spec.startsWith("file://") ? spec.slice(7) : spec;
  if (local.startsWith(".") || local.startsWith("~") || isAbsolute(local)) {
    const path = resolve(
      cwd,
      local.startsWith("~/")
        ? join(process.env.HOME ?? "", local.slice(2))
        : local,
    );
    return {
      kind: "local",
      path,
      name: basename(path)
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "-"),
    };
  }
  throw new Error(
    `Unrecognised source "${spec}". Use github:owner/repo@ref or a path such as ./agent-kit`,
  );
}

const githubHeaders = (): Record<string, string> => ({
  "User-Agent": "preflight",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
});
/** The commit a ref names, so a source is always pinned to exact content. */
export async function resolveCommit(repo: string, ref: string) {
  if (/^[0-9a-f]{40}$/.test(ref)) return ref;
  const response = await fetch(
    `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`,
    {
      headers: { ...githubHeaders(), Accept: "application/vnd.github.sha" },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new Error(`github:${repo}@${ref}: HTTP ${response.status}`);
  const sha = (await response.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha))
    throw new Error(`github:${repo}@${ref}: unexpected commit ${sha}`);
  return sha;
}
async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
/** Download and unpack a commit once; a cached commit is never refetched. */
export async function fetchCommit(
  home: string,
  name: string,
  repo: string,
  commit: string,
) {
  const dir = join(cacheRoot(home), name, commit);
  if (await exists(join(dir, ".preflight-complete"))) return dir;
  const response = await fetch(
    `https://codeload.github.com/${repo}/tar.gz/${commit}`,
    { headers: githubHeaders(), signal: AbortSignal.timeout(60000) },
  );
  if (!response.ok)
    throw new Error(
      `github:${repo}@${commit}: tarball HTTP ${response.status}`,
    );
  const archive = Buffer.from(await response.arrayBuffer());
  if (archive.length > 50_000_000) throw new Error("Source archive too large");
  const partial = `${dir}.partial`;
  await rm(partial, { recursive: true, force: true });
  await extractTarball(archive, partial);
  await writeFile(join(partial, ".preflight-complete"), commit + "\n");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dirname(dir), { recursive: true });
  await rename(partial, dir);
  return dir;
}
/** Where a source's files are on this machine. */
export function sourceRoot(home: string, source: Source) {
  return source.kind === "local"
    ? source.path!
    : join(cacheRoot(home), source.name, source.commit!);
}
const label = (source: Source) =>
  source.kind === "github"
    ? `github:${source.repo}@${source.ref ?? source.commit?.slice(0, 7)}`
    : source.path!;

export async function addSource(
  home: string,
  cwd: string,
  spec: string,
  options: { name?: string; dryRun?: boolean } = {},
) {
  const parsed = parseSourceSpec(spec, cwd);
  const name = options.name ?? parsed.name;
  SourceSchema.shape.name.parse(name);
  const sources = await readSources(home);
  if (sources.some((s) => s.name === name))
    throw new Error(
      `A source named ${name} exists; remove it first or pass --name`,
    );
  if (parsed.kind === "local" && !(await exists(parsed.path!)))
    throw new Error(`No such directory: ${parsed.path}`);
  const planned = {
    name,
    kind: parsed.kind,
    ...(parsed.repo ? { repo: parsed.repo, ref: parsed.ref ?? "main" } : {}),
    ...(parsed.path ? { path: parsed.path } : {}),
  };
  if (options.dryRun)
    return { action: "add", source: planned, file: sourcesPath(home) };
  const source: Source = SourceSchema.parse({
    ...planned,
    ...(parsed.kind === "github"
      ? { commit: await resolveCommit(parsed.repo!, planned.ref ?? "main") }
      : {}),
    addedAt: new Date().toISOString(),
  });
  if (source.kind === "github")
    await fetchCommit(home, source.name, source.repo!, source.commit!);
  const catalog = await sourceCatalog(home, source);
  await writeSources(home, [...sources, source]);
  return {
    action: "added",
    source,
    resources: catalog.resources.length,
    loadouts: Object.keys(catalog.loadouts?.loadouts ?? {}).length,
    errors: catalog.errors,
  };
}

export async function removeSource(home: string, name: string, dryRun = false) {
  const sources = await readSources(home);
  const source = sources.find((s) => s.name === name);
  if (!source) throw new Error(`No source named ${name}`);
  if (dryRun) return { action: "remove", source, file: sourcesPath(home) };
  await writeSources(
    home,
    sources.filter((s) => s.name !== name),
  );
  if (source.kind === "github")
    await rm(join(cacheRoot(home), source.name), {
      recursive: true,
      force: true,
    });
  return { action: "removed", source };
}

/** Re-resolve a GitHub source's ref (or move it to a new ref). */
export async function updateSource(
  home: string,
  name: string | undefined,
  options: { ref?: string; dryRun?: boolean } = {},
) {
  const sources = await readSources(home);
  const selected = name ? sources.filter((s) => s.name === name) : sources;
  if (name && !selected.length) throw new Error(`No source named ${name}`);
  if (options.ref && selected.length !== 1)
    throw new Error("Name one source to move it to another ref");
  const results = [];
  for (const source of selected) {
    if (source.kind === "local") {
      results.push({ name: source.name, status: "local, read in place" });
      continue;
    }
    const ref = options.ref ?? source.ref ?? source.commit!;
    if (options.dryRun) {
      results.push({ name: source.name, status: "would resolve", ref });
      continue;
    }
    const commit = await resolveCommit(source.repo!, ref);
    if (commit === source.commit && ref === source.ref) {
      results.push({ name: source.name, status: "up to date", commit });
      continue;
    }
    await fetchCommit(home, source.name, source.repo!, commit);
    const previous = source.commit;
    Object.assign(source, {
      ref,
      commit,
      updatedAt: new Date().toISOString(),
    });
    if (previous && previous !== commit)
      await rm(join(cacheRoot(home), source.name, previous), {
        recursive: true,
        force: true,
      });
    results.push({
      name: source.name,
      status: "updated",
      from: previous,
      commit,
    });
  }
  if (!options.dryRun) await writeSources(home, sources);
  return { sources: results };
}

export interface SourceCatalog {
  source: string;
  resources: Resource[];
  loadouts?: CatalogLoadouts;
  errors: string[];
}
/**
 * The catalogue a source provides: its catalog/index.json when it has one,
 * otherwise built from its files. Each resource is tagged source:<name>.
 */
export async function sourceCatalog(
  home: string,
  source: Source,
): Promise<SourceCatalog> {
  const root = sourceRoot(home, source);
  const errors: string[] = [];
  const indexPath = join(root, "catalog", "index.json");
  let raw: unknown[];
  let loadouts: SourceCatalog["loadouts"];
  if (await exists(indexPath)) {
    const index = CatalogIndexSchema.parse(
      JSON.parse(await readFile(indexPath, "utf8")),
    );
    raw = index.resources;
    loadouts = index.loadouts;
  } else {
    if (!(await exists(root)))
      throw new Error(
        `${label(source)}: not available here; run preflight source update ${source.name}`,
      );
    const index = await buildCatalog(root, {
      name: source.name,
      ...(source.kind === "github"
        ? { repo: source.repo!, ref: source.commit! }
        : {}),
    });
    raw = index.resources;
    loadouts = index.loadouts;
  }
  const resources: Resource[] = [];
  let skipped = 0;
  for (const input of raw) {
    const parsed = ResourceSchema.safeParse(input);
    if (!parsed.success) {
      skipped++;
      continue;
    }
    const tag = `source:${source.name}`;
    resources.push({
      ...parsed.data,
      tags: parsed.data.tags.includes(tag)
        ? parsed.data.tags
        : [...parsed.data.tags, tag],
    });
  }
  if (skipped)
    errors.push(
      `${source.name}: skipped ${skipped} entr${skipped === 1 ? "y" : "ies"} this version cannot read`,
    );
  return {
    source: source.name,
    resources,
    ...(loadouts ? { loadouts } : {}),
    errors,
  };
}

/** Every configured source's catalogue; one failing source is reported, not fatal. */
export async function allSourceCatalogs(home: string) {
  const catalogs: SourceCatalog[] = [];
  const errors: string[] = [];
  for (const source of await readSources(home))
    try {
      const catalog = await sourceCatalog(home, source);
      catalogs.push(catalog);
      errors.push(...catalog.errors);
    } catch (e) {
      errors.push(`${source.name}: ${String(e)}`);
    }
  const resources = new Map<string, Resource>();
  for (const catalog of catalogs)
    for (const resource of catalog.resources)
      if (!resources.has(resource.id)) resources.set(resource.id, resource);
      else
        errors.push(
          `${catalog.source}: ${resource.id} is also in an earlier source; the earlier one is used`,
        );
  return { catalogs, resources: [...resources.values()], errors };
}

/** Loadouts across sources; "source/name" picks one when names collide. */
export function loadoutIndex(catalogs: SourceCatalog[]) {
  const entries: {
    name: string;
    source: string;
    data: NonNullable<SourceCatalog["loadouts"]>;
    preset: boolean;
  }[] = [];
  for (const catalog of catalogs) {
    if (!catalog.loadouts) continue;
    for (const name of Object.keys(catalog.loadouts.loadouts))
      entries.push({
        name,
        source: catalog.source,
        data: catalog.loadouts,
        preset: false,
      });
    for (const name of Object.keys(catalog.loadouts.presets ?? {}))
      entries.push({
        name,
        source: catalog.source,
        data: catalog.loadouts,
        preset: true,
      });
  }
  const find = (target: string) => {
    const [source, name] = target.includes("/")
      ? (target.split("/", 2) as [string, string])
      : [undefined, target];
    const found = entries.find(
      (e) => e.name === name && (!source || e.source === source),
    );
    if (!found)
      throw new Error(
        entries.length
          ? `Unknown loadout: ${target}`
          : `Unknown loadout: ${target}. ${NO_SOURCE_HINT}`,
      );
    return found;
  };
  return { entries, find };
}
