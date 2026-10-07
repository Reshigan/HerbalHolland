// Trade licences: the documents an account must hold to buy (which ones: src/lib/trade-licences.ts, by the kind of
// business and the ranges), uploaded at registration or on renewal; HQ's check of each against the issuer; and the
// daily job that reminds an account before a licence lapses and pauses its trading when one has, lifting the pause as
// soon as a renewal is verified. Every step is audited. Documents are served through the app only, to HQ and to the
// account's own buyers (src/app/trade/licences/[id]/file/route.ts).
import { db, tx, type Tx } from "../db";
import { audit, SYSTEM, type Actor } from "../audit";
import { sendEmail } from "../email";
import { franchiseEmail } from "../leads";
import { APP_URL } from "../email-templates";
import { readDocument, storeDocument, UploadError } from "../uploads";
import {
  LICENCE_FILE_MAX_BYTES, LICENCE_FILE_TYPES, LICENCE_REMIND_DAYS, TRADE_LICENCES, TRADE_LICENCE_KINDS, checkLicenceInput, isTradeLicenceKind, licenceInSentence, licenceStanding, requiredLicences,
  type LicenceRecord, type LicenceStanding, type TradeLicenceKind,
} from "@/lib/trade-licences";
import { tradeHoldLiftedEmail, tradeLicenceExpiringEmail, tradeLicenceHoldEmail, tradeLicenceNoticeEmail, tradeLicenceRejectedEmail, tradePortalUrl } from "./emails";

export class TradeLicenceError extends Error {
  constructor(message: string, readonly field?: "kind" | "number" | "expiresAt" | "file") {
    super(message);
  }
}

const tradeTeam = () => process.env.TRADE_EMAIL?.trim() || franchiseEmail();
const hqUrl = (accountId: string) => `${APP_URL()}/hq/trade/accounts/${accountId}`;
const portalUrl = () => tradePortalUrl("/account#licences");
const mail = async (r: { subject: string; html: string; text: string }, to: string) => sendEmail({ ...r, to }).catch((e) => console.error("[trade licences] email failed", r.subject, e));

/** The folder licence documents are kept under in storage. */
export const LICENCE_FOLDER = "trade-licences";

const licenceDocument = (kind: TradeLicenceKind) => ({ types: LICENCE_FILE_TYPES, maxBytes: LICENCE_FILE_MAX_BYTES, label: licenceInSentence(kind) });
/** Checks a licence document (PDF, JPG or PNG, ≤ 5 MB) without storing it; refuses with a plain message (UploadError). */
export const checkLicenceDocument = async (file: File, kind: TradeLicenceKind) => void (await readDocument(file, licenceDocument(kind)));
/** Stores one licence document and returns the Upload id; refuses with a plain message. */
export const storeLicenceDocument = (file: File, kind: TradeLicenceKind) => storeDocument({ file, folder: LICENCE_FOLDER, ...licenceDocument(kind) });

/** An account's licence records, newest first. */
export async function licenceRecords(accountId: string, t: Tx | typeof db = db): Promise<(LicenceRecord & { uploadId: string; reviewedAt: Date | null; reviewedById: string | null; submittedById: string | null; remindedAt: Date | null })[]> {
  return t.tradeLicence.findMany({ where: { tradeAccountId: accountId }, orderBy: { createdAt: "desc" } });
}

/** What licences turn on: the kind of business, its ranges, and whether it's a company (has a registration number). */
export type LicensedAccount = { id: string; kind: string; classes: string[]; regNumber: string | null };
const needs = (a: { kind: string; classes: string[]; regNumber: string | null }) => requiredLicences(a.kind, a.classes, !!a.regNumber);

/** Whether the account holds what its kind of business and its ranges require (or would, with `kind`/`classes`/`regNumber`). */
export async function standingOf(account: LicensedAccount, opts: { kind?: string; classes?: string[]; regNumber?: string | null; now?: Date; t?: Tx | typeof db } = {}): Promise<LicenceStanding> {
  const records = await licenceRecords(account.id, opts.t);
  const next = { kind: opts.kind ?? account.kind, classes: opts.classes ?? account.classes, regNumber: opts.regNumber === undefined ? account.regNumber : opts.regNumber };
  return licenceStanding(needs(next), records, opts.now);
}

/**
 * For showing an account's licences: the standing of the ones it needs, then the lines for any other licence it has
 * sent (ahead of a range it wants added, say), on file but not counted for or against it, and every record.
 */
export async function licenceOverview(account: LicensedAccount) {
  const records = await licenceRecords(account.id);
  const required = needs(account);
  const others = TRADE_LICENCE_KINDS.filter((k) => !required.some((r) => r.kind === k) && records.some((r) => r.kind === k));
  return {
    standing: licenceStanding(required, records),
    others: licenceStanding(others.map((kind) => ({ kind, why: "On file, not needed for the ranges on the account yet" })), records).lines,
    records,
  };
}

/** Why the account can't be supplied right now because of its licences, or null when they're in order. */
export async function licenceProblem(account: LicensedAccount, t?: Tx | typeof db): Promise<string | null> {
  const s = await standingOf(account, { t });
  return s.ok ? null : s.problems.join("; ");
}

// ── Uploading ────────────────────────────────────────────────────────────────

/**
 * A licence uploaded for checking: by a buyer of the account (the portal, `byBuyerId`) or HQ. The number and expiry are
 * checked as typed, the document by its bytes; it waits as SUBMITTED until HQ verifies it, and the trade team is told.
 */
export async function submitTradeLicence(
  accountId: string,
  input: { kind: string; number?: string | null; expiresAt?: string | null },
  file: File | null,
  actor: Actor,
  opts: { byBuyerId?: string | null; now?: Date } = {},
) {
  const account = await db.tradeAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (account.status === "CLOSED") throw new TradeLicenceError("This trade account is closed");
  if (opts.byBuyerId) {
    const b = await db.tradeBuyer.findUnique({ where: { id: opts.byBuyerId } });
    if (!b || b.tradeAccountId !== accountId || !b.active) throw new TradeLicenceError("You can't upload licences for this account");
  }
  if (!isTradeLicenceKind(input.kind)) throw new TradeLicenceError("Choose which licence this is", "kind");
  const kind = input.kind;
  const check = checkLicenceInput(kind, { number: kind === "CIPC_REGISTRATION" ? (input.number ?? account.regNumber) : input.number, expiresAt: input.expiresAt }, opts.now);
  if (!check.ok) {
    const [field, message] = Object.entries(check.fields)[0] as ["number" | "expiresAt", string];
    throw new TradeLicenceError(message, field);
  }
  if (!file || file.size === 0) throw new TradeLicenceError(`Attach the ${licenceInSentence(kind)} (a PDF or a photo)`, "file");
  let uploadId: string;
  try {
    uploadId = await storeLicenceDocument(file, kind);
  } catch (e) {
    if (e instanceof UploadError) throw new TradeLicenceError(e.message, "file");
    throw e;
  }
  const licence = await tx(async (t) => {
    const l = await t.tradeLicence.create({ data: { tradeAccountId: accountId, kind, number: check.number, expiresAt: check.expiresAt, uploadId, submittedById: opts.byBuyerId ?? null } });
    await audit(t, actor, "trade.licence.submit", { entity: "TradeLicence", entityId: l.id, data: { account: account.number, kind, number: l.number, expiresAt: l.expiresAt } });
    return l;
  });
  await mail(tradeLicenceNoticeEmail({ account, licence: TRADE_LICENCES[kind].name, number: licence.number, expiresAt: licence.expiresAt, url: hqUrl(accountId) }), tradeTeam());
  return licence;
}

// ── HQ's check ───────────────────────────────────────────────────────────────

/** HQ checked the document against the issuer. A licence pause lifts itself once nothing required is missing or lapsed. */
export async function verifyTradeLicence(id: string, actor: Actor) {
  const { account, released } = await tx(async (t) => {
    const before = await t.tradeLicence.findUniqueOrThrow({ where: { id }, include: { account: true } });
    if (before.status !== "SUBMITTED") throw new TradeLicenceError(`This licence was already ${before.status === "VERIFIED" ? "verified" : "rejected"}`);
    if (before.expiresAt && before.expiresAt.getTime() <= Date.now()) throw new TradeLicenceError("This licence has expired. Ask for the renewed one");
    await t.tradeLicence.update({ where: { id }, data: { status: "VERIFIED", reviewedAt: new Date(), reviewedById: actor.id ?? null, rejectReason: null } });
    await audit(t, actor, "trade.licence.verify", { entity: "TradeLicence", entityId: id, data: { account: before.account.number, kind: before.kind, number: before.number, expiresAt: before.expiresAt } });
    const released = await releaseLicenceHoldIfClear(t, before.account.id, actor);
    return { account: before.account, released };
  });
  if (released) await mail(tradeHoldLiftedEmail({ account, url: tradePortalUrl("/range"), licence: true }), account.email);
  return { released };
}

/** HQ couldn't accept the document: the account is told why and uploads another. */
export async function rejectTradeLicence(id: string, reason: string, actor: Actor) {
  const why = reason.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!why) throw new TradeLicenceError("Say why it can't be accepted, so the account can put it right");
  const l = await tx(async (t) => {
    const before = await t.tradeLicence.findUniqueOrThrow({ where: { id }, include: { account: true } });
    if (before.status !== "SUBMITTED") throw new TradeLicenceError(`This licence was already ${before.status === "VERIFIED" ? "verified" : "rejected"}`);
    const l = await t.tradeLicence.update({ where: { id }, data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: actor.id ?? null, rejectReason: why }, include: { account: true } });
    await audit(t, actor, "trade.licence.reject", { entity: "TradeLicence", entityId: id, data: { account: before.account.number, kind: before.kind, number: before.number, reason: why } });
    return l;
  });
  await mail(tradeLicenceRejectedEmail({ account: l.account, licence: TRADE_LICENCES[l.kind].name, reason: why, url: portalUrl() }), l.account.email);
  return l;
}

/** Lifts the job's licence pause (holdReason "licence") once the account's licences are in order. */
export async function releaseLicenceHoldIfClear(t: Tx, accountId: string, actor: Actor) {
  const account = await t.tradeAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (account.status !== "ON_HOLD" || account.holdReason !== "licence") return false;
  if (!(await standingOf(account, { t })).ok) return false;
  await t.tradeAccount.update({ where: { id: accountId }, data: { status: "APPROVED", holdReason: null } });
  await audit(t, actor, "trade.account.release", { entity: "TradeAccount", entityId: accountId, data: { number: account.number, reason: "licence renewed" } });
  return true;
}

/** Licences waiting for HQ, oldest first (the HQ trade overview). */
export async function licencesToCheck(opts: { accountIds?: string[]; take?: number } = {}) {
  const where = { status: "SUBMITTED" as const, account: { status: { not: "CLOSED" as const } }, ...(opts.accountIds ? { tradeAccountId: { in: opts.accountIds } } : {}) };
  const [rows, total] = await Promise.all([
    db.tradeLicence.findMany({ where, orderBy: { createdAt: "asc" }, take: opts.take ?? 8, include: { account: { select: { id: true, number: true, name: true, status: true } } } }),
    db.tradeLicence.count({ where }),
  ]);
  return { rows, total };
}

// ── The daily job ────────────────────────────────────────────────────────────

/**
 * Reminds an account once, LICENCE_REMIND_DAYS before a required licence lapses (unless a renewal is already in), and
 * pauses an approved account whose required licence has lapsed (holdReason "licence"), with an email. Idempotent.
 */
export async function tradeLicenceExpiry(now = new Date()) {
  let reminded = 0, held = 0, failed = 0;
  const soon = new Date(now.getTime() + LICENCE_REMIND_DAYS * 86_400_000);
  const due = await db.tradeLicence.findMany({
    where: { status: "VERIFIED", remindedAt: null, expiresAt: { gt: now, lte: soon }, account: { status: { in: ["APPROVED", "ON_HOLD"] } } },
    include: { account: true },
    take: 500,
  });
  for (const l of due) {
    try {
      const newer = await db.tradeLicence.count({ where: { tradeAccountId: l.tradeAccountId, kind: l.kind, createdAt: { gt: l.createdAt }, status: { in: ["SUBMITTED", "VERIFIED"] } } });
      const needed = needs(l.account).some((r) => r.kind === l.kind);
      await db.tradeLicence.update({ where: { id: l.id }, data: { remindedAt: now } });
      if (newer || !needed) continue;
      await mail(tradeLicenceExpiringEmail({ account: l.account, licence: TRADE_LICENCES[l.kind].name, expiresAt: l.expiresAt!, url: portalUrl() }), l.account.email);
      reminded++;
    } catch (e) {
      failed++;
      console.error("[trade licences] reminder", l.id, e);
    }
  }
  // Licences that lapsed in the last 30 days (a longer gap still can't be traded on: orders check the licences themselves).
  const lapsedAccounts = await db.tradeAccount.findMany({ where: { status: "APPROVED", licences: { some: { status: "VERIFIED", expiresAt: { lte: now, gt: new Date(now.getTime() - 30 * 86_400_000) } } } }, take: 500 });
  for (const a of lapsedAccounts) {
    try {
      const s = await standingOf(a, { now });
      if (s.ok) continue;
      await tx(async (t) => {
        await t.tradeAccount.update({ where: { id: a.id }, data: { status: "ON_HOLD", holdReason: "licence" } });
        await audit(t, SYSTEM, "trade.account.hold", { entity: "TradeAccount", entityId: a.id, data: { number: a.number, reason: "licence", problems: s.problems } });
      });
      await mail(tradeLicenceHoldEmail({ account: a, problems: s.problems, url: portalUrl() }), a.email);
      held++;
    } catch (e) {
      failed++;
      console.error("[trade licences] hold", a.id, e);
    }
  }
  return { reminded, held, failed };
}
