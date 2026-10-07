"use server";
// HQ → Trade → Orders: confirm an EFT, pick and ship at the DC (short lines allowed), cancel. The trade order service
// checks the state machine and audits; this re-checks the signed-in user and reads the form.
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { reportFailure } from "@/server/alerts";
import { db } from "@/server/db";
import { advanceTradeOrder, confirmTradePayment, nextTradeActions, TradeOrderError } from "@/server/trade/orders";
import { TradeAccountError } from "@/server/trade/accounts";
import { TradeLedgerError } from "@/server/trade/ledger";
import { StockError } from "@/server/inventory";
import { guard, DENIED, fail, flashTo, type ActionState } from "@/server/hq/guard";
import { str, opt, parseDay, parseInt10 } from "@/server/hq/form";

const EXPECTED = [TradeOrderError, TradeAccountError, TradeLedgerError, StockError];

async function attempt(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    if (EXPECTED.some((E) => e instanceof E)) return fail((e as Error).message);
    if ((e as { code?: string })?.code === "P2025") return fail("That order no longer exists. Reload the page.");
    void reportFailure(e, "HQ trade order action"); // unexpected: logged and emailed to ops
    return fail("Something went wrong. Please try again.");
  }
}

const refresh = (id: string, accountId?: string) => {
  revalidatePath(`/hq/trade/orders/${id}`);
  revalidatePath("/hq/trade/orders");
  revalidatePath("/hq/trade");
  if (accountId) revalidatePath(`/hq/trade/accounts/${accountId}`);
};

export async function confirmPayment(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const reference = str(fd, "reference");
  if (!reference) return fail("Enter the bank reference the payment arrived with.", { reference: "Required" });
  const paidAt = str(fd, "paidAt") ? parseDay(str(fd, "paidAt")) : null;
  if (str(fd, "paidAt") && !paidAt) return fail("Check the date.", { paidAt: "A date" });
  return attempt(async () => {
    const o = await confirmTradePayment(id, { reference, paidAt: paidAt ?? undefined }, g.actor);
    refresh(id, o.tradeAccountId);
    flashTo(`/hq/trade/orders/${id}`, `EFT confirmed for ${o.number}: the stock is reserved, the payment is on the ledger and the account has been emailed.`);
  });
}

export async function pickOrder(id: string): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  return attempt(async () => {
    const o = await advanceTradeOrder(id, "pick", g.actor);
    refresh(id, o.tradeAccountId);
    flashTo(`/hq/trade/orders/${id}`, `${o.number} is being picked.`);
  });
}

/** Ship a courier order: courier and tracking, with any lines that go short (`short:<lineId>` = quantity supplied). */
export async function shipOrder(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const courier = str(fd, "courier");
  if (!courier) return fail("Which courier is it with?", { courier: "Required" });
  const trackingNo = opt(fd, "trackingNo");
  const shortShip: { lineId: string; shippedQty: number }[] = [];
  const fields: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("short:") || !String(v).trim()) continue;
    const n = parseInt10(String(v));
    if (n == null || n < 0) fields[k] = "A whole number";
    else shortShip.push({ lineId: k.slice(6), shippedQty: n });
  }
  if (Object.keys(fields).length) return fail("Check the quantities supplied.", fields);
  return attempt(async () => {
    const before = await db.tradeOrder.findUnique({ where: { id }, select: { status: true, fulfilment: true } });
    if (!before || !nextTradeActions(before).includes("ship")) return fail("This order can't be shipped from where it is.");
    const o = await advanceTradeOrder(id, "ship", g.actor, { courier, trackingNo, shortShip, staffId: g.user.id, note: opt(fd, "note") });
    refresh(id, o.tradeAccountId);
    flashTo(`/hq/trade/orders/${id}`, `${o.number} shipped with ${courier}${trackingNo ? ` (${trackingNo})` : ""}. Tax invoice ${o.invoiceNumber} is on the ledger and has been emailed.`);
  });
}

export async function cancelOrder(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const reason = str(fd, "reason");
  if (reason.length < 3) return fail("Say why: the account is told the order was cancelled.", { reason: "Required" });
  return attempt(async () => {
    const o = await advanceTradeOrder(id, "cancel", g.actor, { note: reason, staffId: g.user.id });
    refresh(id, o.tradeAccountId);
    flashTo(`/hq/trade/orders/${id}`, `${o.number} cancelled: any reserved stock is back on sale and the account has been told.${o.payMethod === "EFT" && o.paidAt ? " It was paid by EFT, so refund it by hand." : ""}`);
  });
}

