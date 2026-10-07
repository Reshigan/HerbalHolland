// Posts the books for a period again: every source with activity between two SAST days (inclusive), queued and posted.
// The nightly run makes up the week before it by itself; this is for a longer gap (the scheduler down for days) or a
// period to re-post after a fix. Posting is idempotent: a source that's already right posts nothing new.
//   DATABASE_URL=postgresql://… npx tsx scripts/ledger-backfill.ts 2026-10-01 2026-10-07
import "dotenv/config";
import { db } from "@/server/db";
import { ledgerBackfill } from "@/server/ledger/core";
import { plural } from "@/lib/plural";

const [from = "", to = ""] = process.argv.slice(2);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function main() {
  if (!DAY.test(from) || !DAY.test(to) || from > to) throw new Error("Usage: scripts/ledger-backfill.ts <from> <to>, two days as YYYY-MM-DD (SAST, inclusive), the earlier first");
  const started = Date.now();
  const r = await ledgerBackfill(from, to);
  const left = await db.ledgerQueue.count({ where: { attempts: 0 } });
  console.log(`${from} to ${to}: ${plural(r.queued, "source")} queued; ${plural(r.posted, "posting")} done with ${plural(r.journals, "new journal")}, ${r.failed} failed (${Math.round((Date.now() - started) / 1000)} s).`);
  if (left) console.log(`${plural(left, "posting")} still waiting in the queue: the 15-minute job posts them.`);
  if (r.failed) throw new Error(`${plural(r.failed, "posting")} failed. Failed postings stay queued with their reason: Herbal Holland's books → Month end lists them.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
