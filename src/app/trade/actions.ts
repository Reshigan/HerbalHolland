"use server";
// Server actions shared across the trade portal: sign out and the cart (add whole cases, set, remove, clear). Each
// one re-reads the session; the cart's case packs come from the database, never from the form.
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getTradeBuyer, signOutTrade } from "@/server/trade/auth";
import { tradeActor } from "@/server/trade/accounts";
import { addTradeLine, casesOf, removeTradeLine, setTradeLine } from "@/lib/trade-cart";
import { saveTradeCart, updateTradeCart } from "./_lib/cart";

export async function signOutAction() {
  const buyer = await getTradeBuyer();
  await signOutTrade();
  if (buyer) await audit(db, tradeActor(buyer), "trade.signout", { entity: "TradeAccount", entityId: buyer.tradeAccountId });
  redirect("/trade");
}

export type CartActionState = { ok?: boolean; error?: string; qty?: number; cases?: number; lines?: number; at?: number };

/** A variant the signed-in account may put in its cart, with its case pack — or the plain reason it can't. */
async function tradeVariant(variantId: string) {
  const buyer = await getTradeBuyer();
  if (!buyer) return { error: "Your session has ended — sign in again" as const };
  const v = await db.variant.findUnique({ where: { id: variantId }, select: { id: true, active: true, podSku: true, caseQty: true, product: { select: { status: true, regClass: true, name: true } } } });
  if (!v?.active || v.podSku || v.product.status !== "ACTIVE" || v.product.regClass === "THC" || !buyer.account.classes.includes(v.product.regClass)) return { error: "That item isn't in your trade range" as const };
  return { buyer, v, caseQty: Math.max(1, v.caseQty) };
}

const casesFrom = (form: FormData) => Math.max(0, Math.min(999, Math.floor(Number(form.get("cases") ?? 0)) || 0));

/** Adds whole cases of a variant to the cart. */
export async function addToCartAction(_: CartActionState, form: FormData): Promise<CartActionState> {
  const r = await tradeVariant(String(form.get("variantId") ?? ""));
  if ("error" in r) return { error: r.error };
  const cases = Math.max(1, casesFrom(form));
  const lines = await updateTradeCart((cur) => addTradeLine(cur, r.v.id, cases * r.caseQty, r.caseQty));
  refresh();
  const line = lines.find((l) => l.variantId === r.v.id);
  return { ok: true, qty: line?.qty ?? 0, cases: casesOf(line?.qty ?? 0, r.caseQty), lines: lines.length, at: Date.now() };
}

/** Sets a cart line to a number of cases (zero removes it). */
export async function setCartCasesAction(form: FormData) {
  const r = await tradeVariant(String(form.get("variantId") ?? ""));
  if ("error" in r) return;
  await updateTradeCart((cur) => setTradeLine(cur, r.v.id, casesFrom(form) * r.caseQty, r.caseQty));
  refresh();
}

export async function removeCartLineAction(form: FormData) {
  const variantId = String(form.get("variantId") ?? "");
  if (!variantId) return;
  await updateTradeCart((cur) => removeTradeLine(cur, variantId));
  refresh();
}

export async function clearCartAction() {
  await saveTradeCart([]);
  refresh();
}
