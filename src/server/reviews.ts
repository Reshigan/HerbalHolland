// Product reviews: verified purchases only (the member bought the product), up to three photos, and HQ moderation.
// A hidden review stays on record (POPIA export, the member's own view) but is never shown on the product page nor
// counted in its rating or structured data (productReviews and ratingsFor in @/server/shop/catalogue read `hidden`).
import { db, type Prisma } from "./db";
import { audit, type Actor } from "./audit";
import { storePhotos, UploadError } from "./uploads";
import { screenCopy } from "@/lib/compliance";
import { likeTerm } from "@/lib/search";

export class ReviewError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

export const REVIEW_PHOTOS = { max: 3, maxBytes: 5 * 1024 * 1024, note: "Up to 3 photos of the product, JPG or PNG, 5 MB each" } as const;
export const REVIEW_LIMITS = { title: 80, bodyMin: 10, body: 1_200 } as const;

/**
 * Posts a member's review of a product they bought (a posted sale line), with its photos. Reviews are published on
 * product pages, so the same copy rules as our own marketing apply (screenCopy). Medicines never carry reviews.
 */
export async function postReview(a: { productId: string; customer: { id: string; firstName: string }; rating: number; title: string; body: string; photos: File[]; licensed: boolean }) {
  if (a.licensed) throw new ReviewError("Reviews aren't published for medicines");
  const rating = Math.floor(a.rating);
  const title = a.title.trim().slice(0, REVIEW_LIMITS.title);
  const body = a.body.trim().slice(0, REVIEW_LIMITS.body);
  if (!(rating >= 1 && rating <= 5)) throw new ReviewError("Choose a star rating", "rating");
  if (body.length < REVIEW_LIMITS.bodyMin) throw new ReviewError("Tell other members a little more (at least a sentence)", "body");
  const bought = await db.saleLine.findFirst({ where: { sale: { customerId: a.customer.id, kind: "SALE" }, variant: { productId: a.productId } }, select: { id: true } });
  if (!bought) throw new ReviewError("Reviews are from verified buyers only");
  const flags = screenCopy(`${title} ${body}`);
  if (flags.length) throw new ReviewError(`We can't publish that as written (“${flags[0].term}”). Keep reviews to taste, aroma, quality and experience, with no health or medical claims, please.`, "body");
  if (await db.review.findUnique({ where: { productId_customerId: { productId: a.productId, customerId: a.customer.id } }, select: { id: true } })) throw new ReviewError("You've already reviewed this product. Thank you!");
  let photoUploadIds: string[] = [];
  try {
    photoUploadIds = await storePhotos({ files: a.photos, max: REVIEW_PHOTOS.max, folder: "reviews", uploadedById: a.customer.id });
  } catch (e) {
    if (e instanceof UploadError) throw new ReviewError(e.message, "photos");
    throw e;
  }
  try {
    const review = await db.review.create({ data: { productId: a.productId, customerId: a.customer.id, rating, title: title || null, body, verified: true, photoUploadIds } });
    await audit(db, { type: "CUSTOMER", id: a.customer.id, name: a.customer.firstName }, "review.post", { entity: "Review", entityId: review.id, data: { productId: a.productId, rating, photos: photoUploadIds.length } });
    return review;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new ReviewError("You've already reviewed this product. Thank you!");
    throw e;
  }
}

// ── Moderation (HQ) ─────────────────────────────────────────────────────────

export const REVIEW_VIEWS = ["all", "photos", "hidden", "low"] as const;
export type ReviewView = (typeof REVIEW_VIEWS)[number];
export const reviewView = (v: string | undefined): ReviewView => ((REVIEW_VIEWS as readonly string[]).includes(v ?? "") ? (v as ReviewView) : "all");

export function reviewWhere(f: { view?: string; q?: string }): Prisma.ReviewWhereInput {
  const view = reviewView(f.view);
  const q = likeTerm((f.q ?? "").trim());
  return {
    AND: [
      view === "photos" ? { photoUploadIds: { not: [] } } : view === "hidden" ? { hidden: true } : view === "low" ? { rating: { lte: 2 } } : {},
      q ? { OR: [{ product: { name: { contains: q } } }, { title: { contains: q } }, { body: { contains: q } }] } : {},
    ],
  };
}

export async function listReviews(where: Prisma.ReviewWhereInput, page: number, pageSize = 25) {
  const [rows, total] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { product: { select: { id: true, name: true, slug: true, regClass: true, strain: true } }, customer: { select: { id: true, firstName: true, lastName: true, memberNo: true } } },
    }),
    db.review.count({ where }),
  ]);
  const ids = [...new Set(rows.flatMap((r) => (r.moderatedById ? [r.moderatedById] : [])))];
  const people = new Map((ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  return { rows: rows.map((r) => ({ ...r, moderator: r.moderatedById ? (people.get(r.moderatedById) ?? "Former staff member") : null })), total };
}

export async function reviewCounts() {
  const [all, photos, hidden, low] = await Promise.all([db.review.count(), db.review.count({ where: { photoUploadIds: { not: [] } } }), db.review.count({ where: { hidden: true } }), db.review.count({ where: { rating: { lte: 2 } } })]);
  return { all, photos, hidden, low };
}

/** Hides a review (with the reason the team records) or shows it again. Audited; the product page is revalidated by the action. */
export async function moderateReview(id: string, hidden: boolean, reason: string, actor: Actor & { id: string }) {
  const r = await db.review.findUnique({ where: { id }, include: { product: { select: { slug: true } } } });
  if (!r) throw new ReviewError("Review not found");
  const text = reason.trim().slice(0, 300);
  if (hidden && text.length < 3) throw new ReviewError("Say why it's hidden (the team sees it; the member doesn't)", "reason");
  if (r.hidden === hidden) return { changed: false, slug: r.product.slug };
  await db.review.update({ where: { id }, data: { hidden, hiddenReason: hidden ? text : null, moderatedById: actor.id, moderatedAt: new Date() } });
  await audit(db, actor, hidden ? "review.hide" : "review.show", { entity: "Review", entityId: id, data: { productId: r.productId, reason: hidden ? text : null } });
  return { changed: true, slug: r.product.slug };
}
