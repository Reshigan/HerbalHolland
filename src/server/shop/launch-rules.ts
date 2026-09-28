// Pure display rules for the launch screens (drops, events, the waitlist, Founding Members).
// No server imports, so client components (countdowns) can use them too. Tested in tests/shop-launch.test.ts.
import { opensFor, type DropRule } from "@/lib/drops";
import { TIERS, tierRank, type TierKey } from "@/lib/loyalty-rules";

/** Founding Member number as printed on the card: #0042. */
export const foundingLabel = (n: number) => `#${String(n).padStart(4, "0")}`;

/** Time left until a moment, split for a countdown (null once it has passed). */
export function countdownParts(ms: number) {
  if (!(ms > 0)) return null;
  const s = Math.floor(ms / 1000);
  return { days: Math.floor(s / 86_400), hours: Math.floor((s % 86_400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

const two = (n: number) => String(n).padStart(2, "0");
/** Compact countdown: "3d 04h", "4h 12m", "12m 05s". */
export function fmtCountdown(ms: number) {
  const p = countdownParts(ms);
  if (!p) return "now";
  if (p.days) return `${p.days}d ${two(p.hours)}h`;
  if (p.hours) return `${p.hours}h ${two(p.minutes)}m`;
  return `${p.minutes}m ${two(p.seconds)}s`;
}

/** "2 hours", "1 hour", "45 minutes". */
export const fmtLead = (minutes: number) =>
  minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minute${minutes === 1 ? "" : "s"}`;

/** Who gets in early, in plain words: "Harvest members", "Bloom & Harvest members", "Sprout members and up". */
export function earlyWho(tier: TierKey) {
  const names = TIERS.filter((t) => tierRank(t.key) >= tierRank(tier)).map((t) => t.name);
  return names.length === 1 ? `${names[0]} members` : names.length === 2 ? `${names[0]} & ${names[1]} members` : `${names[0]} members and up`;
}

/** "Harvest members get in 2 hours early", or null when the drop has no early access. */
export const earlyLabel = (d: Pick<DropRule, "earlyTier" | "earlyMinutes">) =>
  d.earlyTier && d.earlyMinutes > 0 ? `${earlyWho(d.earlyTier)} get in ${fmtLead(d.earlyMinutes)} early` : null;

export type DropPhase = "upcoming" | "early" | "live" | "ended";

/**
 * Where a drop stands for this shopper: `upcoming` (not open to them yet), `early` (open to their tier before
 * everyone else), `live` (open to all) or `ended`. `opensAt` is when it opens for them.
 */
export function dropPhase(d: DropRule, tier: TierKey | null, at: Date): { phase: DropPhase; opensAt: Date } {
  const opensAt = opensFor(d, tier);
  if (d.endsAt && at >= d.endsAt) return { phase: "ended", opensAt };
  if (at < opensAt) return { phase: "upcoming", opensAt };
  return { phase: at < d.startsAt ? "early" : "live", opensAt };
}

/**
 * A drop-rule refusal (from dropBlock in lib/drops) rewritten for the bag and checkout: what happened and what to do.
 * `drop` is the drop the message names, when known.
 */
export function readableDropBlock(msg: string, drop?: { name: string; perMemberLimit: number; opensLabel?: string } | null) {
  const members = msg.match(/^(.+) is for Herbal Holland Rewards members/);
  if (members) return { kind: "members" as const, title: `${drop?.name ?? members[1]} is for members`, body: "Join Herbal Holland Rewards free — it takes a minute — then check out as usual." };
  const early = msg.match(/^(.+) isn't open yet$/);
  if (early)
    return {
      kind: "early" as const,
      title: `${drop?.name ?? early[1]} isn't open yet`,
      body: `${drop?.opensLabel ? `It opens for you ${drop.opensLabel}. ` : ""}Drop items can't be ordered before then — remove it for now and we'll keep the rest of your bag.`,
    };
  const limit = msg.match(/^(.+): limit (\d+) per member$/);
  if (limit)
    return {
      kind: "limit" as const,
      title: `${drop?.name ?? limit[1]} is limited to ${limit[2]} per member`,
      body: "That counts anything you've already bought from the drop or have on an open order. Lower the quantity in your bag to continue.",
    };
  return { kind: "other" as const, title: msg, body: "" };
}

/** A member's place on the pre-launch waitlist, shaped for the progress card. */
export function waitlistView(w: { place: number; total: number; boost: number }, cap: number) {
  const total = Math.max(w.total, w.place, 1);
  const founding = w.place <= cap;
  const toFounding = founding ? 0 : w.place - cap;
  return {
    founding,
    toFounding,
    friendsNeeded: founding || w.boost <= 0 ? 0 : Math.ceil(toFounding / w.boost),
    behind: total - w.place,
    /** 0 = front of the line, 1 = back. */
    marker: total > 1 ? (w.place - 1) / (total - 1) : 0,
    /** Share of the line inside the Founding zone. */
    zone: Math.min(1, cap / total),
  };
}

// ── Calendar file (RFC 5545) ─────────────────────────────────────────────────
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Folds content lines at 75 octets (continuation lines start with a space). */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const dec = new TextDecoder();
  const out: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(bytes.length, start + (out.length ? 74 : 75));
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // don't split a UTF-8 character
    out.push((out.length ? " " : "") + dec.decode(bytes.subarray(start, end)));
    start = end;
  }
  return out.join("\r\n");
}

/** A single-event .ics file for "Add to calendar". */
export function icsEvent(e: { uid: string; title: string; description: string; location: string; url: string; startsAt: Date; endsAt: Date; stamp?: Date }) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Herbal Holland//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${icsTime(e.stamp ?? new Date())}`,
    `DTSTART:${icsTime(e.startsAt)}`,
    `DTEND:${icsTime(e.endsAt)}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(e.description)}`,
    `LOCATION:${icsText(e.location)}`,
    `URL:${e.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n")
    .concat("\r\n");
}
