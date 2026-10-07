// Campaign Studio (HQ → Marketing → Studio), the pure parts: a playbook laid out from day T into dated drafts, the
// {fields} filled from the store and the day, and each draft screened for the channel it goes out on. The playbooks
// are in ./studio-playbooks.ts; cards, scheduling and Postiz in src/server/studio.ts.
//   SOCIAL     Instagram, Facebook, Threads, Bluesky, Telegram, LinkedIn: whatever is connected in Postiz
//   WHATSAPP   the brand's WhatsApp Channel, posted by hand (WhatsApp's API can't carry a cannabis brand)
//   GOOGLE     the store's Google Business Profile, posted by hand
//   EMAIL, SMS, PUSH   members' own channels, sent as a campaign (consent, CPA windows and opt-out as always)
import { screenCopy } from "./compliance";
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
};

export type Playbook = {
  key: string;
  name: string;
  blurb: string;
  /** Laid out for one store: its fields fill the copy, and own-channel sends go to its home-store members. */
  store: boolean;
  /** What day T is, e.g. "Doors open". */
  anchor: string;
  items: PlaybookItem[];
};

/** {store} {town} {address} {hours} come from the store; {date} is day T, e.g. "Tuesday 1 December". */
export type Fields = Partial<Record<"store" | "town" | "address" | "hours", string>> & { date: string };

export const LIMITS = { SOCIAL: 2200, SHORT: 280, WHATSAPP: 1000, GOOGLE: 1500, SMS: 480, PUSH: 140, PUSH_TITLE: 40, EMAIL_TITLE: 90 } as const;

const TOKEN = /\{(store|town|address|hours|date)\}/g;
export const fill = (s: string, f: Fields) => s.replace(TOKEN, (m, k: keyof Fields) => f[k] ?? m);

function fillCard(c: Card, f: Fields): Card {
  return { ...c, eyebrow: c.eyebrow && fill(c.eyebrow, f), headline: fill(c.headline, f), sub: c.sub && fill(c.sub, f), lines: c.lines?.map((l) => fill(l, f)) };
}

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** A South African wall-clock time as an instant (SAST is UTC+2 all year). */
export const sastAt = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+02:00`);
const weekdayOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

/** Day T as the copy says it: "Tuesday 1 December". */
export const longDate = (ymd: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${ymd}T12:00:00Z`)).replace(",", "");

export type Draft = Omit<PlaybookItem, "day" | "time"> & { at: Date; moved?: string };

/**
 * The playbook's items on the calendar, fields filled. Nothing lands on a public holiday (the brand doesn't post on
 * them, and direct marketing may not be sent), and members' own channels skip Sundays too (CPA Regulation 4): those
 * move to the next day that's allowed, with a note saying why.
 */
export function layout(pb: Playbook, anchor: string, f: Fields): Draft[] {
  return pb.items
    .map(({ day, time, ...it }) => {
      let ymd = addDays(anchor, day);
      let moved: string | undefined;
      for (let i = 0; i < 7; i++) {
        const holiday = holidayName(sastAt(ymd, "12:00"));
        const sunday = OWN_CHANNELS.includes(it.channel) && weekdayOf(ymd) === 0;
        if (!holiday && !sunday) break;
        moved ??= holiday ? `Moved from ${holiday}` : "Moved from a Sunday (no direct marketing on Sundays)";
        ymd = addDays(ymd, 1);
      }
      return {
        ...it,
        title: it.title && fill(it.title, f),
        text: fill(it.text, f),
        short: it.short && fill(it.short, f),
        card: it.card && fillCard(it.card, f),
        at: sastAt(ymd, time),
        ...(moved && { moved }),
      };
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
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
