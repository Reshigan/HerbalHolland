// Request context for the trade portal's pages: the signed-in buyer (or the sign-in page), the warehouse the
// account's range is priced from, the cart as the WHOLESALE engine quotes it, and the plain reason an account can't
// order. Every mutation re-checks all of this itself in src/server/trade/*; this is for rendering.
import { licenceProblem } from "@/server/trade/licences";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getTradeBuyer, type TradeBuyerSession } from "@/server/trade/auth";
import { defaultDc } from "@/server/trade/orders";
import { quote } from "@/server/pricing";
import { ACCOUNT_STATUS_PROBLEM } from "@/lib/trade";
import { getTradeCart } from "./cart";
import { asList } from "@/lib/json-list";

export type TradeAccount = TradeBuyerSession["account"];

/** Only same-site paths inside the portal are accepted as post-sign-in destinations. */
export function safeTradeNext(raw: unknown) {
  const s = String(raw ?? "");
  return /^\/trade(\/[A-Za-z0-9\-_/?=&%.]*)?$/.test(s) && !s.startsWith("//") ? s : null;
}

/** The signed-in buyer with their account, or the sign-in page (coming back to `next` afterwards). */
export async function requireBuyer(next?: string) {
  const buyer = await getTradeBuyer();
  if (!buyer) redirect(next ? `/trade/login?next=${encodeURIComponent(next)}` : "/trade/login");
  return buyer;
}

/** The warehouse an account's range is priced and couriered from: its own DC, else the network's default one, or null when no DC is set up yet. */
export const rangeStoreFor = cache(async (dcId: string | null) => {
  if (dcId) {
    const own = await db.store.findUnique({ where: { id: dcId } });
    if (own && own.kind === "WAREHOUSE" && own.status !== "CLOSED") return own;
  }
  return defaultDc().catch(() => null);
});

/** The cart as the WHOLESALE engine prices it at the account's DC: the cookie lines, the quote (null when empty) and the store. */
export async function cartQuote(account: Pick<TradeAccount, "id" | "dcId">) {
  const [items, store] = await Promise.all([getTradeCart(), rangeStoreFor(account.dcId)]);
  const q = items.length && store ? await quote({ channel: "WHOLESALE", storeId: store.id, tradeAccountId: account.id, items }) : null;
  return { items, store, quote: q };
}

/** Why this account can't order right now (its status, or a required licence missing, waiting or lapsed), or null. */
export async function orderingProblem(a: Pick<TradeAccount, "id" | "kind" | "classes" | "regNumber" | "status" | "holdReason">) {
  const licence = a.status === "APPROVED" || a.status === "ON_HOLD" ? await licenceProblem({ ...a, classes: asList(a.classes) }) : null;
  if (licence) return `Ordering is paused: ${licence}. Upload it under Account › Licences.`;
  if (a.status === "APPROVED") return null;
  const base = ACCOUNT_STATUS_PROBLEM[a.status as keyof typeof ACCOUNT_STATUS_PROBLEM] ?? "This trade account can't order right now";
  return a.status === "ON_HOLD" && a.holdReason && a.holdReason !== "overdue" && a.holdReason !== "licence" ? `${base}. Reason given: ${a.holdReason}` : base;
}
