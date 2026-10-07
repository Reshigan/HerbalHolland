// Campaign Studio (HQ → Marketing → Studio), the pure parts: a playbook laid out from day T into dated drafts, the
// {fields} filled from the store and the day, and each draft screened for the channel it goes out on. The playbooks
// are in ./studio-playbooks/ (one file per pack); cards, scheduling and Postiz in src/server/studio.ts.
//   SOCIAL     Instagram, Facebook, Threads, Bluesky, Telegram, LinkedIn: whatever is connected in Postiz
//   WHATSAPP   the brand's WhatsApp Channel, posted by hand (WhatsApp's API can't carry a cannabis brand)
//   GOOGLE     the store's Google Business Profile, posted by hand
//   EMAIL, SMS, PUSH   members' own channels, sent as a campaign (consent, CPA windows and opt-out as always)
import { ALLERGENS, screenCopy, type RegClass } from "./compliance";
import { screenSocial } from "./social";
import { holidayName } from "./sa";

export const STUDIO_CHANNELS = {
  SOCIAL: { label: "Social", hand: false },
  WHATSAPP: { label: "WhatsApp Channel", hand: true },
  GOOGLE: { label: "Google profile", hand: true },
  EMAIL: { label: "Email", hand: false },
  SMS: { label: "SMS", hand: false },
  PUSH: { label: "Push", hand: false },
} as const;
export type StudioChannel = keyof typeof STUDIO_CHANNELS;
export const OWN_CHANNELS: StudioChannel[] = ["EMAIL", "SMS", "PUSH"];

/**
 * Brand cards (src/server/studio-cards.tsx), each drawn in the brand's type and colours with the windmill and "Adults 18+":
 *   headline   a big line and a smaller one                      reveal     the line over the KwaZulu-Natal hills
 *   event      eyebrow = the event, headline = the day, sub = time and place
 *   countdown  headline = the number ("7 days"), sub = what for   promise    headline + up to five short lines, ticked
 *   merch      a picture from public/social (`image`, a SOCIAL_IMAGES key) with the headline and sub
 */
export type CardTemplate = "headline" | "reveal" | "event" | "countdown" | "promise" | "merch";
export type Card = { template: CardTemplate; eyebrow?: string; headline: string; sub?: string; lines?: string[]; image?: string };
export const CARD_TEMPLATES: Record<CardTemplate, string> = { headline: "Headline", reveal: "Over the hills", event: "Event", countdown: "Countdown", promise: "Promise", merch: "Merch picture" };
export const CARD_LIMITS = { eyebrow: 40, headline: 60, sub: 100, line: 60, lines: 5 } as const;

export type PlaybookItem = {
  key: string;
  /** Days from day T (negative before it). */
  day: number;
  /** HH:MM, South African time. */
  time: string;
  channel: StudioChannel;
  /** Email subject or push title. */
  title?: string;
  text: string;
  /** Social only: 280 characters at most, for Threads, Bluesky and X when the caption is longer. */
  short?: string;
  card?: Card;
  /** Its words name its day ("today", "tomorrow", "7 days", "last call"): never moved, and day T is refused if it can't go out then. */
  pinned?: true;
  /** When several stores open on one day: posted once, by the first store's campaign, naming every town ({towns}). */
  shared?: true;
  /** Members' channels: who gets it, as a campaign audience (src/lib/rfm.ts). Default: everyone (a store's members for a store). */
  audience?: string;
  /** Social: LinkedIn as well ("also") or only ("only"). Left out, LinkedIn doesn't get it. */
  linkedin?: "also" | "only";
  /** What to shoot for it: the photo or Reel that makes it. The card goes out until someone posts it by hand. */
  brief?: string;
};

export type Playbook = {
  key: string;
  name: string;
  blurb: string;
  /** Laid out for one store: its fields fill the copy, and own-channel sends go to its home-store members. */
  store: boolean;
  /** What day T is, e.g. "Doors open". */
  anchor: string;
  /** Day T must fall on this weekday (0 Sunday … 6 Saturday), and `why` says why. */
  weekday?: number;
  why?: string;
  /** Written for one month: day T is this date (YYYY-MM-DD). */
  date?: string;
  /** Laid out for one product: {product}, {facts}, {category} and {link} come from it. */
  product?: true;
  items: PlaybookItem[];
};

/**
 * {store} {town} {address} {hours} come from the store, {towns} names every store opening that day; {product} {facts}
 * {category} {link} come from the product; {date} is day T, e.g. "Tuesday 1 December".
 */
export type Fields = Partial<Record<"store" | "town" | "towns" | "address" | "hours" | "product" | "facts" | "category" | "link", string>> & { date: string };

export const LIMITS = { SOCIAL: 2200, SHORT: 280, WHATSAPP: 1000, GOOGLE: 1500, SMS: 480, PUSH: 140, PUSH_TITLE: 40, EMAIL_TITLE: 90 } as const;

const TOKEN = /\{(store|towns|town|address|hours|date|product|facts|category|link)\}/g;
export const fill = (s: string, f: Fields) => s.replace(TOKEN, (m, k: keyof Fields) => f[k] ?? m);

function fillCard(c: Card, f: Fields): Card {
  return { ...c, eyebrow: c.eyebrow && fill(c.eyebrow, f), headline: fill(c.headline, f), sub: c.sub && fill(c.sub, f), lines: c.lines?.map((l) => fill(l, f)) };
}

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** A South African wall-clock time as an instant (SAST is UTC+2 all year). */
export const sastAt = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+02:00`);
export const weekdayOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Day T as the copy says it: "Tuesday 1 December". */
export const longDate = (ymd: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${ymd}T12:00:00Z`)).replace(",", "");

export type Draft = Omit<PlaybookItem, "day" | "time"> & { at: Date; moved?: string; blocked?: string };

/** Why a day doesn't suit a channel: a public holiday (no brand posts, no direct marketing), or a Sunday for members' channels (CPA Regulation 4). */
function closed(ymd: string, channel: StudioChannel) {
  const holiday = holidayName(sastAt(ymd, "12:00"));
  if (holiday) return holiday;
  return OWN_CHANNELS.includes(channel) && weekdayOf(ymd) === 0 ? "a Sunday (no direct marketing on Sundays)" : null;
}

/**
 * The playbook's items on the calendar, fields filled. An item that can't go out on its day moves to the next day that
 * allows it, with a note saying why, unless it's pinned (its words name its day): then it's `blocked`, and the
 * campaign needs another day T.
 */
export function layout(pb: Playbook, anchor: string, f: Fields, stagger = 0): Draft[] {
  return pb.items
    .map(({ day, time, ...it }) => {
      const later = it.channel === "SOCIAL" && !it.pinned ? stagger : 0;
      let ymd = addDays(anchor, day + later);
      let moved = later ? `${later} days after the first store's, so each town gets its moment` : undefined;
      let blocked: string | undefined;
      const why = closed(ymd, it.channel);
      if (why && it.pinned) blocked = `${longDate(ymd)} is ${why}`;
      else if (why) {
        moved = `Moved from ${why}`;
        for (let i = 0; i < 7 && closed(ymd, it.channel); i++) ymd = addDays(ymd, 1);
      }
      return {
        ...it,
        title: it.title && fill(it.title, f),
        text: fill(it.text, f),
        short: it.short && fill(it.short, f),
        card: it.card && fillCard(it.card, f),
        at: sastAt(ymd, time),
        ...(moved && { moved }),
        ...(blocked && { blocked }),
      };
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The first day T on or after `from` (YYYY-MM-DD) the playbook can start on: its weekday, with no pinned post refused. */
export function firstDayT(pb: Playbook, from: string) {
  for (let d = from, i = 0; i < 366; d = addDays(d, 1), i++)
    if ((pb.weekday === undefined || weekdayOf(d) === pb.weekday) && !layout(pb, d, { date: longDate(d) }).some((x) => x.blocked)) return d;
  throw new Error(`${pb.key} has no day T in the coming year`);
}

/**
 * One feed post a day across every campaign (LinkedIn-only posts aside): a post landing on a day that already has one (`busy`, YYYY-MM-DD
 * in South African time) moves up to three days later, keeping its time. Pinned posts stay where they are (opening day
 * has its morning and its evening), noting another campaign's post that day. Returns the drafts, their days added to `busy`.
 */
export function spreadFeed(drafts: Draft[], busy: Set<string>, ymdOf: (d: Date) => string): Draft[] {
  const feed = (d: Draft) => d.channel === "SOCIAL" && d.linkedin !== "only";
  const others = new Set(busy);
  for (const d of drafts) if (feed(d) && d.pinned) busy.add(ymdOf(d.at)); // they can't move, so their days go first
  return drafts.map((d) => {
    if (!feed(d)) return d;
    const day = ymdOf(d.at);
    if (d.pinned) return others.has(day) ? { ...d, moved: d.moved ?? "Another campaign posts that day: move its post" } : d;
    if (!busy.has(day)) return busy.add(day), d;
    for (let n = 1; n <= 3; n++) {
      const next = addDays(day, n);
      if (busy.has(next) || holidayName(sastAt(next, "12:00"))) continue;
      busy.add(next);
      return { ...d, at: new Date(d.at.getTime() + n * 86_400_000), moved: d.moved ?? "Moved so the feed gets one post a day" };
    }
    return { ...d, moved: d.moved ?? "Shares its day with another post: move one" };
  });
}

/** Who hears about a new product: the members who chose its interest. Licensed medicines are never marketed. */
export function interestFor(c: RegClass): string | null {
  if (c === "THC") return null;
  return c === "ACCESSORY" ? "interest:ACCESSORY" : c === "APPAREL" ? "interest:APPAREL" : c === "GROW" ? "interest:GROW" : "interest:CBD";
}

const num = (n: number) => new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 1 }).format(n);

/** A product's facts as one plain line for a launch email: its pack, its CBD (Schedule 0 limits), its allergens. */
export function productFacts(p: { netContent: number | null; netUnit: string | null; cbdMgPerPack: number | null; cbdMgPerDay: number | null; allergens: string[] }) {
  const parts = [
    p.netContent && p.netUnit ? `${num(p.netContent)} ${p.netUnit} a pack` : null,
    p.cbdMgPerPack ? `${num(p.cbdMgPerPack)} mg CBD a pack` : null,
    p.cbdMgPerDay ? `at most ${num(p.cbdMgPerDay)} mg CBD a day` : null,
    p.allergens.length ? `contains ${p.allergens.map((a) => ALLERGENS[a as keyof typeof ALLERGENS]?.toLowerCase() ?? a).join(", ")}` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")}.` : "";
}

type Flag = { term: string; reason: string };
type Screenable = { channel: StudioChannel; text: string; short?: string | null; title?: string | null; card?: Card | null; at?: Date };

const PRODUCT = /\b(cbd|thc|cannabis|marijuana|weed|dagga|hemp|strains?|pre-?rolls?|joints?|edibles?|gummies|tinctures?|oils?|vapes?|hash|dispensary|medicines?)\b/i;
const OFFER = /\b(buy|order|shop now|in stock|prices?|specials?|deals?|discounts?|sale|promo|code|R ?\d+|\d+ ?% off|free gift)\b/i;

/**
 * What stops a draft going out on its channel: unfilled {fields}, the copy rules (screenCopy, and screenSocial on
 * social), the length the channel takes, public holidays, and on WhatsApp and Google (whose rules ban promoting drugs or
 * regulated products, whatever the licences) any product or offer at all: store, brand and event news only.
 */
export function screenDraft(d: Screenable): Flag[] {
  const parts = [d.title, d.text, d.short, d.card?.eyebrow, d.card?.headline, d.card?.sub, ...(d.card?.lines ?? [])].filter((x): x is string => !!x);
  const all = parts.join("\n");
  const flags: Flag[] = [];
  const left = all.match(/(?<!\{)\{[a-z]+\}(?!\})/); // {date}, not a campaign's {{points}}
  if (left) flags.push({ term: left[0], reason: "Fill this in before it goes out" });
  if (d.channel === "SOCIAL") flags.push(...screenSocial(all));
  else flags.push(...screenCopy(all));
  if (d.channel === "WHATSAPP" || d.channel === "GOOGLE") {
    const p = all.match(PRODUCT), o = all.match(OFFER);
    if (p) flags.push({ term: p[0], reason: `${STUDIO_CHANNELS[d.channel].label} rules ban promoting cannabis, CBD or medicines, licensed or not: brand, store and event news only` });
    if (o) flags.push({ term: o[0], reason: `No offers or prices on ${d.channel === "WHATSAPP" ? "WhatsApp" : "Google"}: they go to members on their own channels` });
  }
  const c = d.card;
  if (c) {
    for (const k of ["eyebrow", "headline", "sub"] as const) if ((c[k]?.length ?? 0) > CARD_LIMITS[k]) flags.push({ term: `card ${k}`, reason: `Keep the card's ${k} to ${CARD_LIMITS[k]} characters, so it reads at a glance` });
    if ((c.lines?.length ?? 0) > CARD_LIMITS.lines || c.lines?.some((l) => l.length > CARD_LIMITS.line)) flags.push({ term: "card lines", reason: `Up to ${CARD_LIMITS.lines} lines of ${CARD_LIMITS.line} characters on a card` });
    if (c.template === "merch" && !c.image) flags.push({ term: "card picture", reason: "Choose the merch picture" });
  }
  const over = (term: string, n: number, what: string) => flags.push({ term, reason: `${what} take ${n.toLocaleString("en-ZA")} characters at most` });
  if (d.channel === "SOCIAL") {
    if (d.text.length > LIMITS.SOCIAL) over("caption", LIMITS.SOCIAL, "Captions");
    if (d.short && d.short.length > LIMITS.SHORT) over("short version", LIMITS.SHORT, "Short versions");
    if (!d.short && d.text.length > LIMITS.SHORT) flags.push({ term: "short version", reason: `Add a short version (${LIMITS.SHORT} characters) for Threads and Bluesky` });
    if (!d.card) flags.push({ term: "card", reason: "Instagram needs a picture: choose a card" });
  }
  if (d.channel === "WHATSAPP" && d.text.length > LIMITS.WHATSAPP) over("post", LIMITS.WHATSAPP, "Channel posts");
  if (d.channel === "GOOGLE" && d.text.length > LIMITS.GOOGLE) over("post", LIMITS.GOOGLE, "Google posts");
  if (d.channel === "SMS" && d.text.length > LIMITS.SMS) over("message", LIMITS.SMS, "Texts (3 parts)");
  if (d.channel === "PUSH") {
    if (d.text.length > LIMITS.PUSH) over("message", LIMITS.PUSH, "Push messages");
    if (!d.title || d.title.length > LIMITS.PUSH_TITLE) flags.push({ term: "title", reason: `Push needs a title of ${LIMITS.PUSH_TITLE} characters at most` });
  }
  if (d.channel === "EMAIL" && (!d.title || d.title.length > LIMITS.EMAIL_TITLE)) flags.push({ term: "subject", reason: `Email needs a subject of ${LIMITS.EMAIL_TITLE} characters at most` });
  const holiday = d.at && holidayName(d.at);
  if (holiday) flags.push({ term: "date", reason: `${holiday} is a public holiday: pick another day` });
  return flags;
}

export type QrKind = "whatsapp" | "join" | "store";
export const QR_KINDS: Record<QrKind, string> = { whatsapp: "Chat to a store on WhatsApp", join: "Join Herbal Holland Rewards", store: "A store's page" };

/**
 * What the QR maker points at: a store's WhatsApp chat (service questions, the conversation the member starts), the
 * Rewards join page, or a store's page. Join and store links carry ?src= so Reports shows which flyer or window filled
 * the list. Null when the store has no WhatsApp number, or a store link has no store.
 */
export function qrLink(p: { kind: QrKind; base: string; tag: string | null; store: { code: string; slug: string; name: string; whatsapp: string | null } | null }) {
  const src = p.tag ? `src=${p.tag}` : "";
  if (p.kind === "whatsapp") {
    const digits = p.store?.whatsapp?.replace(/\D/g, "").replace(/^0/, "27");
    return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(`Hi Herbal Holland ${p.store!.name}, `)}` : null;
  }
  if (p.kind === "join") {
    const q = [src, p.store && `store=${p.store.code}`].filter(Boolean).join("&");
    return `${p.base}/club/join${q && `?${q}`}`;
  }
  return p.store ? `${p.base}/stores/${p.store.slug}${src && `?${src}`}` : null;
}
