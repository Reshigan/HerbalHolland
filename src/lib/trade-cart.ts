// The trade portal's cart, pure: what the hh_trade_cart cookie holds ("<variantId>_<units>.<variantId>_<units>"),
// kept in whole cases (the portal's steppers count cases and `caseQty` rounds every quantity up to a case
// multiple) and capped per line and per cart, plus the minimum-order arithmetic the cart bar shows. Prices never
// live here: the cart is re-quoted on the server (quote, channel WHOLESALE) every time it is shown.
import { caseMultiple } from "./trade";

export type TradeCartLine = { variantId: string; qty: number };

export const TRADE_CART_COOKIE = "hh_trade_cart";
export const TRADE_CART_MAX_LINES = 60;
export const TRADE_CART_MAX_UNITS = 9_999; // per line
const ID = /^[A-Za-z0-9-]{8,40}$/;

const pack = (caseQty: number | null | undefined) => Math.max(1, Math.floor(caseQty || 1));

/** `qty` rounded up to whole cases, never above the per-line cap (itself a whole number of cases). */
function cap(qty: number, caseQty: number) {
  const c = pack(caseQty);
  const max = Math.max(c, Math.floor(TRADE_CART_MAX_UNITS / c) * c);
  return Math.min(max, caseMultiple(qty, c));
}

export function parseTradeCart(raw: string | null | undefined): TradeCartLine[] {
  if (!raw) return [];
  const out = new Map<string, number>();
  for (const part of raw.split(".")) {
    const [id, q] = part.split("_");
    const qty = Math.floor(Number(q));
    if (!id || !ID.test(id) || !Number.isFinite(qty) || qty < 1) continue;
    if (!out.has(id) && out.size >= TRADE_CART_MAX_LINES) break;
    out.set(id, Math.min(TRADE_CART_MAX_UNITS, (out.get(id) ?? 0) + qty));
  }
  return [...out].map(([variantId, qty]) => ({ variantId, qty }));
}

export function serializeTradeCart(lines: TradeCartLine[]) {
  return lines
    .filter((l) => ID.test(l.variantId) && l.qty >= 1)
    .slice(0, TRADE_CART_MAX_LINES)
    .map((l) => `${l.variantId}_${Math.min(TRADE_CART_MAX_UNITS, Math.floor(l.qty))}`)
    .join(".");
}

/** Adds `qty` units to a line (creating it), rounded up to whole cases of `caseQty`. A full cart ignores a new line. */
export function addTradeLine(lines: TradeCartLine[], variantId: string, qty: number, caseQty = 1): TradeCartLine[] {
  const n = Math.max(1, Math.floor(qty || 0));
  const hit = lines.find((l) => l.variantId === variantId);
  if (hit) return lines.map((l) => (l === hit ? { ...l, qty: cap(l.qty + n, caseQty) } : l));
  if (lines.length >= TRADE_CART_MAX_LINES) return lines;
  return [...lines, { variantId, qty: cap(n, caseQty) }];
}

/** Sets a line's units (rounded up to whole cases); zero or less removes it; a line that isn't there is added. */
export function setTradeLine(lines: TradeCartLine[], variantId: string, qty: number, caseQty = 1): TradeCartLine[] {
  const n = Math.floor(qty || 0);
  if (n <= 0) return removeTradeLine(lines, variantId);
  if (!lines.some((l) => l.variantId === variantId)) return addTradeLine(lines, variantId, n, caseQty);
  return lines.map((l) => (l.variantId === variantId ? { ...l, qty: cap(n, caseQty) } : l));
}

export const removeTradeLine = (lines: TradeCartLine[], variantId: string) => lines.filter((l) => l.variantId !== variantId);

export const tradeCartUnits = (lines: TradeCartLine[]) => lines.reduce((s, l) => s + l.qty, 0);

/** How many cases `qty` units make (a case of 1 is a unit). */
export const casesOf = (qty: number, caseQty: number) => Math.ceil(Math.max(0, qty) / pack(caseQty));

export type MinOrderProgress = { reached: boolean; shortCents: number; pct: number };

/** Where a basket stands against the minimum order (ex VAT): reached, how far short, and the share for a meter. */
export function minOrderProgress(subtotalCents: number, minOrderCents: number): MinOrderProgress {
  const min = Math.max(0, Math.floor(minOrderCents || 0));
  const sub = Math.max(0, Math.floor(subtotalCents || 0));
  const shortCents = Math.max(0, min - sub);
  return { reached: shortCents === 0, shortCents, pct: min > 0 ? Math.min(100, Math.floor((sub / min) * 100)) : 100 };
}
