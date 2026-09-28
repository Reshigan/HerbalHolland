// SEO for the shop (shop.herbalholland.com): titles, descriptions and JSON-LD builders as pure functions, so every
// page emits the same shapes and tests can check them. Nothing here invents data: ratings come only from verified
// reviews, the content reviewer only from CONTENT_REVIEWER, sameAs only from ORG_SAME_AS, dates only from the
// article records or updatedAt columns.
import { dayKey } from "@/lib/format";
import type { Hours } from "@/server/shop/hours";

export const SITE_NAME = "Herbal Holland";
export const LOCALE = "en_ZA";
export const LANGUAGE = "en-ZA";
/** The root layout's title template appends this to every page title. */
export const TITLE_SUFFIX = ` · ${SITE_NAME}`;
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 120;
export const DESCRIPTION_MAX = 160;

/** Public base URL without a trailing slash (APP_URL; the shop goes live at https://shop.herbalholland.com). */
export const siteUrl = (env: string | undefined = process.env.APP_URL) => (env || "http://localhost:3000").replace(/\/$/, "");
export const absoluteUrl = (base: string, path: string) => (/^https?:\/\//.test(path) ? path : `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`);

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Cuts at a word boundary and adds an ellipsis, so a clamp never ends mid-word. */
export function clampWords(text: string, max: number) {
  const s = squash(text);
  if (s.length <= max) return s;
  let cut = s.slice(0, max - 1);
  if (s[max - 1] !== " ") {
    const at = cut.lastIndexOf(" ");
    if (at > max * 0.6) cut = cut.slice(0, at);
  }
  return `${cut.replace(/[\s,;:.·—-]+$/, "")}…`;
}

/**
 * A page title that stays within 60 characters. Short names take the layout template (" · Herbal Holland"); longer
 * ones are used as-is without the suffix, and anything longer than 60 is clamped.
 */
export function pageTitle(name: string): string | { absolute: string } {
  const s = squash(name);
  if (s.length + TITLE_SUFFIX.length <= TITLE_MAX) return s;
  return { absolute: clampWords(s, TITLE_MAX) };
}

/**
 * Adds the parts in order until the description is at least 120 characters (later parts are fillers that only
 * appear when the real copy is short), then clamps to the limit at a word boundary.
 */
export function metaDescription(...parts: (string | null | undefined | false)[]) {
  let out = "";
  for (const p of parts) {
    if (!p || !p.trim()) continue;
    if (out.length >= DESCRIPTION_MIN) break;
    out = squash(`${out} ${p}`);
  }
  return clampWords(out, DESCRIPTION_MAX - 2);
}

// ── Configuration parsed from the environment ────────────────────────────────

export type Reviewer = { name: string; jobTitle?: string; credential?: string };

/** CONTENT_REVIEWER="Name|Pharmacist|SAPC P12345". Unset, blank or nameless → null (never invent a reviewer). */
export function parseReviewer(raw: string | undefined | null): Reviewer | null {
  if (!raw) return null;
  const [name, jobTitle, credential] = raw.split("|").map((s) => s.trim());
  if (!name) return null;
  return { name, ...(jobTitle ? { jobTitle } : {}), ...(credential ? { credential } : {}) };
}

/** ORG_SAME_AS: official profile URLs, comma or whitespace separated. Only http(s) URLs count; empty until supplied. */
export function parseSameAs(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\/\S+$/.test(s)))];
}

// ── Articles: dates and aliases ──────────────────────────────────────────────

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export type DatedArticle = { slug: string; published: string; updated: string; aliases?: string[] };

/** Problems with the article records: bad or future dates, an update before publication, or a duplicate slug/alias. */
export function articleDateProblems(articles: DatedArticle[], today: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of articles) {
    if (!DATE_RE.test(a.published)) out.push(`${a.slug}: published "${a.published}" is not YYYY-MM-DD`);
    if (!DATE_RE.test(a.updated)) out.push(`${a.slug}: updated "${a.updated}" is not YYYY-MM-DD`);
    if (a.updated < a.published) out.push(`${a.slug}: updated ${a.updated} is before published ${a.published}`);
    if (a.published > today) out.push(`${a.slug}: published ${a.published} is in the future (today ${today})`);
    if (a.updated > today) out.push(`${a.slug}: updated ${a.updated} is in the future (today ${today})`);
    for (const s of [a.slug, ...(a.aliases ?? [])]) {
      if (seen.has(s)) out.push(`${a.slug}: "${s}" is already another article's slug or alias`);
      seen.add(s);
    }
  }
  return out;
}

/** Throws at module load (so `next build` refuses) when an article's dates or aliases are wrong. */
export function assertArticleDates(articles: DatedArticle[], today = dayKey(new Date())) {
  const problems = articleDateProblems(articles, today);
  if (problems.length) throw new Error(`Learn articles: ${problems.join("; ")}`);
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────

type Ld = Record<string, unknown>;

/** Safe to inline in a <script type="application/ld+json">: `<` is escaped so "</script>" in copy can't break out. */
export const serializeJsonLd = (data: Ld | Ld[]) => JSON.stringify(data).replace(/</g, "\\u003c");

const orgId = (base: string) => `${base}/#organization`;
const logo = (base: string) => ({ "@type": "ImageObject", url: `${base}/pwa-icon/512`, width: 512, height: 512 });
const ogImage = (base: string) => `${base}/opengraph-image`;
/** A reference to the Organization, for author/publisher/seller/brand. */
export const organizationRef = (base: string): Ld => ({ "@type": "Organization", "@id": orgId(base), name: SITE_NAME, url: `${base}/` });
const ymd = (d: Date | string) => (typeof d === "string" && DATE_RE.test(d) ? d : dayKey(new Date(d)));

export type OrganizationInput = { base: string; legalName?: string | null; email?: string | null; telephone?: string | null; sameAs?: string[] };

export function organizationJsonLd(o: OrganizationInput): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": orgId(o.base),
    name: SITE_NAME,
    url: `${o.base}/`,
    logo: logo(o.base),
    ...(o.legalName ? { legalName: o.legalName } : {}),
    ...(o.email ? { email: o.email } : {}),
    ...(o.telephone ? { telephone: o.telephone } : {}),
    ...(o.sameAs?.length ? { sameAs: o.sameAs } : {}),
  };
}

export function websiteJsonLd(base: string): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}/#website`,
    url: `${base}/`,
    name: SITE_NAME,
    inLanguage: LANGUAGE,
    publisher: { "@id": orgId(base) },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${base}/shop?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export type Crumb = { name: string; path: string };

export function breadcrumbJsonLd(base: string, crumbs: Crumb[]): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absoluteUrl(base, c.path) })),
  };
}

function personJsonLd(r: Reviewer): Ld {
  return {
    "@type": "Person",
    name: r.name,
    ...(r.jobTitle ? { jobTitle: r.jobTitle } : {}),
    ...(r.credential ? { hasCredential: { "@type": "EducationalOccupationalCredential", credentialCategory: "Professional registration", name: r.credential } } : {}),
  };
}

export type ArticleInput = { base: string; slug: string; title: string; description: string; published: string; updated: string; reviewer?: Reviewer | null };

/** Article (never MedicalWebPage: the guides are general information, not medical authority). Author is the Organization. */
export function articleJsonLd(a: ArticleInput): Ld {
  const url = `${a.base}/learn/${a.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: clampWords(a.title, 110),
    description: a.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: a.published,
    dateModified: a.updated,
    inLanguage: LANGUAGE,
    isAccessibleForFree: true,
    image: [ogImage(a.base)],
    author: organizationRef(a.base),
    publisher: { "@type": "Organization", "@id": orgId(a.base), name: SITE_NAME, logo: logo(a.base) },
    ...(a.reviewer ? { reviewedBy: personJsonLd(a.reviewer) } : {}),
  };
}

export type Availability = "InStock" | "OutOfStock" | "InStoreOnly" | "PreOrder";
export type OfferInput = { id: string; sku: string; name: string; barcode?: string | null; priceCents: number; availability: Availability; priceValidUntil?: Date | string | null };
export type ReviewInput = { rating: number; title?: string | null; body?: string | null; author: string; createdAt: Date | string };
export type ProductInput = {
  base: string;
  slug: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  variants: OfferInput[];
  /** From verified Review rows only; null or count 0 → no AggregateRating. */
  rating?: { avg: number; count: number } | null;
  reviews?: ReviewInput[];
};

/** gtin8/12/13/14 from a barcode, only when it is one of those lengths of digits. */
export function gtinOf(barcode: string | null | undefined): Ld {
  const d = (barcode ?? "").replace(/\s/g, "");
  return /^\d+$/.test(d) && [8, 12, 13, 14].includes(d.length) ? { [`gtin${d.length}`]: d } : {};
}

const isOurBrand = (brand: string) => brand.trim().toLowerCase() === SITE_NAME.toLowerCase();

export function productJsonLd(p: ProductInput): Ld {
  const url = `${p.base}/p/${p.slug}`;
  const reviews = p.rating && p.rating.count > 0 ? (p.reviews ?? []).slice(0, 5) : [];
  const rated = !!p.rating && p.rating.count > 0 && reviews.length > 0;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: p.name,
    description: p.description,
    url,
    sku: p.variants[0]?.sku,
    ...gtinOf(p.variants[0]?.barcode),
    category: p.category,
    brand: isOurBrand(p.brand) ? organizationRef(p.base) : { "@type": "Brand", name: p.brand },
    offers: p.variants.map((v) => ({
      "@type": "Offer",
      url: `${url}?v=${v.id}`,
      sku: v.sku,
      name: v.name,
      ...gtinOf(v.barcode),
      priceCurrency: "ZAR",
      price: (v.priceCents / 100).toFixed(2),
      availability: `https://schema.org/${v.availability}`,
      itemCondition: "https://schema.org/NewCondition",
      ...(v.priceValidUntil ? { priceValidUntil: ymd(v.priceValidUntil) } : {}),
      seller: organizationRef(p.base),
    })),
    ...(rated
      ? {
          aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating!.avg.toFixed(1), reviewCount: p.rating!.count, bestRating: 5, worstRating: 1 },
          review: reviews.map((r) => ({
            "@type": "Review",
            author: { "@type": "Person", name: r.author },
            datePublished: ymd(r.createdAt),
            reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
            ...(r.title ? { name: r.title } : {}),
            ...(r.body ? { reviewBody: r.body } : {}),
          })),
        }
      : {}),
  };
}

const DAY: Record<keyof Hours, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const WEEK: (keyof Hours)[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** Days with the same open/close grouped into one specification each; closed days are left out. */
export function openingHoursSpecification(hours: Hours): Ld[] {
  const groups = new Map<string, string[]>();
  for (const k of WEEK) {
    const h = hours[k];
    if (!h) continue;
    const key = `${h[0]}-${h[1]}`;
    groups.set(key, [...(groups.get(key) ?? []), DAY[k]]);
  }
  return [...groups.entries()].map(([key, days]) => {
    const [opens, closes] = key.split("-");
    return { "@type": "OpeningHoursSpecification", dayOfWeek: days, opens, closes };
  });
}

export type StoreInput = {
  base: string;
  slug: string;
  name: string;
  addressLine: string;
  suburb: string;
  city: string;
  /** Full province name, e.g. "KwaZulu-Natal". */
  province: string;
  postalCode: string;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  email?: string | null;
  hours: Hours;
};

/** Store (a LocalBusiness) with address, phone, geo and opening hours from the store record; nothing assumed. */
export function storeJsonLd(s: StoreInput): Ld {
  const url = `${s.base}/stores/${s.slug}`;
  const hours = openingHoursSpecification(s.hours);
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${url}#store`,
    name: `${SITE_NAME} ${s.name}`,
    url,
    image: ogImage(s.base),
    address: {
      "@type": "PostalAddress",
      streetAddress: `${s.addressLine}, ${s.suburb}`,
      addressLocality: s.city,
      addressRegion: s.province,
      postalCode: s.postalCode,
      addressCountry: "ZA",
    },
    ...(s.phone ? { telephone: s.phone } : {}),
    ...(s.email ? { email: s.email } : {}),
    ...(s.lat != null && s.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: s.lat, longitude: s.lng } } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    currenciesAccepted: "ZAR",
    parentOrganization: organizationRef(s.base),
  };
}
