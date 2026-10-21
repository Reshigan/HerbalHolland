// The journeys' database: the SQLite file the app under test runs on, opened with better-sqlite3 and read and written
// straight (every journey checks and prepares rows around what it drives through the browser).
//
//   DATABASE_FILE=path/to/file.sqlite   the file; default: the local D1 of `wrangler dev` / `next dev`, found at
//                                       .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite
//                                       (`ls .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite | grep -v metadata`)
//
// The journeys were written against Postgres through `pg`, and this keeps that shape so they read the same:
// `db.query(sql, params)` → `{ rows }`, `$1, $2…` placeholders, `connect()` and `end()`. What Postgres did for them is
// done here: parameters are bound by number (a Date as the ISO text Prisma stores, a boolean as 0/1, an array or
// object as JSON text), rows come back typed by the column's declared type (BOOLEAN → true/false, DATETIME → Date,
// JSONB → parsed), and the Postgres spellings the journeys use are rewritten to SQLite before they run (`now()` with
// intervals, `::casts`, `= any($n)`, `unnest`, `@>`, array literals, `filter (where …)`, `to_char`, `gen_random_uuid()`).
// Anything else Postgres-only (lateral joins, date arithmetic, jsonb operators) is written as SQLite in the journey.
import Database from "better-sqlite3";
import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const D1_DIR = resolve(ROOT, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");

/** The file to open: DATABASE_FILE, else the local D1 file (there is exactly one once `wrangler d1 migrations apply --local` ran). */
export function databaseFile() {
  if (process.env.DATABASE_FILE) return process.env.DATABASE_FILE;
  const found = globSync("*.sqlite", { cwd: D1_DIR }).map((f) => resolve(D1_DIR, f));
  if (found.length === 1) return found[0];
  throw new Error(found.length ? `Several local D1 files in ${D1_DIR}: set DATABASE_FILE to one of them` : `No local D1 file in ${D1_DIR}: run \`npm run db:migrate\` (and the seed), or set DATABASE_FILE`);
}

// Prisma stores a DateTime as `2026-10-21T07:01:26.322+00:00`; strftime('%f') gives SS.SSS, so the same text.
const NOW = "strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'";
const UUID = "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))))";
const jsonList = (items) => `'${JSON.stringify(items.map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean))}'`;

/** Postgres spellings → SQLite. Exported for the journeys' own fragments and for tests of the rewrite itself. */
export function toSqlite(sql) {
  return (
    sql
      .replace(/gen_random_uuid\(\)(::text)?/gi, UUID)
      // now() [at time zone 'UTC'] [± interval '3 days 2 hours']… → strftime(…, 'now', '+3 days', '+2 hours')
      .replace(/\bnow\(\)(?:\s+at\s+time\s+zone\s+'UTC')?((?:\s*[-+]\s*interval\s*'[^']+')*)/gi, (_, intervals) => {
        const mods = [];
        for (const m of intervals.matchAll(/([-+])\s*interval\s*'([^']+)'/gi))
          for (const part of m[2].trim().match(/\d+\s*[a-z]+/gi) ?? []) mods.push(`'${m[1]}${part.replace(/\s+/g, " ")}'`);
        return `${NOW}${mods.map((m) => `, ${m}`).join("")})`;
      })
      .replace(/date_trunc\('month',\s*([^)]+)\)/gi, (_, x) => `strftime('%Y-%m-01T00:00:00.000+00:00', ${x})`)
      .replace(/to_char\(([^,]+),\s*'YYYY-MM-DD'\)/gi, (_, x) => `substr(${x}, 1, 10)`)
      // x = any($n) → x in (select value from json_each($n)); 'POS' = any(col) → exists (… json_each(col) …)
      .replace(/(\$\d+|'[^']*'|[\w".]+)\s*=\s*any\(\s*(\$\d+|[\w".]+)(?:::[\w"[\]]+)?\s*\)/gi, (_, left, right) =>
        right.startsWith("$") ? `${left} in (select value from json_each(${right}))` : `exists (select 1 from json_each(${right}) where value = ${left})`,
      )
      .replace(/\bunnest\(\s*(\$\d+)(?:::[\w"[\]]+)?\s*\)\s+(\w+)/gi, (_, p, alias) => `(select value as ${alias} from json_each(${p})) ${alias}`)
      // col @> '{A,B}' → every value present
      .replace(/([\w".]+)\s*@>\s*'\{([^}]*)\}'/g, (_, col, items) => items.split(",").map((v) => `exists (select 1 from json_each(${col}) where value = '${v.trim()}')`).join(" and "))
      .replace(/\barray\[([^\]]*)\]/gi, (_, items) => jsonList(items.split(",")))
      .replace(/'\{([A-Za-z0-9_,\s]*)\}'/g, (_, items) => jsonList(items.split(",")))
      .replace(/::"?[A-Za-z_]+"?(\[\])?/g, "")
      .replace(/count\(\*\)\s*filter\s*\(\s*where\s+([^()]+?)\s*\)/gi, (_, cond) => `coalesce(sum(case when ${cond} then 1 else 0 end), 0)`)
      .replace(/\bilike\b/gi, "like")
      .replace(/\bleast\(/gi, "min(")
      .replace(/\bleft\(([^,()]+),\s*(\d+)\)/gi, (_, x, n) => `substr(${x}, 1, ${n})`)
  );
}

const pad = (n, w = 2) => String(n).padStart(w, "0");
/** A Date as Prisma writes it to SQLite. */
export const isoText = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}+00:00`;

function bind(params) {
  const out = {};
  params.forEach((v, i) => {
    out[String(i + 1)] =
      v === undefined || v === null ? null
      : typeof v === "boolean" ? (v ? 1 : 0)
      : v instanceof Date ? isoText(v)
      : Buffer.isBuffer(v) || v instanceof Uint8Array ? v
      : typeof v === "object" ? JSON.stringify(v)
      : v;
  });
  return out;
}

function typed(columns, row) {
  for (const c of columns) {
    const t = c.type?.toUpperCase();
    const v = row[c.name];
    if (v === null || v === undefined || !t) continue;
    if (t === "BOOLEAN") row[c.name] = v === 1 || v === "1" || v === true;
    else if (t === "DATETIME") row[c.name] = new Date(v);
    else if (t === "JSONB" || t === "JSON") {
      try { row[c.name] = typeof v === "string" ? JSON.parse(v) : v; } catch { /* left as text */ }
    }
  }
  return row;
}

/** Opens the file; the object quacks like the `pg.Client` the journeys were written for. */
export function createDb(file = databaseFile()) {
  const sqlite = new Database(file, { timeout: 10_000 });
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return {
    file,
    sqlite,
    async connect() {},
    async query(sql, params = []) {
      const stmt = sqlite.prepare(toSqlite(sql));
      const bound = bind(params);
      if (stmt.reader) {
        const columns = stmt.columns();
        return { rows: stmt.all(bound).map((r) => typed(columns, r)) };
      }
      const r = stmt.run(bound);
      return { rows: [], rowCount: r.changes };
    },
    async end() {
      sqlite.close();
    },
  };
}
