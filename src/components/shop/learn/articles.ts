// Learn: editorial articles. Metadata lives here (home teaser, index, sitemap);
// bodies are React components in ./bodies.tsx.
export type ArticleMeta = {
  slug: string;
  title: string;
  dek: string;
  kicker: string;
  minutes: number;
  art: { slug: string; regClass: string; strain?: string };
};

export const ARTICLES: ArticleMeta[] = [
  {
    slug: "heritage-landraces",
    kicker: "Heritage",
    title: "Heritage landraces & the people who grow them",
    dek: "Durban Poison, Swazi Gold, Malawi Gold and the Wild Coast's own — and why we pay a fair price, agreed before planting.",
    minutes: 6,
    art: { slug: "heritage-landraces-story", regClass: "THC", strain: "SATIVA" },
  },
  {
    slug: "reading-lab-results",
    kicker: "Quality",
    title: "How to read a lab result",
    dek: "Every pack carries a batch code. Here's what the certificate of analysis behind it tells you — and what a PASS really means.",
    minutes: 5,
    art: { slug: "coa-lab-results", regClass: "HEMP" },
  },
  {
    slug: "cbd-schedule-0",
    kicker: "The law, plainly",
    title: "CBD & Schedule 0, explained",
    dek: "Why every CBD product shows milligrams per pack and per day, and why we only ever make a handful of modest claims.",
    minutes: 4,
    art: { slug: "cbd-schedule-zero", regClass: "CBD", strain: "CBD" },
  },
  {
    slug: "section-21",
    kicker: "Patients",
    title: "Registered patients & Section 21",
    dek: "How a doctor-led SAHPRA authorisation works, what we record (and what we deliberately don't), and how collection works in store.",
    minutes: 5,
    art: { slug: "section-twenty-one", regClass: "THC", strain: "INDICA" },
  },
  {
    slug: "responsible-use",
    kicker: "Responsible use",
    title: "Adults only, and always on your terms",
    dek: "Keep it locked away from children, start low, never drive — the plain-English basics we ask every member to live by.",
    minutes: 4,
    art: { slug: "responsible-use-guide", regClass: "GROW" },
  },
  {
    slug: "guilders",
    kicker: "Windmill Club",
    title: "How Guilders work",
    dek: "Earn on every rand you spend, climb from Seed to Harvest, and spend Guilders like cash in any store or online.",
    minutes: 3,
    art: { slug: "guilders-rewards", regClass: "APPAREL" },
  },
];

export const articleBySlug = (slug: string) => ARTICLES.find((a) => a.slug === slug);
