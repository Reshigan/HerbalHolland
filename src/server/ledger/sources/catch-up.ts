// What a night the books job missed left out. A store-day posts only once its day is over (the nightly run queues the
// day that ended) and a statement once its month is (the 1st), and a later change queues either again by itself
// (queueStoreDay). So one of those from the week before that never posted, and isn't waiting in the queue, is one a
// missed night skipped.
import { db } from "../../db";
import { chunk } from "@/lib/json-list";

type Source = { source: string; sourceId: string };

/** How far back the nightly run makes up missed nights; a longer gap is a backfill (scripts/ledger-backfill.ts). */
export const CATCH_UP_DAYS = 7;

/** Of these sources, the ones that never posted and aren't waiting in the queue. */
export async function missed(list: Source[]): Promise<Source[]> {
  if (!list.length) return [];
  const seen = new Set<string>();
  for (const part of chunk(list, 80)) { // D1 binds at most 100 parameters per statement
    const where = { OR: [...new Set(part.map((s) => s.source))].map((source) => ({ source, sourceId: { in: part.filter((s) => s.source === source).map((s) => s.sourceId) } })) };
    const [posted, queued] = await Promise.all([
      db.journal.findMany({ where, select: { source: true, sourceId: true }, distinct: ["source", "sourceId"] }),
      db.ledgerQueue.findMany({ where, select: { source: true, sourceId: true } }),
    ]);
    for (const s of [...posted, ...queued]) seen.add(`${s.source}|${s.sourceId}`);
  }
  return list.filter((s) => !seen.has(`${s.source}|${s.sourceId}`));
}
