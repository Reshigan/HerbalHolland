// Pure back-office rules (no I/O). Shared by store pages, server actions and client
// components, and covered by tests/store-backoffice.test.ts.
import type { Tone } from "@/components/ui/badge";
import type { AdjustReason, MovementType } from "@/generated/prisma/client";

// ── Stock health ─────────────────────────────────────────────────────────────

/** Days of stock the replenishment plan aims for: 3 days lead + 14 days cover (see lib/replenish). */
export const TARGET_DAYS = 17;
export const OVERSTOCK_FACTOR = 1.5;

export type StockStatus = "NEGATIVE" | "OUT" | "LOW" | "HEALTHY" | "OVER";

export const STOCK_STATUS: Record<StockStatus, { label: string; tone: Tone; hint: string }> = {
  NEGATIVE: { label: "Negative", tone: "red", hint: "The till sold more than the system held — count it" },
  OUT: { label: "Out", tone: "red", hint: "Nothing available to sell" },
  LOW: { label: "Low", tone: "amber", hint: "At or below the reorder point" },
  HEALTHY: { label: "Healthy", tone: "green", hint: "Above the reorder point, within target" },
  OVER: { label: "Over", tone: "violet", hint: `More than ${OVERSTOCK_FACTOR}× target stock — consider listing it on the network` },
};

/** Target stock: par level, or 17 days of trailing demand when that is higher. */
export const targetStock = (parLevel: number, avgDaily: number) => Math.max(parLevel, Math.ceil(avgDaily * TARGET_DAYS));

export function stockStatus(r: { onHand: number; available: number; reorderPoint: number; parLevel: number; avgDaily: number; negativeLots?: number }): StockStatus {
  if (r.onHand < 0 || (r.negativeLots ?? 0) > 0) return "NEGATIVE";
  if (r.available <= 0) return "OUT";
  if (r.available <= r.reorderPoint) return "LOW";
  const target = targetStock(r.parLevel, r.avgDaily);
  if (target > 0 && r.available > Math.ceil(target * OVERSTOCK_FACTOR)) return "OVER";
  return "HEALTHY";
}

/** Units above target — what could be listed for other stores to buy. */
export const overstockUnits = (available: number, parLevel: number, avgDaily: number) => Math.max(0, available - targetStock(parLevel, avgDaily));

/** Days of cover as a short label: "12 d", "<1 d", "No sales". */
export function coverLabel(days: number) {
  if (!Number.isFinite(days)) return "No sales";
  if (days <= 0) return "0 d";
  if (days < 1) return "<1 d";
  return `${Math.round(days)} d`;
}

// ── Batches & expiry ─────────────────────────────────────────────────────────

export function expiryState(expiresAt: Date | string | null | undefined, now = new Date()): { days: number | null; label: string; tone: Tone } {
  if (!expiresAt) return { days: null, label: "No expiry", tone: "neutral" };
  const days = Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { days, label: `Expired ${-days} d ago`, tone: "red" };
  if (days === 0) return { days, label: "Expires today", tone: "red" };
  if (days <= 30) return { days, label: `${days} d left`, tone: "amber" };
  if (days <= 90) return { days, label: `${days} d left`, tone: "neutral" };
  const months = Math.round(days / 30.4);
  return { days, label: `${months} mo left`, tone: "neutral" };
}

// ── Stock movements & adjustments ────────────────────────────────────────────

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  RECEIVE: "Received",
  SALE: "Sale",
  REFUND: "Refund",
  ONLINE: "Online order",
  ADJUST: "Adjustment",
  COUNT: "Stock take",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
};

export type Direction = "OUT" | "IN" | "EITHER";

export const ADJUST_REASONS: Record<AdjustReason, { label: string; dir: Direction; hint: string }> = {
  DAMAGED: { label: "Damaged", dir: "OUT", hint: "Broken or unsellable packaging" },
  EXPIRED: { label: "Expired", dir: "OUT", hint: "Past its expiry date" },
  THEFT: { label: "Theft", dir: "OUT", hint: "Add the SAPS case number in the note" },
  LOST: { label: "Lost / missing", dir: "OUT", hint: "Can't be found" },
  SAMPLE: { label: "Sample / tester", dir: "OUT", hint: "Opened for display or staff training" },
  QUALITY: { label: "Quality issue", dir: "OUT", hint: "Customer complaint or failed inspection" },
  RECALL: { label: "Recall return", dir: "OUT", hint: "Sent back to the distribution centre" },
  DESTROYED: { label: "Destroyed (witnessed)", dir: "OUT", hint: "Destruction register — a witness must sign off" },
  FOUND: { label: "Found", dir: "IN", hint: "Stock found that the system didn't know about" },
  CORRECTION: { label: "Correction", dir: "EITHER", hint: "Fix a capture error — say what happened" },
};

export const REASON_ORDER = Object.keys(ADJUST_REASONS) as AdjustReason[];

/** Validates an adjustment request; returns the signed delta or an error message. */
export function checkAdjustment(a: {
  reason: AdjustReason;
  qty: number;
  direction?: "OUT" | "IN" | null;
  onHand: number;
  witness?: string | null;
  note?: string | null;
}): { delta: number } | { error: string; field?: string } {
  const meta = ADJUST_REASONS[a.reason];
  if (!meta) return { error: "Choose a reason", field: "reason" };
  if (!Number.isInteger(a.qty) || a.qty <= 0) return { error: "Enter a whole number of units", field: "qty" };
  if (a.qty > 10_000) return { error: "That's more than 10,000 units — check the quantity", field: "qty" };
  const dir = meta.dir === "EITHER" ? a.direction : meta.dir;
  if (dir !== "OUT" && dir !== "IN") return { error: "Choose whether stock goes in or out", field: "direction" };
  if (dir === "OUT" && a.qty > a.onHand) return { error: `Only ${Math.max(0, a.onHand)} on hand in that batch`, field: "qty" };
  if (a.reason === "DESTROYED" && (a.witness ?? "").trim().length < 3) return { error: "Destruction needs a witness name for the register", field: "witness" };
  if (a.reason === "CORRECTION" && (a.note ?? "").trim().length < 3) return { error: "Say what the correction is for", field: "note" };
  return { delta: dir === "OUT" ? -a.qty : a.qty };
}

// ── Stock takes ──────────────────────────────────────────────────────────────

export type VarianceLine = { counted: number | null; system: number; unitCostCents: number };

export function varianceSummary(lines: VarianceLine[]) {
  let counted = 0, uncounted = 0, exact = 0, overUnits = 0, shortUnits = 0, overValue = 0, shortValue = 0;
  for (const l of lines) {
    if (l.counted == null) {
      uncounted++;
      continue;
    }
    counted++;
    const d = l.counted - l.system;
    if (d === 0) exact++;
    else if (d > 0) (overUnits += d), (overValue += d * l.unitCostCents);
    else (shortUnits -= d), (shortValue -= d * l.unitCostCents);
  }
  return {
    lines: lines.length,
    counted,
    uncounted,
    exact,
    overUnits,
    shortUnits,
    netUnits: overUnits - shortUnits,
    overValue,
    shortValue,
    netValue: overValue - shortValue,
    accuracy: counted ? exact / counted : 1,
  };
}

/** Two counts overlap when either is a full count or both count the same category. */
export const scopesOverlap = (a: string, b: string) => a === "FULL" || b === "FULL" || a === b;

// ── Purchasing ───────────────────────────────────────────────────────────────

export type ReceiptLine = { ordered: number; shipped: number; received: number };

export function receiptCheck(lines: ReceiptLine[]) {
  let shortShipped = 0, shortReceived = 0, units = 0;
  for (const l of lines) {
    units += l.received;
    if (l.shipped < l.ordered) shortShipped += l.ordered - l.shipped;
    if (l.received < l.shipped) shortReceived += l.shipped - l.received;
  }
  return { units, shortShipped, shortReceived, clean: shortShipped === 0 && shortReceived === 0 };
}

// ── Online orders ────────────────────────────────────────────────────────────

export const FULFIL_LABEL = { COLLECT: "Click & collect", SAME_DAY: "Same-day delivery", COURIER: "Courier" } as const;

// ── Cash ─────────────────────────────────────────────────────────────────────

/** Cash-up variance colour: balanced, within R50, or over R50 out. */
export const cashTone = (varianceCents: number | null | undefined): Tone =>
  varianceCents == null ? "neutral" : varianceCents === 0 ? "green" : Math.abs(varianceCents) <= 5_000 ? "amber" : "red";

// ── Trading hours ────────────────────────────────────────────────────────────

export const WEEK = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
] as const;
export type DayKey = (typeof WEEK)[number][0];
export type TradingHours = Record<DayKey, { open: string; close: string } | null>;

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Store.hours JSON ({ mon: ["09:00", "20:00"], sun: null }) → a full week. Unknown days are closed. */
export function readHours(json: unknown): TradingHours {
  const src = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const out = {} as TradingHours;
  for (const [k] of WEEK) {
    const v = src[k];
    out[k] = Array.isArray(v) && typeof v[0] === "string" && typeof v[1] === "string" ? { open: v[0], close: v[1] } : null;
  }
  return out;
}

/** Validates a week of hours and returns the JSON shape stored on Store.hours. */
export function hoursJson(week: TradingHours): { json: Record<DayKey, [string, string] | null> } | { error: string } {
  const json = {} as Record<DayKey, [string, string] | null>;
  for (const [k, name] of WEEK) {
    const d = week[k];
    if (!d) {
      json[k] = null;
      continue;
    }
    if (!CLOCK.test(d.open) || !CLOCK.test(d.close)) return { error: `${name}: use 24-hour times like 09:00` };
    if (d.close <= d.open) return { error: `${name}: closing time must be after opening time` };
    json[k] = [d.open, d.close];
  }
  return { json };
}

// ── Form parsing (everything from the browser is untrusted text) ─────────────

export const str = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
export const bool = (fd: FormData, name: string) => ["on", "true", "1"].includes(String(fd.get(name) ?? ""));
export const list = (fd: FormData, name: string) => [...new Set(fd.getAll(name).map((v) => String(v).trim()).filter(Boolean))];

/** "R1,234.50" / "1234.5" / "1 234" / "12,50" → cents; null when empty or not a number. */
export function parseRand(raw: string | null | undefined): number | null {
  let s = String(raw ?? "").trim().replace(/^R\s*/i, "").replace(/\s/g, "");
  if (!s) return null;
  if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(",", "."); // decimal comma
  s = s.replace(/,/g, "");
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** Whole number within [min, max]; null when empty or invalid. */
export function parseWhole(raw: string | null | undefined, min = 0, max = 1_000_000): number | null {
  const s = String(raw ?? "").trim().replace(/[\s,]/g, "");
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

/** <input type="date"> value (a SAST calendar day) → that day's 00:00 SAST. */
export function parseDay(raw: string | null | undefined): Date | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00+02:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** <input type="datetime-local"> (SAST wall clock) → UTC Date. */
export function parseLocal(raw: string | null | undefined): Date | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(`${s}:00+02:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → "YYYY-MM-DDTHH:mm" in SAST (datetime-local default value). */
export function toLocalInput(d: Date | string | null | undefined) {
  if (!d) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date(d))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** "16:30" → minutes after midnight; null when invalid. */
export function parseClock(raw: string | null | undefined): number | null {
  const s = String(raw ?? "").trim();
  if (!CLOCK.test(s)) return null;
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
}
export const clock = (minutes: number | null | undefined) =>
  minutes == null ? "" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export const isPin = (s: string) => /^\d{4}$/.test(s);

// ── URLs & exports ───────────────────────────────────────────────────────────

/** `path?…` keeping the current params, applying `patch` (null/"" removes a key). */
export function hrefWith(path: string, params: Record<string, string | string[] | undefined>, patch: Record<string, string | number | null | undefined> = {}) {
  const p = new URLSearchParams();
  const merged: Record<string, unknown> = { ...params, ...patch };
  for (const [k, v] of Object.entries(merged)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val != null && val !== "") p.set(k, String(val));
  }
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

/** One CSV cell: quoted when needed, and neutralised against spreadsheet formula injection. */
export function csvCell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvLine = (cells: unknown[]) => cells.map(csvCell).join(",");

/** First value of a search param. */
export const sp1 = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
