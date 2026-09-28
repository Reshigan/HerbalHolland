// herbalholland.com — the real-world facts the pages use, and only these. The site builds without a database, so
// nothing here comes from the platform's demo data or seed: no demo registration numbers, addresses or partners.
// Change a fact here and rebuild (npx tsx sites/herbalholland.com/build.ts); the words around it live in ./content.

/** A place on the globe, in decimal degrees (north and east positive). */
export type Place = { name: string; lat: number; lon: number };

export type Store = { key: "hillcrest" | "hilton"; name: string; province: string; opens: string; trading: boolean };

/**
 * The online shop and Herbal Holland Rewards. While `url` is null neither is live: every "Shop online", "Join Rewards"
 * and store-finder door on the site shows an "opening soon" state instead of a link. Set it (e.g.
 * "https://herbalholland.co.za") and those doors link there; joining goes to `${url}/club/join?src=site`.
 */
export type Shop = { url: string | null; opensLabel: string };

/** The company's registered details (ECT Act s43). Unknown for now: fill them in when they are, and they appear. */
export type Company = { legalName: string | null; regNumber: string | null; vatNumber: string | null; address: string | null; phone: string | null };

export const FACTS = {
  origin: "https://herbalholland.com",
  brand: "Herbal Holland",

  email: {
    hello: "hello@herbalholland.com",
    franchise: "franchise@herbalholland.com",
    press: "press@herbalholland.com",
    careers: "careers@herbalholland.com",
  },

  shop: { url: null, opensLabel: "Opening soon" } as Shop,

  company: { legalName: null, regNumber: null, vatNumber: null, address: null, phone: null } as Company,

  /** The first two stores: both in KwaZulu-Natal, both opening on the same day. None is trading yet. */
  stores: [
    { key: "hillcrest", name: "Hillcrest", province: "KwaZulu-Natal", opens: "2026-12-01", trading: false },
    { key: "hilton", name: "Hilton", province: "KwaZulu-Natal", opens: "2026-12-01", trading: false },
  ] as Store[],
  opening: "2026-12-01", // Tuesday 1 December 2026
  kmBetweenStores: 51, // Hillcrest to Hilton, about

  /** Amsterdam to our first store, by great circle. */
  places: {
    amsterdam: { name: "Amsterdam", lat: 52.3676, lon: 4.9041 },
    hillcrest: { name: "Hillcrest", lat: -29.781, lon: 30.7596 },
  } satisfies Record<string, Place>,
  km: { hillcrest: 9475, hilton: 9438 },

  /** Founding Members: the first 2,026 members of Herbal Holland Rewards. Joining is free, adults 18+. */
  founding: {
    cap: 2026,
    tier: "Sprout",
    // Kept for the record, never shown: herbalholland.com carries no prices, deals or discounts.
    savings: "5% instant savings",
    months: 14,
    minAge: 18,
  },
} as const;

/** A link on the shop (null while the shop isn't live). */
export const shopLink = (path = "/") => (FACTS.shop.url ? `${FACTS.shop.url.replace(/\/$/, "")}${path}` : null);

/** Joining Herbal Holland Rewards from this site, tagged so these sign-ups show in the platform's reports. */
export const joinLink = () => shopLink("/club/join?src=site");

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Tuesday 1 December 2026" from "2026-12-01" (a calendar date, so no time zone can move it). */
export function longDate(day: string, { weekday = true } = {}) {
  const [y, m, d] = day.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${weekday ? `${DAYS[w]} ` : ""}${d} ${MONTHS[m - 1]} ${y}`;
}

/** "1 Dec" from "2026-12-01". */
export const shortDay = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
};

/** Great-circle distance in km (mean Earth radius), to check the published figures against the coordinates. */
export function greatCircleKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}
