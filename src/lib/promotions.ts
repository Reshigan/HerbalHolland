// Pure promotion engine.
//
// Order of play (predictable, no double-dipping):
//   1. Unit deals — MULTIBUY bundles and BUY_X_GET_Y bonus buys — claim the units they use.
//   2. Line deals — the single best PERCENT / targeted FIXED discount on each remaining unit.
//   3. Basket deal — the best untargeted FIXED amount, spread across lines so VAT per line stays right.
//   4. Points multiplier — the highest applicable.
// Deals that are close but not yet triggered come back as `suggestions` ("add 1 more pre-roll…")
// so tills and the web shop can prompt the complementary item.
import { allocateProportionally } from "./money";

export type PromoKind = "PERCENT" | "FIXED" | "MULTIPLIER" | "BUY_X_GET_Y" | "MULTIBUY";

export type PromoInput = {
  id: string;
  name: string;
  code?: string | null;
  kind: PromoKind;
  value: number;
  categoryIds: string[];
  productIds: string[];
  minSpendCents: number;
  buyQty?: number | null;
  getQty?: number | null;
  rewardPercent?: number | null;
  rewardCategoryIds?: string[];
  rewardProductIds?: string[];
};

export type PricedLine = { key: string; productId: string; categoryId: string; qty: number; unitPriceCents: number; noPromo?: boolean };

export type Suggestion = { promoId: string; name: string; message: string; productIds: string[]; categoryIds: string[] };

export type PromoResult = {
  lines: { key: string; grossCents: number; discountCents: number; totalCents: number; promoId?: string }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  pointsMultiplier: number;
  applied: { id: string; name: string; discountCents: number }[];
  suggestions: Suggestion[];
  codeError?: string;
};

const targets = (ids: { productIds: string[]; categoryIds: string[] }, l: { productId: string; categoryId: string }) =>
  (!ids.productIds.length && !ids.categoryIds.length) || ids.productIds.includes(l.productId) || ids.categoryIds.includes(l.categoryId);

const rewardTargets = (p: PromoInput) =>
  p.rewardProductIds?.length || p.rewardCategoryIds?.length
    ? { productIds: p.rewardProductIds ?? [], categoryIds: p.rewardCategoryIds ?? [] }
    : { productIds: p.productIds, categoryIds: p.categoryIds };

const sameTargets = (p: PromoInput) => !(p.rewardProductIds?.length || p.rewardCategoryIds?.length);

type Unit = { line: number; price: number; discount: number; claimed: boolean; promoId?: string };

export function applyPromotions(lines: PricedLine[], promos: PromoInput[], code?: string | null): PromoResult {
  const fullSubtotal = lines.reduce((s, l) => s + l.qty * l.unitPriceCents, 0);
  // Lines excluded from incentives (e.g. medicines under s18A) neither get nor unlock deals.
  const subtotal = lines.filter((l) => !l.noPromo).reduce((s, l) => s + l.qty * l.unitPriceCents, 0);
  const wanted = code?.trim().toUpperCase() || null;
  let codeError: string | undefined;
  const codePromo = wanted ? promos.find((p) => p.code?.toUpperCase() === wanted) : undefined;
  if (wanted && !codePromo) codeError = "That code isn't valid right now";
  else if (codePromo && subtotal < codePromo.minSpendCents) codeError = `Spend R${codePromo.minSpendCents / 100} to use ${codePromo.code}`;

  const live = promos.filter((p) => !p.code || p === codePromo);
  const eligible = live.filter((p) => subtotal >= p.minSpendCents);
  const applied = new Map<string, { id: string; name: string; discountCents: number }>();
  const credit = (p: PromoInput, amt: number) => {
    const a = applied.get(p.id) ?? { id: p.id, name: p.name, discountCents: 0 };
    a.discountCents += amt;
    applied.set(p.id, a);
  };
  const suggestions: Suggestion[] = [];
  const suggest = (p: PromoInput, message: string, t = rewardTargets(p)) =>
    suggestions.push({ promoId: p.id, name: p.name, message, productIds: t.productIds, categoryIds: t.categoryIds });

  // Expand to units, most expensive first (customers get the cheapest item as the reward).
  const units: Unit[] = lines
    .flatMap((l, i) => Array.from({ length: l.qty }, () => ({ line: i, price: l.unitPriceCents, discount: 0, claimed: !!l.noPromo })))
    .sort((a, b) => b.price - a.price);
  const free = (t: { productIds: string[]; categoryIds: string[] }) => units.filter((u) => !u.claimed && targets(t, lines[u.line]));

  // 1a. Multi-buys: any N qualifying items for a fixed price.
  for (const p of eligible.filter((x) => x.kind === "MULTIBUY" && (x.buyQty ?? 0) > 1)) {
    const n = p.buyQty!;
    const pool = free(p);
    const groups = Math.floor(pool.length / n);
    for (let g = 0; g < groups; g++) {
      const group = pool.slice(g * n, g * n + n);
      const total = group.reduce((s, u) => s + u.price, 0);
      if (total <= p.value) continue;
      const parts = allocateProportionally(total - p.value, group.map((u) => u.price));
      group.forEach((u, i) => Object.assign(u, { discount: parts[i], claimed: true, promoId: p.id }));
      credit(p, total - p.value);
    }
    const left = pool.length % n;
    if (left > 0 || pool.length === 0) suggest(p, `Add ${n - left} more to get ${n} for R${p.value / 100}`, p);
  }

  // 1b. Bonus buys: buy X (or spend Y) and get Z at a discount / free.
  for (const p of live.filter((x) => x.kind === "BUY_X_GET_Y" && (x.getQty ?? 0) > 0)) {
    const pct = Math.min(100, p.rewardPercent ?? 100);
    const get = p.getQty!;
    const reward = rewardTargets(p);
    if (subtotal < p.minSpendCents) {
      if (subtotal >= p.minSpendCents * 0.7) suggest(p, `Spend R${Math.ceil((p.minSpendCents - subtotal) / 100)} more to unlock: ${p.name}`);
      continue;
    }
    let entitled: number;
    if (sameTargets(p) && p.buyQty) {
      // Same pool (e.g. buy 2 get 1): walk groups of buy+get, rewarding the cheapest in each group.
      const pool = free(p);
      const size = p.buyQty + get;
      entitled = 0;
      for (let g = 0; g + size <= pool.length; g += size) {
        for (const u of pool.slice(g + p.buyQty, g + size)) {
          u.discount = Math.round((u.price * pct) / 100);
          u.claimed = true;
          u.promoId = p.id;
          credit(p, u.discount);
        }
        for (const u of pool.slice(g, g + p.buyQty)) u.claimed = true;
        entitled += get;
      }
      const rem = pool.length % size;
      if (rem >= p.buyQty) suggest(p, `Add ${size - rem} more — ${pct === 100 ? "it's free" : `${pct}% off`} (${p.name})`, p);
      else if (entitled === 0 && pool.length > 0) suggest(p, `Add ${p.buyQty - rem} more to unlock ${p.name}`, p);
      continue;
    }
    const triggers = p.buyQty ? Math.floor(free(p).filter((u) => !targets(reward, lines[u.line]) || !sameTargets(p)).length / p.buyQty) : 1;
    entitled = triggers * get;
    if (p.buyQty) for (const u of free(p).slice(0, triggers * p.buyQty)) if (!targets(reward, lines[u.line])) u.claimed = true;
    const rewards = free(reward).sort((a, b) => a.price - b.price).slice(0, entitled);
    for (const u of rewards) {
      u.discount = Math.round((u.price * pct) / 100);
      u.claimed = true;
      u.promoId = p.id;
      credit(p, u.discount);
    }
    if (entitled > rewards.length)
      suggest(p, `${pct === 100 ? "Free" : `${pct}% off`} with your basket — add it: ${p.name}`);
  }

  // 2. Best line-level discount on unclaimed units.
  for (const u of units.filter((x) => !x.claimed)) {
    const l = lines[u.line];
    let best = 0;
    let bestPromo: PromoInput | undefined;
    for (const p of eligible) {
      if (!targets(p, l) || !(p.productIds.length || p.categoryIds.length || p.kind === "PERCENT")) continue;
      const d = p.kind === "PERCENT" ? Math.round((u.price * p.value) / 100) : p.kind === "FIXED" ? Math.min(u.price, p.value) : 0;
      if (d > best) (best = d), (bestPromo = p);
    }
    if (bestPromo) {
      u.discount = best;
      u.promoId = bestPromo.id;
      credit(bestPromo, best);
    }
  }

  const out = lines.map((l, i) => {
    const mine = units.filter((u) => u.line === i);
    const discount = mine.reduce((s, u) => s + u.discount, 0);
    const gross = l.qty * l.unitPriceCents;
    const promoId = mine.find((u) => u.promoId)?.promoId;
    return { key: l.key, grossCents: gross, discountCents: discount, totalCents: gross - discount, promoId };
  });

  // 3. Basket-level fixed amount ("R50 off orders over R500").
  const cartFixed = eligible
    .filter((p) => p.kind === "FIXED" && !p.productIds.length && !p.categoryIds.length)
    .sort((a, b) => b.value - a.value)[0];
  if (cartFixed) {
    const weights = out.map((l, i) => (lines[i].noPromo ? 0 : l.totalCents));
    const remaining = weights.reduce((s, w) => s + w, 0);
    const amt = Math.min(cartFixed.value, remaining);
    const parts = allocateProportionally(amt, weights);
    out.forEach((l, i) => {
      l.discountCents += parts[i];
      l.totalCents -= parts[i];
    });
    credit(cartFixed, amt);
  }

  // 4. Points multiplier.
  const multipliers = eligible.filter((p) => p.kind === "MULTIPLIER");
  const multiplier = Math.max(1, ...multipliers.map((p) => p.value / 100));
  for (const p of multipliers) if (p.value / 100 === multiplier && multiplier > 1) credit(p, 0);

  const discount = out.reduce((s, l) => s + l.discountCents, 0);
  return {
    lines: out,
    subtotalCents: fullSubtotal,
    discountCents: discount,
    totalCents: fullSubtotal - discount,
    pointsMultiplier: multiplier,
    applied: [...applied.values()],
    suggestions,
    codeError,
  };
}

/** Plain-English description of a deal for shelf talkers, receipts and the web shop. */
export function describePromo(p: PromoInput) {
  switch (p.kind) {
    case "PERCENT":
      return `${p.value}% off`;
    case "FIXED":
      return `R${p.value / 100} off${p.productIds.length || p.categoryIds.length ? " each" : ""}${p.minSpendCents ? ` when you spend R${p.minSpendCents / 100}` : ""}`;
    case "MULTIPLIER":
      return `${p.value / 100}× points`;
    case "MULTIBUY":
      return `Any ${p.buyQty} for R${p.value / 100}`;
    case "BUY_X_GET_Y": {
      const reward = (p.rewardPercent ?? 100) >= 100 ? "free" : `${p.rewardPercent}% off`;
      if (!p.buyQty) return `Spend R${p.minSpendCents / 100}, get ${p.getQty} ${reward}`;
      return `Buy ${p.buyQty}, get ${p.getQty} ${reward}`;
    }
  }
}
