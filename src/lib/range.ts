// Ranges the shop doesn't show (owner's call, 24 Oct 2026): their categories and products stay in the database, so
// the tills, reports and HQ still see them, but the shop, sitemap and menu boards leave them out.
export const HIDDEN_CATEGORIES = ["skin-care", "protein-nutrition", "collagen-supplements"];

export const isHiddenCategory = (slug: string) => HIDDEN_CATEGORIES.includes(slug);

/** Prisma product filter: only products in a shown range. */
export const SHOWN_RANGE = { category: { slug: { notIn: HIDDEN_CATEGORIES } } };
