import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

type Row = Record<string, string | number | null | Uint8Array>;
const globalDb = globalThis as typeof globalThis & {
  chatflowDb?: DatabaseSync;
};

export function database() {
  if (globalDb.chatflowDb) return globalDb.chatflowDb;
  const filename = process.env.DATABASE_PATH || "./data/chatflow.sqlite";
  if (filename !== ":memory:")
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  for (const name of readdirSync(resolve("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(resolve("migrations", name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    db.exec("BEGIN IMMEDIATE");
    try {
      const existing = db
        .prepare("SELECT checksum FROM schema_migrations WHERE name=?")
        .get(name);
      if (existing && existing.checksum !== checksum)
        throw new Error(`Applied migration changed: ${name}`);
      if (!existing) {
        db.exec(sql);
        db.prepare("INSERT INTO schema_migrations VALUES (?,?,?)").run(
          name,
          checksum,
          new Date().toISOString(),
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  }
  globalDb.chatflowDb = db;
  return db;
}
export function all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
  return database()
    .prepare(sql)
    .all(...params) as T[];
}
export function one<T = Row>(
  sql: string,
  ...params: SQLInputValue[]
): T | undefined {
  return database()
    .prepare(sql)
    .get(...params) as T | undefined;
}
export function run(sql: string, ...params: SQLInputValue[]) {
  return database()
    .prepare(sql)
    .run(...params);
}
export function transaction<T>(action: () => T): T {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
