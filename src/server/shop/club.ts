// Herbal Holland Rewards member views: card, tier progress, points ledger, orders, invoices,
// marketing preferences and patient-authorisation status. Always scoped to the
// signed-in member — callers pass the id from the session, never from the client.
import { db } from "@/server/db";
import { spend12m } from "@/server/loyalty";
import { customerContext } from "@/server/compliance";
import { invoiceUrl } from "@/server/invoices";
import { nextTier, tierFor, TIERS } from "@/lib/loyalty-rules";

/** Position of a tier on the ladder (driven by TIERS, so renamed tiers still resolve to a rung). */
export function tierIndex(key: string) {
  const i = TIERS.findIndex((t) => t.key === key);
  return i >= 0 ? i : key === "SEED" ? 0 : TIERS.length - 1;
}
export const tierMeta = (key: string) => TIERS[tierIndex(key)];

export const LEDGER_LABEL: Record<string, string> = {
  EARN: "Earned", REDEEM: "Redeemed", SIGNUP: "Welcome bonus", REFERRAL: "Referral bonus", BIRTHDAY: "Birthday bonus",
  BONUS: "Bonus", REVERSAL: "Reversal", EXPIRE: "Expired", ADJUST: "Adjustment",
};

export async function memberOverview(customerId: string) {
  const [customer, spend, ledger, orders, ctx, referrals, saved] = await Promise.all([
    db.customer.findUniqueOrThrow({ where: { id: customerId }, include: { homeStore: { select: { name: true, slug: true, code: true } } } }),
    spend12m(db, customerId),
    db.loyaltyEntry.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 6, include: { store: { select: { name: true } } } }),
    db.order.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 3, include: { store: { select: { name: true } }, _count: { select: { lines: true } } } }),
    customerContext(customerId),
    db.customer.count({ where: { referredById: customerId } }),
    db.sale.aggregate({ where: { customerId }, _sum: { memberSavingsCents: true } }),
  ]);
  // Tiers are re-assessed on every purchase against rolling 12-month spend. If spend has
  // slipped below the member's current tier, show what it takes to keep it rather than the next rung.
  const held = tierIndex(customer.tier);
  const earned = tierIndex(tierFor(spend).key);
  const n = nextTier(spend);
  const goal =
    earned < held
      ? { mode: "keep" as const, tier: TIERS[held], remainingCents: TIERS[held].minCents - spend }
      : n
        ? { mode: "reach" as const, tier: n.tier, remainingCents: n.remainingCents }
        : null;
  return { customer, spend, goal, tier: tierMeta(customer.tier), ledger, orders, auth: ctx.auth ?? null, patient: ctx.customer?.patient ?? null, referrals, savedCents: saved._sum.memberSavingsCents ?? 0 };
}

/** Human title for a points ledger row. */
export function ledgerTitle(e: { kind: string; note: string | null; orderId: string | null; store: { name: string } | null }) {
  if (e.note) return e.note;
  const where = e.store ? ` at ${e.store.name}` : "";
  if (e.kind === "EARN") return e.orderId ? `Online order${where}` : `Purchase${where}`;
  if (e.kind === "REDEEM") return e.orderId ? "Spent on an online order" : `Spent${where}`;
  return `${LEDGER_LABEL[e.kind] ?? e.kind}${where}`;
}

export async function memberLedger(customerId: string, page: number, pageSize = 20) {
  const where = { customerId };
  const [rows, total] = await Promise.all([
    db.loyaltyEntry.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { store: { select: { name: true } } } }),
    db.loyaltyEntry.count({ where }),
  ]);
  return { rows, total };
}

export async function memberOrders(customerId: string, page: number, pageSize = 10) {
  const where = { customerId };
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { store: { select: { name: true } }, lines: { take: 3, include: { variant: { include: { product: { select: { name: true, slug: true, strain: true, regClass: true } } } } } }, _count: { select: { lines: true } } },
    }),
    db.order.count({ where }),
  ]);
  return { rows, total };
}

export async function memberInvoices(customerId: string, page: number, pageSize = 12) {
  const where = { customerId };
  const [rows, total] = await Promise.all([
    db.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, number: true, kind: true, channel: true, totalCents: true, vatCents: true, pointsEarned: true, createdAt: true, invoiceSentAt: true, invoiceEmail: true,
        store: { select: { name: true, company: { select: { vatNumber: true } } } },
        _count: { select: { lines: true } },
      },
    }),
    db.sale.count({ where }),
  ]);
  return { rows: rows.map((r) => ({ ...r, url: invoiceUrl(r.id), title: r.kind === "REFUND" ? (r.store.company.vatNumber ? "Credit note" : "Refund") : r.store.company.vatNumber ? "Tax invoice" : "Invoice" })), total };
}

/** Latest consent event per channel — the evidence trail behind each toggle (POPIA s69). */
export async function consentTrail(customerId: string) {
  const rows = await db.consentEvent.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 40 });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.channel)) latest.set(r.channel, r);
  return latest;
}
