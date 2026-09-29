// Learn: editorial articles. Metadata lives here (home teaser, index, sitemap);
// bodies are React components in ./bodies.tsx.
//
// Dates are set by hand (YYYY-MM-DD): `published` when the guide first went live, `updated` whenever its copy changes.
// They are shown on the page and go into the Article schema, so keep them honest — the build refuses an `updated`
// earlier than `published` or a date in the future (assertArticleDates below).
import { assertArticleDates } from "@/lib/seo";

export type ArticleMeta = {
  /** The canonical URL is /learn/<slug>; anything in `aliases` redirects there permanently. */
  slug: string;
  aliases?: string[];
  title: string;
  dek: string;
  kicker: string;
  minutes: number;
  published: string;
  updated: string;
  art: { slug: string; regClass: string; strain?: string };
};

export const ARTICLES: ArticleMeta[] = [
  {
    slug: "heritage-landraces",
    aliases: ["heritage-landraces-story"],
    kicker: "Heritage",
    title: "Heritage landraces & the people who grow them",
    dek: "Durban Poison, Swazi Gold, Malawi Gold and the Wild Coast's own — and why we pay a fair price, agreed before planting.",
    minutes: 6,
    published: "2026-09-28",
    updated: "2026-09-28",
    art: { slug: "heritage-landraces-story", regClass: "THC", strain: "SATIVA" },
  },
  {
    slug: "reading-lab-results",
    aliases: ["coa-lab-results"],
    kicker: "Quality",
    title: "How to read a lab result",
    dek: "Every pack carries a batch code. Here's what the certificate of analysis behind it tells you — and what a PASS really means.",
    minutes: 5,
    published: "2026-09-28",
    updated: "2026-09-28",
    art: { slug: "coa-lab-results", regClass: "HEMP" },
  },
  {
    slug: "cbd-schedule-0",
    aliases: ["cbd-schedule-zero"],
    kicker: "The law, plainly",
    title: "CBD & Schedule 0, explained",
    dek: "Why every CBD product shows milligrams per pack and per day, and why we only ever make a handful of modest claims.",
    minutes: 4,
    published: "2026-09-28",
    updated: "2026-09-28",
    art: { slug: "cbd-schedule-zero", regClass: "CBD", strain: "CBD" },
  },
  {
    slug: "section-21",
    aliases: ["section-twenty-one"],
    kicker: "Patients",
    title: "Registered patients & Section 21",
    dek: "How a doctor-led SAHPRA authorisation works, what we record (and what we deliberately don't), and how collection works in store.",
    minutes: 5,
    published: "2026-09-28",
    updated: "2026-09-28",
    art: { slug: "section-twenty-one", regClass: "THC", strain: "INDICA" },
  },
  {
    slug: "responsible-use",
    aliases: ["responsible-use-guide"],
    kicker: "Responsible use",
    title: "Adults only, and always on your terms",
    dek: "Keep it locked away from children, start low, never drive — the plain-English basics we ask every member to live by.",
    minutes: 4,
    published: "2026-09-28",
    updated: "2026-09-28",
    art: { slug: "responsible-use-guide", regClass: "GROW" },
  },
  {
    slug: "points",
    aliases: ["rewards-points"],
    kicker: "Rewards",
    title: "How Rewards points work",
    dek: "Instant member prices from day one, points on every rand, and a climb from Seed to Harvest — in any store or online.",
    minutes: 3,
    published: "2026-09-28",
    updated: "2026-09-28",
    art: { slug: "rewards-points", regClass: "APPAREL" },
  },
];

assertArticleDates(ARTICLES);

export const articleBySlug = (slug: string) => ARTICLES.find((a) => a.slug === slug);

/** The article for a URL slug, and whether that slug is an alias (the page then redirects to the canonical URL). */
export function resolveArticle(slug: string): { article: ArticleMeta; alias: boolean } | null {
  const exact = articleBySlug(slug);
  if (exact) return { article: exact, alias: false };
  const aliased = ARTICLES.find((a) => a.aliases?.includes(slug));
  return aliased ? { article: aliased, alias: true } : null;
}
