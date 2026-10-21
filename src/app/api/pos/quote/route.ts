// Authoritative basket price for the till: price rules, member/volume prices, near-expiry
// markdowns, promotions, the member's My Deals and welcome gift, and "complete the deal"
// suggestions (domain: pricing.quote). An empty basket with a member still returns their
// suggestions, so the till can offer a first-time member's welcome gift straight away.
// Trade-sale mode (`tradeAccountId`): the WHOLESALE quote for the account instead (ex-VAT trade prices with VAT per
// line, no member prices, points or My Deals), plus the trade basket rule's verdict on every line.
import { z } from "zod";
import { quote } from "@/server/pricing";
import { isOffer } from "@/server/offers";
import { getSettings } from "@/server/settings";
import { checkTradeBasket } from "@/server/compliance";
import { db } from "@/server/db";
import { json, readBody, withStaff, PosError, type PosStaff } from "@/server/pos/http";
import { Items } from "@/server/pos/schemas";
import { pointsFor, type TierKey } from "@/lib/loyalty-rules";
import { ACCOUNT_STATUS_PROBLEM } from "@/lib/trade";
import type { QuoteDTO } from "@/server/pos/types";
import { asList } from "@/lib/json-list";

const Body = z.object({
  items: Items,
  code: z.string().trim().max(40).nullish(),
  customerId: z.string().nullish(),
  tradeAccountId: z.string().nullish(),
});

export const POST = withStaff(async (req, pos) => {
  const b = await readBody(req, Body);
  if (b.tradeAccountId) return json(await tradeQuote(pos, { items: b.items, code: b.code || null, tradeAccountId: b.tradeAccountId }));
  const [q, customer, settings] = await Promise.all([
    quote({ storeId: pos.device.storeId, channel: "POS", items: b.items, code: b.code || null, customerId: b.customerId }),
    b.customerId ? db.customer.findUnique({ where: { id: b.customerId }, select: { tier: true } }) : null,
    getSettings(),
  ]);
  const earnable = q.lines.filter((l) => !l.noEarn).reduce((s, l) => s + l.totalCents, 0);
  const names = new Map(q.applied.map((a) => [a.id, a.name]));
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
      exCents: l.exCents,
      promoId: l.promoId,
      noEarn: l.noEarn,
      memberSavingsCents: l.memberSavingsCents,
      offerCents: l.offerCents,
      offerName: l.offerCents ? ((isOffer(l.promoId) && names.get(l.promoId!)) || "My Deals") : null,
    })),
    subtotalCents: q.subtotalCents,
    discountCents: q.discountCents,
    offerCents: q.lines.reduce((s, l) => s + l.offerCents, 0),
    totalCents: q.totalCents,
    vatCents: q.vatCents,
    pointsMultiplier: q.pointsMultiplier,
    applied: q.applied,
    suggestions: q.suggestions,
    codeError: q.codeError,
    memberSavingsCents: q.memberSavingsCents,
    joinSavingsCents: q.joinSavingsCents,
    pointsEstimate: customer ? pointsFor(earnable, customer.tier as TierKey, q.pointsMultiplier, settings.loyalty.earnPer100) : 0,
  };
  return json(dto);
});

/**
 * The trade-sale quote: the WHOLESALE engine for the account (its own TRADE list first), the trade basket rule with
 * HQ's settings (classes the account may buy, the store's licences, THC never). Each blocked line carries its reason
 * so the basket can say why, and the sale would be refused the same way when it posts (sales.postTradeSale).
 */
async function tradeQuote(pos: PosStaff, b: { items: { variantId: string; qty: number }[]; code: string | null; tradeAccountId: string }): Promise<QuoteDTO> {
  const account = await db.tradeAccount.findUnique({ where: { id: b.tradeAccountId }, select: { id: true, status: true, classes: true } });
  if (!account) throw new PosError("Unknown trade account", 404);
  if (account.status !== "APPROVED" && account.status !== "ON_HOLD") throw new PosError(ACCOUNT_STATUS_PROBLEM[account.status as keyof typeof ACCOUNT_STATUS_PROBLEM], 422);
  const q = await quote({ storeId: pos.device.storeId, channel: "WHOLESALE", items: b.items, code: b.code, tradeAccountId: account.id });
  const comp = await checkTradeBasket({ items: q.lines.map((l) => ({ name: l.name, regClass: l.regClass })), accountClasses: asList(account.classes), storeLicences: asList(pos.device.store.licences) });
  // The rule names the line at the start of each message ("<product · variant> is …").
  const blockOf = (name: string) => comp.blocks.find((m) => m.startsWith(`${name} `)) ?? null;
  return {
    lines: q.lines.map((l) => ({
      variantId: l.variantId,
      qty: l.qty,
      unitPriceCents: l.unitPriceCents, // ex VAT
      shelfCents: l.shelfCents,
      rrpCents: l.rrpCents,
      priceRule: l.priceRule,
      grossCents: l.grossCents,
      discountCents: l.discountCents,
      totalCents: l.totalCents, // ex + VAT
      vatCents: l.vatCents,
      exCents: l.exCents,
      promoId: l.promoId,
      noEarn: true,
      memberSavingsCents: 0,
      offerCents: 0,
      offerName: null,
      blocked: blockOf(l.name),
    })),
    subtotalCents: q.subtotalCents,
    discountCents: q.discountCents,
    offerCents: 0,
    totalCents: q.totalCents,
    vatCents: q.vatCents,
    pointsMultiplier: 1,
    applied: q.applied,
    suggestions: [], // "complete the deal" nudges are consumer promotions
    codeError: q.codeError,
    memberSavingsCents: 0,
    joinSavingsCents: 0,
    pointsEstimate: 0,
    exCents: q.exCents ?? q.totalCents - q.vatCents,
    tradeAccountId: account.id,
    blocks: comp.blocks,
  };
}
