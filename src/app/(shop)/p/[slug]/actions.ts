"use server";
import { getSettings } from "@/server/settings";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { postReview, ReviewError } from "@/server/reviews";
import { filesIn } from "@/server/uploads";

export type ReviewState = { ok?: boolean; error?: string; values?: { rating: string; title: string; body: string } };

/** Verified reviews only: the member must have bought the product (a posted sale). */
export async function submitReview(productId: string, _: ReviewState, form: FormData): Promise<ReviewState> {
  const r = await review(productId, form);
  // React resets the form once the action returns: an error sends the rating and text back, so the member can edit it.
  return r.ok ? r : { ...r, values: { rating: String(form.get("rating") ?? ""), title: String(form.get("title") ?? ""), body: String(form.get("body") ?? "") } };
}

async function review(productId: string, form: FormData): Promise<ReviewState> {
  const customer = await getCustomer();
  if (!customer) return { error: "Sign in to write a review" };
  const product = await db.product.findUnique({ where: { id: productId }, select: { slug: true, regClass: true } });
  if (!product) return { error: "That product is no longer available" };
  try {
    await postReview({
      productId,
      customer,
      rating: Number(form.get("rating")),
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      photos: filesIn(form, "photos"),
      licensed: (await getSettings()).compliance.licensedOnly.includes(product.regClass),
    });
  } catch (e) {
    if (e instanceof ReviewError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/p/${product.slug}`);
  return { ok: true };
}

export type AlertState = { ok?: boolean; error?: string };

export async function requestStockAlert(variantId: string): Promise<AlertState> {
  const customer = await getCustomer();
  if (!customer) return { error: "Sign in so we know who to tell" };
  const v = await db.variant.findUnique({ where: { id: variantId }, select: { id: true } });
  if (!v) return { error: "That item is no longer available" };
  await db.stockAlert.upsert({
    where: { customerId_variantId: { customerId: customer.id, variantId } },
    create: { customerId: customer.id, variantId },
    update: { notifiedAt: null, createdAt: new Date() },
  });
  return { ok: true };
}
