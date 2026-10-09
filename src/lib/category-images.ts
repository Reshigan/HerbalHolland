// Category pictures: studio renders of each category's products (scripts/render/products.py), served from
// public/catalogue/categories. A category HQ adds later has none until it's rendered; the page falls back to its icon.
const RENDERED = new Set(["flower", "pre-rolls", "edibles", "vapes", "concentrates", "wellness", "coffee-drinks", "protein-nutrition", "skin-care", "collagen-supplements", "accessories", "grow", "apparel"]);

export const categoryImage = (slug: string) => (RENDERED.has(slug) ? `/catalogue/categories/${slug}.jpg` : null);
