import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { execute, catalogResources } from "../src/commands.js";
import { PreflightService } from "../src/service.js";
import { PreflightLockSchema } from "../src/schema.js";
import { ConfigStore } from "../src/state.js";
import { disabledResources } from "../src/toggle.js";
import { BenchRun } from "../src/bench.js";
import { ArenaReport } from "../src/bench-arena.js";
import type { Context } from "../src/adapters.js";
import type { Snapshot } from "./protocol.js";
export async function snapshot(
  context: Context,
  options: { transcripts?: boolean } = {},
): Promise<Snapshot> {
  const transcripts = options.transcripts ?? true;
  const service = new PreflightService(context);
  const errors: string[] = [];
  const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T) => {
    try {
      return await fn();
    } catch (e) {
      errors.push(`${label}: ${String(e)}`);
      return fallback;
    }
  };
  let initialized = true;
  const config = await safe(
    "Configuration",
    async () => {
      try {
        return await service.store.read();
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
          initialized = false;
          return null;
        }
        throw e;
      }
    },
    null,
  );
  const lock = await safe(
    "Lockfile",
    async () => {
      try {
        return PreflightLockSchema.parse(
          JSON.parse(await readFile(service.store.lockPath, "utf8")),
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    null,
  );
  const inherited = context.globalOnly
    ? []
    : await safe(
        "Global configuration",
        () =>
          new ConfigStore(join(context.home, ".preflight", "global"))
            .resources()
            .catch((e) => {
              if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
              throw e;
            }),
        [],
      );
  const [
    detected,
    report,
    instructions,
    usage,
    loadoutList,
    sourceList,
    benches,
    arenas,
  ] = await Promise.all([
    safe(
      "Detected resources",
      async () =>
        (await service.unmanaged(inherited)).map((entry) => entry.resource),
      [],
    ),
    safe(
      "Doctor",
      () => service.doctorReport(transcripts ? {} : { readTranscripts: false }),
      null,
    ),
    safe(
      "Instructions",
      () =>
        execute(["instructions", "lint"], context) as Promise<
          Snapshot["instructions"]
        >,
      null,
    ),
    safe(
      "Usage",
      async () =>
        transcripts
          ? ((await execute(
              ["usage", "--since", "30d"],
              context,
            )) as Snapshot["usage"])
          : null,
      null,
    ),
    safe(
      "Loadouts",
      async () =>
        (await execute(["loadouts", "list"], context)) as {
          loadouts: string[];
        } & Snapshot["loadoutCatalog"],
      { loadouts: [], details: {}, presets: {} },
    ),
    safe(
      "Sources",
      async () =>
        (await execute(["source", "list"], context)) as {
          sources: Snapshot["sources"];
          errors: string[];
        },
      { sources: [], errors: [] },
    ),
    safe(
      "Benchmarks",
      async () => {
        let files: string[];
        try {
          files = await readdir(join(context.root, ".preflight", "bench"));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw e;
        }
        const results = [];
        for (const name of files
          .filter((f) => /^[a-z0-9_-]+\.json$/i.test(f))
          .slice(0, 100)) {
          try {
            results.push(
              BenchRun.parse(
                JSON.parse(
                  await readFile(
                    join(context.root, ".preflight", "bench", name),
                    "utf8",
                  ),
                ),
              ),
            );
          } catch (e) {
            errors.push(`Benchmark ${name}: ${String(e)}`);
          }
        }
        return results;
      },
      [],
    ),
    safe(
      "Arena reports",
      async () => {
        const dir = join(context.root, ".preflight", "arena");
        let files: string[];
        try {
          files = await readdir(dir);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw e;
        }
        const reports = [];
        for (const name of files
          .filter((f) => /^[a-z0-9_-]+\.json$/i.test(f))
          .slice(0, 50)) {
          try {
            reports.push(
              ArenaReport.parse(
                JSON.parse(await readFile(join(dir, name), "utf8")),
              ),
            );
          } catch (e) {
            errors.push(`Arena ${name}: ${String(e)}`);
          }
        }
        return reports;
      },
      [],
    ),
  ]);
  return {
    root: context.root,
    home: context.home,
    initialized,
    config,
    lock,
    resources: config?.profiles[config.activeProfile]?.resources ?? [],
    inherited,
    detected: context.globalOnly
      ? detected.filter((r) => r.scope === "global")
      : detected.filter(
          (r) =>
            !inherited.some(
              (g) =>
                r.scope === "global" &&
                r.name === g.name &&
                r.type === g.type &&
                r.harnesses.some((h) => g.harnesses.includes(h)),
            ),
        ),
    disabled: await safe("Disabled resources", () => disabledResources(context), []),
    catalogue: await safe("Sources", () => catalogResources(context.home), []),
    findings: report?.findings ?? [],
    doctor: report ? { skipped: report.skipped, facts: report.facts } : null,
    instructions,
    usage,
    ...(transcripts ? {} : { transcriptsOff: true }),
    loadouts: loadoutList.loadouts,
    loadoutCatalog: {
      details: loadoutList.details ?? {},
      presets: loadoutList.presets ?? {},
    },
    sources: sourceList.sources.map((s) => ({
      name: s.name,
      kind: s.kind,
      ...(s.repo ? { repo: s.repo } : {}),
      ...(s.ref ? { ref: s.ref } : {}),
      ...(s.commit ? { commit: s.commit } : {}),
      ...(s.path ? { path: s.path } : {}),
      resources: s.resources,
      loadouts: s.loadouts,
    })),
    benches,
    arenas,
    errors: [...errors, ...sourceList.errors.map((e) => `Source ${e}`)],
  };
}
