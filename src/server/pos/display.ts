// Customer-facing display feed for a separate screen: the till posts its sale snapshot (device-authenticated) and
// the display polls it back with the device id + the pairing key the till generated. Kept in memory with a short
// TTL: nothing is stored, and there is no schema. One app instance serves a store's tills and displays; behind a
// load balancer without sticky sessions the poll may miss the instance holding the snapshot (documented in the
// runbook: the same-device BroadcastChannel path needs no server at all).
import { safeEqual } from "../crypto";

const TTL_MS = 3 * 60_000;
const MAX_BYTES = 24_000;

type Entry = { key: string; snapshot: unknown; at: number };
const store: Map<string, Entry> = ((globalThis as { __hhDisplay?: Map<string, Entry> }).__hhDisplay ??= new Map());

const sweep = (now: number) => {
  for (const [id, e] of store) if (now - e.at > TTL_MS) store.delete(id);
};

export function putSnapshot(deviceId: string, key: string, snapshot: unknown) {
  if (JSON.stringify(snapshot).length > MAX_BYTES) throw new Error("Snapshot too large");
  const now = Date.now();
  sweep(now);
  store.set(deviceId, { key, snapshot, at: now });
}

export function getSnapshot(deviceId: string, key: string): { snapshot: unknown; ageMs: number } | null {
  const e = store.get(deviceId);
  if (!e || !safeEqual(e.key, key)) return null;
  const age = Date.now() - e.at;
  if (age > TTL_MS) {
    store.delete(deviceId);
    return null;
  }
  return { snapshot: e.snapshot, ageMs: age };
}

/** Forgets a device's feed (the till turned the separate screen off, or changed its key). */
export const clearSnapshot = (deviceId: string) => void store.delete(deviceId);
