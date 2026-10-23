// Member lookup at the till: search by phone, name or member number (or a scanned
// member QR), and the detail panel (tier, points, age check, patient authorisation,
// Founding Member status, My Deals). Trading history is this store's only: visits and
// last visit count sales at the till's own store, never the rest of the network.
import { db } from "@/server/db";
import { customerContext } from "@/server/compliance";
import { activeOffers } from "@/server/offers";
import { normalisePhone } from "@/lib/sa";
import { maskPhone, memberNoFrom } from "@/components/pos/lib/rules";
import { PosError } from "./http";
import type { Prisma } from "@/generated/prisma/client";
import { holdingGuarantee } from "@/lib/referral-ladder";
import type { CustomerDetail, CustomerHit, TierKey, AgeCheckKind } from "./types";

/** Sales at this store per member: count + most recent (refunds excluded). */
async function visitsHere(storeId: string, customerIds: string[]) {
  if (!customerIds.length) return new Map<string, { visits: number; last: string | null }>();
  const rows = await db.sale.groupBy({
    by: ["customerId"],
    where: { storeId, kind: "SALE", customerId: { in: customerIds } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  return new Map(rows.map((r) => [r.customerId!, { visits: r._count._all, last: r._max.createdAt?.toISOString() ?? null }]));
}

export async function searchCustomers(raw: string, storeId: string): Promise<CustomerHit[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  const memberNo = memberNoFrom(q);
  const phone = normalisePhone(q);
  const digits = q.replace(/\D/g, "");
  const words = q.split(/\s+/).filter(Boolean);
  // Part of a mobile, from either end: "1234" (the last digits) or "063015" / "82555" (the start, as +27…).
  const prefix = digits.startsWith("0") ? `+27${digits.slice(1)}` : digits.startsWith("27") ? `+${digits}` : /^[6-8]/.test(digits) ? `+27${digits}` : null;
  const where = memberNo
    ? { memberNo }
    : phone
      ? { phone }
      : /^\d{4,9}$/.test(digits) && digits.length === q.replace(/\s/g, "").length
        ? { OR: [{ phone: { endsWith: digits } }, ...(prefix && prefix.length > 4 ? [{ phone: { startsWith: prefix } }] : [])] }
        : q.includes("@")
          ? { email: q.toLowerCase() }
          : words.length > 1
            ? { firstName: { startsWith: words[0] }, lastName: { startsWith: words.slice(1).join(" ") } }
            : { OR: [{ firstName: { startsWith: q } }, { lastName: { startsWith: q } }] };
  const find = (w: Prisma.CustomerWhereInput) =>
    db.customer.findMany({
      where: w,
      take: 8,
      orderBy: [{ lastPurchaseAt: { sort: "desc", nulls: "last" } }],
      select: {
        id: true, memberNo: true, firstName: true, lastName: true, phone: true, tier: true, points: true,
        patientAuths: { where: { status: "ACTIVE", validFrom: { lte: new Date() }, validTo: { gte: new Date() } }, select: { id: true }, take: 1 },
      },
    });
  // Members whose home store this is come first (a name search can match hundreds network-wide).
  const [local, all] = await Promise.all([find({ AND: [where, { homeStoreId: storeId }] }), find(where)]);
  const rows = [...local, ...all.filter((c) => !local.some((l) => l.id === c.id))].slice(0, 8);
  const here = await visitsHere(storeId, rows.map((c) => c.id));
  const hits = rows.map((c) => ({
    id: c.id,
    memberNo: c.memberNo,
    name: [c.firstName, c.lastName].filter(Boolean).join(" "),
    phone: maskPhone(c.phone),
    tier: c.tier as TierKey,
    points: c.points,
    patient: c.patientAuths.length > 0,
    visitsHere: here.get(c.id)?.visits ?? 0,
    lastVisitHere: here.get(c.id)?.last ?? null,
  }));
  // Most recent visitors here first (stable, so the rest keep their order).
  return hits.sort((a, b) => (b.lastVisitHere ?? "").localeCompare(a.lastVisitHere ?? ""));
}

export async function customerDetail(id: string, storeId: string): Promise<CustomerDetail> {
  const [ctx, here, offers] = await Promise.all([customerContext(id), visitsHere(storeId, [id]), activeOffers(id)]);
  const c = ctx.record;
  if (!c) throw new PosError("Member not found", 404);
  const home = c.homeStoreId ? await db.store.findUnique({ where: { id: c.homeStoreId }, select: { name: true } }) : null;
  const auth = "auth" in ctx ? ctx.auth : null;
  const hold = holdingGuarantee(c.tierFloor, c.tierFloorUntil, c.boostTier, c.boostUntil); // a founding floor or a referral boost
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
    visitsHere: here.get(id)?.visits ?? 0,
    lastVisitHere: here.get(id)?.last ?? null,
    foundingNo: c.foundingNo,
    tierFloor: hold ? { tier: hold.tier, until: hold.until.toISOString() } : null,
    offers: offers.map((o) => ({ id: o.id, title: o.title, endsAt: o.endsAt.toISOString() })),
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
