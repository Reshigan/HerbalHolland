// The SQLite file behind Node-side tools (the seed, scripts, the integration tests): DATABASE_URL names it (`file:…`),
// and for a running `next dev` it is the local D1 under .wrangler/state/v3/d1/miniflare-D1DatabaseObject/. Opens it
// with better-sqlite3 directly, before Prisma does, to give an empty file the schema (migrations/*.sql, the same files
// `wrangler d1 migrations apply` runs, recorded in d1_migrations so wrangler won't run them again) and to empty every
// table of a database that's being seeded again. Foreign keys are enforced (as D1 enforces them), so the wipe switches
// them off for the deletes.
import Database from "better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";

const MIGRATIONS = new URL("../migrations/", import.meta.url);

/** The path of the SQLite file a `file:` URL names (relative to the working directory, as Prisma reads it). */
export function sqlitePath(url = process.env.DATABASE_URL ?? "") {
  if (!url.startsWith("file:")) throw new Error("DATABASE_URL must name a SQLite file (file:…)");
  return url.slice("file:".length).replace(/\?.*$/, "");
}

/** The tables the app owns: not SQLite's own, not Prisma's, not wrangler's migration ledger. */
export function appTables(sqlite: Database.Database): string[] {
  return sqlite
    .prepare<[], { name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_prisma%' ESCAPE '\\' AND name NOT LIKE 'd1\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name`)
    .all()
    .map((r) => r.name);
}

/** Applies migrations/*.sql, in order, to a file that has no schema yet. Returns the names applied. */
export function applyMigrations(sqlite: Database.Database): string[] {
  sqlite.exec("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const done = new Set(sqlite.prepare<[], { name: string }>("SELECT name FROM d1_migrations").all().map((r) => r.name));
  const applied: string[] = [];
  for (const file of readdirSync(MIGRATIONS).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()) {
    if (done.has(file)) continue;
    sqlite.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
    sqlite.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(file);
    applied.push(file);
  }
  return applied;
}

/** Empties every app table (foreign keys off for the deletes, on again after), keeping the schema. */
export function wipeTables(sqlite: Database.Database) {
  sqlite.pragma("foreign_keys = OFF");
  try {
    sqlite.transaction(() => {
      for (const t of appTables(sqlite)) sqlite.prepare(`DELETE FROM "${t}"`).run();
    })();
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}

/**
 * Makes the file DATABASE_URL names ready for Prisma: created with the schema when it's new or empty, and (with
 * `wipe`) emptied when it isn't. Returns what was done, for the caller's log line.
 */
export function prepareSqliteFile(opts: { url?: string; wipe?: boolean } = {}) {
  const path = sqlitePath(opts.url);
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  try {
    sqlite.pragma("journal_mode = WAL");
    const hasSchema = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'Store'").get();
    const applied = hasSchema ? [] : applyMigrations(sqlite);
    if (hasSchema && opts.wipe) wipeTables(sqlite);
    sqlite.pragma("foreign_keys = ON");
    return { path, name: basename(path), applied, wiped: Boolean(hasSchema && opts.wipe) };
  } finally {
    sqlite.close();
  }
}

/** Opens the file read-write with better-sqlite3 (foreign keys on), for a caller that wants raw access. */
export function openSqliteFile(url?: string) {
  const sqlite = new Database(sqlitePath(url));
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}
