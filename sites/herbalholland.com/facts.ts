// The real-world facts the herbalholland.com pages use, and only these. The site builds without a database, so
// nothing here comes from the platform's demo data or seed: no demo registration numbers, addresses or partners.
// Change a fact here and rebuild (npx tsx sites/herbalholland.com/build.ts); the words around it live in ./content.
import { PROVINCES, type ProvinceCode } from "@/lib/sa";

/** A place on the globe, in decimal degrees (north and east positive). */
export type Place = { name: string; lat: number; lon: number };

/**
 * A store. One line each in `stores`, and everything follows from the list: the globe's pins and the map, /stores, the
 * new-stores chapter, and every count, place and date the site mentions. Only what we know goes in: the town, never
 * an address, hours or phone number we haven't been given.
 */
export type Store = {
  /** Stable id, and the store's anchor on /stores (/stores#hillcrest). */
  key: string;
  /** The store's name, as on its sign. */
  name: string;
  /** The town or city it's in. */
  city: string;
  province: ProvinceCode;
  /** Where it is, in decimal degrees, for the map and the globe. */
  lat: number;
  lon: number;
  /** Its opening day, YYYY-MM-DD: required while it's "opening"; left out for a store that's open when we don't have it. */
  opens?: string;
  status: "opening" | "open";
  /** Its street address, phone number and trading hours: shown on /stores and its own page only once we have them. */
  address?: string;
  phone?: string;
  /** Trading hours as the schema.org OpeningHoursSpecification expects them, e.g. "Mo-Fr 09:00-18:00", "Sa 09:00-14:00". */
  hours?: readonly string[];
  /** A photograph of the store (a file in ./static/stores), once the owner has shot it. Until then the store is drawn. */
  photo?: string;
};

/**
 * The online shop and Herbal Holland Rewards. While `url` is null neither is live: every "Shop online" leads to the
 * early-access sign-up, and "Join Rewards" and the store finder show an "opening soon" state. Set it (e.g.
 * "https://herbalholland.co.za") and those doors link there; joining goes to `${url}/club/join?src=site`.
 */
export type Shop = { url: string | null; opensLabel: string };

/** The registered details (ECT Act s43) of the company that owns the online business. Fill in the rest when known. */
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

  /** Herbal Holland's own profiles elsewhere (Instagram, Facebook, LinkedIn…), for the Organization's sameAs. Empty until the owner supplies the URLs. */
  social: [] as readonly string[],

  company: { legalName: "Vantax (Pty) Ltd", regNumber: null, vatNumber: null, address: null, phone: null } as Company,
  /** The Information Officer (POPIA, and PAIA requests), reached at email.hello. */
  officer: "Reshigan Govender",

  /**
   * Every store, in the order the site lists them. Pietermaritzburg and Umhlanga are open (we have no opening dates,
   * addresses or hours for them, so none are shown); Hillcrest and Hilton, two new stores in the KwaZulu-Natal hills,
   * open on the same day. The open stores' points are their towns' own (OpenStreetMap: Pietermaritzburg, and Umhlanga
   * Rocks), as is Hilton's, which gives the published 9,438 km from Amsterdam and 51 km from Hillcrest. Adding a store
   * is one line here; its address, phone, hours and photo appear on the site as soon as they're filled in.
   */
  stores: [
    { key: "pietermaritzburg", name: "Pietermaritzburg", city: "Pietermaritzburg", province: "KZN", lat: -29.6, lon: 30.3789, status: "open" },
    { key: "umhlanga", name: "Umhlanga", city: "Umhlanga", province: "KZN", lat: -29.73, lon: 31.0828, status: "open" },
    { key: "hillcrest", name: "Hillcrest", city: "Hillcrest", province: "KZN", lat: -29.781, lon: 30.7596, opens: "2026-12-01", status: "opening" },
    { key: "hilton", name: "Hilton", city: "Hilton", province: "KZN", lat: -29.5522, lon: 30.3017, opens: "2026-12-01", status: "opening" },
  ] as Store[],

  /** Where the story starts. */
  places: {
    amsterdam: { name: "Amsterdam", lat: 52.3676, lon: 4.9041 },
  } satisfies Record<string, Place>,
  /** Published distances, by great circle: from Amsterdam to a store (by key), and between the two new stores (the
   *  next opening day's). The build checks each against the coordinates above. */
  km: { hillcrest: 9475, hilton: 9438 } as Record<string, number>,
  kmBetweenStores: 51,

  /**
   * Where each category on the home page's shelf opens in the online shop once it's live: the shop's category slugs.
   * Check them against the live catalogue when the shop opens.
   */
  shelf: {
    cbd: "/shop?category=wellness",
    food: "/shop?category=coffee-drinks",
    skin: "/shop?category=skin-care",
    supplements: "/shop?category=collagen-supplements",
    accessories: "/shop?category=accessories",
    apparel: "/shop?category=apparel",
    grow: "/shop?category=grow",
  } as Record<string, string>,

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

// ── From the stores list ─────────────────────────────────────────────────────
/** Soonest first; a store without a date (open before we had one) keeps its place in the list, ahead of dated ones. */
const byDay = (a: Store, b: Store) => (a.opens ?? "").localeCompare(b.opens ?? "");

/** Stores that are open (in the list's order), and stores still to open (soonest first). */
export const openStores = () => FACTS.stores.filter((s) => s.status === "open");
export const openingStores = () => FACTS.stores.filter((s) => s.status === "opening").sort(byDay);

/** The next opening day (YYYY-MM-DD), or null when every store is open. */
export const nextOpening = () => openingStores()[0]?.opens ?? null;

/**
 * The new stores: the ones opening on the next opening day (Hillcrest and Hilton, in the hills) or, once every store
 * is open, the ones that opened last. The home page's "Holland, meet the Hills." chapter and the km story are theirs.
 */
export const newStores = () => {
  const next = nextOpening();
  const day = next ?? [...FACTS.stores].filter((s) => s.opens).sort(byDay).at(-1)?.opens;
  return FACTS.stores.filter((s) => s.opens && s.opens === day);
};

/** Provinces with a store, in the order they first appear in the list. */
export const storeProvinces = (stores: readonly Store[] = FACTS.stores) => [...new Set(stores.map((s) => s.province))];

/** "KwaZulu-Natal", "Gauteng and KwaZulu-Natal", "Gauteng, Western Cape and KwaZulu-Natal". */
export const provinceNames = (codes: readonly ProvinceCode[]) => listOf(codes.map((c) => PROVINCES[c]));

/** "Hillcrest", "Hillcrest and Hilton", "Hillcrest, Hilton and Durban". */
export const listOf = (items: readonly string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** Great-circle distance in km (mean Earth radius), to check the published figures against the coordinates. */
export function greatCircleKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}
