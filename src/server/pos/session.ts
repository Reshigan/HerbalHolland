// Till identity: which stores a signed-in manager may pair a device to, the staff tiles
// on the lock screen, and PIN sign-in (rate limited, audited).
import { db } from "@/server/db";
import { endSession, pairDevice, startSession, verifySecret, HQ_ROLES } from "@/server/auth";
import { audit, type Actor } from "@/server/audit";
import { scopeOf, storeWhere } from "@/server/scope";
import { PosError, limiter, type PosDevice } from "./http";
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

const pins = limiter(5, 5 * 60_000);

export async function pinSignIn(device: PosDevice, userId: string, pin: string) {
  const key = `${device.id}:${userId}`;
  if (pins.blocked(key)) throw new PosError("Too many wrong PINs — wait 5 minutes or ask your manager", 429);
  const user = await db.user.findFirst({ where: { id: userId, storeId: device.storeId, active: true } });
  if (!user?.pinHash) throw new PosError("That staff member can't use this till", 403);
  if (!/^\d{4,6}$/.test(pin) || !verifySecret(pin, user.pinHash)) {
    if (pins.fail(key))
      await audit(db, { type: "DEVICE", id: device.id, name: device.name }, "pos.pin_lockout", { storeId: device.storeId, entity: "User", entityId: user.id });
    throw new PosError("That PIN isn't right", 401, "BAD_PIN");
  }
  pins.reset(key);
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

const signIns = limiter(8, 15 * 60_000);

/** Verifies a manager's email + password for pairing. */
export async function verifyPairingUser(email: string, password: string) {
  const key = email.trim().toLowerCase();
  if (signIns.blocked(key)) throw new PosError("Too many attempts — try again in 15 minutes", 429);
  const user = await db.user.findUnique({ where: { email: key } });
  if (!user?.active || !verifySecret(password, user.passwordHash)) {
    signIns.fail(key);
    throw new PosError("That email and password don't match", 401);
  }
  signIns.reset(key);
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

export const isHqRole = (r: Role) => HQ_ROLES.includes(r);
