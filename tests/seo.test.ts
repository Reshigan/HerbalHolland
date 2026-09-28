import { describe, expect, it } from "vitest";
import {
  articleDateProblems,
  articleJsonLd,
  breadcrumbJsonLd,
  clampWords,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  gtinOf,
  metaDescription,
  openingHoursSpecification,
  organizationJsonLd,
  pageTitle,
  parseReviewer,
  parseSameAs,
  productJsonLd,
  serializeJsonLd,
  storeJsonLd,
  TITLE_MAX,
  websiteJsonLd,
} from "@/lib/seo";
import { ARTICLES, resolveArticle } from "@/components/shop/learn/articles";
import { resolvePrice, type PriceListRule } from "@/lib/pricing-rules";

const base = "https://shop.herbalholland.com";

describe("titles and descriptions", () => {
  it("keeps titles within 60 characters including the layout suffix", () => {
    expect(pageTitle("CBD Wellness")).toBe("CBD Wellness");
    const long = pageTitle("Heritage landraces & the people who grow them, and the co-operative");
    expect(long).toEqual({ absolute: expect.any(String) });
    expect((long as { absolute: string }).absolute.length).toBeLessThanOrEqual(TITLE_MAX);
    expect((long as { absolute: string }).absolute).toMatch(/…$/);
    // Fits on its own but not with the suffix: used as-is, without the suffix.
    expect(pageTitle("Registered patients & Section 21: how collection works")).toEqual({ absolute: "Registered patients & Section 21: how collection works" });
  });
  it("builds descriptions of 120–160 characters, adding fillers only while short", () => {
    const filler = "Lab-tested, batch-traceable, click & collect in store or delivered nationwide. Adults 18+.";
    const short = metaDescription("Oils, drops and capsules for everyday calm.", filler, "Never used");
    expect(short.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
    expect(short.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(short).not.toContain("Never used");
    // Still short after the first filler: the next part is added too.
    expect(metaDescription("Oils.", "Drops.", filler)).toContain(filler);
    const long = metaDescription("x".repeat(50) + " " + "word ".repeat(60), filler);
    expect(long.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(long).toMatch(/…$/);
    expect(metaDescription(null, undefined, false, "  a  b ")).toBe("a b");
    for (const a of ARTICLES) {
      const d = metaDescription(a.dek, "A plain-English guide from Herbal Holland. Adults 18+.");
      expect(d.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
      expect(d.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
  });
  it("clamps at a word boundary", () => {
    expect(clampWords("The quick brown fox jumps over the lazy dog", 20)).toBe("The quick brown fox…");
    expect(clampWords("short", 20)).toBe("short");
  });
});

describe("environment-driven facts", () => {
  it("parses the content reviewer and never invents one", () => {
    expect(parseReviewer(undefined)).toBeNull();
    expect(parseReviewer("")).toBeNull();
    expect(parseReviewer(" | Pharmacist | SAPC P1")).toBeNull();
    expect(parseReviewer("Jane Doe|Pharmacist|SAPC P12345")).toEqual({ name: "Jane Doe", jobTitle: "Pharmacist", credential: "SAPC P12345" });
    expect(parseReviewer("Jane Doe")).toEqual({ name: "Jane Doe" });
  });
  it("keeps only real profile URLs for sameAs", () => {
    expect(parseSameAs(undefined)).toEqual([]);
    expect(parseSameAs("")).toEqual([]);
    expect(parseSameAs("https://www.instagram.com/x, https://www.facebook.com/x https://www.instagram.com/x, not-a-url")).toEqual(["https://www.instagram.com/x", "https://www.facebook.com/x"]);
  });
});

describe("article dates and aliases", () => {
  const ok = { slug: "a", published: "2026-09-01", updated: "2026-09-20" };
  it("accepts good records and rejects updates before publication or in the future", () => {
    expect(articleDateProblems([ok], "2026-09-28")).toEqual([]);
    expect(articleDateProblems([{ ...ok, updated: "2026-08-31" }], "2026-09-28")).toHaveLength(1);
    expect(articleDateProblems([{ ...ok, updated: "2026-09-29" }], "2026-09-28")).toHaveLength(1);
    expect(articleDateProblems([{ ...ok, published: "2026-10-01", updated: "2026-10-01" }], "2026-09-28")).toHaveLength(2);
    expect(articleDateProblems([{ ...ok, published: "28/09/2026" }], "2026-09-28").join()).toContain("YYYY-MM-DD");
    expect(articleDateProblems([ok, { slug: "b", aliases: ["a"], published: "2026-09-01", updated: "2026-09-01" }], "2026-09-28").join()).toContain("already");
  });
  it("ships with valid dates and resolves aliases to one canonical article", () => {
    expect(articleDateProblems(ARTICLES, "2026-09-28")).toEqual([]);
    expect(resolveArticle("heritage-landraces")).toMatchObject({ alias: false, article: { slug: "heritage-landraces" } });
    expect(resolveArticle("heritage-landraces-story")).toMatchObject({ alias: true, article: { slug: "heritage-landraces" } });
    expect(resolveArticle("nope")).toBeNull();
  });
});

describe("JSON-LD builders", () => {
  it("Organization and WebSite", () => {
    const org = organizationJsonLd({ base, legalName: "Herbal Holland (Pty) Ltd", email: "hello@example.co.za", telephone: null, sameAs: [] });
    expect(org).toMatchObject({ "@context": "https://schema.org", "@type": "Organization", "@id": `${base}/#organization`, name: "Herbal Holland", url: `${base}/`, legalName: "Herbal Holland (Pty) Ltd", email: "hello@example.co.za" });
    expect(org.logo).toMatchObject({ "@type": "ImageObject", url: `${base}/pwa-icon/512` });
    expect(org).not.toHaveProperty("sameAs");
    expect(org).not.toHaveProperty("telephone");
    expect(organizationJsonLd({ base, sameAs: ["https://www.instagram.com/x"] }).sameAs).toEqual(["https://www.instagram.com/x"]);
    const site = websiteJsonLd(base);
    expect(site).toMatchObject({ "@type": "WebSite", url: `${base}/`, inLanguage: "en-ZA", publisher: { "@id": `${base}/#organization` } });
    expect((site.potentialAction as { target: { urlTemplate: string } }).target.urlTemplate).toBe(`${base}/shop?q={search_term_string}`);
  });
  it("BreadcrumbList with absolute items in order", () => {
    const b = breadcrumbJsonLd(base, [{ name: "Shop", path: "/shop" }, { name: "Grow", path: "/shop?category=grow" }, { name: "Seedling tray", path: "/p/seedling-tray" }]);
    expect(b["@type"]).toBe("BreadcrumbList");
    expect(b.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Shop", item: `${base}/shop` },
      { "@type": "ListItem", position: 2, name: "Grow", item: `${base}/shop?category=grow` },
      { "@type": "ListItem", position: 3, name: "Seedling tray", item: `${base}/p/seedling-tray` },
    ]);
  });
  it("Article with organisation author, dates, canonical and an optional reviewer", () => {
    const a = ARTICLES[0];
    const ld = articleJsonLd({ base, slug: a.slug, title: a.title, description: a.dek, published: a.published, updated: a.updated, reviewer: null });
    expect(ld).toMatchObject({
      "@type": "Article",
      headline: a.title,
      description: a.dek,
      url: `${base}/learn/${a.slug}`,
      mainEntityOfPage: { "@type": "WebPage", "@id": `${base}/learn/${a.slug}` },
      datePublished: a.published,
      dateModified: a.updated,
      author: { "@type": "Organization", name: "Herbal Holland" },
      publisher: { "@type": "Organization", name: "Herbal Holland", logo: { "@type": "ImageObject" } },
    });
    expect(ld).not.toHaveProperty("reviewedBy");
    expect(ld["@type"]).not.toBe("MedicalWebPage");
    const reviewed = articleJsonLd({ base, slug: a.slug, title: a.title, description: a.dek, published: a.published, updated: a.updated, reviewer: parseReviewer("Jane Doe|Pharmacist|SAPC P12345") });
    expect(reviewed.reviewedBy).toEqual({ "@type": "Person", name: "Jane Doe", jobTitle: "Pharmacist", hasCredential: { "@type": "EducationalOccupationalCredential", credentialCategory: "Professional registration", name: "SAPC P12345" } });
  });

  const product = {
    base,
    slug: "durban-poison-preroll",
    name: "Durban Poison pre-rolls",
    description: "Three 0.5 g pre-rolls.",
    brand: "Herbal Holland",
    category: "Pre-rolls",
    variants: [
      { id: "v1", sku: "PR-DP-3", name: "3 pack", barcode: "6001234567890", priceCents: 24_900, availability: "InStock" as const },
      { id: "v2", sku: "PR-DP-10", name: "10 pack", barcode: "12345", priceCents: 69_900, availability: "OutOfStock" as const, priceValidUntil: new Date("2026-10-31T21:59:59Z") },
    ],
  };
  it("Product: sku, gtin13 only from a real barcode, ZAR offers from stock, our organisation as brand", () => {
    const ld = productJsonLd({ ...product, rating: null, reviews: [] });
    expect(ld).toMatchObject({ "@type": "Product", name: product.name, sku: "PR-DP-3", gtin13: "6001234567890", category: "Pre-rolls", url: `${base}/p/${product.slug}` });
    expect(ld.brand).toMatchObject({ "@type": "Organization", name: "Herbal Holland" });
    const offers = ld.offers as Record<string, unknown>[];
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ "@type": "Offer", sku: "PR-DP-3", gtin13: "6001234567890", priceCurrency: "ZAR", price: "249.00", availability: "https://schema.org/InStock", url: `${base}/p/${product.slug}?v=v1` });
    expect(offers[0]).not.toHaveProperty("priceValidUntil");
    expect(offers[1]).toMatchObject({ price: "699.00", availability: "https://schema.org/OutOfStock", priceValidUntil: "2026-10-31" });
    expect(offers[1]).not.toHaveProperty("gtin13");
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(ld).not.toHaveProperty("review");
    expect(gtinOf("6001234567890")).toEqual({ gtin13: "6001234567890" });
    expect(gtinOf("12345678")).toEqual({ gtin8: "12345678" });
    expect(gtinOf("ABC")).toEqual({});
    expect(gtinOf(null)).toEqual({});
  });
  it("Product: a partner brand stays a Brand, never our organisation", () => {
    expect(productJsonLd({ ...product, brand: "Storz & Bickel" }).brand).toEqual({ "@type": "Brand", name: "Storz & Bickel" });
  });
  it("Product: ratings and reviews only when verified reviews exist", () => {
    const reviews = [{ rating: 5, title: "Lovely", body: "Smooth.", author: "Thandi M.", createdAt: new Date("2026-09-20T08:00:00Z") }];
    // A count without rows (or rows without a count) is not evidence: nothing is emitted.
    expect(productJsonLd({ ...product, rating: { avg: 4.5, count: 3 }, reviews: [] })).not.toHaveProperty("aggregateRating");
    expect(productJsonLd({ ...product, rating: { avg: 0, count: 0 }, reviews })).not.toHaveProperty("aggregateRating");
    const ld = productJsonLd({ ...product, rating: { avg: 4.6667, count: 3 }, reviews });
    expect(ld.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: "4.7", reviewCount: 3, bestRating: 5, worstRating: 1 });
    expect(ld.review).toEqual([{ "@type": "Review", author: { "@type": "Person", name: "Thandi M." }, datePublished: "2026-09-20", reviewRating: { "@type": "Rating", ratingValue: 5, bestRating: 5, worstRating: 1 }, name: "Lovely", reviewBody: "Smooth." }]);
  });
  it("Store: address, phone, geo and grouped opening hours from the record", () => {
    const hours = { mon: ["09:00", "18:00"] as [string, string], tue: ["09:00", "18:00"] as [string, string], wed: ["09:00", "18:00"] as [string, string], thu: ["09:00", "18:00"] as [string, string], fri: ["09:00", "20:00"] as [string, string], sat: ["09:00", "14:00"] as [string, string], sun: null };
    expect(openingHoursSpecification(hours)).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday"], opens: "09:00", closes: "18:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Friday"], opens: "09:00", closes: "20:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Saturday"], opens: "09:00", closes: "14:00" },
    ]);
    const ld = storeJsonLd({ base, slug: "hillcrest", name: "Hillcrest", addressLine: "12 Old Main Rd", suburb: "Hillcrest", city: "Durban", province: "KwaZulu-Natal", postalCode: "3610", lat: -29.781, lng: 30.7596, phone: "+27 31 000 0000", email: null, hours });
    expect(ld).toMatchObject({
      "@type": "Store",
      name: "Herbal Holland Hillcrest",
      url: `${base}/stores/hillcrest`,
      address: { "@type": "PostalAddress", streetAddress: "12 Old Main Rd, Hillcrest", addressLocality: "Durban", addressRegion: "KwaZulu-Natal", postalCode: "3610", addressCountry: "ZA" },
      telephone: "+27 31 000 0000",
      geo: { "@type": "GeoCoordinates", latitude: -29.781, longitude: 30.7596 },
      parentOrganization: { "@type": "Organization", name: "Herbal Holland" },
    });
    expect(ld).not.toHaveProperty("email");
    const bare = storeJsonLd({ base, slug: "s", name: "S", addressLine: "1", suburb: "A", city: "B", province: "Gauteng", postalCode: "0001", hours: {} });
    expect(bare).not.toHaveProperty("geo");
    expect(bare).not.toHaveProperty("telephone");
    expect(bare).not.toHaveProperty("openingHoursSpecification");
  });
  it("serialises safely for an inline script", () => {
    expect(serializeJsonLd({ name: "</script><b>" })).toBe('{"name":"\\u003c/script>\\u003cb>"}');
  });
});

describe("price validity for offers", () => {
  const at = new Date("2026-09-28T10:00:00+02:00");
  const mk = (over: Partial<PriceListRule>): PriceListRule => ({ id: "l", name: "List", kind: "ZONE", tiers: [], storeIds: [], regionIds: [], active: true, priority: 0, createdAt: at, items: [], ...over });
  const v = { variantId: "v", rrpCents: 65000, qty: 1 };
  const ctx = { channel: "ONLINE" as const, member: false, at };
  it("carries the end date of the list that set the price, and nothing otherwise", () => {
    expect(resolvePrice(v, [], ctx).validUntil).toBeNull();
    const ends = new Date("2026-10-31T21:59:59Z");
    const sale = mk({ id: "s", channel: "ONLINE", endsAt: ends, items: [{ variantId: "v", priceCents: 59000, minQty: 1 }] });
    expect(resolvePrice(v, [sale], ctx)).toMatchObject({ unitCents: 59000, validUntil: ends });
    expect(resolvePrice(v, [mk({ id: "open", channel: "ONLINE", items: [{ variantId: "v", priceCents: 59000, minQty: 1 }] })], ctx).validUntil).toBeNull();
    // A tier saving on top has no end date of its own.
    expect(resolvePrice(v, [sale], { ...ctx, member: true, tier: "SEED", tierPct: 3 }).validUntil).toBeNull();
  });
});
