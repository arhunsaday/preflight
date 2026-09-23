import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
export interface FileChange {
  path: string;
  before: string | null;
  after: string | null;
}
export const readText = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
};
async function safePath(path: string) {
  let current = resolve(path);
  while (true) {
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error(`Refusing symlink write: ${current}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
async function put(path: string, value: string | null) {
  await safePath(path);
  if (value === null) {
    await rm(path, { force: true });
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, value, { mode: 0o600, flag: "wx" });
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}
const Journal = z.object({
  id: z.string(),
  actor: z.string(),
  source: z.string().optional(),
  at: z.string(),
  status: z.enum(["pending", "complete", "rolled-back"]),
  files: z.array(
    z.object({
      path: z.string(),
      before: z.string().nullable(),
      after: z.string().nullable(),
    }),
  ),
});
export async function applyFiles(
  root: string,
  changes: FileChange[],
  options: { actor: string; source?: string; dryRun?: boolean },
) {
  const files = changes.filter((f) => f.before !== f.after);
  const seen = new Set<string>();
  for (const file of files) {
    file.path = resolve(file.path);
    if (seen.has(file.path)) throw new Error(`Duplicate write: ${file.path}`);
    seen.add(file.path);
    await safePath(file.path);
    if ((await readText(file.path)) !== file.before)
      throw new Error(`File changed since preview: ${file.path}`);
  }
  if (options.dryRun || !files.length)
    return { files, dryRun: !!options.dryRun };
  const dir = join(root, ".adk");
  await safePath(dir);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const mutex = join(dir, "write.lock");
  await writeFile(mutex, String(process.pid), { flag: "wx", mode: 0o600 });
  const journal = Journal.parse({
    id: randomUUID(),
    actor: options.actor,
    source: options.source,
    at: new Date().toISOString(),
    status: "pending",
    files,
  });
  const journalPath = join(dir, "transactions", `${journal.id}.json`);
  const done: FileChange[] = [];
  try {
    if ((await pendingTransactions(root)).length)
      throw new Error(
        "Interrupted transaction found; run adk recover before writing",
      );
    for (const file of files)
      if ((await readText(file.path)) !== file.before)
        throw new Error(`File changed since preview: ${file.path}`);
    await put(journalPath, JSON.stringify(journal, null, 2));
    for (const file of files) {
      await put(file.path, file.after);
      done.push(file);
    }
    journal.status = "complete";
    await put(journalPath, JSON.stringify(journal, null, 2));
    const auditPath = join(dir, "audit.jsonl");
    await put(
      auditPath,
      ((await readText(auditPath)) ?? "") +
        JSON.stringify({
          id: journal.id,
          actor: journal.actor,
          source: journal.source,
          at: journal.at,
          paths: files.map((f) => f.path),
        }) +
        "\n",
    );
    await put(join(dir, "latest"), journal.id);
  } catch (error) {
    for (const file of done.reverse()) await put(file.path, file.before);
    if (await readText(journalPath)) {
      journal.status = "rolled-back";
      await put(journalPath, JSON.stringify(journal, null, 2));
    }
    throw error;
  } finally {
    await rm(mutex, { force: true });
  }
  return { id: journal.id, files, dryRun: false };
}
export async function rollback(root: string, dryRun = false) {
  const id = (await readText(join(root, ".adk", "latest")))?.trim();
  if (!id || !/^[a-f0-9-]+$/.test(id))
    throw new Error("No transaction to roll back");
  const path = join(root, ".adk", "transactions", `${id}.json`);
  const journal = Journal.parse(JSON.parse((await readText(path))!));
  if (journal.status !== "complete")
    throw new Error("Transaction is not complete");
  const result = await applyFiles(
    root,
    journal.files.map((f) => ({
      path: f.path,
      before: f.after,
      after: f.before,
    })),
    { actor: process.env.USER ?? "local", source: `rollback:${id}`, dryRun },
  );
  return result;
}
export const jsonText = (value: unknown) =>
  JSON.stringify(value, null, 2) + "\n";

async function pendingTransactions(root: string) {
  const directory = join(root, ".adk", "transactions");
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const pending = [];
  for (const name of names.filter((n) => /^[a-f0-9-]+\.json$/.test(n))) {
    const path = join(directory, name);
    const journal = Journal.parse(JSON.parse((await readText(path))!));
    if (journal.status === "pending") pending.push({ path, journal });
  }
  return pending;
}
export async function recover(root: string, dryRun = false) {
  const pending = await pendingTransactions(root);
  const changes: FileChange[] = [];
  for (const { journal } of pending)
    for (const file of journal.files) {
      const actual = await readText(file.path);
      if (actual !== file.before && actual !== file.after)
        throw new Error(`File changed after interruption: ${file.path}`);
      if (actual !== file.before)
        changes.push({ path: file.path, before: actual, after: file.before });
    }
  if (dryRun)
    return { files: changes, transactions: pending.map((p) => p.journal.id) };
  const dir = join(root, ".adk");
  await safePath(dir);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const mutex = join(dir, "write.lock");
  const old = await readText(mutex);
  if (old !== null) {
    const pid = Number(old);
    if (!Number.isInteger(pid) || pid <= 0)
      throw new Error("Invalid write lock; inspect it manually");
    try {
      process.kill(pid, 0);
      throw new Error(`Writer ${pid} is still active`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
    await rm(mutex);
  }
  await writeFile(mutex, String(process.pid), { flag: "wx", mode: 0o600 });
  try {
    for (const file of changes) {
      if ((await readText(file.path)) !== file.before)
        throw new Error(`File changed during recovery: ${file.path}`);
      await put(file.path, file.after);
    }
    for (const { path, journal } of pending) {
      journal.status = "rolled-back";
      await put(path, jsonText(journal));
    }
    const auditPath = join(dir, "audit.jsonl");
    await put(
      auditPath,
      ((await readText(auditPath)) ?? "") +
        JSON.stringify({
          at: new Date().toISOString(),
          actor: process.env.USER ?? "local",
          action: "recover",
          transactions: pending.map((p) => p.journal.id),
        }) +
        "\n",
    );
  } finally {
    await rm(mutex, { force: true });
  }
  return { recovered: pending.map((p) => p.journal.id), files: changes };
}
