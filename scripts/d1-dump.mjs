// The rows of a SQLite file as INSERT statements D1 can import (`wrangler d1 execute <db> --remote --file <out>`), for
// standing a deployed database up from a local seed. The schema comes from the migrations, so only data is written;
// wrangler's own tables are skipped. Foreign keys are deferred for the import (tables come in creation order, which
// is parent-first for this schema anyway).
//   node scripts/d1-dump.mjs <file.sqlite> <out.sql>
import Database from "better-sqlite3";
import { createWriteStream } from "node:fs";

const [file, out] = process.argv.slice(2);
if (!file || !out) {
  console.error("usage: node scripts/d1-dump.mjs <file.sqlite> <out.sql>");
  process.exit(2);
}
const db = new Database(file, { readonly: true });
const w = createWriteStream(out);
const write = (s) => new Promise((ok) => (w.write(s) ? ok() : w.once("drain", ok)));

const lit = (v) =>
  v === null ? "NULL"
  : typeof v === "number" ? String(v)
  : typeof v === "bigint" ? v.toString()
  : Buffer.isBuffer(v) ? `X'${v.toString("hex")}'`
  : `'${String(v).replace(/'/g, "''")}'`;

await write("PRAGMA defer_foreign_keys = true;\n");
const tables = db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_cf_%' and name <> 'd1_migrations' order by rowid").all();
let rows = 0;
for (const { name } of tables) {
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
      await write(head + batch.join(",\n") + ";\n");
      batch = [];
      bytes = 0;
    }
  }
  if (batch.length) await write(head + batch.join(",\n") + ";\n");
}
await new Promise((ok) => w.end(ok));
console.log(`${rows} rows from ${tables.length} tables → ${out}`);
