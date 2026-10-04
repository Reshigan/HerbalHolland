// Wrong staff passwords (sign-in and till pairing) and till PINs are counted on the account in the database, so the
// limit holds however many servers run: 8 wrong passwords lock the account out of password sign-in for 15 minutes,
// 5 wrong PINs lock it out of every till for 5. A right one clears the count. Each lock is audited by the caller.
import { db, tx } from "./db";

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
