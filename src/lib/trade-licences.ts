// The licences and registrations a trade account must hold before it may buy, and whether it holds them. Pure: the
// application form (live, as the applicant picks the kind of business and the ranges), the portal, HQ, the till and
// the daily job all read these same rules. The rule set is the business's compliance policy — reviewed by counsel
// (docs/COMPLIANCE.md "Trade (wholesale)"); THC is never traded, so no cannabis licence appears here.
import { dayKey, fmtDate } from "./format";

export type TradeLicenceKind = "PHARMACY_LICENCE" | "SAPC_RECORDING" | "SAHPRA_LICENCE" | "FOOD_COA" | "BUSINESS_LICENCE" | "PRACTICE_NUMBER" | "CIPC_REGISTRATION" | "SARS_REGISTRATION";
export type TradeLicenceStatus = "SUBMITTED" | "VERIFIED" | "REJECTED";

type LicenceInfo = {
  name: string;
  law: string; // what requires it
  issuer: string;
  expires: boolean; // it lapses: the expiry date is required and the daily job watches it
  hint: string; // under the number field
  pattern?: RegExp; // the number, once tidied
  patternError?: string;
};

export const TRADE_LICENCES: Record<TradeLicenceKind, LicenceInfo> = {
  PHARMACY_LICENCE: { name: "Pharmacy licence", law: "Pharmacy Act 53 of 1974, section 22", issuer: "the Department of Health", expires: false, hint: "The licence number on the Department of Health's licence to own the pharmacy." },
  SAPC_RECORDING: { name: "SAPC pharmacy recording", law: "Pharmacy Act 53 of 1974", issuer: "the South African Pharmacy Council", expires: false, hint: "The pharmacy's recording number with the SAPC." },
  SAHPRA_LICENCE: { name: "SAHPRA licence to wholesale or distribute", law: "Medicines and Related Substances Act 101 of 1965, section 22C", issuer: "SAHPRA", expires: true, hint: "Needed to resell CBD supplements (complementary medicines) to other businesses." },
  FOOD_COA: { name: "Certificate of acceptability (food premises)", law: "Regulation R638 of 2018", issuer: "the municipality's environmental health services", expires: false, hint: "For the premises where the food is kept and sold." },
  BUSINESS_LICENCE: { name: "Business licence", law: "Businesses Act 71 of 1991", issuer: "the municipality", expires: false, hint: "The municipal licence to sell meals or perishable foodstuffs." },
  PRACTICE_NUMBER: { name: "Practice number", law: "BHF PCNS, with registration at the HPCSA or AHPCSA", issuer: "the Board of Healthcare Funders", expires: true, hint: "Seven digits. The expiry date is on this year's practice number certificate.", pattern: /^\d{7}$/, patternError: "A practice number is seven digits" },
  CIPC_REGISTRATION: { name: "Company registration certificate", law: "Companies Act 71 of 2008", issuer: "CIPC", expires: false, hint: "The certificate for the registration number above (CoR14.3 or equivalent).", pattern: /^\d{4}\/\d{6}\/\d{2}$/, patternError: "Company registration numbers look like 2015/123456/07" },
  SARS_REGISTRATION: { name: "SARS tax registration", law: "Tax Administration Act 28 of 2011, section 22", issuer: "SARS", expires: false, hint: "The owner's income tax reference number (ten digits) — the document is SARS's notice of registration.", pattern: /^\d{10}$/, patternError: "An income tax reference number is ten digits" },
};
export const TRADE_LICENCE_KINDS = Object.keys(TRADE_LICENCES) as TradeLicenceKind[];
/** A licence's name mid-sentence: "pharmacy licence", but "SAHPRA licence…" and "SAPC pharmacy recording" keep their capitals. */
export const licenceInSentence = (kind: TradeLicenceKind) => {
  const n = TRADE_LICENCES[kind].name;
  return /^[A-Z][a-z]/.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n;
};
export const isTradeLicenceKind = (v: unknown): v is TradeLicenceKind => typeof v === "string" && v in TRADE_LICENCES;

/**
 * When each licence is required: the account is one of `kinds` (any kind when absent), buys at least one of `classes`
 * (any range when absent) and, where `company` is set, is (true) or isn't (false) a registered company — a sole
 * proprietor gives no registration number. A licence named by several rules is required once.
 */
export const TRADE_LICENCE_RULES: readonly { licence: TradeLicenceKind; kinds?: readonly string[]; classes?: readonly string[]; company?: boolean; why: string }[] = [
  { licence: "PHARMACY_LICENCE", kinds: ["PHARMACY"], why: "A pharmacy trades under its licence to own the pharmacy" },
  { licence: "SAPC_RECORDING", kinds: ["PHARMACY"], why: "A pharmacy is recorded with the Pharmacy Council" },
  { licence: "SAHPRA_LICENCE", kinds: ["DISTRIBUTOR"], classes: ["CBD"], why: "Reselling CBD supplements to other businesses is wholesaling medicines" },
  { licence: "CIPC_REGISTRATION", kinds: ["DISTRIBUTOR", "OTHER"], why: "Trade accounts for these businesses are for registered companies" },
  { licence: "CIPC_REGISTRATION", kinds: ["RETAILER", "ONLINE_SHOP"], company: true, why: "A company shows its registration with CIPC" },
  { licence: "SARS_REGISTRATION", kinds: ["RETAILER", "ONLINE_SHOP"], company: false, why: "A sole proprietor shows the business is registered with SARS" },
  { licence: "BUSINESS_LICENCE", kinds: ["CAFE"], why: "Selling meals or perishable food needs a municipal business licence" },
  { licence: "FOOD_COA", kinds: ["CAFE"], why: "Food premises need a certificate of acceptability" },
  { licence: "FOOD_COA", classes: ["CBD_FOOD"], why: "Selling CBD food and drink needs a certificate of acceptability for the premises" },
  { licence: "PRACTICE_NUMBER", kinds: ["PRACTICE"], why: "A health practice holds a practice number and council registration" },
];

export type RequiredLicence = { kind: TradeLicenceKind; why: string };

/** The licences an account of this kind must hold to buy these ranges, in a fixed order. `company`: it has a registration number. */
export function requiredLicences(kind: string, classes: readonly string[], company: boolean): RequiredLicence[] {
  const out = new Map<TradeLicenceKind, string>();
  for (const r of TRADE_LICENCE_RULES) {
    if (r.kinds && !r.kinds.includes(kind)) continue;
    if (r.classes && !r.classes.some((c) => classes.includes(c))) continue;
    if (r.company !== undefined && r.company !== company) continue;
    if (!out.has(r.licence)) out.set(r.licence, r.why);
  }
  return TRADE_LICENCE_KINDS.filter((k) => out.has(k)).map((k) => ({ kind: k, why: out.get(k)! }));
}

// ── Holding them ─────────────────────────────────────────────────────────────

export type LicenceRecord = { id: string; kind: TradeLicenceKind; number: string; status: TradeLicenceStatus; expiresAt: Date | null; createdAt: Date; rejectReason?: string | null };
export type LicenceState = "ok" | "expiring" | "pending" | "rejected" | "expired" | "missing";
export type LicenceLine = {
  kind: TradeLicenceKind;
  name: string;
  why: string;
  state: LicenceState;
  current: LicenceRecord | null; // the newest verified licence still in date
  pending: LicenceRecord | null; // a newer one waiting for HQ
  latest: LicenceRecord | null; // the newest record of this kind, whatever its status
  problem: string | null; // why the account can't trade on this line (null when it can)
};
export type LicenceStanding = { ok: boolean; lines: LicenceLine[]; problems: string[] };

/** Days before a licence lapses that the account is reminded (and the line shows as "expiring"). */
export const LICENCE_REMIND_DAYS = 30;

const live = (r: LicenceRecord, now: Date) => !r.expiresAt || r.expiresAt.getTime() > now.getTime();

/**
 * Whether the account holds every required licence: verified by HQ and in date. A renewal waiting for HQ keeps the
 * account trading while the current licence is still in date; once it lapses, trading pauses until one is verified.
 */
export function licenceStanding(required: readonly RequiredLicence[], records: readonly LicenceRecord[], now = new Date()): LicenceStanding {
  const soon = now.getTime() + LICENCE_REMIND_DAYS * 86_400_000;
  const lines = required.map(({ kind, why }): LicenceLine => {
    const name = TRADE_LICENCES[kind].name;
    const mine = records.filter((r) => r.kind === kind).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const latest = mine[0] ?? null;
    const current = mine.find((r) => r.status === "VERIFIED" && live(r, now)) ?? null;
    const pending = mine.find((r) => r.status === "SUBMITTED" && (!current || r.createdAt > current.createdAt)) ?? null;
    let state: LicenceState;
    let problem: string | null = null;
    if (current) state = current.expiresAt && current.expiresAt.getTime() <= soon ? "expiring" : "ok";
    else if (pending) (state = "pending"), (problem = `${name} is waiting to be checked`);
    else if (latest?.status === "REJECTED") (state = "rejected"), (problem = `${name} wasn't accepted${latest.rejectReason ? ` (${latest.rejectReason})` : ""} — upload a new one`);
    else {
      const lapsed = mine.find((r) => r.status === "VERIFIED");
      if (lapsed?.expiresAt) (state = "expired"), (problem = `${name} expired on ${fmtDate(lapsed.expiresAt)} — upload the renewed one`);
      else (state = "missing"), (problem = `${name} is needed — upload it`);
    }
    return { kind, name, why, state, current, pending, latest, problem };
  });
  const problems = lines.flatMap((l) => (l.problem ? [l.problem] : []));
  return { ok: !problems.length, lines, problems };
}

// ── Typing one in ────────────────────────────────────────────────────────────

const CONTROL = /[\u0000-\u001F\u007F]/g;
export const LICENCE_NUMBER_MAX = 40;
export const LICENCE_MAX_YEARS = 10;

/** The end of a date (yyyy-mm-dd) in SAST: a licence that expires on a day is valid all that day. */
export const expiryOf = (ymd: string) => new Date(`${ymd}T23:59:59+02:00`);
/** The date an expiry falls on, as yyyy-mm-dd in SAST (for date inputs). */
export const expiryInput = (d: Date | null | undefined) => (d ? dayKey(d) : "");

export type LicenceInputCheck = { ok: true; number: string; expiresAt: Date | null } | { ok: false; fields: { number?: string; expiresAt?: string } };

/** Checks a licence number and expiry date as typed. `number` for a company registration is the registration number. */
export function checkLicenceInput(kind: TradeLicenceKind, input: { number?: string | null; expiresAt?: string | null }, now = new Date()): LicenceInputCheck {
  const info = TRADE_LICENCES[kind];
  const fields: { number?: string; expiresAt?: string } = {};
  let number = (input.number ?? "").replace(CONTROL, "").replace(/\s+/g, " ").trim().toUpperCase();
  if (info.pattern) number = number.replace(/\s/g, ""); // the patterned numbers are digits (and slashes)
  if (!number) fields.number = `Enter the ${licenceInSentence(kind)} number`;
  else if (number.length < 3 || number.length > LICENCE_NUMBER_MAX) fields.number = `Between 3 and ${LICENCE_NUMBER_MAX} characters`;
  else if (info.pattern && !info.pattern.test(number)) fields.number = info.patternError ?? "Check the number";
  const raw = (input.expiresAt ?? "").trim();
  let expiresAt: Date | null = null;
  if (raw) {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(expiryOf(raw).getTime()) && dayKey(expiryOf(raw)) === raw;
    if (!ok) fields.expiresAt = "Enter the expiry date";
    else {
      expiresAt = expiryOf(raw);
      if (expiresAt.getTime() <= now.getTime()) fields.expiresAt = "This licence has expired — upload the renewed one";
      else if (expiresAt.getTime() > now.getTime() + LICENCE_MAX_YEARS * 366 * 86_400_000) fields.expiresAt = "Check the expiry date";
    }
  } else if (info.expires) fields.expiresAt = `Enter the date the ${licenceInSentence(kind)} expires`;
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, number, expiresAt };
}

/** Licence documents: a PDF or a photo (JPG, PNG), at most 5 MB. Shared by the forms and the server's checks. */
export const LICENCE_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const LICENCE_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const LICENCE_FILE_MAX_BYTES = 5 * 1024 * 1024;
