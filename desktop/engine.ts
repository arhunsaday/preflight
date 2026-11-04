import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { execute, catalogResources } from "../src/commands.js";
import { AdkService } from "../src/service.js";
import { AdkLockSchema } from "../src/schema.js";
import { ConfigStore } from "../src/state.js";
import { BenchRun } from "../src/bench.js";
import type { Context } from "../src/adapters.js";
import type { Snapshot } from "./protocol.js";
export async function snapshot(context: Context): Promise<Snapshot> {
  const service = new AdkService(context);
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
        return AdkLockSchema.parse(
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
          new ConfigStore(join(context.home, ".adk", "global"))
            .resources()
            .catch((e) => {
              if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
              throw e;
            }),
        [],
      );
  const [detected, findings, usage, loadouts, benches] = await Promise.all([
    safe(
      "Detected resources",
      async () =>
        (await service.unmanaged(inherited)).map((entry) => entry.resource),
      [],
    ),
    safe("Doctor", () => service.doctor(), []),
    safe(
      "Usage",
      () => execute(["usage"], context) as Promise<Snapshot["usage"]>,
      null,
    ),
    safe(
      "Loadouts",
      async () =>
        (
          (await execute(["loadouts", "list"], context)) as {
            loadouts: string[];
          }
        ).loadouts,
      [],
    ),
    safe(
      "Benchmarks",
      async () => {
        let files: string[];
        try {
          files = await readdir(join(context.root, ".adk", "bench"));
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
                    join(context.root, ".adk", "bench", name),
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
    catalogue: catalogResources(),
    findings,
    usage,
    loadouts,
    benches,
    errors,
  };
}
