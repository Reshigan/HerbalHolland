// Product reviews with photos: verified purchases only, up to three JPG/PNG photos stored through the app's storage,
// the copy screen, and HQ moderation. A hidden review vanishes from the product page's reviews and rating.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { postPosSale } from "@/server/sales";
import { moderateReview, postReview, listReviews, reviewCounts, reviewWhere, ReviewError } from "@/server/reviews";
import { buildCards, productReviews, PRODUCT_INCLUDE } from "@/server/shop/catalogue";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70])], "oil.jpg", { type: "image/jpeg" });
const big = () => new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.jpg", { type: "image/jpeg" });

beforeAll(async () => {
  process.env.UPLOAD_DIR = `${process.cwd()}/.data/uploads-test`;
  await resetDb();
  w = await buildWorld();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("posting a review", () => {
  it("needs a verified purchase, then stores the photos and the review", async () => {
    const product = await db.product.findUniqueOrThrow({ where: { slug: "test-coffee" } });
    const base = { productId: product.id, customer: { id: w.walkIn.id, firstName: w.walkIn.firstName }, rating: 5, title: "Lovely", body: "Smooth, rich and exactly as described.", licensed: false };
    await expect(postReview({ ...base, photos: [] })).rejects.toThrow(/verified buyers/);
    // A verified buyer: a posted till sale of the product on their card (Seed members pay 3% less).
    await postPosSale(
      { id: randomUUID(), number: "TST01-RV0001", customerId: w.walkIn.id, lines: [{ variantId: w.coffeeV.id, qty: 1 }], payments: [{ method: "CASH", amountCents: Math.round(22_900 * 0.97) }], ageCheck: "ID_SIGHTED" },
      { storeId: w.store.id, deviceId: w.device.id, staffId: w.manager.id, staffName: "Staff" },
    );
    await expect(postReview({ ...base, photos: [], body: "It cures my anxiety." })).rejects.toThrow(/can't publish that as written/);
    await expect(postReview({ ...base, photos: [big()] })).rejects.toThrow(/5 MB/);
    await expect(postReview({ ...base, photos: [jpeg(), jpeg(), jpeg(), jpeg()] })).rejects.toThrow(/Up to 3/);
    await expect(postReview({ ...base, photos: [], licensed: true })).rejects.toThrow(/medicines/);

    const r = await postReview({ ...base, photos: [jpeg(), jpeg()] });
    expect(r).toMatchObject({ productId: product.id, customerId: w.walkIn.id, rating: 5, verified: true, hidden: false });
    expect(r.photoUploadIds).toHaveLength(2);
    const uploads = await db.upload.findMany({ where: { id: { in: r.photoUploadIds } } });
    expect(uploads.map((u) => u.contentType)).toEqual(["image/jpeg", "image/jpeg"]);
    expect(uploads[0].key).toMatch(/^reviews\/\d{4}-\d{2}\/[0-9a-f-]+\.jpg$/);
    expect(await db.auditLog.findFirst({ where: { action: "review.post", entityId: r.id } })).toMatchObject({ data: { rating: 5, photos: 2 } });
    await expect(postReview({ ...base, photos: [] })).rejects.toThrow(/already reviewed/);
  });

  it("shows on the product page and in its rating until HQ hides it, and comes back when shown again", async () => {
    const product = await db.product.findUniqueOrThrow({ where: { slug: "test-coffee" }, include: PRODUCT_INCLUDE });
    const review = await db.review.findFirstOrThrow({ where: { productId: product.id } });
    expect(await productReviews(product.id, 6)).toMatchObject({ count: 1, avg: 5 });
    expect((await buildCards([product], { tier: null }))[0].rating).toEqual({ avg: 5, count: 1 });

    await expect(moderateReview(review.id, true, "", { type: "USER", id: w.manager.id, name: w.manager.name })).rejects.toThrow(ReviewError);
    expect(await moderateReview(review.id, true, "Names a medical condition", { type: "USER", id: w.manager.id, name: w.manager.name })).toEqual({ changed: true, slug: "test-coffee" });
    expect(await db.review.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({ hidden: true, hiddenReason: "Names a medical condition", moderatedById: w.manager.id });
    expect(await productReviews(product.id, 6)).toMatchObject({ count: 0, avg: 0, rows: [] });
    expect((await buildCards([product], { tier: null }))[0].rating).toBeNull();
    expect(await db.auditLog.count({ where: { action: "review.hide", entityId: review.id } })).toBe(1);
    expect(await reviewCounts()).toMatchObject({ all: 1, photos: 1, hidden: 1 });
    expect((await listReviews(reviewWhere({ view: "hidden" }), 1)).rows[0]).toMatchObject({ id: review.id, moderator: w.manager.name });

    expect(await moderateReview(review.id, false, "", { type: "USER", id: w.manager.id, name: w.manager.name })).toEqual({ changed: true, slug: "test-coffee" });
    expect(await productReviews(product.id, 6)).toMatchObject({ count: 1 });
    expect((await listReviews(reviewWhere({ q: "smooth" }), 1)).total).toBe(1);
  });
});
