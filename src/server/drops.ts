// Drops: limited releases with member-only access, tier early access and per-member limits (src/lib/drops.ts).
// Limits are enforced where money changes hands: placeOrder and postPosSale.
import { db } from "./db";
import { OPEN_ORDER_STATUSES } from "./inventory";
import { sendBulk } from "./messaging";
import { APP_URL } from "./invoices";
import { dropBlock, opensFor } from "@/lib/drops";
import { tierRank, type TierKey } from "@/lib/loyalty-rules";
import { marketingWindow } from "@/lib/sa";
import type { Drop } from "@/generated/prisma/client";

/** Drops that still govern any of these variants (not ended). */
export function dropsFor(variantIds: string[], at = new Date()) {
  return db.drop.findMany({ where: { variantIds: { hasSome: variantIds }, OR: [{ endsAt: null }, { endsAt: { gt: at } }] }, orderBy: { startsAt: "asc" } });
}

/** Units of a drop this member already bought or has on open orders. */
async function boughtInDrop(customerId: string, d: Drop) {
  const since = opensFor(d, "HARVEST"); // the earliest anyone could buy
  const [sold, open] = await Promise.all([
    db.saleLine.aggregate({ where: { variantId: { in: d.variantIds }, sale: { customerId, kind: "SALE", createdAt: { gte: since } } }, _sum: { qty: true } }),
    db.orderLine.aggregate({ where: { variantId: { in: d.variantIds }, order: { customerId, status: { in: [...OPEN_ORDER_STATUSES] }, createdAt: { gte: since } } }, _sum: { qty: true } }),
  ]);
  return (sold._sum.qty ?? 0) + (open._sum.qty ?? 0);
}

/** Reasons this basket can't be bought now because of drop rules (empty = fine). */
export async function dropBlocks(customerId: string | null | undefined, lines: { variantId: string; qty: number }[], at = new Date()) {
  const drops = await dropsFor(lines.map((l) => l.variantId), at);
  if (!drops.length) return [];
  const c = customerId ? await db.customer.findUnique({ where: { id: customerId }, select: { tier: true } }) : null;
  const blocks: string[] = [];
  for (const d of drops) {
    const qty = lines.filter((l) => d.variantIds.includes(l.variantId)).reduce((s, l) => s + l.qty, 0);
    const bought = qty && c ? await boughtInDrop(customerId!, d) : 0;
    const why = qty ? dropBlock(d, { member: !!c, tier: (c?.tier as TierKey) ?? null, bought }, qty, at) : null;
    if (why) blocks.push(why);
  }
  return blocks;
}

export const watchDrop = (dropId: string, customerId: string) =>
  db.dropWatch.upsert({ where: { dropId_customerId: { dropId, customerId } }, create: { dropId, customerId }, update: {} });

/** Scheduler: tells watchers when the drop opens for them: early-access tiers first, then everyone. */
export async function notifyDrops(now = new Date()) {
  if (!marketingWindow(now).allowed) return { sent: 0 }; // CPA Reg 4: wait for the next allowed contact slot
  const drops = await db.drop.findMany({
    where: { OR: [{ notifiedAt: null, startsAt: { lte: now } }, { notifiedEarlyAt: null, earlyTier: { not: null }, earlyMinutes: { gt: 0 } }] },
  });
  let sent = 0;
  for (const d of drops) {
    const early = !!d.earlyTier && !d.notifiedEarlyAt && opensFor(d, d.earlyTier as TierKey) <= now && now < d.startsAt;
    if (!early && (d.notifiedAt || d.startsAt > now)) continue;
    const watchers = await db.dropWatch.findMany({
      where: { dropId: d.id },
      select: { customer: { select: { id: true, phone: true, tier: true, consentSms: true, pushSubs: { select: { id: true }, take: 1 } } } },
    });
    const earlyOk = (t: string) => !!d.earlyTier && tierRank(t as TierKey) >= tierRank(d.earlyTier as TierKey);
    // Early pass: eligible tiers only. Main pass: everyone not already told in the early pass.
    const who = watchers.map((w) => w.customer).filter((c) => (early ? earlyOk(c.tier) : !(d.notifiedEarlyAt && earlyOk(c.tier))));
    const body = `${d.name} is ${early ? "open early for you" : "live now"}. Limit ${d.perMemberLimit} per member.`;
    const url = `${APP_URL()}/drops/${d.slug}`;
    const push = who.filter((c) => c.pushSubs.length);
    const sms = who.filter((c) => !c.pushSubs.length && c.consentSms);
    for (let i = 0; i < push.length; i += 500)
      sent += await sendBulk(push.slice(i, i + 500).map((c) => ({ customerId: c.id, to: c.id, channel: "PUSH" as const, subject: "Herbal Holland drop", body, url })), "TRANSACTIONAL");
    for (let i = 0; i < sms.length; i += 500)
      sent += await sendBulk(sms.slice(i, i + 500).map((c) => ({ customerId: c.id, to: c.phone, channel: "SMS" as const, body: `Herbal Holland: ${body} ${url}` })), "TRANSACTIONAL");
    await db.drop.update({ where: { id: d.id }, data: early ? { notifiedEarlyAt: now } : { notifiedAt: now } });
  }
  return { sent };
}
