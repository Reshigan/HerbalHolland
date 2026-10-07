"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { quote } from "@/server/pricing";
import { deliveryFee, OrderError, placeOrder } from "@/server/orders";
import { CustomerError } from "@/server/customers";
import { LoyaltyError } from "@/server/loyalty";
import { getCart, getPromoCode, getVoucherCode, saveCart, savePromoCode, saveVoucherCode } from "@/server/shop/context";
import { rememberAddress } from "@/server/shop/addresses";
import { redeemablePoints } from "@/server/shop/cart-codec";
import { readableDropBlock } from "@/server/shop/launch-rules";
import { VoucherError } from "@/server/shop/vouchers";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";

export type CheckoutState = { error?: string; alternatives?: { id: string; name: string }[]; fields?: Partial<Record<"addressLine" | "suburb" | "city" | "province" | "postalCode" | "storeId", string>>; values?: Record<string, string> };

const Address = z.object({
  addressLine: z.string().trim().min(4, "Enter your street address").max(120),
  suburb: z.string().trim().min(2, "Enter your suburb").max(60),
  city: z.string().trim().min(2, "Enter your town or city").max(60),
  province: z.enum(Object.keys(PROVINCES) as [ProvinceCode, ...ProvinceCode[]], { message: "Choose your province" }),
  postalCode: z.string().trim().regex(/^\d{4}$/, "4-digit postal code"),
  notes: z.string().trim().max(200).optional(),
});

const ADDRESS_FIELDS = ["addressLine", "suburb", "city", "province", "postalCode", "notes", "addressLabel", "saveAddress"];

/** React resets the form once the action returns: a delivery address comes back with any error, so it isn't lost. */
export async function placeOrderAction(_: CheckoutState, form: FormData): Promise<CheckoutState> {
  const r = await place(form);
  return form.has("addressLine") ? { ...r, values: Object.fromEntries(ADDRESS_FIELDS.map((k) => [k, String(form.get(k) ?? "")])) } : r;
}

async function place(form: FormData): Promise<CheckoutState> {
  const customer = await getCustomer();
  if (!customer) return { error: "Your session has ended. Please sign in again." };
  const items = await getCart();
  if (!items.length) return { error: "Your bag is empty." };

  const f = z.enum(["COLLECT", "SAME_DAY", "COURIER"]).safeParse(form.get("fulfilment"));
  if (!f.success) return { error: "Choose click & collect or delivery." };
  const fulfilment = f.data;
  const payMethod = form.get("payMethod") === "IN_STORE" && fulfilment === "COLLECT" ? "IN_STORE" : "ONLINE";

  let storeId: string | null = null;
  let address: z.infer<typeof Address> | undefined;
  if (fulfilment === "COLLECT") {
    storeId = String(form.get("storeId") ?? "") || null;
    if (!storeId) return { error: "Choose a store to collect from.", fields: { storeId: "Choose a store" } };
  } else {
    const a = Address.safeParse({
      addressLine: form.get("addressLine"), suburb: form.get("suburb"), city: form.get("city"), province: form.get("province"),
      postalCode: form.get("postalCode"), notes: String(form.get("notes") ?? "") || undefined,
    });
    if (!a.success) return { error: "Check your delivery address.", fields: Object.fromEntries(a.error.issues.map((i) => [String(i.path[0]), i.message])) };
    address = a.data;
  }

  // Points: whole points, from the minimum up to the cap on incentive-eligible spend (medicines excluded).
  const [settings, code, voucherCode] = await Promise.all([getSettings(), getPromoCode(), getVoucherCode()]);
  const wanted = Math.max(0, Math.floor(Number(form.get("points") ?? 0)) || 0);
  let points = 0;
  if (wanted > 0) {
    if (wanted < settings.loyalty.minRedeem) return { error: `You can redeem from ${settings.loyalty.minRedeem} points.` };
    const q = await quote({ channel: "ONLINE", items, code, customerId: customer.id });
    const fee = await deliveryFee(fulfilment, q.lines, customer.tier);
    const eligible = q.lines.filter((l) => !l.noEarn).reduce((s, l) => s + l.totalCents, 0) + fee;
    points = Math.min(wanted, redeemablePoints({ balance: customer.points, eligibleCents: eligible, maxPct: settings.loyalty.maxRedeemPct, min: settings.loyalty.minRedeem }));
  }

  let order: Awaited<ReturnType<typeof placeOrder>>;
  try {
    // A gift voucher pays with online payment; paying in store leaves it on the voucher for the counter, where the till takes it.
    order = await placeOrder({ customerId: customer.id, fulfilment, storeId, address, items, code, points, payMethod, voucherCode: payMethod === "ONLINE" ? voucherCode : null });
  } catch (e) {
    if (e instanceof OrderError) {
      // Limited drops: turn the rule's short refusal into something a shopper can act on.
      const drop = readableDropBlock(e.message);
      return { error: drop.kind === "other" ? e.message : `${drop.title}. ${drop.body}`, alternatives: e.alternatives };
    }
    if (e instanceof LoyaltyError || e instanceof CustomerError || e instanceof VoucherError) return { error: e.message };
    throw e;
  }
  // The address this order ships to is kept for next time (up to five; "Home", "Work" or "Other").
  if (address && form.get("saveAddress") !== "no") await rememberAddress(customer.id, address, String(form.get("addressLabel") ?? "") || null).catch((e) => console.error("[checkout] address", e));
  await Promise.all([saveCart([]), savePromoCode(null), voucherCode ? saveVoucherCode(null) : Promise.resolve()]);
  redirect(order.status === "PENDING_PAYMENT" ? `/checkout/pay/${order.id}` : `/orders/${order.code}?placed=1`);
}
