# Search (shop.herbalholland.com)

The shop is indexed at `APP_URL` (production: `https://shop.herbalholland.com`); the corporate site herbalholland.com
is separate. Titles, descriptions and structured data are built by the pure helpers in `src/lib/seo.ts`
(tested in `tests/seo.test.ts`; routes in `tests/integration/seo.test.ts`). Health content is YMYL, so nothing is
invented: ratings come only from verified member reviews, the reviewer only from `CONTENT_REVIEWER`, profile links
only from `ORG_SAME_AS`, and dates only from the article records or `updatedAt` columns.

## What each page emits

| Page | `<head>` | JSON-LD |
|---|---|---|
| `/` | canonical, Open Graph | `Organization` (name, logo, legal name/email/phone from the franchisor company, `sameAs` from `ORG_SAME_AS`) + `WebSite` (with `SearchAction` → `/shop?q=`) |
| `/shop`, `/shop?category=…`, `/shop?mood=…` | one canonical per category/mood; searches (`q`), price/sort filters and unknown categories are `noindex, follow` | `BreadcrumbList` (Shop › Category) on category pages |
| `/p/[slug]` | canonical, Open Graph; licensed medicines get a generic "Dispensary" title and `noindex, nofollow` | `Product` (sku, `gtin8/12/13/14` from the variant barcode, category, brand = our `Organization` when the brand is Herbal Holland, else a `Brand`; one ZAR `Offer` per variant with availability from real network stock, `priceValidUntil` only when the price comes from a price list with an end date; `AggregateRating` + up to 5 `Review`s only when verified reviews exist) + `BreadcrumbList` (Shop › Category › Product). Not emitted for licensed products |
| `/stores/[slug]` | canonical, Open Graph | `Store` (address, telephone, email, geo, `openingHoursSpecification` from the store's hours, `parentOrganization`) + `BreadcrumbList` (Stores › Province › Store) |
| `/learn/[slug]` | canonical, Open Graph `article` with published/modified times | `Article` (headline, description, `datePublished`, `dateModified`, author + publisher = the Organization, `mainEntityOfPage`, `reviewedBy` only when `CONTENT_REVIEWER` is set; the type is never `MedicalWebPage`) + `BreadcrumbList` (Learn › Article) |
| `/legal/[slug]`, `/learn`, `/stores`, `/drops` | canonical, Open Graph | — |
| `/sitemap.xml` | public pages only: never licensed products, `/dispensary` or `/batch/`; `lastmod` only from `Product.updatedAt` (products, and the newest product for a category) and article `updated` dates. Stores and static pages have no timestamp, so none is claimed. Bounded (20,000 products, 5,000 stores). | |
| `/robots.txt` | allows the storefront; disallows HQ, store back office, POS, API, cart/checkout, orders, Rewards account, invoices, menu boards, batch certificates, the dispensary and brand assets | |

Product art is generated SVG, so `Product` has no `image`; Google's product rich results want one, which is a
photography task, not a markup one.

## Learn articles: dates, reviewer, aliases

- `src/components/shop/learn/articles.ts` holds `published` and `updated` (YYYY-MM-DD) per guide. Set `updated`
  whenever the copy changes; the build refuses an `updated` earlier than `published`, either date in the future, or
  a slug/alias used twice (`assertArticleDates` runs at module load). Both dates are shown on the page and in the schema.
- `CONTENT_REVIEWER="Name|Job title|Registration"` (e.g. `Jane Doe|Pharmacist|SAPC P12345`) shows "Reviewed by …" on
  every guide and sets `Article.reviewedBy`. Leave it unset until a real, registered person has reviewed the guides.
- One URL per guide: `aliases` (old or alternative slugs) redirect permanently (308) to `/learn/<slug>` and are not
  in the sitemap.

## Search Console

1. In Search Console add a **Domain** property for `herbalholland.com` (DNS TXT record in Cloudflare) so every
   subdomain, including `shop.herbalholland.com`, is covered; or a URL-prefix property `https://shop.herbalholland.com/`
   verified with a DNS record or the `verification.google` field in `src/app/layout.tsx`.
2. Submit `https://shop.herbalholland.com/sitemap.xml` (Sitemaps). Check `robots.txt` in the Settings → robots.txt report.
3. After the first crawl, review Pages (indexing: licensed products and `/dispensary` should be excluded by noindex),
   Enhancements → Products, Breadcrumbs, Articles (schema validity) and Core Web Vitals. Use the URL Inspection tool on
   a product, a store and a guide to confirm the rendered JSON-LD; the Rich Results Test does the same before launch.
4. Set `ORG_SAME_AS` once the brand's profiles exist, and add the store pages to Google Business Profile listings
   (each store's website URL → `https://shop.herbalholland.com/stores/<slug>`).
