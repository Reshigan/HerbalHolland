// The rows of a SQLite file as INSERT statements D1 can import, in parts of about 8 MB (`<out>.001`, `<out>.002`…; each
// `wrangler d1 execute <db> --remote --file <part>` is its own import, which keeps D1 within what one import can take),
// for standing a deployed database up from a local seed. The schema comes from the migrations, so only data is written;
// wrangler's own tables are skipped. Tables come parent-first (by their foreign keys), so every part stands on its own.
//   node scripts/d1-dump.mjs <file.sqlite> <out.sql>
import Database from "better-sqlite3";
import { createWriteStream } from "node:fs";

const [file, out] = process.argv.slice(2);
if (!file || !out) {
  console.error("usage: node scripts/d1-dump.mjs <file.sqlite> <out.sql>");
  process.exit(2);
}
const PART_BYTES = 8_000_000;
const db = new Database(file, { readonly: true });

const lit = (v) =>
  v === null ? "NULL"
  : typeof v === "number" ? String(v)
  : typeof v === "bigint" ? v.toString()
  : Buffer.isBuffer(v) ? `X'${v.toString("hex")}'`
  : `'${String(v).replace(/'/g, "''")}'`;

// Parts: a new file whenever the current one passes PART_BYTES, at a statement boundary.
const parts = [];
let w = null, size = 0;
const write = (s) => new Promise((ok) => (w.write(s) ? ok() : w.once("drain", ok)));
async function statement(sql) {
  if (!w || size > PART_BYTES) {
    if (w) await new Promise((ok) => w.end(ok));
    const name = `${out}.${String(parts.length + 1).padStart(3, "0")}`;
    parts.push(name);
    w = createWriteStream(name);
    size = 0;
    await write("PRAGMA defer_foreign_keys = true;\n");
  }
  await write(sql);
  size += sql.length;
}

// Tables parent-first: a table follows every table its foreign keys point at.
const all = db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_cf_%' and name <> 'd1_migrations' order by rowid").all().map((t) => t.name);
const parents = new Map(all.map((t) => [t, db.prepare(`pragma foreign_key_list("${t}")`).all().map((f) => f.table).filter((p) => p !== t && all.includes(p))]));
const tables = [], placed = new Set();
const place = (t) => {
  if (placed.has(t)) return;
  placed.add(t);
  for (const p of parents.get(t)) place(p);
  tables.push(t);
};
for (const t of all) place(t);

let rows = 0;
for (const name of tables) {
  const cols = db.prepare(`pragma table_info("${name}")`).all().map((c) => `"${c.name}"`);
  const head = `INSERT INTO "${name}" (${cols.join(", ")}) VALUES\n`;
  // A statement stays under D1's limit on its length (100 KB; SQLITE_TOOBIG beyond it): rows go in by size, not by count.
  let batch = [], bytes = 0;
  for (const r of db.prepare(`select * from "${name}"`).iterate()) {
    const row = `(${Object.values(r).map(lit).join(", ")})`;
    batch.push(row);
    bytes += row.length + 2;
    rows++;
    if (bytes > 60_000 || batch.length === 500) {
      await statement(head + batch.join(",\n") + ";\n");
      batch = [];
      bytes = 0;
    }
  }
  if (batch.length) await statement(head + batch.join(",\n") + ";\n");
}
if (w) await new Promise((ok) => w.end(ok));
console.log(`${rows} rows from ${tables.length} tables → ${parts.length} parts: ${parts[0]} … ${parts[parts.length - 1]}`);
