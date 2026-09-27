// Owned-channel marketing with compliance built in: POPIA s69 consent per channel,
// do-not-contact suppression (NCC opt-out registry), CPA Regulation 4 send windows,
// copy screening and a full sender footer on every message.
import { db } from "./db";
import { sendBulk } from "./messaging";
import { audit, type Actor } from "./audit";
import { marketingWindow, nextMarketingSlot } from "@/lib/sa";
import { addDays } from "@/lib/format";
import { SEGMENTS, type SegmentKey } from "@/lib/rfm";
import { screenCopy } from "@/lib/compliance";
import { guilders } from "@/lib/loyalty-rules";
import type { MsgChannel, Prisma, Tier } from "@/generated/prisma/client";

export const CONSENT_FIELD = { WHATSAPP: "consentWhatsapp", SMS: "consentSms", EMAIL: "consentEmail", PUSH: "consentPush" } as const;

export class CampaignError extends Error {}

/** SQL twin of lib/rfm segmentOf — kept in the same precedence order. */
export function segmentWhere(segment: string, now = new Date()): Prisma.CustomerWhereInput {
  const d = (n: number) => addDays(now, -n);
  const champion: Prisma.CustomerWhereInput = { lastPurchaseAt: { gte: d(30) }, visits: { gte: 10 } };
  const isNew: Prisma.CustomerWhereInput = { firstPurchaseAt: { gte: d(30) }, visits: { gte: 1, lte: 2 } };
  switch (segment) {
    case "ALL":
      return {};
    case "PROSPECT":
      return { visits: 0 };
    case "CHAMPION":
      return champion;
    case "NEW":
      return { AND: [isNew, { NOT: champion }] };
    case "LOYAL":
      return { AND: [{ lastPurchaseAt: { gte: d(60) }, visits: { gte: 5 } }, { NOT: champion }, { NOT: isNew }] };
    case "PROMISING":
      return {
        AND: [
          { visits: { gte: 1 } },
          { NOT: isNew },
          { OR: [{ lastPurchaseAt: { gte: d(60) }, visits: { lt: 5 } }, { lastPurchaseAt: { gte: d(120), lt: d(60) }, visits: { lt: 3 } }] },
        ],
      };
    case "AT_RISK":
      return { lastPurchaseAt: { gte: d(120), lt: d(60) }, visits: { gte: 3 } };
    case "LAPSED":
      return { lastPurchaseAt: { lt: d(120) } };
    default:
      if (segment.startsWith("tier:")) return { tier: segment.slice(5) as Tier };
      return { id: "__none__" };
  }
}

export function segmentLabel(segment: string) {
  if (segment === "ALL") return "All members";
  if (segment.startsWith("tier:")) return `Tier: ${segment.slice(5).toLowerCase()}`;
  return SEGMENTS[segment as SegmentKey]?.name ?? segment;
}

const audienceWhere = (segment: string, storeId?: string | null): Prisma.CustomerWhereInput => ({
  AND: [segmentWhere(segment), storeId ? { homeStoreId: storeId } : {}],
});

export async function audienceSize(segment: string, channel: MsgChannel, storeId?: string | null) {
  const where = audienceWhere(segment, storeId);
  const [total, reachable] = await Promise.all([
    db.customer.count({ where }),
    db.customer.count({ where: { AND: [where, { [CONSENT_FIELD[channel]]: true }] } }),
  ]);
  return { total, reachable };
}

export async function senderFooter() {
  const hq = await db.company.findFirst({ where: { kind: "FRANCHISOR" } });
  return `\n— ${hq?.legalName ?? "Herbal Holland"}, ${hq?.address ?? ""}, ${hq?.phone ?? ""}, ${hq?.email ?? ""}. Reply STOP to opt out.`;
}

function render(tpl: string, c: { firstName: string; points: number }, code?: string | null) {
  return tpl
    .replaceAll("{{firstName}}", c.firstName)
    .replaceAll("{{points}}", guilders(c.points))
    .replaceAll("{{code}}", code ?? "");
}

export async function sendCampaign(id: string, actor: Actor, now = new Date()) {
  const c = await db.campaign.findUniqueOrThrow({ where: { id } });
  if (c.status === "SENT" || c.status === "CANCELLED") throw new CampaignError("This campaign has already been sent");
  const flags = screenCopy(c.message);
  if (flags.length) throw new CampaignError(`Copy needs changes: ${flags.map((f) => `"${f.term}" — ${f.reason}`).join("; ")}`);

  const window = marketingWindow(now);
  if (!window.allowed) {
    const at = nextMarketingSlot(now);
    await db.campaign.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: at } });
    return { sent: 0, suppressed: 0, audience: 0, scheduledAt: at, reason: window.reason };
  }

  const promo = c.promotionId ? await db.promotion.findUnique({ where: { id: c.promotionId } }) : null;
  const footer = await senderFooter();
  const field = CONSENT_FIELD[c.channel];
  const where = audienceWhere(c.segment, c.storeId);
  let cursor: string | undefined;
  let sent = 0, suppressed = 0, audience = 0;
  for (;;) {
    const batch = await db.customer.findMany({
      where,
      take: 500,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      orderBy: { id: "asc" },
      select: { id: true, firstName: true, phone: true, email: true, points: true, consentWhatsapp: true, consentSms: true, consentEmail: true, consentPush: true },
    });
    if (!batch.length) break;
    audience += batch.length;
    const contact = (b: (typeof batch)[number]) => (c.channel === "EMAIL" ? b.email : b.phone);
    const values = batch.map(contact).filter((v): v is string => !!v);
    const blocked = new Set(
      (await db.suppression.findMany({ where: { value: { in: values }, OR: [{ channel: null }, { channel: c.channel }] }, select: { value: true } })).map((s) => s.value),
    );
    const rows = batch.flatMap((b) => {
      const to = contact(b);
      if (!b[field] || !to || blocked.has(to)) {
        suppressed++;
        return [];
      }
      return [{ campaignId: c.id, customerId: b.id, to, channel: c.channel, body: render(c.message, b, promo?.code) + footer }];
    });
    await sendBulk(rows);
    sent += rows.length;
    cursor = batch[batch.length - 1].id;
  }
  await db.campaign.update({ where: { id }, data: { status: "SENT", sentAt: now, audienceCount: audience, sentCount: sent, suppressedCount: suppressed } });
  await audit(db, actor, "campaign.send", { storeId: c.storeId, entity: "Campaign", entityId: c.id, data: { sent, suppressed } });
  return { sent, suppressed, audience };
}

/** Called by the scheduler (cron/worker) to release campaigns held for a legal send window. */
export async function runDueCampaigns(now = new Date()) {
  const due = await db.campaign.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now } }, select: { id: true } });
  const results = [];
  for (const c of due) results.push(await sendCampaign(c.id, { type: "SYSTEM", name: "Scheduler" }, now));
  return results;
}

/** Last-touch attribution: sales stamped with the campaign (via its promo code or tracked link). */
export async function campaignResults(ids: string[]) {
  const rows = await db.sale.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids } }, _sum: { totalCents: true }, _count: true });
  return new Map(rows.map((r) => [r.campaignId!, { revenueCents: r._sum.totalCents ?? 0, orders: r._count }]));
}
