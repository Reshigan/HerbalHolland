import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import type { Role } from "@/generated/prisma/client";

export { hashSecret, verifySecret, sha256, newToken } from "./crypto";
import { sha256, newToken } from "./crypto";

// ── Cookies & sessions ───────────────────────────────────────────────────────
export const COOKIE = { staff: "hh_staff", pos: "hh_pos", device: "hh_device", customer: "hh_customer", trade: "hh_trade" } as const;

const cookieOpts = (maxAgeSec: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeSec,
});

export async function startSession(
  name: keyof typeof COOKIE,
  who: { userId?: string; customerId?: string; storeId?: string; deviceId?: string; tradeBuyerId?: string },
  hours: number,
) {
  const token = newToken();
  await db.session.create({ data: { id: sha256(token), ...who, expiresAt: new Date(Date.now() + hours * 3_600_000) } });
  if (who.userId) await db.user.update({ where: { id: who.userId }, data: { lastLoginAt: new Date() } });
  (await cookies()).set(COOKIE[name], token, cookieOpts(hours * 3600));
}

export async function endSession(name: keyof typeof COOKIE) {
  const jar = await cookies();
  const token = jar.get(COOKIE[name])?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(COOKIE[name]);
}

async function readSession(name: keyof typeof COOKIE) {
  const token = (await cookies()).get(COOKIE[name])?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sha256(token) } });
  if (!s || s.expiresAt < new Date()) return null;
  return s;
}

// ── Staff (back office, HQ) ──────────────────────────────────────────────────
/** The signed-in staff member, even one who must still choose their own password (only the password page wants that). */
export const getStaffChangingPassword = cache(async () => {
  const s = await readSession("staff");
  // A till's PIN session (it carries the device) only ever works at that till, never as a back-office sign-in.
  if (!s?.userId || s.deviceId) return null;
  const user = await db.user.findUnique({
    where: { id: s.userId },
    include: { company: true, store: true, region: true },
  });
  return user?.active ? user : null;
});
/** The signed-in staff member; nobody until a temporary password has been replaced. */
export const getStaff = cache(async () => {
  const user = await getStaffChangingPassword();
  return user && !user.mustChangePassword ? user : null;
});
export type Staff = NonNullable<Awaited<ReturnType<typeof getStaff>>>;

export async function requireStaff(roles?: Role[]) {
  const user = await getStaffChangingPassword();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password");
  if (roles && !roles.includes(user.role)) redirect("/login?denied=1");
  return user;
}

export const HQ_ROLES: Role[] = ["HQ_ADMIN", "HQ_STAFF", "AREA_MANAGER"];
export const isHq = (u: { role: Role }) => HQ_ROLES.includes(u.role);

// ── POS device + staff PIN ───────────────────────────────────────────────────
export const getDevice = cache(async () => {
  const token = (await cookies()).get(COOKIE.device)?.value;
  if (!token) return null;
  const d = await db.device.findUnique({ where: { tokenHash: sha256(token) }, include: { store: true } });
  return d?.active ? d : null;
});

export async function pairDevice(storeId: string, name: string) {
  const token = newToken();
  const used = new Set((await db.device.findMany({ where: { storeId }, select: { prefix: true } })).map((d) => d.prefix));
  const prefix = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("").find((p) => !used.has(p)) ?? `D${used.size}`;
  const device = await db.device.create({ data: { storeId, name, prefix, tokenHash: sha256(token) } });
  (await cookies()).set(COOKIE.device, token, cookieOpts(365 * 24 * 3600));
  return device;
}

export const getPosStaff = cache(async () => {
  const device = await getDevice();
  const s = await readSession("pos");
  if (!device || !s?.userId || s.deviceId !== device.id) return null;
  const user = await db.user.findUnique({ where: { id: s.userId } });
  return user?.active ? { user, device } : null;
});

// ── Customers (storefront, Herbal Holland Rewards) ──────────────────────────────────────
export const getCustomer = cache(async () => {
  const s = await readSession("customer");
  if (!s?.customerId) return null;
  return db.customer.findUnique({ where: { id: s.customerId } });
});

// ── Trade buyers (the trade portal, cookie hh_trade) ────────────────────────
export const TRADE_SESSION_HOURS = 12;

/**
 * The buyer a trade session token belongs to, with their account — null when the session is missing or expired, the
 * buyer was removed, or the account is closed. Every trade page and action starts here; mutations re-check the
 * account's status themselves (src/server/trade/*).
 */
export async function tradeBuyerForToken(token: string | null | undefined) {
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sha256(token) }, select: { tradeBuyerId: true, expiresAt: true } });
  if (!s?.tradeBuyerId || s.expiresAt < new Date()) return null;
  const buyer = await db.tradeBuyer.findUnique({ where: { id: s.tradeBuyerId }, include: { account: true } });
  return buyer?.active && buyer.account.status !== "CLOSED" ? buyer : null;
}
export type TradeBuyerSession = NonNullable<Awaited<ReturnType<typeof tradeBuyerForToken>>>;

export const getTradeBuyer = cache(async () => tradeBuyerForToken((await cookies()).get(COOKIE.trade)?.value));

/** Where a staff member lands after signing in. */
export async function homeFor(u: { role: Role; storeId: string | null; companyId: string | null }) {
  if (isHq(u)) return "/hq";
  if (u.role === "BUDTENDER") return "/pos";
  if (u.storeId) {
    const store = await db.store.findUnique({ where: { id: u.storeId }, select: { code: true } });
    return store ? `/store/${store.code}` : "/login?nostore=1";
  }
  // Owners land on all their stores together (a single-store owner just sees that store).
  const stores = await db.store.findMany({ where: { companyId: u.companyId ?? "", kind: "RETAIL", status: "ACTIVE" }, orderBy: { code: "asc" }, select: { code: true }, take: 2 });
  return stores.length ? `/store/${stores[0].code}${stores.length > 1 ? "?stores=company" : ""}` : "/login?nostore=1";
}
