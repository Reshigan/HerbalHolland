// Member lookup at the till: search by phone, name or member number (or a scanned
// member QR), and the detail panel (tier, Guilders, age check, patient authorisation).
import { db } from "@/server/db";
import { customerContext } from "@/server/compliance";
import { normalisePhone } from "@/lib/sa";
import { maskPhone, memberNoFrom } from "@/components/pos/lib/rules";
import { PosError } from "./http";
import type { CustomerDetail, CustomerHit, TierKey, AgeCheckKind } from "./types";

export async function searchCustomers(raw: string): Promise<CustomerHit[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  const memberNo = memberNoFrom(q);
  const phone = normalisePhone(q);
  const digits = q.replace(/\D/g, "");
  const words = q.split(/\s+/).filter(Boolean);
  const where = memberNo
    ? { memberNo }
    : phone
      ? { phone }
      : /^\d{4,9}$/.test(digits) && digits.length === q.replace(/\s/g, "").length
        ? { phone: { endsWith: digits } }
        : q.includes("@")
          ? { email: q.toLowerCase() }
          : words.length > 1
            ? { firstName: { startsWith: words[0], mode: "insensitive" as const }, lastName: { startsWith: words.slice(1).join(" "), mode: "insensitive" as const } }
            : { OR: [{ firstName: { startsWith: q, mode: "insensitive" as const } }, { lastName: { startsWith: q, mode: "insensitive" as const } }] };
  const rows = await db.customer.findMany({
    where,
    take: 8,
    orderBy: [{ lastPurchaseAt: { sort: "desc", nulls: "last" } }],
    select: {
      id: true, memberNo: true, firstName: true, lastName: true, phone: true, tier: true, points: true,
      patientAuths: { where: { status: "ACTIVE", validFrom: { lte: new Date() }, validTo: { gte: new Date() } }, select: { id: true }, take: 1 },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    memberNo: c.memberNo,
    name: [c.firstName, c.lastName].filter(Boolean).join(" "),
    phone: maskPhone(c.phone),
    tier: c.tier as TierKey,
    points: c.points,
    patient: c.patientAuths.length > 0,
  }));
}

export async function customerDetail(id: string): Promise<CustomerDetail> {
  const ctx = await customerContext(id);
  const c = ctx.record;
  if (!c) throw new PosError("Member not found", 404);
  const home = c.homeStoreId ? await db.store.findUnique({ where: { id: c.homeStoreId }, select: { name: true } }) : null;
  const auth = "auth" in ctx ? ctx.auth : null;
  return {
    id: c.id,
    memberNo: c.memberNo,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: maskPhone(c.phone),
    email: c.email,
    tier: c.tier as TierKey,
    points: c.points,
    ageCheck: c.ageCheck as AgeCheckKind,
    ageVerified: !!c.ageVerifiedAt,
    age: ctx.customer?.age ?? null,
    homeStore: home?.name ?? null,
    visits: c.visits,
    lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
    patient: auth
      ? {
          authNumber: auth.authNumber,
          prescriber: auth.prescriber,
          prescriberRegNo: auth.prescriberRegNo,
          scope: auth.scope,
          monthlyLimitGrams: auth.monthlyLimitGrams,
          remainingGrams: ctx.customer?.patient?.remainingGrams ?? 0,
          validTo: auth.validTo.toISOString(),
        }
      : null,
  };
}
