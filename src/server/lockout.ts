// Wrong staff passwords (sign-in and till pairing) and till PINs are counted on the account in the database, so the
// limit holds however many servers run: 8 wrong passwords lock the account out of password sign-in for 15 minutes,
// 5 wrong PINs lock it out of every till for 5. A right one clears the count. Each lock is audited by the caller.
// Two longer counts sit on top (src/server/throttle.ts): 30 wrong passwords from one connection in 15 minutes, whatever
// the accounts, pause password sign-in from there; 10 wrong PINs in a day switch the PIN off until a manager resets it.
import { headers } from "next/headers";
import { db, tx } from "./db";
import { clear, count, record, ipKey } from "./throttle";
import { clientIpFrom } from "@/lib/client-ip";

const RULES = {
  password: { fails: "passwordFails", at: "passwordLockedAt", max: 8, minutes: 15 },
  pin: { fails: "pinFails", at: "pinLockedAt", max: 5, minutes: 5 },
} as const;
export type LockKind = keyof typeof RULES;

type Counted = { passwordFails: number; passwordLockedAt: Date | null; pinFails: number; pinLockedAt: Date | null };

/** Whether the account is still locked out (of password sign-in or of the tills). */
export function isLocked(user: Counted, kind: LockKind, now = Date.now()) {
  const at = user[RULES[kind].at];
  return !!at && now - at.getTime() < RULES[kind].minutes * 60_000;
}

/** Counts a wrong try; true when it has just locked the account. */
export function recordFailure(userId: string, kind: LockKind): Promise<boolean> {
  const r = RULES[kind];
  return tx(async (t) => {
    await t.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const u: Counted = await t.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordFails: true, passwordLockedAt: true, pinFails: true, pinLockedAt: true } });
    const fails = u[r.fails] + 1;
    const locks = fails >= r.max;
    await t.user.update({ where: { id: userId }, data: { [r.fails]: locks ? 0 : fails, ...(locks && { [r.at]: new Date() }) } });
    return locks;
  });
}

/** A right password or PIN: the count starts again. */
export const clearFailures = (userId: string, kind: LockKind) =>
  db.user.update({ where: { id: userId }, data: { [RULES[kind].fails]: 0, [RULES[kind].at]: null } });

// ── Per connection: password sign-in and till pairing ─────────────────────────
const IP_WINDOW_MS = 15 * 60_000;
const IP_MAX = 30;
export const IP_LOCKED = "Too many attempts from here. Try again in 15 minutes.";

/** The throttle key for this request's connection (a keyed hash of its IP). */
export const signInKey = async () => `signin-ip:${ipKey(clientIpFrom(await headers()))}`;
/** Whether the connection has had 30 wrong passwords in the last 15 minutes: refuse before checking another. */
export const ipLocked = async (key: string) => (await count(key, IP_WINDOW_MS)) >= IP_MAX;
/** Counts a failed sign-in from the connection. */
export const recordIpFailure = (key: string) => record(key, IP_WINDOW_MS);

// ── Per PIN: ten wrong in a day ────────────────────────────────────────────────
const DAY_MS = 86_400_000;
const PIN_DAY_MAX = 10;
export const PIN_DISABLED = "Your PIN is locked. Ask a manager to reset it";
const pinKey = (userId: string) => `pin:${userId}`;

/** Whether the PIN has been switched off (ten wrong in 24 hours). It stays off until a manager sets a new one. */
export const pinDisabled = (user: { pinDisabledAt: Date | null }) => !!user.pinDisabledAt;
/** Counts a wrong PIN towards the daily ten; at ten the PIN is switched off (true). */
export async function recordPinFailure(userId: string) {
  if ((await record(pinKey(userId), DAY_MS)) < PIN_DAY_MAX) return false;
  await db.user.update({ where: { id: userId }, data: { pinDisabledAt: new Date() } });
  return true;
}
/** A manager set a new PIN: the day's count against the old one is forgotten and the PIN works again. */
export async function resetPinFailures(userId: string) {
  await clear(pinKey(userId));
  await db.user.update({ where: { id: userId }, data: { pinDisabledAt: null } });
}
