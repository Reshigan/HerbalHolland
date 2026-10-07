// Till identity: which stores a signed-in manager may pair a device to, the staff tiles
// on the lock screen, and PIN sign-in (rate limited, audited).
import { db, tx } from "@/server/db";
import { endSession, pairDevice, startSession, upgradeHash, verifySecret } from "@/server/auth";
import { NO_HASH } from "@/server/crypto";
import { audit, type Actor } from "@/server/audit";
import { scopeOf, storeWhere } from "@/server/scope";
import { PosError, type PosDevice } from "./http";
import { clearFailures, IP_LOCKED, ipLocked, isLocked, PIN_DISABLED, pinDisabled, recordFailure, recordIpFailure, recordPinFailure, signInKey } from "../lockout";
import type { Role } from "@/generated/prisma/client";
import type { SessionInfo, StaffTile } from "./types";

/** Roles that may pair a till to a store. */
export const PAIR_ROLES: Role[] = ["HQ_ADMIN", "HQ_STAFF", "AREA_MANAGER", "OWNER", "MANAGER"];
const POS_SESSION_HOURS = 12;

export async function staffTiles(storeId: string): Promise<StaffTile[]> {
  const users = await db.user.findMany({
    where: { storeId, active: true, pinHash: { not: null } },
    select: { id: true, name: true, role: true, canDispense: true },
  });
  const rank = (r: string) => (r === "MANAGER" ? 0 : 1);
  return users.sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name));
}

export async function sessionInfo(device: PosDevice, me: { id: string; name: string; role: string; canDispense: boolean } | null): Promise<SessionInfo> {
  return {
    device: { id: device.id, name: device.name, prefix: device.prefix },
    store: { id: device.store.id, code: device.store.code, name: device.store.name, suburb: device.store.suburb, city: device.store.city },
    staff: await staffTiles(device.storeId),
    me: me && { id: me.id, name: me.name, role: me.role, canDispense: me.canDispense },
    demo: process.env.DEMO_MODE === "true",
  };
}

export async function pinSignIn(device: PosDevice, userId: string, pin: string) {
  // One attempt at a time per person, held across check, verify and record: a burst of parallel guesses can't each read
  // "not locked" before the first failure counts. A second attempt while one is being checked is turned away at once.
  return tx(async (t) => {
    const [{ ok }] = await t.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`pin:${userId}`})) AS ok`;
    if (!ok) throw new PosError("One moment — that PIN is still being checked", 429);
    return pinAttempt(device, userId, pin);
  });
}

async function pinAttempt(device: PosDevice, userId: string, pin: string) {
  const user = await db.user.findFirst({ where: { id: userId, storeId: device.storeId, active: true } });
  if (!user?.pinHash) throw new PosError("That staff member can't use this till", 403);
  if (pinDisabled(user)) throw new PosError(PIN_DISABLED, 403, "PIN_DISABLED");
  if (isLocked(user, "pin")) throw new PosError("Too many wrong PINs — wait 5 minutes or ask your manager", 429);
  if (!/^\d{4,6}$/.test(pin) || !(await verifySecret(pin, user.pinHash))) {
    const till = { type: "DEVICE" as const, id: device.id, name: device.name };
    if (await recordFailure(user.id, "pin")) await audit(db, till, "pos.pin_lockout", { storeId: device.storeId, entity: "User", entityId: user.id });
    // Ten wrong in a day (across the 5-minute locks): the PIN stays off until a manager sets a new one.
    if (await recordPinFailure(user.id)) {
      await audit(db, till, "pos.pin_disabled", { storeId: device.storeId, entity: "User", entityId: user.id });
      throw new PosError(PIN_DISABLED, 403, "PIN_DISABLED");
    }
    throw new PosError("That PIN isn't right", 401, "BAD_PIN");
  }
  if (user.pinFails) await clearFailures(user.id, "pin");
  await upgradeHash(user.id, "pinHash", user.pinHash, pin);
  await endSession("pos");
  await startSession("pos", { userId: user.id, storeId: device.storeId, deviceId: device.id }, POS_SESSION_HOURS);
  await db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  await audit(db, { type: "USER", id: user.id, name: user.name }, "pos.sign_in", { storeId: device.storeId, entity: "Device", entityId: device.id });
  return user;
}

// ── Pairing ────────────────────────────────────────────────────────────────

export type PairableStore = { id: string; code: string; name: string; suburb: string; city: string };

const storeSelect = { id: true, code: true, name: true, suburb: true, city: true } as const;

/** Trading retail stores the user may pair a till to (their scope; managers: their own store). */
export async function pairableStores(user: { role: Role; storeId: string | null; companyId: string | null; regionId: string | null }): Promise<PairableStore[]> {
  if (!PAIR_ROLES.includes(user.role)) return [];
  return db.store.findMany({
    where: { AND: [storeWhere(scopeOf(user)), { kind: "RETAIL", status: "ACTIVE" }] },
    select: storeSelect,
    orderBy: { code: "asc" },
  });
}

export const demoStores = () =>
  db.store.findMany({ where: { kind: "RETAIL", status: "ACTIVE" }, select: storeSelect, orderBy: { code: "asc" } });

/**
 * Verifies a manager's email + password for pairing: the same limits as signing in (wrong ones count towards the
 * account's lockout and the connection's), and someone still on a temporary password chooses their own first.
 */
export async function verifyPairingUser(email: string, password: string) {
  const from = await signInKey();
  if (await ipLocked(from)) throw new PosError(IP_LOCKED, 429);
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase().slice(0, 254) } });
  if (user && isLocked(user, "password")) throw new PosError("Too many attempts — try again in 15 minutes", 429);
  const right = await verifySecret(password, user?.passwordHash ?? NO_HASH);
  if (!user?.active || !right) {
    await recordIpFailure(from);
    if (user) {
      const who = { type: "USER" as const, id: user.id, name: user.name };
      await audit(db, who, "auth.failed", { storeId: user.storeId, entity: "User", entityId: user.id, data: { via: "till pairing", reason: right ? "account switched off" : "wrong password" } });
      if (!right && (await recordFailure(user.id, "password"))) await audit(db, who, "auth.lockout", { storeId: user.storeId, entity: "User", entityId: user.id, data: { via: "till pairing" } });
    }
    throw new PosError("That email and password don't match", 401);
  }
  if (user.passwordFails) await clearFailures(user.id, "password");
  if (user.mustChangePassword) throw new PosError("Choose your own password first — sign in at /login", 403);
  await upgradeHash(user.id, "passwordHash", user.passwordHash, password);
  if (!PAIR_ROLES.includes(user.role)) throw new PosError("Only a store manager, owner or HQ can pair a till", 403);
  return user;
}

export async function pairTill(opts: { storeId: string; name: string; actor: Actor; previous: PosDevice | null }) {
  const store = await db.store.findFirst({ where: { id: opts.storeId, kind: "RETAIL", status: "ACTIVE" }, select: { id: true, code: true, name: true } });
  if (!store) throw new PosError("That store isn't trading", 404);
  if (opts.previous) {
    await db.device.update({ where: { id: opts.previous.id }, data: { active: false } });
    await audit(db, opts.actor, "device.unpair", { storeId: opts.previous.storeId, entity: "Device", entityId: opts.previous.id, data: { reason: "re-paired" } });
  }
  await endSession("pos");
  const device = await pairDevice(store.id, opts.name.trim() || "Counter");
  await audit(db, opts.actor, "device.pair", { storeId: store.id, entity: "Device", entityId: device.id, data: { name: device.name, prefix: device.prefix } });
  return { device, store };
}

