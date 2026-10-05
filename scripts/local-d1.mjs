// Test-only D1 adapter over real SQLite for Electron's isolated API fixture.
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
export async function localD1() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(await readFile(`migrations/${name}`, "utf8"));
  const database = {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) {
          args = values;
          return statement;
        },
        async all() {
          return {
            results: sqlite.prepare(sql).all(...args),
            success: true,
            meta: {},
          };
        },
        async raw() {
          return sqlite
            .prepare(sql)
            .all(...args)
            .map((row) => Object.values(row));
        },
        async first() {
          return sqlite.prepare(sql).get(...args) ?? null;
        },
        async run() {
          const result = sqlite.prepare(sql).run(...args);
          return {
            results: [],
            success: true,
            meta: {
              changes: Number(result.changes),
              last_row_id: Number(result.lastInsertRowid),
            },
          };
        },
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map((s) => s.all()));
    },
  };
  return { database, close: () => sqlite.close() };
}
