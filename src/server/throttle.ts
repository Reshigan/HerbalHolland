// Rate limits that hold across every server and restart: each counted event is a Throttle row under a key (for
// example "signin-ip:<hash>", "otp-sms:all", "pin:<userId>"), counted in a sliding window. Checking and counting run
// under a Postgres advisory lock on the key, so requests arriving together can't all slip under the limit. The daily
// job prunes rows older than the longest window.
import { createHmac } from "node:crypto";
import { db, tx, type Tx } from "./db";
import { appSecret } from "./secret";

const lock = (t: Tx, key: string) => t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`throttle:${key}`}))`;
const since = (windowMs: number) => new Date(Date.now() - windowMs);

/** Counts one event under `key` unless `max` already happened in the last `windowMs`; true when it was allowed. */
export function hit(key: string, max: number, windowMs: number): Promise<boolean> {
  return tx(async (t) => {
    await lock(t, key);
    if ((await t.throttle.count({ where: { key, createdAt: { gte: since(windowMs) } } })) >= max) return false;
    await t.throttle.create({ data: { key } });
    return true;
  });
}

/** Counts one event (a failure, say) without a limit check; returns how many there now are in the window. */
export function record(key: string, windowMs: number): Promise<number> {
  return tx(async (t) => {
    await lock(t, key);
    await t.throttle.create({ data: { key } });
    return t.throttle.count({ where: { key, createdAt: { gte: since(windowMs) } } });
  });
}

/** Events under `key` in the last `windowMs`. */
export const count = (key: string, windowMs: number) => db.throttle.count({ where: { key, createdAt: { gte: since(windowMs) } } });

/** Forgets a key (a manager reset the PIN, say). */
export const clear = (key: string) => db.throttle.deleteMany({ where: { key } });

/** Daily housekeeping: the longest window in use is a day. */
export const pruneThrottle = (now = new Date()) => db.throttle.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 2 * 86_400_000) } } });

/** A keyed hash of an IP for throttle keys and records (never the IP itself). */
export const ipKey = (ip: string | null) => (ip ? createHmac("sha256", appSecret()).update(`ip:${ip}`).digest("hex").slice(0, 32) : "unknown");
