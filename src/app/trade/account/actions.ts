"use server";
// The account page's changes, all by the signed-in buyer: business details (OWNER only, via updateTradeAccount with
// byBuyerId), adding and removing buyers. Terms, limits and ranges stay HQ's.
import { refresh } from "next/cache";
import { getTradeBuyer } from "@/server/trade/auth";
import { addTradeBuyer, removeTradeBuyer, tradeActor, TradeAccountError, updateTradeAccount, type TradeAccountDetails } from "@/server/trade/accounts";

export type DetailsState = { ok?: boolean; error?: string; values?: Record<string, string>; at?: number };
export type BuyerState = { ok?: boolean; error?: string; values?: Record<string, string>; at?: number };

const DETAIL_KEYS: (keyof TradeAccountDetails)[] = ["name", "legalName", "kind", "regNumber", "vatNumber", "email", "phone", "addressLine", "suburb", "city", "province", "postalCode", "deliveryLine", "deliverySuburb", "deliveryCity", "deliveryProvince", "deliveryPostalCode"];

export async function updateDetailsAction(_: DetailsState, form: FormData): Promise<DetailsState> {
  const values = Object.fromEntries(DETAIL_KEYS.map((k) => [k, String(form.get(k) ?? "").slice(0, 500)]));
  const buyer = await getTradeBuyer();
  if (!buyer) return { error: "Your session has ended — sign in again", values };
  try {
    await updateTradeAccount(buyer.tradeAccountId, values as Partial<TradeAccountDetails>, tradeActor(buyer), { byBuyerId: buyer.id });
  } catch (e) {
    if (e instanceof TradeAccountError) return { error: e.message, values };
    throw e;
  }
  refresh();
  return { ok: true, at: Date.now() };
}

export async function addBuyerAction(_: BuyerState, form: FormData): Promise<BuyerState> {
  const values = Object.fromEntries(["name", "email", "phone", "role"].map((k) => [k, String(form.get(k) ?? "").slice(0, 254)]));
  const buyer = await getTradeBuyer();
  if (!buyer) return { error: "Your session has ended — sign in again", values };
  try {
    await addTradeBuyer(buyer.tradeAccountId, { name: values.name, email: values.email, phone: values.phone || null, role: values.role === "OWNER" ? "OWNER" : "BUYER" }, tradeActor(buyer), { byBuyerId: buyer.id });
  } catch (e) {
    if (e instanceof TradeAccountError) return { error: e.message, values };
    throw e;
  }
  refresh();
  return { ok: true, at: Date.now() };
}

export async function removeBuyerAction(_: BuyerState, form: FormData): Promise<BuyerState> {
  const buyer = await getTradeBuyer();
  if (!buyer) return { error: "Your session has ended — sign in again" };
  const id = String(form.get("buyerId") ?? "");
  try {
    await removeTradeBuyer(id, tradeActor(buyer), { byBuyerId: buyer.id });
  } catch (e) {
    if (e instanceof TradeAccountError) return { error: e.message };
    throw e;
  }
  refresh();
  return { ok: true, at: Date.now() };
}
