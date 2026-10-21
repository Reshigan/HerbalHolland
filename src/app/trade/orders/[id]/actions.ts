"use server";
// "Order again": puts an order's lines back in the cart in whole cases of today's case packs, skipping anything that
// has left the trade range, and says what happened.
import { refresh } from "next/cache";
import { db } from "@/server/db";
import { getTradeBuyer } from "@/server/trade/auth";
import { addTradeLine } from "@/lib/trade-cart";
import { updateTradeCart } from "../../_lib/cart";
import { asList } from "@/lib/json-list";

export type ReorderResult = { ok: boolean; count: number; summary: string };

export async function reorderTradeAction(orderId: string): Promise<ReorderResult> {
  const buyer = await getTradeBuyer();
  if (!buyer) return { ok: false, count: 0, summary: "Your session has ended. Sign in again." };
  const order = await db.tradeOrder.findUnique({ where: { id: orderId }, include: { lines: { include: { variant: { select: { id: true, active: true, podSku: true, caseQty: true, product: { select: { name: true, status: true, regClass: true } } } } } } } });
  if (!order || order.tradeAccountId !== buyer.tradeAccountId) return { ok: false, count: 0, summary: "That order isn't on your account." };
  const added: string[] = [];
  const skipped: string[] = [];
  const lines = await updateTradeCart((cart) => {
    let lines = cart;
    for (const l of order.lines) {
      const v = l.variant;
      const ok = v.active && !v.podSku && v.product.status === "ACTIVE" && v.product.regClass !== "THC" && asList(buyer.account.classes).includes(v.product.regClass);
      if (!ok) {
        skipped.push(`${v.product.name}`);
        continue;
      }
      const before = lines.length;
      lines = addTradeLine(lines, v.id, l.qty, Math.max(1, v.caseQty));
      if (lines.length === before && !lines.some((x) => x.variantId === v.id)) skipped.push(`${v.product.name} (cart full)`);
      else added.push(v.product.name);
    }
    return lines;
  });
  refresh();
  const summary = [added.length ? `Added ${added.length} ${added.length === 1 ? "line" : "lines"} to your cart.` : "Nothing could be added.", skipped.length ? `Not in the trade range any more: ${skipped.join(", ")}.` : null].filter(Boolean).join(" ");
  return { ok: added.length > 0, count: lines.length, summary };
}
