"use server";
// Placing a trade order from the cart cookie: courier from the DC (which of the account's addresses) or click &
// collect (which store), EFT or on account, the buyer's reference and notes. placeTradeOrder re-checks everything
// (status, classes, whole cases, the minimum, credit); its plain-English refusal comes back inline. The store list
// for click & collect is fetched here too (province, search, page) so the picker never loads the whole network.
import { redirect } from "next/navigation";
import { getTradeBuyer } from "@/server/trade/auth";
import { collectStoresFor, placeTradeOrder, TradeOrderError, type CollectStore } from "@/server/trade/orders";
import { TradeAccountError } from "@/server/trade/accounts";
import { TradeLedgerError } from "@/server/trade/ledger";
import { quote } from "@/server/pricing";
import { PROVINCES } from "@/lib/sa";
import { getTradeCart, saveTradeCart } from "../_lib/cart";
import { rangeStoreFor } from "../_lib/context";

export type CheckoutState = { error?: string; fields?: { storeId?: string; payMethod?: string }; values?: Record<string, string> };

export async function placeOrderAction(_: CheckoutState, form: FormData): Promise<CheckoutState> {
  const values = Object.fromEntries(["fulfilment", "payMethod", "storeId", "deliver", "reference", "notes"].map((k) => [k, String(form.get(k) ?? "").slice(0, 1_000)]));
  const buyer = await getTradeBuyer();
  if (!buyer) return { error: "Your session has ended — sign in again", values };
  const items = await getTradeCart();
  if (!items.length) return { error: "Your cart is empty", values };
  const fulfilment = values.fulfilment === "COLLECT" ? "COLLECT" : values.fulfilment === "COURIER" ? "COURIER" : null;
  if (!fulfilment) return { error: "Choose courier or click & collect", values };
  const payMethod = values.payMethod === "ACCOUNT" ? "ACCOUNT" : values.payMethod === "EFT" ? "EFT" : null;
  if (!payMethod) return { error: "Choose how to pay", fields: { payMethod: "Choose EFT or on account" }, values };
  if (fulfilment === "COLLECT" && !values.storeId) return { error: "Choose the store to collect from", fields: { storeId: "Choose a store" }, values };
  let id: string;
  try {
    const order = await placeTradeOrder({
      accountId: buyer.tradeAccountId,
      buyerId: buyer.id,
      lines: items,
      payMethod,
      fulfilment,
      storeId: fulfilment === "COLLECT" ? values.storeId : null,
      deliver: values.deliver === "BILLING" ? "BILLING" : "DELIVERY",
      reference: values.reference || null,
      notes: values.notes || null,
    });
    id = order.id;
  } catch (e) {
    if (e instanceof TradeOrderError || e instanceof TradeAccountError || e instanceof TradeLedgerError) return { error: e.message, values };
    throw e;
  }
  await saveTradeCart([]);
  redirect(`/trade/orders/${id}?placed=1`);
}

export type StoreQuery = { province?: string | null; q?: string | null; page?: number };
export type StoreList = { rows: CollectStore[]; total: number; page: number; pageSize: number };

/** Click & collect stores for the cart as it stands: the account's province first, filtered by province or a search, a page at a time. */
export async function collectStoresAction(input: StoreQuery): Promise<StoreList | { error: string }> {
  const buyer = await getTradeBuyer();
  if (!buyer) return { error: "Your session has ended — sign in again" };
  const items = await getTradeCart();
  const store = await rangeStoreFor(buyer.account.dcId);
  if (!items.length || !store) return { rows: [], total: 0, page: 1, pageSize: 8 };
  const q = await quote({ channel: "WHOLESALE", storeId: store.id, tradeAccountId: buyer.tradeAccountId, items });
  const province = input.province && input.province in PROVINCES ? input.province : null;
  return collectStoresFor(
    q.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, regClass: l.regClass })),
    buyer.account,
    { province, q: input.q?.slice(0, 60) ?? null, page: Math.max(1, Math.floor(input.page ?? 1)), pageSize: 8 },
  );
}
