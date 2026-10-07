"use server";
import { redirect } from "next/navigation";
import { getCustomer } from "@/server/auth";
import { startVoucherPurchase, VoucherError } from "@/server/shop/vouchers";

export type GiftState = { error?: string; values?: Record<string, string> };

/** Starts a voucher purchase and sends the member to the pay page. The voucher is issued when the order is paid. */
export async function buyVoucherAction(_: GiftState, form: FormData): Promise<GiftState> {
  const values = Object.fromEntries(["amount", "recipientName", "recipientEmail", "message"].map((k) => [k, String(form.get(k) ?? "")]));
  const customer = await getCustomer();
  if (!customer) return { error: "Sign in to buy a gift voucher.", values };
  let orderId: string;
  try {
    const { order } = await startVoucherPurchase({ customer, amountCents: Number(values.amount), recipientName: values.recipientName, recipientEmail: values.recipientEmail, message: values.message });
    orderId = order.id;
  } catch (e) {
    if (e instanceof VoucherError) return { error: e.message, values };
    throw e;
  }
  redirect(`/checkout/pay/${orderId}`);
}
