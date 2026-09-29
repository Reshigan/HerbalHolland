// Returns: what may come back, until when, and what is refunded. The rules the returns policy (@/lib/policies,
// /legal/returns) promises: faulty, damaged or wrong goods within 6 months (CPA s56), a change of mind on an online
// order within 7 days of delivery (ECTA s44), never for made-to-order merch or licensed medicines (ECTA s42).
// Pure: safe on the server, in the browser and in tests (tests/returns.test.ts).
import type { RegClass } from "./compliance";
import { addDays, dayKey, fmtDate } from "./format";
import { zar } from "./money";

// ── Reasons and windows ─────────────────────────────────────────────────────

export const RETURN_REASONS = ["DEFECTIVE", "DAMAGED", "WRONG_ITEM", "COOLING_OFF", "OTHER"] as const;
export type ReturnReasonKey = (typeof RETURN_REASONS)[number];
export const isReturnReason = (v: unknown): v is ReturnReasonKey => typeof v === "string" && (RETURN_REASONS as readonly string[]).includes(v);

export const RETURN_REASON: Record<ReturnReasonKey, { label: string; hint: string; window: "defect" | "coolingOff"; ourCost: boolean }> = {
  DEFECTIVE: { label: "It's faulty", hint: "Defective, unsafe or not doing what it should — within 6 months of delivery (CPA s56). The return is at our cost.", window: "defect", ourCost: true },
  DAMAGED: { label: "It arrived damaged", hint: "Damaged in the parcel. A photo of the box and the item helps us sort it out quickly.", window: "defect", ourCost: true },
  WRONG_ITEM: { label: "It's not what I ordered", hint: "The wrong item, size or quantity. We collect it at our cost.", window: "defect", ourCost: true },
  COOLING_OFF: {
    label: "I changed my mind",
    hint: "Within 7 days of delivery, unopened and with everything that came with it (ECTA s44). You pay only the direct cost of the return: the delivery fee covers the courier that collects it.",
    window: "coolingOff",
    ourCost: false,
  },
  OTHER: { label: "Something else", hint: "Tell us what happened and we'll take it from there.", window: "defect", ourCost: true },
};

export const RETURN_WINDOWS = { coolingOffDays: 7, defectMonths: 6 } as const;

/** Never returned for a change of mind: licensed medicines (dispensed under a SAHPRA authorisation; faults go through the dispensary). */
export const NO_COOLING_OFF_CLASSES: RegClass[] = ["THC"];
/** Consumables and skin care: a change-of-mind return must be unopened and sealed (ECTA s42(2) — counsel to confirm). */
export const SEALED_CLASSES: RegClass[] = ["CBD", "CBD_FOOD", "CBD_TOPICAL", "SUPPLEMENT"];

const endOfDaySA = (d: Date) => new Date(`${dayKey(d)}T23:59:59.999+02:00`);
/** The same SAST calendar day `n` months on (clamped to the month's last day). */
function addMonthsSA(d: Date, n: number) {
  const [y, m, day] = dayKey(d).split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(`${first.toISOString().slice(0, 7)}-${String(Math.min(day, last)).padStart(2, "0")}T12:00:00+02:00`);
}

/** The last moment a return for `reason` can be requested, counted from delivery or collection (end of the day, SAST). */
export function returnWindowEnds(completedAt: Date, reason: ReturnReasonKey) {
  return RETURN_REASON[reason].window === "coolingOff" ? endOfDaySA(addDays(completedAt, RETURN_WINDOWS.coolingOffDays)) : endOfDaySA(addMonthsSA(completedAt, RETURN_WINDOWS.defectMonths));
}

// ── Statuses ────────────────────────────────────────────────────────────────

export const RETURN_STATUSES = ["REQUESTED", "APPROVED", "COLLECTION_BOOKED", "RECEIVED", "REFUNDED", "DECLINED"] as const;
export type ReturnStatusKey = (typeof RETURN_STATUSES)[number];
export const isReturnStatus = (v: unknown): v is ReturnStatusKey => typeof v === "string" && (RETURN_STATUSES as readonly string[]).includes(v);

export const RETURN_STATUS: Record<ReturnStatusKey, { label: string; member: string; hint: string }> = {
  REQUESTED: { label: "Requested", member: "Request received", hint: "Waiting for a decision" },
  APPROVED: { label: "Approved", member: "Approved — collection coming", hint: "Book the courier collection" },
  COLLECTION_BOOKED: { label: "Collection booked", member: "Courier booked", hint: "Waiting for the parcel to arrive" },
  RECEIVED: { label: "Received", member: "We have it — refund on its way", hint: "Check it, then refund" },
  REFUNDED: { label: "Refunded", member: "Refunded", hint: "Done" },
  DECLINED: { label: "Declined", member: "Declined", hint: "Closed with a reason" },
};
/** Still being worked. */
export const OPEN_RETURN_STATUSES: readonly ReturnStatusKey[] = ["REQUESTED", "APPROVED", "COLLECTION_BOOKED", "RECEIVED"];

/** Where a return can go next. Declining is possible until the money moves; nothing moves after a refund. */
export const RETURN_MOVES: Record<ReturnStatusKey, readonly ReturnStatusKey[]> = {
  REQUESTED: ["APPROVED", "DECLINED"],
  APPROVED: ["COLLECTION_BOOKED", "RECEIVED", "DECLINED"],
  COLLECTION_BOOKED: ["RECEIVED", "DECLINED"],
  RECEIVED: ["REFUNDED", "DECLINED"],
  REFUNDED: [],
  DECLINED: [],
};
export const canMoveReturn = (from: ReturnStatusKey, to: ReturnStatusKey) => RETURN_MOVES[from].includes(to);

// ── Eligibility ─────────────────────────────────────────────────────────────

export type ReturnLine = {
  variantId: string;
  name: string;
  qty: number;
  totalCents: number;
  regClass: RegClass;
  madeToOrder: boolean;
  /** Units already in another return request (open or refunded). */
  requested: number;
};
export type ReturnOrder = { status: string; completedAt: Date | null; lines: ReturnLine[] };
export type LineEligibility = { variantId: string; name: string; qty: number; blocked: string | null; sealed: boolean };
export type Eligibility = { ok: boolean; reason: string | null; windowEnds: Date | null; lines: LineEligibility[] };

/** What on an order may come back now for `reason`, line by line, with the plain-English reason when it can't. */
export function returnEligibility(order: ReturnOrder, reason: ReturnReasonKey, now: Date): Eligibility {
  const all = (blocked: string) => order.lines.map((l) => ({ variantId: l.variantId, name: l.name, qty: 0, blocked, sealed: false }));
  if (order.status !== "COMPLETED" || !order.completedAt)
    return { ok: false, reason: "Only orders that have been delivered or collected can be returned.", windowEnds: null, lines: all("Not delivered yet") };
  const windowEnds = returnWindowEnds(order.completedAt, reason);
  if (now > windowEnds) {
    const why =
      RETURN_REASON[reason].window === "coolingOff"
        ? `The ${RETURN_WINDOWS.coolingOffDays}-day window for a change of mind closed on ${fmtDate(windowEnds)}. If something is faulty, choose that instead: you have ${RETURN_WINDOWS.defectMonths} months.`
        : `Returns for this order closed on ${fmtDate(windowEnds)}, ${RETURN_WINDOWS.defectMonths} months after it was delivered. Still need help? Ask us at /support.`;
    return { ok: false, reason: why, windowEnds, lines: all("Outside the return window") };
  }
  const coolingOff = reason === "COOLING_OFF";
  const lines = order.lines.map((l): LineEligibility => {
    const left = l.qty - l.requested;
    const blocked =
      left <= 0
        ? "Already in a return request"
        : coolingOff && l.madeToOrder
          ? "Made to order for you, so it can't be returned for a change of mind (faulty merch can)"
          : coolingOff && NO_COOLING_OFF_CLASSES.includes(l.regClass)
            ? "Licensed medicines can't be returned for a change of mind"
            : null;
    return { variantId: l.variantId, name: l.name, qty: blocked ? 0 : left, blocked, sealed: coolingOff && !blocked && SEALED_CLASSES.includes(l.regClass) };
  });
  const ok = lines.some((l) => l.qty > 0);
  const reasonText = ok
    ? null
    : lines.every((l) => l.blocked === "Already in a return request")
      ? "Every item on this order is already in a return request."
      : "Nothing on this order can be returned for a change of mind. If something is faulty, choose that reason instead.";
  return { ok, reason: reasonText, windowEnds, lines };
}

export type ReturnItem = { variantId: string; qty: number };

/** The items the member ticked, checked against what may come back. */
export function validateReturnItems(picked: { variantId: string; qty: unknown }[], e: Eligibility): { ok: true; items: ReturnItem[] } | { ok: false; error: string } {
  if (!e.ok) return { ok: false, error: e.reason ?? "Nothing on this order can be returned." };
  const items: ReturnItem[] = [];
  for (const p of picked) {
    const qty = Math.floor(Number(p.qty));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const line = e.lines.find((l) => l.variantId === p.variantId);
    if (!line) return { ok: false, error: "One of the items isn't on this order." };
    if (line.blocked) return { ok: false, error: `${line.name}: ${line.blocked.toLowerCase()}.` };
    if (qty > line.qty) return { ok: false, error: `${line.name}: only ${line.qty} can be returned.` };
    items.push({ variantId: p.variantId, qty });
  }
  if (!items.length) return { ok: false, error: "Choose at least one item to return." };
  return { ok: true, items };
}

// ── Refunds ─────────────────────────────────────────────────────────────────

export type RefundLine = { variantId: string; qty: number; totalCents: number; returned?: number /* units refunded by earlier returns */ };
export type RefundBreakdown = { linesCents: number; deliveryCents: number; totalCents: number; wholeOrder: boolean; capped: boolean; note: string };

/**
 * What a return refunds: each returned unit's share of its line (what was actually paid, after member savings and
 * deals), plus the delivery fee when the whole order has come back (this request together with any refunded before
 * it) — except for a change of mind, where the fee covers the courier that collects the parcel (the direct cost of
 * returning, ECTA s44). Never more than was paid in money: points come back as points.
 */
export function refundBreakdown(a: { lines: RefundLine[]; items: ReturnItem[]; deliveryCents: number; reason: ReturnReasonKey; paidCents?: number | null }): RefundBreakdown {
  const per = new Map<string, number>();
  for (const it of a.items) per.set(it.variantId, (per.get(it.variantId) ?? 0) + it.qty);
  let linesCents = 0;
  for (const l of a.lines) {
    const qty = Math.min(l.qty, per.get(l.variantId) ?? 0);
    if (qty > 0) linesCents += Math.round((l.totalCents * qty) / l.qty);
  }
  // The whole order has come back once this request, with any refunded before it, covers every unit.
  const wholeOrder = a.lines.every((l) => (l.returned ?? 0) + (per.get(l.variantId) ?? 0) >= l.qty);
  const coolingOff = a.reason === "COOLING_OFF";
  const deliveryCents = wholeOrder && !coolingOff ? a.deliveryCents : 0;
  let totalCents = linesCents + deliveryCents;
  let capped = false;
  if (a.paidCents != null && totalCents > a.paidCents) (totalCents = Math.max(0, a.paidCents)), (capped = true);
  const note = [
    a.deliveryCents > 0 && wholeOrder && coolingOff ? "The delivery fee isn't refunded: it covers the courier that collects the parcel (the direct cost of the return)." : null,
    a.deliveryCents > 0 && wholeOrder && !coolingOff ? "The whole order is coming back, so the delivery fee is refunded too." : null,
    a.deliveryCents > 0 && !wholeOrder ? "Part of the order is coming back, so the delivery fee stays." : null,
    capped ? "Capped at what was paid in money; points used on the order come back as points." : null,
  ]
    .filter(Boolean)
    .join(" ");
  return { linesCents, deliveryCents, totalCents, wholeOrder, capped, note };
}

/** Whether a line's units go back on the shelf: yes for a change of mind or a wrong item, never for faulty or damaged goods. */
export const restockByDefault = (reason: ReturnReasonKey) => reason === "COOLING_OFF" || reason === "WRONG_ITEM";

// ── Numbers, photos, member messages ────────────────────────────────────────

/** RT-000123 (from the RETURN_REQUEST counter). */
export const returnNumber = (n: number) => `RT-${String(n).padStart(6, "0")}`;

export const RETURN_PHOTOS = { max: 3, maxBytes: 5 * 1024 * 1024, note: "Up to 3 photos, JPG or PNG, 5 MB each" } as const;
export const RETURN_NOTE_MAX = 1_000;

/** The message the member gets at each step (SMS-short, and the same words as the email). */
export function returnStatusMessage(r: { number: string; orderCode: string; status: ReturnStatusKey; courier?: string | null; waybill?: string | null; refundCents?: number | null; decisionNote?: string | null }) {
  const n = r.number;
  switch (r.status) {
    case "REQUESTED":
      return { subject: `Return ${n} received`, text: `We have your return request ${n} for order ${r.orderCode}. We'll look at it and reply within one business day.` };
    case "APPROVED":
      return { subject: `Return ${n} approved`, text: `Your return ${n} for order ${r.orderCode} is approved. We'll book a courier to collect it and let you know the details. Pack it securely with everything that came with it.` };
    case "COLLECTION_BOOKED":
      return { subject: `Return ${n}: courier booked`, text: `A courier will collect your return ${n} for order ${r.orderCode}${r.courier ? ` (${r.courier}${r.waybill ? `, waybill ${r.waybill}` : ""})` : ""}. Have the parcel ready and packed.` };
    case "RECEIVED":
      return { subject: `Return ${n} has reached us`, text: `Your return ${n} for order ${r.orderCode} has reached us. We're checking it and will refund you as soon as that's done.` };
    case "REFUNDED":
      return { subject: `Return ${n} refunded`, text: `We've refunded ${zar(r.refundCents ?? 0)} for return ${n} (order ${r.orderCode}) to the way you paid. Your bank may take a few days to show it.` };
    case "DECLINED":
      return { subject: `Return ${n}: we can't accept it`, text: `We can't accept return ${n} for order ${r.orderCode}${r.decisionNote ? `: ${r.decisionNote}` : "."} If you'd like to talk it through, reply to this message or ask us at /support.` };
  }
}
