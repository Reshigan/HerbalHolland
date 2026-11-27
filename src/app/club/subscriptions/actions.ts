"use server";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getCustomer } from "@/server/auth";
import { cancelSubscription, changeStore, claimAllowance, pauseSubscription, resumeSubscription, subscribe, SubscriptionError } from "@/server/shop/subscriptions";
import type { Fulfilment } from "@/generated/prisma/client";

const HERE = "/club/subscriptions";
const back = (e: string): never => redirect(`${HERE}?e=${encodeURIComponent(e)}`);
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

/** Signs the member in again if needed and turns a SubscriptionError into a message on the page. */
async function run<T>(fn: (c: { id: string; firstName: string }) => Promise<T>): Promise<T> {
  const c = await getCustomer();
  if (!c) redirect(`/club/join?next=${HERE}`);
  try {
    return await fn(c);
  } catch (e) {
    if (e instanceof SubscriptionError) return back(e.message);
    throw e;
  }
}

export async function subscribeForm(form: FormData) {
  const { orderId } = await run((c) =>
    subscribe({
      customerId: c.id, planId: str(form, "planId"), storeId: str(form, "storeId"), fulfilment: str(form, "fulfilment") as Fulfilment,
      addressId: str(form, "addressId") || null, acceptTerms: form.get("acceptTerms") === "yes",
    }),
  );
  redirect(`/checkout/pay/${orderId}`);
}

export async function claimForm(form: FormData) {
  const items = [...form.entries()]
    .filter(([k]) => k.startsWith("q_"))
    .map(([k, v]) => ({ variantId: k.slice(2), qty: Math.max(0, Math.floor(Number(v) || 0)) }))
    .filter((i) => i.qty > 0);
  if (!items.length) back("Choose what you'd like this period");
  const { code } = await run((c) => claimAllowance({ customerId: c.id, subscriptionId: str(form, "id"), items }));
  redirect(`/orders/${code}?placed=1`);
}

export async function changeForm(form: FormData) {
  const act = str(form, "act");
  const subscriptionId = str(form, "id");
  const orderId = await run(async (c) => {
    const a = { customerId: c.id, firstName: c.firstName, subscriptionId };
    if (act === "pause") await pauseSubscription(a);
    else if (act === "cancel") await cancelSubscription(a);
    else if (act === "store") await changeStore({ ...a, storeId: str(form, "storeId") });
    else if (act === "resume") return (await resumeSubscription(a)).orderId;
    return null;
  });
  if (orderId) redirect(`/checkout/pay/${orderId}`);
  refresh();
}
