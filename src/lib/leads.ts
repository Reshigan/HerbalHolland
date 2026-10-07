// Franchise enquiries (from herbalholland.com's former enquiry form): what it accepted, the pipeline HQ works them through, the
// CPA franchise-regulation signing rule and the POPIA retention date. Pure: safe on the server, in the browser and in tests.
import { PROVINCES, normalisePhone, type ProvinceCode } from "./sa";
import { addDays, dayKey, fmtDate, startOfDaySA } from "./format";
import { isEmail } from "@/lib/email";

// ── The enquiry form ────────────────────────────────────────────────────────

/** The field's label everywhere (form, HQ, export): what the enquirer could invest, never what a store costs. */
export const CAPITAL_LABEL = "Capital you could put in";

/** Bands, not amounts: stored by key, shown by label. */
export const CAPITAL_BANDS = [
  { key: "under-1.5m", label: "Under R1.5 million" },
  { key: "1.5-3m", label: "R1.5–3 million" },
  { key: "3-5m", label: "R3–5 million" },
  { key: "over-5m", label: "Over R5 million" },
  { key: "discuss", label: "I'd rather discuss it" },
] as const;
export type CapitalBand = (typeof CAPITAL_BANDS)[number]["key"];
export const isCapitalBand = (v: unknown): v is CapitalBand => CAPITAL_BANDS.some((b) => b.key === v);
export const capitalLabel = (key: string) => CAPITAL_BANDS.find((b) => b.key === key)?.label ?? key;

export const LEAD_LIMITS = {
  name: 100,
  email: 254,
  area: 80,
  experienceMin: 20,
  experience: 2_000,
  message: 2_000,
  note: 1_000, // a note with a status change
  notes: 10_000, // the lead's running notes
  perIpHour: 3, // enquiries from one connection (keyed IP hash) in an hour
  perEmailDay: 2, // enquiries from one email address in 24 hours
} as const;

export type LeadField = "name" | "email" | "phone" | "area" | "province" | "experience" | "capital" | "pharmacist" | "message" | "consent";
/** What the browser sent: untrusted text (checkboxes as "on", radios as "yes"/"no"). */
export type RawLead = Partial<Record<LeadField | "source", string | boolean | null | undefined>>;
export type CleanLead = {
  name: string;
  email: string;
  phone: string; // E.164 (+27…)
  area: string;
  province: ProvinceCode;
  experience: string;
  capital: CapitalBand;
  pharmacist: boolean;
  message: string | null;
  source: string | null;
};
export type LeadErrors = Partial<Record<LeadField, string>>;
export type LeadCheck = { ok: true; data: CleanLead } | { ok: false; fields: LeadErrors };

const text = (v: unknown) => (typeof v === "string" ? v : "");
// Control characters never belong in a form field (tabs and line breaks are handled below).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
/** One line: whitespace collapsed. */
const line = (v: unknown) => text(v).replace(CONTROL, "").replace(/\s+/g, " ").trim();
/** Paragraphs: line breaks kept (at most one blank line in a row), spaces tidied. */
const para = (v: unknown) =>
  text(v)
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const ticked = (v: unknown) => v === true || (typeof v === "string" && ["on", "true", "yes", "1"].includes(v.trim().toLowerCase()));
const yesNo = (v: unknown): boolean | null => {
  if (typeof v === "boolean") return v;
  const s = text(v).trim().toLowerCase();
  return s === "yes" ? true : s === "no" ? false : null;
};
const count = (n: number) => n.toLocaleString("en-US");

/** A campaign tag from ?src= (e.g. linkedin, fasa-2027): lowercase letters, digits and dashes, up to 40 (like join tags). */
export const leadSource = (raw?: string | null) => {
  const t = raw?.trim().toLowerCase() ?? "";
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(t) ? t : null;
};

/** Checks an enquiry field by field. Returns the cleaned lead, or a plain-English message per field. */
export function validateLead(input: RawLead): LeadCheck {
  const fields: LeadErrors = {};
  const L = LEAD_LIMITS;

  const name = line(input.name);
  if (!name) fields.name = "Tell us your name";
  else if (name.length > L.name) fields.name = `Keep your name under ${L.name} characters`;
  else if (!/\p{L}/u.test(name)) fields.name = "Enter your name in letters";

  const email = line(input.email).toLowerCase();
  if (!email) fields.email = "Enter your email address. We reply by email";
  else if (email.length > L.email || !isEmail(email)) fields.email = "That doesn't look like an email address. Check it for typos";

  const rawPhone = line(input.phone);
  const phone = rawPhone ? normalisePhone(rawPhone) : null;
  if (!rawPhone) fields.phone = "Enter a mobile number we can call you on";
  else if (!phone) fields.phone = "Enter a South African mobile number, e.g. 082 123 4567";

  const area = line(input.area);
  if (area.length < 2) fields.area = "Tell us where you'd like to open: a town or area";
  else if (area.length > L.area) fields.area = `Keep it under ${L.area} characters`;

  const province = line(input.province).toUpperCase();
  if (!Object.hasOwn(PROVINCES, province)) fields.province = "Choose a province";

  const experience = para(input.experience);
  if (!experience) fields.experience = "Tell us about your retail or business experience";
  else if (experience.length < L.experienceMin) fields.experience = `A little more, please: at least ${L.experienceMin} characters`;
  else if (experience.length > L.experience) fields.experience = `Keep it under ${count(L.experience)} characters`;

  const capital = line(input.capital);
  if (!isCapitalBand(capital)) fields.capital = "Choose the band closest to what you could put in";

  const pharmacist = yesNo(input.pharmacist);
  if (pharmacist == null) fields.pharmacist = "Choose yes or no";

  const message = para(input.message);
  if (message.length > L.message) fields.message = `Keep your message under ${count(L.message)} characters`;

  if (!ticked(input.consent)) fields.consent = "Tick the box so we can use your details to reply";

  if (Object.keys(fields).length) return { ok: false, fields };
  return {
    ok: true,
    data: {
      name,
      email,
      phone: phone!,
      area,
      province: province as ProvinceCode,
      experience,
      capital: capital as CapitalBand,
      pharmacist: pharmacist!,
      message: message || null,
      source: leadSource(text(input.source)),
    },
  };
}

// ── The early-access list (herbalholland.com, until the online shop opens) ──

export const EARLY_ACCESS_LIMITS = { firstName: 60, perIpHour: 5 } as const;
/** The consent wording a sign-up ticked, kept with it: bump it when the site's wording changes. */
export const EARLY_ACCESS_CONSENT = "early-access-1";
export type EarlyAccessField = "firstName" | "email" | "mobile" | "contact" | "province" | "adult" | "consent";
export type CleanEarlyAccess = { firstName: string | null; email: string | null; mobile: string | null; province: ProvinceCode | null; source: string | null };
export type EarlyAccessCheck = { ok: true; data: CleanEarlyAccess } | { ok: false; fields: Partial<Record<EarlyAccessField, string>> };

/** An early-access sign-up: an email address or a mobile number (or both), 18 or older, and consent to hear about the launch. */
export function validateEarlyAccess(input: Partial<Record<EarlyAccessField | "source", unknown>>): EarlyAccessCheck {
  const fields: Partial<Record<EarlyAccessField, string>> = {};
  const firstName = line(input.firstName);
  if (firstName.length > EARLY_ACCESS_LIMITS.firstName) fields.firstName = `Keep it under ${EARLY_ACCESS_LIMITS.firstName} characters`;
  else if (firstName && !/\p{L}/u.test(firstName)) fields.firstName = "Enter your name in letters";

  const email = line(input.email).toLowerCase();
  if (email && (email.length > LEAD_LIMITS.email || !isEmail(email))) fields.email = "That doesn't look like an email address. Check it for typos";
  const rawMobile = line(input.mobile);
  const mobile = rawMobile ? normalisePhone(rawMobile) : null;
  if (rawMobile && !mobile) fields.mobile = "Enter a South African mobile number, e.g. 082 123 4567";
  if (!email && !rawMobile) fields.contact = "Enter an email address or a mobile number";

  const province = line(input.province).toUpperCase();
  if (province && !Object.hasOwn(PROVINCES, province)) fields.province = "Choose a province";
  if (!ticked(input.adult)) fields.adult = "Herbal Holland is for adults: tick to confirm you're 18 or older";
  if (!ticked(input.consent)) fields.consent = "Tick the box so we can tell you when the shop opens";

  if (Object.keys(fields).length) return { ok: false, fields };
  return { ok: true, data: { firstName: firstName || null, email: email || null, mobile, province: (province || null) as ProvinceCode | null, source: leadSource(text(input.source)) } };
}

// ── Numbers ─────────────────────────────────────────────────────────────────

/** FL-000123 (from the FRANCHISE_LEAD counter). */
export const leadNumber = (n: number) => `FL-${String(n).padStart(6, "0")}`;

/** "FL-123", "fl000123" or "FL 123" typed into a search → "FL-000123"; null when it isn't a lead number. */
export function numberQuery(q: string) {
  const m = q.trim().match(/^fl[\s-]*0*(\d{1,7})$/i);
  return m ? leadNumber(Number(m[1])) : null;
}

// ── The pipeline ────────────────────────────────────────────────────────────

export const LEAD_STATUSES = ["NEW", "CONTACTED", "INFO_EVENING", "DISCLOSURE_SENT", "SIGNED", "NOT_A_FIT"] as const;
export type LeadStatusKey = (typeof LEAD_STATUSES)[number];
export const isLeadStatus = (v: unknown): v is LeadStatusKey => typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);

export const LEAD_STATUS: Record<LeadStatusKey, { label: string; hint: string }> = {
  NEW: { label: "New", hint: "Waiting for our first reply" },
  CONTACTED: { label: "Contacted", hint: "We've replied or called" },
  INFO_EVENING: { label: "Information evening", hint: "Invited to, or came to, an information evening" },
  DISCLOSURE_SENT: { label: "Disclosure sent", hint: "They have the disclosure document; signing no sooner than 14 days after it went out" },
  SIGNED: { label: "Signed", hint: "Franchise agreement signed" },
  NOT_A_FIT: { label: "Not a fit", hint: "Closed; deleted a year after the last change unless it's reopened" },
};

/** Still being worked. */
export const OPEN_STATUSES: readonly LeadStatusKey[] = ["NEW", "CONTACTED", "INFO_EVENING", "DISCLOSURE_SENT"];

/**
 * Where a lead can go next. Forward (skipping steps is fine, but only "Disclosure sent" leads to "Signed"), one step
 * back to correct a slip, "Not a fit" from anywhere (a signed franchisee can still cancel in the CPA's cooling-off
 * period), and a closed lead can be reopened.
 */
export const LEAD_MOVES: Record<LeadStatusKey, readonly LeadStatusKey[]> = {
  NEW: ["CONTACTED", "INFO_EVENING", "DISCLOSURE_SENT", "NOT_A_FIT"],
  CONTACTED: ["INFO_EVENING", "DISCLOSURE_SENT", "NOT_A_FIT"],
  INFO_EVENING: ["CONTACTED", "DISCLOSURE_SENT", "NOT_A_FIT"],
  DISCLOSURE_SENT: ["INFO_EVENING", "SIGNED", "NOT_A_FIT"],
  SIGNED: ["DISCLOSURE_SENT", "NOT_A_FIT"],
  NOT_A_FIT: ["CONTACTED"],
};

// ── CPA franchise regulations: the disclosure document at least 14 days before signing ─────────────────────────

export const DISCLOSURE_DAYS = 14;

/** The first day a franchise agreement may be signed: 14 days after the disclosure document went out (SAST days). */
export const earliestSigning = (disclosureSentAt: Date) => addDays(startOfDaySA(disclosureSentAt), DISCLOSURE_DAYS);

/** Why the lead can't be marked signed yet, or null when it can. */
export function signingBlock(disclosureSentAt: Date | null, now: Date): string | null {
  if (!disclosureSentAt) return "Record the day the disclosure document was sent first: signing can follow 14 days later (CPA franchise regulations).";
  const earliest = earliestSigning(disclosureSentAt);
  if (dayKey(now) < dayKey(earliest))
    return `Not yet: the disclosure document went out on ${fmtDate(disclosureSentAt)}, so the earliest signing day is ${fmtDate(earliest)} (at least ${DISCLOSURE_DAYS} days, CPA franchise regulations).`;
  return null;
}

/** Why a lead can't move from one status to another, or null when it can. `disclosureSentAt` is the date it will have. */
export function checkMove(from: LeadStatusKey, to: LeadStatusKey, ctx: { disclosureSentAt: Date | null; now: Date }): string | null {
  if (from === to) return `It's already at “${LEAD_STATUS[to].label}”.`;
  if (!LEAD_MOVES[from].includes(to)) return `A lead at “${LEAD_STATUS[from].label}” can't move to “${LEAD_STATUS[to].label}”.`;
  if (to === "DISCLOSURE_SENT" && !ctx.disclosureSentAt) return "Add the day the disclosure document was sent.";
  if (to === "SIGNED") return signingBlock(ctx.disclosureSentAt, ctx.now);
  return null;
}

/** Why the disclosure date can't be set to `next` (null = cleared) on a lead at `status`, or null when it can. */
export function checkDisclosureDate(status: LeadStatusKey, next: Date | null, now: Date): string | null {
  if (status === "SIGNED") return "The agreement is signed: the disclosure date is part of the record and can't change.";
  if (!next) return status === "DISCLOSURE_SENT" ? "A lead at “Disclosure sent” needs the day the document went out." : null;
  if (dayKey(next) > dayKey(now)) return "The disclosure date can't be in the future.";
  return null;
}

/** The dated line a status change with a note adds to the lead's notes. */
export function noteLine(a: { at: Date; by: string; from: LeadStatusKey; to: LeadStatusKey; note: string }) {
  return `${fmtDate(a.at)} · ${a.by} · ${LEAD_STATUS[a.from].label} → ${LEAD_STATUS[a.to].label}: ${a.note}`;
}
export const appendNote = (notes: string | null, entry: string) => (notes?.trim() ? `${notes.trimEnd()}\n\n${entry}` : entry);

// ── POPIA: not-a-fit enquiries are deleted a year after their last change ────────────────────────────────────────

export const RETENTION_DAYS = 365;
/** Not-a-fit leads last changed before this moment are due for deletion. */
export const purgeCutoff = (now: Date) => addDays(now, -RETENTION_DAYS);
/** When a not-a-fit lead will be deleted (if nobody reopens it). */
export const purgeOn = (updatedAt: Date) => addDays(updatedAt, RETENTION_DAYS);

/** "Thandiwe" from "Thandiwe van Wyk": the greeting in the acknowledgement. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
