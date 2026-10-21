// Customer-facing display feed for a separate screen: the till posts its sale snapshot (device-authenticated) and
// the display polls it back with the device id + the pairing key the till generated. Held in D1 for three minutes:
// Workers run as many isolates, so memory would not do; the same-device BroadcastChannel path needs no server at all.
import { db } from "../db";
import { safeEqual } from "../crypto";

const TTL_MS = 3 * 60_000;
const MAX_BYTES = 24_000;

export async function putSnapshot(deviceId: string, key: string, snapshot: unknown) {
  if (JSON.stringify(snapshot).length > MAX_BYTES) throw new Error("Snapshot too large");
  const at = new Date();
  await db.displayFeed.upsert({ where: { deviceId }, create: { deviceId, key, snapshot: snapshot as object, at }, update: { key, snapshot: snapshot as object, at } });
}

export async function getSnapshot(deviceId: string, key: string): Promise<{ snapshot: unknown; ageMs: number } | null> {
  const e = await db.displayFeed.findUnique({ where: { deviceId } });
  if (!e || !safeEqual(e.key, key)) return null;
  const age = Date.now() - e.at.getTime();
  if (age > TTL_MS) {
    await db.displayFeed.delete({ where: { deviceId } }).catch(() => undefined);
    return null;
  }
  return { snapshot: e.snapshot, ageMs: age };
}

/** Forgets a device's feed (the till turned the separate screen off, or changed its key). */
export const clearSnapshot = async (deviceId: string) => void (await db.displayFeed.deleteMany({ where: { deviceId } }));

/** Stale rows (a till that stopped sending): swept by the frequent job. */
export const sweepDisplayFeeds = (now = new Date()) => db.displayFeed.deleteMany({ where: { at: { lt: new Date(now.getTime() - TTL_MS) } } });
