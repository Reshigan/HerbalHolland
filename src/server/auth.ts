import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import type { Role } from "@/generated/prisma/client";

export { hashSecret, verifySecret, sha256, newToken } from "./crypto";
import { sha256, newToken } from "./crypto";

// ── Cookies & sessions ───────────────────────────────────────────────────────
export const COOKIE = { staff: "hh_staff", pos: "hh_pos", device: "hh_device", customer: "hh_customer" } as const;

const cookieOpts = (maxAgeSec: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeSec,
});

export async function startSession(
  name: keyof typeof COOKIE,
  who: { userId?: string; customerId?: string; storeId?: string; deviceId?: string },
  hours: number,
) {
  const token = newToken();
  await db.session.create({ data: { id: sha256(token), ...who, expiresAt: new Date(Date.now() + hours * 3_600_000) } });
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
export const getStaff = cache(async () => {
  const s = await readSession("staff");
  if (!s?.userId) return null;
  const user = await db.user.findUnique({
    where: { id: s.userId },
    include: { company: true, store: true, region: true },
  });
  return user?.active ? user : null;
});
export type Staff = NonNullable<Awaited<ReturnType<typeof getStaff>>>;

export async function requireStaff(roles?: Role[]) {
  const user = await getStaff();
  if (!user) redirect("/login");
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

// ── Customers (storefront, Oranje Club) ──────────────────────────────────────
export const getCustomer = cache(async () => {
  const s = await readSession("customer");
  if (!s?.customerId) return null;
  return db.customer.findUnique({ where: { id: s.customerId } });
});

/** Where a staff member lands after signing in. */
export async function homeFor(u: { role: Role; storeId: string | null; companyId: string | null }) {
  if (isHq(u)) return "/hq";
  if (u.role === "BUDTENDER") return "/pos";
  const store = u.storeId
    ? await db.store.findUnique({ where: { id: u.storeId }, select: { code: true } })
    : await db.store.findFirst({ where: { companyId: u.companyId ?? "", kind: "RETAIL", status: "ACTIVE" }, orderBy: { code: "asc" }, select: { code: true } });
  return store ? `/store/${store.code}` : "/login?nostore=1";
}
