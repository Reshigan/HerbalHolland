"use server";
import { getSettings } from "@/server/settings";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { screenCopy } from "@/lib/compliance";

export type ReviewState = { ok?: boolean; error?: string };

/** Verified reviews only: the member must have bought the product (a posted sale). */
export async function submitReview(productId: string, _: ReviewState, form: FormData): Promise<ReviewState> {
  const customer = await getCustomer();
  if (!customer) return { error: "Sign in to write a review" };
  const product = await db.product.findUnique({ where: { id: productId }, select: { slug: true, regClass: true } });
  if (!product) return { error: "That product is no longer available" };
  if ((await getSettings()).compliance.licensedOnly.includes(product.regClass)) return { error: "Reviews aren't published for medicines" };
  const rating = Math.floor(Number(form.get("rating")));
  const title = String(form.get("title") ?? "").trim().slice(0, 80);
  const body = String(form.get("body") ?? "").trim().slice(0, 1200);
  if (!(rating >= 1 && rating <= 5)) return { error: "Choose a star rating" };
  if (body.length < 10) return { error: "Tell other members a little more (at least a sentence)" };
  const bought = await db.saleLine.findFirst({ where: { sale: { customerId: customer.id, kind: "SALE" }, variant: { productId } }, select: { id: true } });
  if (!bought) return { error: "Reviews are from verified buyers only" };
  // Reviews are published on product pages, so the same copy rules as our own marketing apply.
  const flags = screenCopy(`${title} ${body}`);
  if (flags.length)
    return { error: `We can't publish that as written (“${flags[0].term}”). Keep reviews to taste, aroma, quality and experience — no health or medical claims, please.` };
  try {
    await db.review.create({ data: { productId, customerId: customer.id, rating, title: title || null, body, verified: true } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "You've already reviewed this product — thank you!" };
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
