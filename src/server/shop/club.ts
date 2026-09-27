// Herbal Holland Rewards member views: card, tier progress, points ledger, orders, invoices,
// marketing preferences and patient-authorisation status. Always scoped to the
// signed-in member — callers pass the id from the session, never from the client.
import { db } from "@/server/db";
import { spend12m } from "@/server/loyalty";
import { customerContext } from "@/server/compliance";
import { invoiceUrl } from "@/server/invoices";
import { nextTier, TIERS } from "@/lib/loyalty-rules";

/** Position of a tier on the ladder (driven by TIERS, so renamed tiers still resolve to a rung). */
export function tierIndex(key: string) {
  const i = TIERS.findIndex((t) => t.key === key);
  return i >= 0 ? i : key === "SEED" ? 0 : TIERS.length - 1;
}
export const tierMeta = (key: string) => TIERS[tierIndex(key)];

export async function memberOverview(customerId: string) {
  const [customer, spend, ledger, orders, ctx, referrals] = await Promise.all([
    db.customer.findUniqueOrThrow({ where: { id: customerId }, include: { homeStore: { select: { name: true, slug: true, code: true } } } }),
    spend12m(db, customerId),
    db.loyaltyEntry.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 6, include: { store: { select: { name: true } } } }),
    db.order.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 3, include: { store: { select: { name: true } }, _count: { select: { lines: true } } } }),
    customerContext(customerId),
    db.customer.count({ where: { referredById: customerId } }),
  ]);
  return { customer, spend, next: nextTier(spend), tier: tierMeta(customer.tier), ledger, orders, auth: ctx.auth ?? null, patient: ctx.customer?.patient ?? null, referrals };
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
