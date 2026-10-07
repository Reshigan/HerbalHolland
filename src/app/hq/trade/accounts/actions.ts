"use server";
// HQ → Trade → Accounts: licences (verify or reject), approval and terms, holds and closure, details, buyers, the ledger (payments, credit notes,
// adjustments, statements) and placing an order on an account's behalf. Every action re-checks the signed-in user
// (HQ admin or HQ team), hands the work to the trade services (which validate and audit) and turns their errors into
// inline messages.
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { reportFailure } from "@/server/alerts";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { addTradeBuyer, approveTradeAccount, closeTradeAccount, holdTradeAccount, releaseTradeHold, removeTradeBuyer, TradeAccountError, updateTradeAccount, type TradeAccountDetails, type TradeTermsInput } from "@/server/trade/accounts";
import { adjustTradeLedger, emailTradeStatement, issueCreditNote, recordTradePayment, TradeLedgerError } from "@/server/trade/ledger";
import { collectStoresFor, defaultDc, placeTradeOrder, TradeOrderError } from "@/server/trade/orders";
import { rejectTradeLicence, TradeLicenceError, verifyTradeLicence } from "@/server/trade/licences";
import { tradeRange } from "@/server/pricing";
import { StockError } from "@/server/inventory";
import { guard, DENIED, fail, done, flashTo, type ActionState } from "@/server/hq/guard";
import { str, opt, list, parseRand, parseInt10, parseDay } from "@/server/hq/form";
import { TRADE_CLASSES, previousMonth } from "@/lib/trade";
import { zar, zarWhole } from "@/lib/money";
import type { RegClass } from "@/lib/compliance";
import type { TradeTerms } from "@/generated/prisma/client";

const EXPECTED = [TradeAccountError, TradeLedgerError, TradeOrderError, TradeLicenceError, StockError];

/** Runs an action body; the trade services' own errors come back as inline messages, redirects pass through. */
async function attempt(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    if (EXPECTED.some((E) => e instanceof E)) return fail((e as Error).message);
    if ((e as { code?: string })?.code === "P2025") return fail("That no longer exists. Reload the page.");
    void reportFailure(e, "HQ trade account action"); // unexpected: logged and emailed to ops
    return fail("Something went wrong. Please try again.");
  }
}

const refresh = (id: string) => {
  revalidatePath(`/hq/trade/accounts/${id}`);
  revalidatePath("/hq/trade/accounts");
  revalidatePath("/hq/trade");
};

/** The terms fields (approve and "save terms" share them): checked here for the form, then again by the service. */
function readTerms(fd: FormData): { terms: TradeTermsInput; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const terms = str(fd, "terms") as TradeTerms;
  if (terms !== "PREPAID" && terms !== "ACCOUNT") fields.terms = "Prepaid or on account";
  const creditLimitCents = parseRand(str(fd, "creditLimit")) ?? 0;
  if (terms === "ACCOUNT" && creditLimitCents <= 0) fields.creditLimit = "An account on credit terms needs a limit";
  if (creditLimitCents < 0 || creditLimitCents > 100_000_000_00) fields.creditLimit = "R0 – R100,000,000";
  const paymentDays = parseInt10(str(fd, "paymentDays") || "30") ?? 0;
  if (paymentDays < 1 || paymentDays > 120) fields.paymentDays = "1 to 120 days";
  const classes = list(fd, "classes").filter((c) => (TRADE_CLASSES as string[]).includes(c)) as RegClass[];
  if (!classes.length) fields.classes = "Tick at least one range";
  return { terms: { terms, creditLimitCents, paymentDays, classes, priceListId: opt(fd, "priceListId"), dcId: opt(fd, "dcId"), notes: str(fd, "notes") }, fields };
}

export async function approveAccount(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const { terms, fields } = readTerms(fd);
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  return attempt(async () => {
    const a = await approveTradeAccount(id, terms, g.actor);
    refresh(id);
    flashTo(`/hq/trade/accounts/${id}`, `${a.number} approved on ${terms.terms === "ACCOUNT" ? `account terms (${terms.paymentDays} days, limit ${zarWhole(terms.creditLimitCents)})` : "prepaid terms"}, and the account has been emailed.`);
  });
}

export async function saveTerms(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const { terms, fields } = readTerms(fd);
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  return attempt(async () => {
    await updateTradeAccount(id, terms, g.actor);
    refresh(id);
    return done("Terms saved. They apply to the account's next order.");
  });
}

/** HQ checked the licence document with the issuer. A licence pause lifts itself once nothing required is lapsed. */
export async function verifyLicence(id: string, licenceId: string): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  return attempt(async () => {
    const l = await db.tradeLicence.findFirst({ where: { id: licenceId, tradeAccountId: id }, select: { id: true } });
    if (!l) return fail("That licence isn't on this account.");
    const { released } = await verifyTradeLicence(licenceId, g.actor);
    refresh(id);
    flashTo(`/hq/trade/accounts/${id}`, released ? "Licence verified. The account's licences are in order again, so its pause is lifted and it has been told." : "Licence verified.");
  });
}

/** The document can't be accepted: the account is emailed the reason and uploads another in the portal. */
export async function rejectLicence(id: string, licenceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const reason = str(fd, "reason");
  if (reason.length < 3) return fail("Say what's wrong: it's in the email the account gets.", { reason: "Required" });
  return attempt(async () => {
    const l = await db.tradeLicence.findFirst({ where: { id: licenceId, tradeAccountId: id }, select: { id: true } });
    if (!l) return fail("That licence isn't on this account.");
    await rejectTradeLicence(licenceId, reason, g.actor);
    refresh(id);
    flashTo(`/hq/trade/accounts/${id}`, "Licence not accepted. The account has been emailed why, and can upload another in the portal.");
  });
}

export async function holdAccount(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const reason = str(fd, "reason");
  if (reason.length < 3) return fail("Say why the account is on hold: it's in the email they get.", { reason: "Required" });
  return attempt(async () => {
    await holdTradeAccount(id, reason, g.actor);
    refresh(id);
    flashTo(`/hq/trade/accounts/${id}`, "Account on hold: nothing new goes on account until it's released. The account has been emailed.");
  });
}

export async function releaseAccount(id: string): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  return attempt(async () => {
    await releaseTradeHold(id, g.actor);
    refresh(id);
    flashTo(`/hq/trade/accounts/${id}`, "Hold lifted. The account can order on its terms again, and has been told.");
  });
}

export async function closeAccount(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  if (str(fd, "confirm").toUpperCase() !== "CLOSE") return fail("Type CLOSE to confirm.");
  return attempt(async () => {
    await closeTradeAccount(id, opt(fd, "reason"), g.actor);
    refresh(id);
    flashTo(`/hq/trade/accounts/${id}`, "Account closed: its buyers are signed out for good. Any balance stays due.");
  });
}

const DETAIL_KEYS: (keyof TradeAccountDetails)[] = ["name", "legalName", "kind", "regNumber", "vatNumber", "email", "phone", "addressLine", "suburb", "city", "province", "postalCode", "deliveryLine", "deliverySuburb", "deliveryCity", "deliveryProvince", "deliveryPostalCode"];

export async function saveDetails(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const patch = Object.fromEntries(DETAIL_KEYS.map((k) => [k, str(fd, k)])) as Partial<TradeAccountDetails>;
  return attempt(async () => {
    await updateTradeAccount(id, patch, g.actor);
    refresh(id);
    return done("Details saved.");
  });
}

export async function addBuyer(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  return attempt(async () => {
    const b = await addTradeBuyer(id, { name: str(fd, "name"), email: str(fd, "email"), phone: opt(fd, "phone"), role: str(fd, "role") === "OWNER" ? "OWNER" : "BUYER" }, g.actor);
    refresh(id);
    return done(`${b.name} added. They sign in to the trade portal with a code emailed to ${b.email}.`);
  });
}

export async function removeBuyer(id: string, buyerId: string): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  return attempt(async () => {
    if (!(await db.tradeBuyer.findFirst({ where: { id: buyerId, tradeAccountId: id }, select: { id: true } }))) return fail("That buyer isn't on this account.");
    const b = await removeTradeBuyer(buyerId, g.actor);
    refresh(id);
    return done(`${b.name} can no longer sign in or order for this account.`);
  });
}

// ── Ledger ───────────────────────────────────────────────────────────────────

export async function recordPayment(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const cents = parseRand(str(fd, "amount"));
  if (!cents || cents <= 0) fields.amount = "The amount received, like 2500.00";
  const reference = str(fd, "reference");
  if (!reference) fields.reference = "The bank reference";
  const receivedAt = str(fd, "receivedAt") ? parseDay(str(fd, "receivedAt")) : null;
  if (str(fd, "receivedAt") && !receivedAt) fields.receivedAt = "A date";
  if (receivedAt && receivedAt.getTime() > Date.now() + 86_400_000) fields.receivedAt = "Not in the future";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  return attempt(async () => {
    const r = await recordTradePayment(id, { cents: cents!, reference, receivedAt: receivedAt ?? undefined, note: opt(fd, "note"), tradeOrderId: opt(fd, "tradeOrderId") }, g.actor);
    refresh(id);
    return done(`Payment of ${zar(cents!)} recorded (${reference}). Balance now ${zar(r.balanceCents)}.${r.released ? " The overdue hold has lifted." : ""}`);
  });
}

export async function creditNote(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const cents = parseRand(str(fd, "amount"));
  if (!cents || cents <= 0) fields.amount = "The amount to credit";
  const note = str(fd, "note");
  if (note.length < 3) fields.note = "Say why";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  return attempt(async () => {
    const e = await issueCreditNote(id, { cents: cents!, reference: opt(fd, "reference"), note }, g.actor);
    refresh(id);
    return done(`Credit note ${e.reference} for ${zar(cents!)} issued.`);
  });
}

export async function adjustLedger(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const cents = parseRand(str(fd, "amount"));
  if (cents == null || cents === 0) fields.amount = "A signed amount: negative reduces what the account owes";
  const note = str(fd, "note");
  if (note.length < 3) fields.note = "An adjustment needs a note";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  return attempt(async () => {
    await adjustTradeLedger(id, { cents: cents!, note, reference: opt(fd, "reference") }, g.actor);
    refresh(id);
    return done(`Adjustment of ${cents! < 0 ? "−" : "+"}${zar(Math.abs(cents!))} posted.`);
  });
}

export async function sendStatement(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const month = str(fd, "month") || previousMonth(new Date());
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail("Choose a month.", { month: "YYYY-MM" });
  return attempt(async () => {
    const r = await emailTradeStatement(id, month, { force: true });
    if (!r.sent) return fail(r.reason === "not approved" ? "The account hasn't been approved yet, so there's no statement to send." : `The statement couldn't be sent: ${r.reason}`);
    await audit(db, g.actor, "trade.statement.send", { entity: "TradeAccount", entityId: id, data: { month } });
    refresh(id);
    return done(`Statement for ${month} emailed to the account's billing address.`);
  });
}

// ── Placing an order for the account (phone orders) ─────────────────────────

export type RangeHit = { variantId: string; name: string; sku: string; regClass: string; caseQty: number; unitCents: number; breaks: { minQty: number; unitCents: number }[]; available: number; rrpCents: number };

/** The trade range at the account's DC, searched — for the order builder (24 at a time, never the whole catalogue). */
export async function searchRange(accountId: string, q: string): Promise<{ rows: RangeHit[]; total: number; dc: string; didYouMean: string | null } | { error: string }> {
  const g = await guard("network");
  if (!g) return { error: DENIED.error! };
  const account = await db.tradeAccount.findUnique({ where: { id: accountId }, select: { classes: true, priceListId: true, dcId: true } });
  if (!account) return { error: "Unknown trade account" };
  try {
    const dc = (account.dcId ? await db.store.findFirst({ where: { id: account.dcId, kind: "WAREHOUSE", status: { not: "CLOSED" } } }) : null) ?? (await defaultDc());
    const r = await tradeRange(dc.id, account, { q: q.slice(0, 60), pageSize: 24 });
    return {
      dc: dc.name,
      total: r.total,
      didYouMean: r.didYouMean,
      rows: r.rows.map((x) => ({ variantId: x.variantId, name: `${x.productName} · ${x.variantName}`, sku: x.sku, regClass: x.regClass, caseQty: x.caseQty, unitCents: x.unitCents, breaks: x.breaks, available: x.available, rrpCents: x.rrpCents })),
    };
  } catch (e) {
    if (e instanceof TradeOrderError) return { error: e.message };
    throw e;
  }
}

export type CollectHit = { id: string; code: string; name: string; suburb: string; city: string; allInStock: boolean; short: number };

/** Stores a basket can be collected from (a page of 12: the account's province first), with whether it's all in stock there. */
export async function searchCollectStores(accountId: string, lines: { variantId: string; qty: number }[], q: string): Promise<{ rows: CollectHit[]; total: number } | { error: string }> {
  const g = await guard("network");
  if (!g) return { error: DENIED.error! };
  const account = await db.tradeAccount.findUnique({ where: { id: accountId }, select: { classes: true, province: true } });
  if (!account) return { error: "Unknown trade account" };
  const ids = [...new Set(lines.map((l) => l.variantId))].slice(0, 100);
  const variants = await db.variant.findMany({ where: { id: { in: ids } }, select: { id: true, product: { select: { regClass: true } } } });
  const cls = new Map(variants.map((v) => [v.id, v.product.regClass]));
  const r = await collectStoresFor(lines.filter((l) => cls.has(l.variantId) && l.qty > 0).map((l) => ({ variantId: l.variantId, qty: Math.floor(l.qty), regClass: cls.get(l.variantId)! })), account, { q: q.slice(0, 60), pageSize: 12 });
  return { total: r.total, rows: r.rows.map((s) => ({ id: s.id, code: s.code, name: s.name, suburb: s.suburb, city: s.city, allInStock: s.allInStock, short: s.short.length })) };
}

export async function placeOrderForAccount(accountId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const variantIds = fd.getAll("variantId").map(String);
  const qtys = fd.getAll("qty").map((v) => parseInt10(String(v)) ?? 0);
  const lines = variantIds.map((variantId, i) => ({ variantId, qty: qtys[i] ?? 0 })).filter((l) => l.variantId && l.qty > 0);
  if (!lines.length) return fail("Add at least one item to the order.", { lines: "Nothing in the order" });
  const payMethod = str(fd, "payMethod") === "ACCOUNT" ? "ACCOUNT" : "EFT";
  const fulfilment = str(fd, "fulfilment") === "COLLECT" ? "COLLECT" : "COURIER";
  const storeId = opt(fd, "storeId");
  if (fulfilment === "COLLECT" && !storeId) return fail("Choose the store the order will be collected from.", { storeId: "Choose a store" });
  return attempt(async () => {
    const o = await placeTradeOrder({
      accountId, actor: g.actor, lines, payMethod, fulfilment, storeId, deliver: str(fd, "deliver") === "BILLING" ? "BILLING" : "DELIVERY",
      reference: opt(fd, "reference"), notes: opt(fd, "notes"),
    });
    refresh(accountId);
    revalidatePath("/hq/trade/orders");
    flashTo(`/hq/trade/orders/${o.id}`, payMethod === "EFT" ? `Order ${o.number} placed. The pro forma has been emailed; confirm the EFT here when it arrives.` : `Order ${o.number} placed on account. Stock is reserved and the account has been emailed.`);
  });
}
