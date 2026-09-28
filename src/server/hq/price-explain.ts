// Pure explanation of a resolved price for the HQ pricing simulator: which price
// lists were considered, why each did or didn't apply, and which rule won. Mirrors
// the precedence in lib/pricing-rules (resolvePrice stays the single source of truth
// for the final number).
import { listApplies, resolvePrice, type PriceContext, type PriceListRule } from "@/lib/pricing-rules";
import { tierInfo } from "@/lib/loyalty-rules";

export type ExplainInput = { variantId: string; rrpCents: number; storeShelfCents?: number | null; qty: number; incentives: boolean };

export type ListVerdict = {
  id: string;
  name: string;
  kind: PriceListRule["kind"];
  applies: boolean;
  reason: string;
  priceCents: number | null; // this list's price for the variant at this quantity (null = no price for it)
  minQty: number;
  won: boolean;
};

export function whyNot(l: PriceListRule, c: PriceContext): string | null {
  if (!l.active) return "Switched off";
  if (l.startsAt && l.startsAt > c.at) return "Not started yet";
  if (l.endsAt && l.endsAt < c.at) return "Ended";
  if (l.channel && l.channel !== c.channel) return l.channel === "ONLINE" ? "Online only" : "In-store only";
  const everywhere = !l.storeIds.length && !l.regionIds.length;
  if (!everywhere && !((!!c.storeId && l.storeIds.includes(c.storeId)) || (!!c.regionId && l.regionIds.includes(c.regionId))))
    return c.storeId ? "Not for this store or region" : "Limited to specific stores";
  if (l.kind === "MEMBER") {
    if (!c.member) return "Members only";
    if (l.tiers.length && !(c.tier && l.tiers.includes(c.tier))) return "Not for this tier";
  }
  return null;
}

function priceAt(l: PriceListRule, variantId: string, rrp: number, qty: number) {
  const explicit = l.items.filter((i) => i.variantId === variantId && i.minQty <= qty).sort((a, b) => b.minQty - a.minQty)[0];
  if (explicit) return { price: explicit.priceCents, minQty: explicit.minQty };
  if (l.adjustPct != null) return { price: Math.round((rrp * (100 + l.adjustPct)) / 100), minQty: 1 };
  return null;
}

export function explainPrice(v: ExplainInput, lists: PriceListRule[], ctx: PriceContext) {
  const result = resolvePrice({ ...v, markdownPct: null }, lists, ctx);
  const ordered = [...lists].sort((a, b) => b.priority - a.priority || b.createdAt.getTime() - a.createdAt.getTime());
  const live = ordered.filter((l) => listApplies(l, ctx));

  const storeShelf = ctx.channel === "POS" && v.storeShelfCents != null;
  const zone = storeShelf ? undefined : live.filter((l) => l.kind !== "MEMBER").find((l) => priceAt(l, v.variantId, v.rrpCents, 1));
  // The rule resolvePrice names (member or quantity-break list) — match it back to a list.
  const incentive = result.rule ? live.find((l) => result.rule === l.name || result.rule?.startsWith(`${l.name} (`)) : undefined;

  const verdicts: ListVerdict[] = ordered.map((l) => {
    const reason = whyNot(l, ctx);
    const p = priceAt(l, v.variantId, v.rrpCents, v.qty);
    const excluded = !reason && !v.incentives && (l.kind === "MEMBER" || (p?.minQty ?? 1) > 1);
    return {
      id: l.id,
      name: l.name,
      kind: l.kind,
      applies: !reason && !excluded,
      reason: reason ?? (excluded ? "Medicines Act s18A — no incentives" : !p ? "No price for this item" : l === zone ? "Sets the shelf price" : l === incentive ? "Lowest price — wins" : l.kind === "MEMBER" || p.minQty > 1 ? "Doesn't beat the price already reached" : storeShelf ? "Store's own shelf price wins in store" : "Lower priority than the winning list"),
      priceCents: p?.price ?? null,
      minQty: p?.minQty ?? 1,
      won: l === zone || l === incentive,
    };
  });

  const steps: { label: string; cents: number; note: string }[] = [{ label: "Recommended retail price", cents: v.rrpCents, note: "National RRP incl. VAT — a recommendation only" }];
  if (storeShelf) steps.push({ label: "Store shelf price", cents: v.storeShelfCents!, note: "The franchisee's own price always wins in store" });
  else if (zone) steps.push({ label: `Shelf price from “${zone.name}”`, cents: result.shelfCents, note: zone.kind === "CHANNEL" ? "Channel price list" : "Zone / scheduled price list — highest priority that applies" });
  const tierPct = v.incentives && ctx.member && ctx.tier && ctx.tierPct ? ctx.tierPct : 0;
  if (!v.incentives) steps.push({ label: "No incentives", cents: result.unitCents, note: "A medicine — licensed, or a CBD supplement on the Compliance page's no-incentives list: tier savings, member prices, quantity breaks and promotions don't apply (Medicines Act s18A)" });
  else {
    if (tierPct) steps.push({ label: `${tierInfo(ctx.tier!).name} Rewards price`, cents: Math.round((result.shelfCents * (100 - tierPct)) / 100), note: `Instant ${tierPct}% tier saving on the shelf price` });
    if (incentive) steps.push({ label: incentive.kind === "MEMBER" ? `Member price from “${incentive.name}”` : `Quantity break from “${incentive.name}”`, cents: result.unitCents, note: incentive.kind === "MEMBER" ? "Lowest member price — beats the shelf and tier price" : "Quantity break reached at this quantity" });
  }
  return { result, verdicts, steps, lineCents: result.unitCents * v.qty };
}
