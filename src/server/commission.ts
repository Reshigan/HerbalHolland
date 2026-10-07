// Staff commission, switched on per store by the owner (the employer, who pays it): HQ's rates × each person's net
// till sales ex VAT, less refunds of their sales (whoever processes the refund), never below zero for the month. A sale
// a dispenser completed for someone else (Sale.soldById) is the seller's: the dispenser stays on it as staff.
// None on medicines (Medicines Act s18A: licensed, and the noIncentives classes) or on sales rung onto their own member
// card; anyone with an open loss-prevention alert at the store is held until it's closed. An owner's approval freezes
// the month for payroll.
import { db } from "./db";
import { audit, type Actor } from "./audit";
import { getSettings } from "./settings";
import { commissionCents } from "@/lib/commission";
import { incentiveExcluded, type RegClass } from "@/lib/compliance";
import { dayKey } from "@/lib/format";
import { Prisma } from "@/generated/prisma/client";

export class CommissionError extends Error {}

export type CommissionLine = { userId: string; name: string; salesCents: number; refundsCents: number; commissionCents: number; held: boolean };

export const thisMonth = (now = new Date()) => dayKey(now).slice(0, 7);
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(`${month}-01T00:00:00+02:00`), end: new Date(`${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}-01T00:00:00+02:00`) };
}

export async function monthCommission(storeId: string, month: string, onlyUserId?: string): Promise<CommissionLine[]> {
  const { start, end } = monthRange(month);
  const { commission, compliance } = await getSettings();
  const excluded = incentiveExcluded(compliance);
  // A sale is the seller's (soldById, else whoever rang it up); a refund counts against whoever made the original sale;
  // sales on the seller's own member card don't count at all.
  const rows = await db.$queryRaw<{ userId: string; regClass: RegClass; sold: number; refunded: number }[]>`
    SELECT COALESCE(o."soldById", o."staffId", s."soldById", s."staffId") AS "userId", p."regClass"::text AS "regClass",
      COALESCE(SUM(l."totalCents" - l."vatCents") FILTER (WHERE s.kind = 'SALE'), 0)::int AS sold,
      COALESCE(SUM(l."totalCents" - l."vatCents") FILTER (WHERE s.kind = 'REFUND'), 0)::int AS refunded
    FROM "Sale" s
    JOIN "SaleLine" l ON l."saleId" = s.id JOIN "Variant" v ON v.id = l."variantId" JOIN "Product" p ON p.id = v."productId"
    LEFT JOIN "Sale" o ON o.id = s."refundOfId"
    JOIN "User" u ON u.id = COALESCE(o."soldById", o."staffId", s."soldById", s."staffId")
    WHERE s."storeId" = ${storeId} AND s.channel = 'POS' AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
      AND COALESCE(o."customerId", s."customerId") IS DISTINCT FROM u."memberId"
      ${onlyUserId ? Prisma.sql`AND u.id = ${onlyUserId}` : Prisma.empty}
    GROUP BY 1, 2`;
  const ids = [...new Set(rows.map((r) => r.userId))];
  const [users, open] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    db.alert.findMany({ where: { storeId, userId: { in: ids }, status: { in: ["OPEN", "INVESTIGATING"] } }, select: { userId: true } }),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const held = new Set(open.map((a) => a.userId));
  return ids
    .map((id) => {
      const mine = rows.filter((r) => r.userId === id && !excluded.includes(r.regClass));
      const lines = mine.flatMap((r) => [{ regClass: r.regClass, netCents: r.sold }, { regClass: r.regClass, netCents: r.refunded }]);
      return {
        userId: id,
        name: name.get(id) ?? "Former staff",
        salesCents: mine.reduce((t, r) => t + r.sold, 0),
        refundsCents: mine.reduce((t, r) => t + r.refunded, 0),
        commissionCents: Math.max(0, commissionCents(lines, commission.bps, excluded)),
        held: held.has(id),
      };
    })
    .sort((a, b) => b.commissionCents - a.commissionCents);
}

export async function approveMonth(storeId: string, month: string, actor: Actor & { id: string }) {
  if (month >= thisMonth()) throw new CommissionError("A month can be approved once it has ended");
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId }, select: { commissionOn: true } });
  if (!store.commissionOn) throw new CommissionError("Commission isn't switched on for this store");
  if (await db.commissionRun.findUnique({ where: { storeId_month: { storeId, month } } })) throw new CommissionError(`${month} is already approved`);
  const lines = await monthCommission(storeId, month);
  const totalCents = lines.filter((l) => !l.held).reduce((t, l) => t + l.commissionCents, 0);
  const run = await db.commissionRun.create({ data: { storeId, month, totalCents, lines, approvedById: actor.id } });
  await audit(db, actor, "commission.approve", { storeId, entity: "CommissionRun", entityId: run.id, data: { month, totalCents, people: lines.length, held: lines.filter((l) => l.held).length } });
  return run;
}

/** Pays a held line once the person's alerts at the store are closed. */
export async function releaseHeld(storeId: string, month: string, userId: string, actor: Actor & { id: string }) {
  const run = await db.commissionRun.findUnique({ where: { storeId_month: { storeId, month } } });
  const lines = (run?.lines ?? []) as CommissionLine[];
  const line = lines.find((l) => l.userId === userId && l.held);
  if (!run || !line) throw new CommissionError("Nothing held for this person in that month");
  if (await db.alert.count({ where: { storeId, userId, status: { in: ["OPEN", "INVESTIGATING"] } } })) throw new CommissionError(`Close ${line.name}'s open alerts first`);
  line.held = false;
  await db.commissionRun.update({ where: { id: run.id }, data: { lines, totalCents: run.totalCents + line.commissionCents } });
  await audit(db, actor, "commission.release", { storeId, entity: "CommissionRun", entityId: run.id, data: { month, userId, commissionCents: line.commissionCents } });
}

/** The till's "my commission this month" (null when the store doesn't pay commission). */
export async function tillCommission(storeId: string, userId: string) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { commissionOn: true } });
  if (!store?.commissionOn) return null;
  const [line] = await monthCommission(storeId, thisMonth(), userId);
  return { month: thisMonth(), commissionCents: line?.commissionCents ?? 0, held: line?.held ?? false };
}
