// Customer-facing display: what the second screen may know about the sale. Pure builders (unit-tested) so the
// privacy rules are provable: never a phone number, member number, address, patient detail or the name of a
// licensed medicine; no deals on medicines in the idle messages (Medicines Act s18A via incentiveExcluded).
import { incentiveExcluded, type ComplianceSettings, type RegClass } from "@/lib/compliance";
import { livePromotions } from "./pricing";
import type { BootPromotion, BootProduct, QuoteDTO, ReceiptDTO } from "@/server/pos/types";
import type { Cart } from "./storage";

export const DISPLAY_CHANNEL = "hh-pos-display";
/** The till re-sends the snapshot at least this often while a separate screen is paired (the server keeps it 3 min). */
export const DISPLAY_HEARTBEAT_MS = 45_000;

export type DisplayState = "idle" | "sale" | "pay" | "done";

export type DisplayLine = { name: string; detail: string | null; qty: number; totalCents: number; discountCents: number };

export type DisplaySnapshot = {
  v: 1;
  at: string;
  store: { name: string; code: string };
  state: DisplayState;
  lines: DisplayLine[];
  subtotalCents: number;
  discountCents: number;
  savingsCents: number;
  totalCents: number;
  vatCents: number;
  member: { firstName: string; tier: string; points: number; pointsEstimate: number } | null;
  promos: string[]; // names of the promotions applied to this basket
  pay: { dueCents: number; paidCents: number; tapping: boolean; method: string | null } | null;
  done: { totalCents: number; changeCents: number; pointsEarned: number; balance: number | null; firstName: string | null } | null;
  idle: string[]; // brand messages the idle screen cycles through
  training: boolean;
};

export const BRAND_MESSAGES = [
  "Welcome to Herbal Holland. Adults 18+.",
  "Herbal Holland Rewards: members earn points and tier prices on every visit. Ask us to sign you up — it takes 20 seconds.",
  "Every batch is lab-tested and traceable. Scan the code on your pack to see its certificate.",
  "Dutch heritage, African soil.",
  "Questions about a product? Our team is happy to help.",
];

export const LICENSED_LINE_NAME = "Dispensed medicine";

/** Messages the idle screen cycles: the brand lines, today's deals (never on medicines) and the next event. */
export function idleMessages(
  input: { promotions: BootPromotion[]; products: Pick<BootProduct, "id" | "categoryId" | "regClass">[]; compliance: ComplianceSettings; nextEvent?: { title: string; startsAt: string } | null },
  at = new Date(),
): string[] {
  const excluded = new Set<RegClass>(incentiveExcluded(input.compliance));
  const out = [...BRAND_MESSAGES];
  for (const promo of livePromotions(input.promotions, at)) {
    const targets = input.products.filter((p) => promo.productIds.includes(p.id) || promo.categoryIds.includes(p.categoryId));
    const sitewide = !promo.productIds.length && !promo.categoryIds.length;
    // A deal shows only when everything it covers may carry an incentive: nothing about medicines, ever.
    if (!sitewide && (!targets.length || targets.some((p) => excluded.has(p.regClass)))) continue;
    if (sitewide && input.products.some((p) => excluded.has(p.regClass)) && promo.kind !== "PERCENT" && promo.kind !== "FIXED") continue;
    out.push(`Today's deal: ${promo.name}${promo.description ? ` — ${promo.description}` : ""}`);
  }
  if (input.nextEvent) {
    const d = new Date(input.nextEvent.startsAt);
    const when = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    out.push(`Next in store: ${input.nextEvent.title} — ${when}. Members RSVP in the Rewards app.`);
  }
  return out;
}

export type SnapshotInput = {
  store: { name: string; code: string };
  cart: Pick<Cart, "lines" | "customer">;
  quote: QuoteDTO;
  productOf: (variantId: string) => { name: string; variantName: string; regClass: RegClass } | undefined;
  licensedClasses: readonly string[];
  stage: "basket" | "pay" | "done";
  pay?: { dueCents: number; paidCents: number; tapping: boolean; method: string | null } | null;
  done?: ReceiptDTO | null;
  idle: string[];
  training: boolean;
  at?: Date;
};

/** The sale as the customer may see it. */
export function buildSnapshot(i: SnapshotInput): DisplaySnapshot {
  const at = (i.at ?? new Date()).toISOString();
  const store = { name: i.store.name, code: i.store.code };
  const c = i.cart.customer;
  const member = c ? { firstName: c.firstName, tier: c.tier, points: c.points, pointsEstimate: i.quote.pointsEstimate } : null;
  const base = { v: 1 as const, at, store, idle: i.idle, training: i.training };

  if (i.stage === "done" && i.done) {
    const r = i.done;
    const change = r.payments.reduce((s, p) => s + (p.changeCents ?? 0), 0);
    return {
      ...base,
      state: "done",
      lines: [],
      subtotalCents: r.subtotalCents,
      discountCents: r.discountCents,
      savingsCents: r.memberSavingsCents,
      totalCents: r.totalCents,
      vatCents: r.vatCents,
      member: null,
      promos: [],
      pay: null,
      done: { totalCents: r.totalCents, changeCents: change, pointsEarned: r.queued || i.training ? 0 : r.pointsEarned, balance: r.customer && !r.queued && !i.training ? r.customer.points : null, firstName: r.customer ? r.customer.name.split(" ")[0] : null },
    };
  }

  const byVariant = new Map(i.quote.lines.map((l) => [l.variantId, l]));
  const lines: DisplayLine[] = i.cart.lines.flatMap((l) => {
    const p = i.productOf(l.variantId);
    if (!p) return [];
    const q = byVariant.get(l.variantId);
    const licensed = i.licensedClasses.includes(p.regClass);
    return [{ name: licensed ? LICENSED_LINE_NAME : p.name, detail: licensed ? null : p.variantName, qty: l.qty, totalCents: q?.totalCents ?? 0, discountCents: q?.discountCents ?? 0 }];
  });
  const empty = !lines.length && !member;
  return {
    ...base,
    state: empty ? "idle" : i.stage === "pay" ? "pay" : "sale",
    lines,
    subtotalCents: i.quote.subtotalCents,
    discountCents: i.quote.discountCents,
    savingsCents: i.quote.memberSavingsCents,
    totalCents: i.quote.totalCents,
    vatCents: i.quote.vatCents,
    member,
    promos: [...new Set(i.quote.applied.map((a) => a.name))],
    pay: i.stage === "pay" ? (i.pay ?? { dueCents: i.quote.totalCents, paidCents: 0, tapping: false, method: null }) : null,
    done: null,
  };
}

export const idleSnapshot = (store: { name: string; code: string }, idle: string[], training = false, at = new Date()): DisplaySnapshot => ({
  v: 1,
  at: at.toISOString(),
  store,
  state: "idle",
  lines: [],
  subtotalCents: 0,
  discountCents: 0,
  savingsCents: 0,
  totalCents: 0,
  vatCents: 0,
  member: null,
  promos: [],
  pay: null,
  done: null,
  idle,
  training,
});

/** A pairing key for a separate screen: 16 characters from a URL-safe alphabet (crypto-random in the browser). */
export function displayKey(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return [...random(16)].map((b) => alphabet[b % alphabet.length]).join("");
}

/** The link a separate screen opens (no cookies needed: the device id + key identify the feed). */
export const displayUrl = (origin: string, deviceId: string, key: string) => `${origin}/pos/display?d=${encodeURIComponent(deviceId)}&k=${encodeURIComponent(key)}`;

/** Sanity check on a received snapshot (the BroadcastChannel and the poll both hand us untrusted JSON). */
export function isSnapshot(x: unknown): x is DisplaySnapshot {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<DisplaySnapshot>;
  return s.v === 1 && typeof s.at === "string" && !!s.store && Array.isArray(s.lines) && typeof s.state === "string" && Array.isArray(s.idle);
}
