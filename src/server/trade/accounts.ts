// Trade accounts: applications from the portal, HQ's approval and terms, holds and closures, the account's buyers,
// and the lists HQ and the till search. Every change is audited and every status change is emailed to the account.
import { db, tx, type Tx } from "../db";
import { audit, type Actor } from "../audit";
import { nextNumber } from "../counters";
import { getSettings } from "../settings";
import { sendEmail } from "../email";
import { franchiseEmail } from "../leads";
import { APP_URL } from "../email-templates";
import { ACCOUNT_STATUS_PROBLEM, TRADE_CLASSES, TRADE_LIMITS, isTradeKind, normaliseEmail, normaliseRegNumber, normaliseTradePhone, normaliseVatNumber, tradeAccountNumber, tradeNumberQuery, validateTradeApplication, type RawTradeApplication, type TradeErrors } from "@/lib/trade";
import type { RegClass } from "@/lib/compliance";
import { ledgerEntries, tradeBalance } from "./ledger";
import { ageing } from "@/lib/trade";
import { tradeApplicationNoticeEmail, tradeApplicationReceivedEmail, tradeApprovedEmail, tradeClosedEmail, tradeHoldLiftedEmail, tradeOnHoldEmail, tradePortalUrl } from "./emails";
import { ipHash } from "../leads";
import { UploadError } from "../uploads";
import { checkLicenceDocument, licenceProblem, standingOf, storeLicenceDocument } from "./licences";
import { isTradeLicenceKind, type TradeLicenceKind } from "@/lib/trade-licences";
import type { Prisma, TradeAccount, TradeAccountStatus, TradeBuyer, TradeTerms } from "@/generated/prisma/client";
import { isEmail } from "@/lib/email";

export class TradeAccountError extends Error {}

/** Where new applications are announced: TRADE_EMAIL, else the franchise team's address. */
export const tradeEmail = () => process.env.TRADE_EMAIL?.trim() || franchiseEmail();

/** A trade buyer as an audit actor (the audit log's CUSTOMER type with the buyer's id; the name says it's a trade buyer). */
export const tradeActor = (b: Pick<TradeBuyer, "id" | "name">): Actor => ({ type: "CUSTOMER", id: b.id, name: `${b.name} (trade buyer)` });

const mail = async (r: { subject: string; html: string; text: string }, to: string) => sendEmail({ ...r, to }).catch((e) => console.error("[trade] email failed", r.subject, e));

const hqUrl = (id: string) => `${APP_URL()}/hq/trade/accounts/${id}`;

// ── Applying ─────────────────────────────────────────────────────────────────

export type ApplyResult = { ok: true; account: TradeAccount; buyer: TradeBuyer } | { ok: false; fields: TradeErrors; error?: string };

/**
 * A trade application from the portal: validated (src/lib/trade.ts validateTradeApplication), then the PENDING account
 * (TA-…) with its OWNER buyer, an acknowledgement to the buyer, a notice to the trade team, and the audit entry
 * `trade.apply`. A buyer email already in use is refused by field: they sign in instead.
 */
/** Applications from one connection in an hour before the portal asks them to wait (the form carries documents). */
export const APPLICATIONS_PER_IP_HOUR = 5;

export async function applyForTradeAccount(
  raw: RawTradeApplication,
  opts: { source?: string | null; ip?: string | null; files?: Partial<Record<string, File | null>> } = {},
): Promise<ApplyResult> {
  // The licence documents that came with the form (their contents are checked once everything typed is in order).
  const files = new Map(Object.entries(opts.files ?? {}).filter((e): e is [TradeLicenceKind, File] => isTradeLicenceKind(e[0]) && e[1] instanceof File && e[1].size > 0));
  const check = validateTradeApplication({ ...raw, licenceFiles: [...files.keys()] });
  if (!check.ok) return check;
  const d = check.data;
  const settings = await getSettings();
  if (await db.tradeBuyer.findUnique({ where: { email: d.buyerEmail }, select: { id: true } }))
    return { ok: false, fields: { buyerEmail: "That email address already signs in to a trade account — sign in, or use another address for this business" } };
  const hash = opts.ip ? ipHash(opts.ip) : null;
  if (hash && (await db.tradeAccount.count({ where: { ipHash: hash, createdAt: { gte: new Date(Date.now() - 3_600_000) } } })) >= APPLICATIONS_PER_IP_HOUR)
    return { ok: false, fields: {}, error: "We've had several applications from this connection in the last hour — please try again later, or email the trade team." };
  // The documents: every one checked by its bytes before any is stored, then stored before the account exists.
  const refused: TradeErrors = {};
  for (const l of d.licences)
    await checkLicenceDocument(files.get(l.kind)!, l.kind).catch((e) => {
      if (!(e instanceof UploadError)) throw e;
      refused[`licence.${l.kind}.file`] = e.message;
    });
  if (Object.keys(refused).length) return { ok: false, fields: refused };
  const uploads = new Map<TradeLicenceKind, string>();
  for (const l of d.licences) uploads.set(l.kind, await storeLicenceDocument(files.get(l.kind)!, l.kind));
  const now = new Date();
  const { account, buyer } = await tx(async (t) => {
    const number = tradeAccountNumber(await nextNumber(t, "trade-account"));
    const account = await t.tradeAccount.create({
      data: {
        number, name: d.name, legalName: d.legalName, kind: d.kind, regNumber: d.regNumber, vatNumber: d.vatNumber, email: d.email, phone: d.phone,
        addressLine: d.addressLine, suburb: d.suburb, city: d.city, province: d.province, postalCode: d.postalCode,
        deliveryLine: d.delivery?.addressLine ?? null, deliverySuburb: d.delivery?.suburb ?? null, deliveryCity: d.delivery?.city ?? null, deliveryProvince: d.delivery?.province ?? null, deliveryPostalCode: d.delivery?.postalCode ?? null,
        status: "PENDING", terms: "PREPAID", classes: d.classes, notes: d.notes, adultAttestedAt: now, termsVersion: settings.trade.termsVersion, termsAcceptedAt: now, ipHash: hash,
        buyers: { create: { name: d.buyerName, email: d.buyerEmail, phone: d.buyerPhone, role: "OWNER" } },
      },
      include: { buyers: true },
    });
    const buyer = account.buyers[0];
    if (d.licences.length)
      await t.tradeLicence.createMany({ data: d.licences.map((l) => ({ tradeAccountId: account.id, kind: l.kind, number: l.number, expiresAt: l.expiresAt, uploadId: uploads.get(l.kind)!, submittedById: buyer.id })) });
    await audit(t, tradeActor(buyer), "trade.apply", { entity: "TradeAccount", entityId: account.id, data: { number, kind: d.kind, classes: d.classes, licences: d.licences.map((l) => ({ kind: l.kind, number: l.number, expiresAt: l.expiresAt })), termsVersion: settings.trade.termsVersion, source: opts.source ?? null } });
    return { account, buyer };
  });
  await Promise.all([
    mail(tradeApplicationReceivedEmail({ account, buyerName: buyer.name }), buyer.email),
    mail(tradeApplicationNoticeEmail({ account, url: hqUrl(account.id) }), tradeEmail()),
  ]);
  return { ok: true, account, buyer };
}

// ── HQ: approval, terms, holds, closure ──────────────────────────────────────

export type TradeTermsInput = { terms: TradeTerms; creditLimitCents: number; paymentDays: number; classes: string[]; priceListId?: string | null; dcId?: string | null; notes?: string | null };

async function checkTerms(t: Tx | typeof db, a: TradeTermsInput) {
  const classes = [...new Set(a.classes.map((c) => c.trim().toUpperCase()))] as RegClass[];
  if (!classes.length) throw new TradeAccountError("Choose at least one range the account may buy");
  if (classes.includes("THC")) throw new TradeAccountError("Licensed medicines are never traded");
  if (classes.some((c) => !TRADE_CLASSES.includes(c))) throw new TradeAccountError("Unknown range");
  if (a.terms !== "PREPAID" && a.terms !== "ACCOUNT") throw new TradeAccountError("Terms are prepaid or on account");
  const creditLimitCents = Math.max(0, Math.floor(a.creditLimitCents || 0));
  if (a.terms === "ACCOUNT" && creditLimitCents <= 0) throw new TradeAccountError("An account on credit terms needs a credit limit");
  const paymentDays = Math.floor(a.paymentDays || 30);
  if (paymentDays < 1 || paymentDays > 120) throw new TradeAccountError("Payment days must be between 1 and 120");
  if (a.priceListId) {
    const list = await t.priceList.findUnique({ where: { id: a.priceListId }, select: { kind: true } });
    if (list?.kind !== "TRADE") throw new TradeAccountError("Choose a trade price list");
  }
  if (a.dcId) {
    const dc = await t.store.findUnique({ where: { id: a.dcId }, select: { kind: true, status: true } });
    if (dc?.kind !== "WAREHOUSE" || dc.status === "CLOSED") throw new TradeAccountError("Choose a distribution centre");
  }
  return { terms: a.terms, creditLimitCents: a.terms === "ACCOUNT" ? creditLimitCents : 0, paymentDays, classes, priceListId: a.priceListId || null, dcId: a.dcId || null, ...(a.notes !== undefined ? { notes: a.notes?.trim().slice(0, TRADE_LIMITS.notes) || null } : {}) };
}

const termsInfo = async () => {
  const s = (await getSettings()).trade;
  return { minOrderCents: s.minOrderCents, deliveryCents: s.deliveryCents, freeDeliveryOverCents: s.freeDeliveryOverCents, collectHandlingCents: s.collectHandlingCents, eftHoldDays: s.eftHoldDays };
};

/** Approves a PENDING account (or re-approves one HQ held) with its terms; emails the approval. */
export async function approveTradeAccount(id: string, input: TradeTermsInput, actor: Actor) {
  const account = await tx(async (t) => {
    const before = await t.tradeAccount.findUniqueOrThrow({ where: { id } });
    if (before.status === "CLOSED") throw new TradeAccountError("This account is closed — reopen it first");
    const data = await checkTerms(t, input);
    // Licences first: every one this kind of business needs for the approved ranges, verified and in date.
    const standing = await standingOf(before, { classes: data.classes, t });
    if (!standing.ok) throw new TradeAccountError(`Verify the licences first: ${standing.problems.join("; ")}`);
    const account = await t.tradeAccount.update({ where: { id }, data: { ...data, status: "APPROVED", holdReason: null, approvedAt: before.approvedAt ?? new Date(), approvedById: actor.id ?? null } });
    await audit(t, actor, "trade.account.approve", { entity: "TradeAccount", entityId: id, data: { number: account.number, from: before.status, terms: data.terms, creditLimitCents: data.creditLimitCents, paymentDays: data.paymentDays, classes: data.classes } });
    return account;
  });
  await mail(tradeApprovedEmail({ account, terms: await termsInfo(), url: tradePortalUrl("/login") }), account.email);
  return account;
}

/** Puts an approved account on hold (nothing new goes on account; EFT orders still work). `reason` "overdue" is the job's; it lifts itself when settled. */
export async function holdTradeAccount(id: string, reason: string, actor: Actor) {
  const r = reason.trim().slice(0, 200);
  if (!r) throw new TradeAccountError("Say why the account is on hold");
  const { account, balanceCents, overdueCents } = await tx(async (t) => {
    const before = await t.tradeAccount.findUniqueOrThrow({ where: { id } });
    if (before.status !== "APPROVED" && before.status !== "ON_HOLD") throw new TradeAccountError(`Only an approved account can be put on hold (this one is ${before.status.toLowerCase().replace("_", " ")})`);
    const account = await t.tradeAccount.update({ where: { id }, data: { status: "ON_HOLD", holdReason: r } });
    await audit(t, actor, "trade.account.hold", { entity: "TradeAccount", entityId: id, data: { number: account.number, reason: r } });
    const entries = await ledgerEntries(id, t);
    const a = ageing(entries);
    return { account, balanceCents: a.total, overdueCents: a.overdue };
  });
  await mail(tradeOnHoldEmail({ account, reason: r, balanceCents, overdueCents, url: tradePortalUrl("/statements") }), account.email);
  return account;
}

/** Lifts a hold by hand (HQ). The overdue job's hold lifts itself on payment, but HQ may lift it early. */
export async function releaseTradeHold(id: string, actor: Actor) {
  const account = await tx(async (t) => {
    const before = await t.tradeAccount.findUniqueOrThrow({ where: { id } });
    if (before.status !== "ON_HOLD") throw new TradeAccountError("This account isn't on hold");
    const account = await t.tradeAccount.update({ where: { id }, data: { status: "APPROVED", holdReason: null } });
    await audit(t, actor, "trade.account.release", { entity: "TradeAccount", entityId: id, data: { number: account.number, reason: before.holdReason } });
    return account;
  });
  await mail(tradeHoldLiftedEmail({ account, url: tradePortalUrl("/range") }), account.email);
  return account;
}

/** Closes an account: its buyers are signed out and can't sign in again; the balance stays due. */
export async function closeTradeAccount(id: string, reason: string | null, actor: Actor) {
  const r = reason?.trim().slice(0, 200) || null;
  const { account, balanceCents } = await tx(async (t) => {
    const before = await t.tradeAccount.findUniqueOrThrow({ where: { id } });
    if (before.status === "CLOSED") throw new TradeAccountError("This account is already closed");
    const account = await t.tradeAccount.update({ where: { id }, data: { status: "CLOSED", holdReason: r } });
    await t.session.deleteMany({ where: { tradeBuyer: { tradeAccountId: id } } });
    await audit(t, actor, "trade.account.close", { entity: "TradeAccount", entityId: id, data: { number: account.number, reason: r } });
    return { account, balanceCents: await tradeBalance(id, t) };
  });
  await mail(tradeClosedEmail({ account, reason: r, balanceCents }), account.email);
  return account;
}

export type TradeAccountDetails = {
  name: string;
  legalName: string;
  kind: string;
  regNumber: string | null;
  vatNumber: string | null;
  email: string;
  phone: string | null;
  addressLine: string;
  suburb: string | null;
  city: string;
  province: string;
  postalCode: string;
  deliveryLine: string | null;
  deliverySuburb: string | null;
  deliveryCity: string | null;
  deliveryProvince: string | null;
  deliveryPostalCode: string | null;
};
const DETAIL_KEYS: (keyof TradeAccountDetails)[] = ["name", "legalName", "kind", "regNumber", "vatNumber", "email", "phone", "addressLine", "suburb", "city", "province", "postalCode", "deliveryLine", "deliverySuburb", "deliveryCity", "deliveryProvince", "deliveryPostalCode"];
const TERM_KEYS: (keyof TradeTermsInput)[] = ["terms", "creditLimitCents", "paymentDays", "classes", "priceListId", "dcId", "notes"];

function cleanDetails(p: Partial<TradeAccountDetails>): Prisma.TradeAccountUpdateInput {
  const out: Prisma.TradeAccountUpdateInput = {};
  const line = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  if (p.name !== undefined) out.name = line(p.name).slice(0, TRADE_LIMITS.name) || undefined;
  if (p.legalName !== undefined) {
    const v = line(p.legalName).slice(0, TRADE_LIMITS.name);
    if (!v) throw new TradeAccountError("The legal name can't be blank");
    out.legalName = v;
  }
  if (p.kind !== undefined) {
    const k = line(p.kind).toUpperCase();
    if (!isTradeKind(k)) throw new TradeAccountError("Choose what kind of business this is");
    out.kind = k;
  }
  if (p.regNumber !== undefined) {
    const v = line(p.regNumber);
    if (v && !normaliseRegNumber(v)) throw new TradeAccountError("Company registration numbers look like 2015/123456/07");
    out.regNumber = v ? normaliseRegNumber(v) : null;
  }
  if (p.vatNumber !== undefined) {
    const v = line(p.vatNumber);
    if (v && !normaliseVatNumber(v)) throw new TradeAccountError("VAT numbers are ten digits starting with 4");
    out.vatNumber = v ? normaliseVatNumber(v) : null;
  }
  if (p.email !== undefined) {
    const v = normaliseEmail(line(p.email));
    if (!isEmail(v)) throw new TradeAccountError("Enter the billing email address");
    out.email = v;
  }
  if (p.phone !== undefined) {
    const v = line(p.phone);
    if (v && !normaliseTradePhone(v)) throw new TradeAccountError("Enter a South African phone number");
    out.phone = v ? normaliseTradePhone(v) : null;
  }
  for (const k of ["addressLine", "city", "postalCode"] as const)
    if (p[k] !== undefined) {
      const v = line(p[k]).slice(0, TRADE_LIMITS.address);
      if (!v) throw new TradeAccountError(`The ${k === "addressLine" ? "street address" : k === "city" ? "city" : "postal code"} can't be blank`);
      if (k === "postalCode" && !/^\d{4}$/.test(v)) throw new TradeAccountError("Enter the four-digit postal code");
      out[k] = v;
    }
  if (p.suburb !== undefined) out.suburb = line(p.suburb).slice(0, TRADE_LIMITS.address) || null;
  if (p.province !== undefined) {
    const v = line(p.province).toUpperCase();
    if (!["GP", "WC", "KZN", "EC", "FS", "LP", "MP", "NW", "NC"].includes(v)) throw new TradeAccountError("Choose the province");
    out.province = v as Prisma.TradeAccountUpdateInput["province"];
  }
  const dLine = p.deliveryLine !== undefined ? line(p.deliveryLine).slice(0, TRADE_LIMITS.address) : undefined;
  if (dLine !== undefined) {
    if (!dLine) Object.assign(out, { deliveryLine: null, deliverySuburb: null, deliveryCity: null, deliveryProvince: null, deliveryPostalCode: null });
    else {
      const city = line(p.deliveryCity);
      const prov = line(p.deliveryProvince).toUpperCase();
      const postal = line(p.deliveryPostalCode);
      if (!city || !/^\d{4}$/.test(postal) || !["GP", "WC", "KZN", "EC", "FS", "LP", "MP", "NW", "NC"].includes(prov)) throw new TradeAccountError("A delivery address needs a city, province and four-digit postal code");
      Object.assign(out, { deliveryLine: dLine, deliverySuburb: line(p.deliverySuburb) || null, deliveryCity: city, deliveryProvince: prov as Prisma.TradeAccountUpdateInput["deliveryProvince"], deliveryPostalCode: postal });
    }
  }
  return out;
}

/**
 * Updates an account's details and/or terms. HQ (a USER actor) may change anything; an OWNER buyer (`byBuyerId`) may
 * change the business details only — terms, limits, classes and price lists stay HQ's. Audited with the keys changed.
 */
export async function updateTradeAccount(id: string, patch: Partial<TradeAccountDetails & TradeTermsInput>, actor: Actor, opts: { byBuyerId?: string | null } = {}) {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  const termKeys = keys.filter((k) => (TERM_KEYS as string[]).includes(k));
  const detailKeys = keys.filter((k) => (DETAIL_KEYS as string[]).includes(k));
  if (!termKeys.length && !detailKeys.length) throw new TradeAccountError("Nothing to change");
  return tx(async (t) => {
    const before = await t.tradeAccount.findUniqueOrThrow({ where: { id } });
    if (opts.byBuyerId) {
      const b = await t.tradeBuyer.findUnique({ where: { id: opts.byBuyerId } });
      if (!b || b.tradeAccountId !== id || !b.active || b.role !== "OWNER") throw new TradeAccountError("Only the account's owner can change its details");
      if (before.status === "CLOSED") throw new TradeAccountError(ACCOUNT_STATUS_PROBLEM.CLOSED);
      if (termKeys.length) throw new TradeAccountError("Terms and ranges are set by Herbal Holland Trade — email us to change them");
    }
    const data: Prisma.TradeAccountUpdateInput = { ...cleanDetails(Object.fromEntries(detailKeys.map((k) => [k, patch[k]])) as Partial<TradeAccountDetails>) };
    if (termKeys.length) {
      const terms = await checkTerms(t, { terms: patch.terms ?? before.terms, creditLimitCents: patch.creditLimitCents ?? before.creditLimitCents, paymentDays: patch.paymentDays ?? before.paymentDays, classes: patch.classes ?? before.classes, priceListId: patch.priceListId === undefined ? before.priceListId : patch.priceListId, dcId: patch.dcId === undefined ? before.dcId : patch.dcId, notes: patch.notes });
      Object.assign(data, terms);
    }
    // A new kind of business, new ranges, or adding or removing the registration number (a company or a sole
    // proprietor) can need licences the account hasn't given yet.
    const nextKind = (data.kind as string | undefined) ?? before.kind;
    const nextClasses = (data.classes as string[] | undefined) ?? before.classes;
    const nextReg = data.regNumber === undefined ? before.regNumber : (data.regNumber as string | null);
    if ((before.status === "APPROVED" || before.status === "ON_HOLD") && (nextKind !== before.kind || nextClasses.join() !== before.classes.join() || !!nextReg !== !!before.regNumber)) {
      const standing = await standingOf(before, { kind: nextKind, classes: nextClasses, regNumber: nextReg, t });
      if (!standing.ok) throw new TradeAccountError(`The account needs its licences in order for that first: ${standing.problems.join("; ")}`);
    }
    const account = await t.tradeAccount.update({ where: { id }, data });
    await audit(t, actor, "trade.account.update", { entity: "TradeAccount", entityId: id, data: { number: account.number, changed: [...detailKeys, ...termKeys] } });
    return account;
  });
}

// ── Buyers ───────────────────────────────────────────────────────────────────

async function mayManageBuyers(t: Tx, accountId: string, opts: { byBuyerId?: string | null }) {
  if (!opts.byBuyerId) return; // HQ
  const b = await t.tradeBuyer.findUnique({ where: { id: opts.byBuyerId } });
  if (!b || b.tradeAccountId !== accountId || !b.active || b.role !== "OWNER") throw new TradeAccountError("Only the account's owner can manage who orders for it");
  const account = await t.tradeAccount.findUniqueOrThrow({ where: { id: accountId }, select: { status: true } });
  if (account.status === "CLOSED") throw new TradeAccountError(ACCOUNT_STATUS_PROBLEM.CLOSED);
}

/** Adds a buyer (OWNER or BUYER). They sign in with a code sent to their email, which must be unique across the network. */
export async function addTradeBuyer(accountId: string, a: { name: string; email: string; phone?: string | null; role?: "OWNER" | "BUYER" }, actor: Actor, opts: { byBuyerId?: string | null } = {}) {
  const name = a.name.replace(/\s+/g, " ").trim().slice(0, TRADE_LIMITS.name);
  const email = normaliseEmail(a.email);
  if (!name) throw new TradeAccountError("Enter the buyer's name");
  if (!isEmail(email)) throw new TradeAccountError("Enter the buyer's email address");
  const phone = a.phone?.trim() ? normaliseTradePhone(a.phone) : null;
  if (a.phone?.trim() && !phone) throw new TradeAccountError("Enter a South African phone number, or leave it blank");
  return tx(async (t) => {
    await mayManageBuyers(t, accountId, opts);
    if (await t.tradeBuyer.findUnique({ where: { email }, select: { id: true } })) throw new TradeAccountError("That email address already signs in to a trade account");
    const buyer = await t.tradeBuyer.create({ data: { tradeAccountId: accountId, name, email, phone, role: a.role === "OWNER" ? "OWNER" : "BUYER" } });
    await audit(t, actor, "trade.buyer.add", { entity: "TradeAccount", entityId: accountId, data: { buyerId: buyer.id, role: buyer.role } });
    return buyer;
  });
}

/** Removes a buyer: deactivated (their orders keep pointing at them) and signed out everywhere. The last owner stays. */
export async function removeTradeBuyer(buyerId: string, actor: Actor, opts: { byBuyerId?: string | null } = {}) {
  return tx(async (t) => {
    const buyer = await t.tradeBuyer.findUniqueOrThrow({ where: { id: buyerId } });
    await mayManageBuyers(t, buyer.tradeAccountId, opts);
    if (!buyer.active) return buyer;
    if (buyer.role === "OWNER" && (await t.tradeBuyer.count({ where: { tradeAccountId: buyer.tradeAccountId, role: "OWNER", active: true } })) <= 1)
      throw new TradeAccountError("An account keeps at least one owner — add another owner first");
    const updated = await t.tradeBuyer.update({ where: { id: buyerId }, data: { active: false } });
    await t.session.deleteMany({ where: { tradeBuyerId: buyerId } });
    await audit(t, actor, "trade.buyer.remove", { entity: "TradeAccount", entityId: buyer.tradeAccountId, data: { buyerId } });
    return updated;
  });
}

// ── Reading ──────────────────────────────────────────────────────────────────

export const tradeAccountById = (id: string) => db.tradeAccount.findUnique({ where: { id }, include: { buyers: { orderBy: [{ role: "asc" }, { createdAt: "asc" }] }, priceList: { select: { id: true, name: true } } } });

/** Balance (ledger), ageing, open orders and the last order — for HQ's account page and the portal's dashboard. */
export async function tradeAccountSummary(id: string, now = new Date()) {
  const account = await tradeAccountById(id);
  if (!account) return null;
  const [entries, open, last] = await Promise.all([
    ledgerEntries(id),
    db.tradeOrder.aggregate({ where: { tradeAccountId: id, status: { in: ["PENDING_PAYMENT", "PLACED", "PICKING", "READY"] } }, _count: true, _sum: { totalCents: true } }),
    db.tradeOrder.findFirst({ where: { tradeAccountId: id }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, totalCents: true, createdAt: true } }),
  ]);
  const age = ageing(entries, now);
  const openOnAccount = await db.tradeOrder.aggregate({ where: { tradeAccountId: id, payMethod: "ACCOUNT", status: { in: ["PLACED", "PICKING", "READY"] } }, _sum: { totalCents: true } });
  const exposure = age.total + (openOnAccount._sum.totalCents ?? 0);
  return {
    account,
    balanceCents: age.total,
    ageing: age,
    openOrders: { count: open._count, cents: open._sum.totalCents ?? 0 },
    openOnAccountCents: openOnAccount._sum.totalCents ?? 0,
    availableCents: account.terms === "ACCOUNT" && account.status === "APPROVED" ? Math.max(0, account.creditLimitCents - exposure) : 0,
    lastOrder: last,
  };
}

/** ?q=: an account number (however typed), or part of a trading name, legal name, VAT number or billing email. */
export function tradeAccountSearch(raw?: string | null): Prisma.TradeAccountWhereInput {
  const q = (raw ?? "").trim().slice(0, 100);
  if (!q) return {};
  const like = { contains: q, mode: "insensitive" as const };
  const number = tradeNumberQuery(q, "TA");
  return { OR: [...(number ? [{ number }] : []), { number: like }, { name: like }, { legalName: like }, { vatNumber: like }, { email: like }] };
}

/** HQ's list: by status (default every status), searched and paginated, newest first (PENDING first when unfiltered). */
export async function listTradeAccounts(f: { status?: TradeAccountStatus | "ALL" | null; q?: string | null; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(f.pageSize ?? 25)));
  const where: Prisma.TradeAccountWhereInput = { AND: [f.status && f.status !== "ALL" ? { status: f.status } : {}, tradeAccountSearch(f.q)] };
  const [total, rows] = await Promise.all([
    db.tradeAccount.count({ where }),
    db.tradeAccount.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { orders: true, buyers: true } } } }),
  ]);
  const balances = rows.length ? await db.tradeLedgerEntry.groupBy({ by: ["tradeAccountId"], where: { tradeAccountId: { in: rows.map((r) => r.id) } }, _sum: { cents: true } }) : [];
  const balance = new Map(balances.map((b) => [b.tradeAccountId, b._sum.cents ?? 0]));
  return { rows: rows.map((r) => ({ ...r, balanceCents: balance.get(r.id) ?? 0 })), total, page, pageSize };
}

export type TradeAccountHit = {
  id: string;
  number: string;
  name: string;
  legalName: string;
  vatNumber: string | null;
  status: TradeAccountStatus;
  terms: TradeTerms;
  classes: string[];
  creditLimitCents: number;
  paymentDays: number;
  balanceCents: number;
  availableCents: number; // what may still go on account now
  licenceProblem: string | null; // a required licence missing, waiting for HQ, or lapsed: the till can't sell to it
};

/** The till's lookup: approved accounts (and those on hold, who may pay in money) by name, number or VAT number, with terms, limit and balance. */
export async function tradeAccountLookup(q: string, opts: { limit?: number; includeOnHold?: boolean } = {}): Promise<TradeAccountHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const statuses: TradeAccountStatus[] = opts.includeOnHold === false ? ["APPROVED"] : ["APPROVED", "ON_HOLD"];
  const rows = await db.tradeAccount.findMany({ where: { AND: [{ status: { in: statuses } }, tradeAccountSearch(term)] }, orderBy: { name: "asc" }, take: Math.min(25, Math.max(1, opts.limit ?? 8)) });
  if (!rows.length) return [];
  const [balances, open] = await Promise.all([
    db.tradeLedgerEntry.groupBy({ by: ["tradeAccountId"], where: { tradeAccountId: { in: rows.map((r) => r.id) } }, _sum: { cents: true } }),
    db.tradeOrder.groupBy({ by: ["tradeAccountId"], where: { tradeAccountId: { in: rows.map((r) => r.id) }, payMethod: "ACCOUNT", status: { in: ["PLACED", "PICKING", "READY"] } }, _sum: { totalCents: true } }),
  ]);
  const balance = new Map(balances.map((b) => [b.tradeAccountId, b._sum.cents ?? 0]));
  const openCents = new Map(open.map((o) => [o.tradeAccountId, o._sum.totalCents ?? 0]));
  const licence = new Map(await Promise.all(rows.map(async (r) => [r.id, await licenceProblem(r)] as const)));
  return rows.map((r) => {
    const balanceCents = balance.get(r.id) ?? 0;
    const exposure = balanceCents + (openCents.get(r.id) ?? 0);
    return {
      id: r.id, number: r.number, name: r.name, legalName: r.legalName, vatNumber: r.vatNumber, status: r.status, terms: r.terms, classes: r.classes, creditLimitCents: r.creditLimitCents, paymentDays: r.paymentDays,
      balanceCents, availableCents: r.terms === "ACCOUNT" && r.status === "APPROVED" ? Math.max(0, r.creditLimitCents - exposure) : 0,
      licenceProblem: licence.get(r.id) ?? null,
    };
  });
}

/** Loads an account that may transact (APPROVED, or ON_HOLD when `allowOnHold`), or throws the plain reason. */
export async function requireTradeAccount(id: string, opts: { allowOnHold?: boolean } = {}, client: Tx | typeof db = db) {
  const account = await client.tradeAccount.findUnique({ where: { id } });
  if (!account) throw new TradeAccountError("Unknown trade account");
  if (account.status === "APPROVED" || (opts.allowOnHold && account.status === "ON_HOLD")) return account;
  throw new TradeAccountError(ACCOUNT_STATUS_PROBLEM[account.status as keyof typeof ACCOUNT_STATUS_PROBLEM]);
}
