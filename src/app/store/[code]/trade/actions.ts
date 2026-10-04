"use server";
// Store back office → Trade orders: pick, mark ready (the buyer gets the collection code), hand over (ID checked,
// code matched, short lines allowed) and cancel. Scope is re-checked here; the trade order service does the rest.
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { advanceTradeOrder, nextTradeActions, TradeOrderError } from "@/server/trade/orders";
import { TradeAccountError } from "@/server/trade/accounts";
import { TradeLedgerError } from "@/server/trade/ledger";
import { StockError } from "@/server/inventory";
import { attempt, actorOf, done, fail, UserError, type ActionState } from "@/server/store/context";
import { bool, str } from "@/server/store/rules";
import { parseInt10 } from "@/server/hq/form";

/** The signed-in staff member at this store and the collect order, which must be this store's. */
async function load(code: string, id: string) {
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  // The store's own team works the orders; area managers and HQ staff see them read-only.
  if (!canManageStore(user) && user.role !== "BUDTENDER") throw new UserError("Trade orders are handled by the store's team.");
  const order = await db.tradeOrder.findFirst({ where: { id, storeId: store.id }, select: { id: true, number: true, status: true, fulfilment: true, collectionCode: true, payMethod: true, paidAt: true } });
  if (!order) throw new UserError("Trade order not found at this store.");
  return { user, store, order, actor: actorOf(user) };
}

const refresh = (code: string, id: string) => {
  revalidatePath(`/store/${code}/trade`);
  revalidatePath(`/store/${code}/trade/${id}`);
  revalidatePath(`/store/${code}`);
};

/** The trade services' errors as inline messages, like the store's own domain errors. */
async function tradeAttempt(fn: () => Promise<ActionState>): Promise<ActionState> {
  return attempt(async () => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof TradeOrderError || e instanceof TradeAccountError || e instanceof TradeLedgerError || e instanceof StockError) return fail(e.message);
      throw e;
    }
  });
}

export async function pickTradeOrder(code: string, id: string): Promise<ActionState> {
  return tradeAttempt(async () => {
    const { order, actor, user } = await load(code, id);
    if (!nextTradeActions(order).includes("pick")) return fail(`${order.number} can't be picked from where it is.`);
    await advanceTradeOrder(id, "pick", actor, { staffId: user.id });
    refresh(code, id);
    return done(`Picking ${order.number}.`);
  });
}

export async function readyTradeOrder(code: string, id: string): Promise<ActionState> {
  return tradeAttempt(async () => {
    const { order, actor, user } = await load(code, id);
    if (!nextTradeActions(order).includes("ready")) return fail(`${order.number} can't be marked ready from where it is.`);
    await advanceTradeOrder(id, "ready", actor, { staffId: user.id });
    refresh(code, id);
    return done(`${order.number} is ready — the buyer has been sent their collection code by email and text.`);
  });
}

/** Hand over: the collector's ID (18+) checked, the six-digit code they give matched, any short lines noted. */
export async function collectTradeOrder(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return tradeAttempt(async () => {
    const { order, actor, user } = await load(code, id);
    if (!nextTradeActions(order).includes("collect")) return fail(`${order.number} isn't ready to hand over.`);
    if (!bool(fd, "idChecked")) return fail("Check the collector's ID — everyone collecting for a trade account is 18 or older.", "idChecked");
    const typed = str(fd, "collectionCode").replace(/\s/g, "");
    if (!/^\d{6}$/.test(typed)) return fail("Type the six-digit collection code the buyer was sent.", "collectionCode");
    if (typed !== order.collectionCode) return fail("That isn't this order's collection code — ask the collector to check their email or text.", "collectionCode");
    const shortShip: { lineId: string; shippedQty: number }[] = [];
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("short:") || !String(v).trim()) continue;
      const n = parseInt10(String(v));
      if (n == null || n < 0) return fail("Quantities supplied must be whole numbers.", k);
      shortShip.push({ lineId: k.slice(6), shippedQty: n });
    }
    const o = await advanceTradeOrder(id, "collect", actor, { idChecked: true, staffId: user.id, shortShip, note: str(fd, "note").slice(0, 300) || null });
    refresh(code, id);
    return done(`${o.number} handed over. Sale ${o.invoiceNumber} is posted at the store and the tax invoice emailed to the account.`);
  });
}

export async function cancelTradeOrder(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return tradeAttempt(async () => {
    const { order, actor, user } = await load(code, id);
    if (!canManageStore(user)) return fail("Only a manager or owner can cancel a trade order.");
    if (!nextTradeActions(order).includes("cancel")) return fail(`${order.number} can't be cancelled from where it is.`);
    const reason = str(fd, "reason").slice(0, 300);
    if (reason.length < 3) return fail("Say why — the account is told the order was cancelled.", "reason");
    await advanceTradeOrder(id, "cancel", actor, { note: `Cancelled by ${user.name}: ${reason}`, staffId: user.id });
    refresh(code, id);
    return done(`${order.number} cancelled — reserved stock is back on sale and the account has been told.`);
  });
}
