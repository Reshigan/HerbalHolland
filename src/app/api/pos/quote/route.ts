// Authoritative basket price for the till: price rules, member/volume prices, near-expiry
// markdowns, promotions and "complete the deal" suggestions (domain: pricing.quote).
import { z } from "zod";
import { quote } from "@/server/pricing";
import { getSettings } from "@/server/settings";
import { db } from "@/server/db";
import { json, readBody, withStaff } from "@/server/pos/http";
import { Items } from "@/server/pos/schemas";
import { pointsFor, type TierKey } from "@/lib/loyalty-rules";
import type { QuoteDTO } from "@/server/pos/types";

const Body = z.object({
  items: Items,
  code: z.string().trim().max(40).nullish(),
  customerId: z.string().nullish(),
});

export const POST = withStaff(async (req, pos) => {
  const b = await readBody(req, Body);
  const [q, customer, settings] = await Promise.all([
    quote({ storeId: pos.device.storeId, channel: "POS", items: b.items, code: b.code || null, customerId: b.customerId }),
    b.customerId ? db.customer.findUnique({ where: { id: b.customerId }, select: { tier: true } }) : null,
    getSettings(),
  ]);
  const earnable = q.lines.filter((l) => !l.noEarn).reduce((s, l) => s + l.totalCents, 0);
  const dto: QuoteDTO = {
    lines: q.lines.map((l) => ({
      variantId: l.variantId,
      qty: l.qty,
      unitPriceCents: l.unitPriceCents,
      shelfCents: l.shelfCents,
      rrpCents: l.rrpCents,
      priceRule: l.priceRule,
      grossCents: l.grossCents,
      discountCents: l.discountCents,
      totalCents: l.totalCents,
      vatCents: l.vatCents,
      promoId: l.promoId,
      noEarn: l.noEarn,
    })),
    subtotalCents: q.subtotalCents,
    discountCents: q.discountCents,
    totalCents: q.totalCents,
    vatCents: q.vatCents,
    pointsMultiplier: q.pointsMultiplier,
    applied: q.applied,
    suggestions: q.suggestions,
    codeError: q.codeError,
    pointsEstimate: customer ? pointsFor(earnable, customer.tier as TierKey, q.pointsMultiplier, settings.loyalty.earnPer100) : 0,
  };
  return json(dto);
});
