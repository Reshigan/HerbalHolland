// Reconciliation checks for one company's books and one month: the invariants the postings keep, each set against the
// register it mirrors.
//   Every company: debits equal credits; the running balances match the journal lines; nothing failed in the posting
//   queue; no unmatched bank lines.
//   A franchisee: each store's Herbal Holland account against its franchise statement and payments; each store's stock
//   against its valuation.
//   HQ: its franchisee accounts against each franchisee's books; gift vouchers, Rewards points and trade debtors against
//   their registers; the DCs' stock.
// Balances are compared at the month's last day (yesterday, for the month under way), with the registers taken back to
// then; movements within the month leave out opening balances. Bounded: one company, one month.
import { db, tx, Prisma } from "../db";
import { booksFor } from "./core";
import { franchiseStatement } from "../finance";
import { POINT_VALUE_CENTS } from "@/lib/loyalty-rules";
import { checkDate, differences } from "@/lib/ledger-admin";
import { addMonths, monthEnd, monthStart, periodOf } from "@/lib/ledger";
import { addDays, dayKey, fmtDate, fmtMonth } from "@/lib/format";
import { zar } from "@/lib/money";
import { plural } from "@/lib/plural";
import { chunk, inBatches } from "@/lib/json-list";

export type BooksCheck = {
  key: string;
  label: string;
  ok: boolean;
  expected: number; // what the register says (cents), or 0 for a count
  actual: number; // what the books say
  difference: number; // actual − expected
  unit: "cents" | "count";
  detail: string;
  href: string | null;
};

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
const dateOf = (day: string) => new Date(`${day}T00:00:00Z`);
/** A list of ids as one JSON parameter (any length under D1's 100 bound values): `col IN (${inList(ids)})`. */
const inList = (ids: readonly string[]) => Prisma.sql`SELECT value FROM json_each(${JSON.stringify(ids)})`;
const monthName = (p: string) => fmtMonth(`${p}-15T12:00:00Z`);
const dayLabel = (day: string) => fmtDate(`${day}T12:00:00Z`);
const SHOWN = 20; // mismatches listed one by one; the rest are counted

function check(c: Omit<BooksCheck, "difference" | "ok" | "unit"> & Partial<Pick<BooksCheck, "ok" | "unit">>): BooksCheck {
  const difference = c.actual - c.expected;
  return { unit: "cents", ok: difference === 0, ...c, difference };
}

/** Σ (debit − credit) on these accounts per store ("" = none) through `asAt`: whole months from the running balances, a part month from its posted lines. */
async function storeBalances(companyId: string, accountIds: string[], asAt: string) {
  const p = periodOf(asAt);
  const whole = asAt === monthEnd(p);
  const out = new Map<string, number>();
  const add = (k: string, v: number) => out.set(k, (out.get(k) ?? 0) + v);
  const months = await db.ledgerBalance.groupBy({ by: ["storeId"], where: { companyId, accountId: { in: accountIds }, period: whole ? { lte: p } : { lt: p } }, _sum: { debitCents: true, creditCents: true } });
  for (const r of months) add(r.storeId, n(r._sum.debitCents) - n(r._sum.creditCents));
  if (!whole) {
    const days = await db.journalLine.groupBy({ by: ["storeId"], where: { companyId, accountId: { in: accountIds }, period: p, date: { lte: dateOf(asAt) }, journal: { status: "POSTED" } }, _sum: { amountCents: true } });
    for (const r of days) add(r.storeId ?? "", n(r._sum.amountCents));
  }
  return out;
}
const total = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);

/** Pending and failed postings that are this company's: all of them for HQ; for a franchisee, its stores' trading days and statements. */
export async function queueCounts(companyId: string) {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { kind: true } });
  if (company.kind === "FRANCHISOR") {
    const [r] = await db.$queryRaw<{ waiting: bigint; failed: bigint }[]>`SELECT count(*) AS waiting, COUNT(CASE WHEN attempts > 0 THEN 1 END) AS failed FROM "LedgerQueue"`;
    return { waiting: n(r?.waiting), failed: n(r?.failed) };
  }
  const stores = (await db.store.findMany({ where: { companyId }, select: { id: true } })).map((s) => s.id);
  if (!stores.length) return { waiting: 0, failed: 0 };
  const [r] = await db.$queryRaw<{ waiting: bigint; failed: bigint }[]>`
    SELECT count(*) AS waiting, COUNT(CASE WHEN attempts > 0 THEN 1 END) AS failed FROM "LedgerQueue"
    WHERE instr("sourceId", ':') > 0 AND substr("sourceId", 1, instr("sourceId", ':') - 1) IN (${inList(stores)})`;
  return { waiting: n(r?.waiting), failed: n(r?.failed) };
}

/** Postings that failed at least once, oldest first (HQ's books only: the queue is network-wide). */
export async function failedPostings(page: number, pageSize: number) {
  const where = { attempts: { gt: 0 } };
  const [total, rows] = await Promise.all([db.ledgerQueue.count({ where }), db.ledgerQueue.findMany({ where, orderBy: { queuedAt: "asc" }, skip: (page - 1) * pageSize, take: pageSize })]);
  return { total, rows };
}

/** The company's reconciliation checks for `period` (YYYY-MM), in the order the month-end screen lists them. */
export async function booksChecks(companyId: string, period: string, now = new Date()): Promise<BooksCheck[]> {
  const today = dayKey(now);
  const when = checkDate(period, today);
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, kind: true } });
  const book = await tx((t) => booksFor(t, companyId));
  const stores = await db.store.findMany({ where: { companyId }, select: { id: true, code: true, name: true, kind: true }, orderBy: { code: "asc" } });
  const base = `/books/${companyId}`;
  const ledger = (key: string, q: Record<string, string> = {}) => `${base}/reports/ledger?${new URLSearchParams({ account: book.accounts.get(key)!, from: period, to: period, ...q })}`;
  const ctx = { companyId, period, when, stores, accounts: book.accounts, base, ledger };
  const parts = await Promise.all([
    ledgerChecks(ctx),
    company.kind === "FRANCHISEE" ? (when.over ? statementChecks(ctx) : []) : networkChecks(ctx),
    stockChecks(ctx),
    queueCheck(ctx, company.kind),
    bankLineCheck(ctx),
  ]);
  return parts.flat();
}

type Ctx = {
  companyId: string;
  period: string;
  when: ReturnType<typeof checkDate>;
  stores: { id: string; code: string; name: string; kind: string }[];
  accounts: Map<string, string>;
  base: string;
  ledger: (key: string, q?: Record<string, string>) => string;
};

/** Debits equal credits through the month; the month's running balances equal its journal lines. */
async function ledgerChecks({ companyId, period, base }: Ctx): Promise<BooksCheck[]> {
  const [through, kept, lines] = await Promise.all([
    db.ledgerBalance.aggregate({ where: { companyId, period: { lte: period } }, _sum: { debitCents: true, creditCents: true } }),
    db.ledgerBalance.groupBy({ by: ["accountId"], where: { companyId, period }, _sum: { debitCents: true, creditCents: true } }),
    db.journalLine.groupBy({ by: ["accountId"], where: { companyId, period, journal: { status: "POSTED" } }, _sum: { amountCents: true } }),
  ]);
  const debits = n(through._sum.debitCents), credits = n(through._sum.creditCents);
  const off = differences(new Map(lines.map((l) => [l.accountId, n(l._sum.amountCents)])), new Map(kept.map((k) => [k.accountId, n(k._sum.debitCents) - n(k._sum.creditCents)])));
  const names = off.length ? new Map((await db.ledgerAccount.findMany({ where: { id: { in: off.map((o) => o.key) } }, select: { id: true, code: true, name: true } })).map((a) => [a.id, `${a.code} ${a.name}`])) : new Map<string, string>();
  return [
    check({
      key: "trial-balance", label: "Debits equal credits", expected: credits, actual: debits,
      detail: `${zar(debits)} of debits and ${zar(credits)} of credits to the end of ${monthName(period)}.`,
      href: `${base}/reports/trial-balance?from=${period}&to=${period}`,
    }),
    check({
      key: "running-balances", label: "Account balances match the journals",
      expected: off.reduce((s, o) => s + o.expected, 0), actual: off.reduce((s, o) => s + o.actual, 0), ok: off.length === 0,
      detail: off.length ? `Kept balances differ from the posted lines on ${off.slice(0, 5).map((o) => `${names.get(o.key) ?? o.key} (${zar(o.difference)})`).join(", ")}${off.length > 5 ? ` and ${off.length - 5} more` : ""}.` : `Every account's ${monthName(period)} balance adds up from its journal lines.`,
      href: null,
    }),
  ];
}

/**
 * A franchisee, each store, a month that's over: the Herbal Holland account moved by the franchise statement's net
 * (what HQ owes the store, negative when the store owes HQ) plus statement payments made in the month (paid to HQ:
 * positive; paid by HQ: negative). Opening balances are left out.
 */
async function statementChecks({ companyId, period, stores, accounts, ledger }: Ctx): Promise<BooksCheck[]> {
  const retail = stores.filter((s) => s.kind === "RETAIL");
  if (!retail.length) return [];
  const hq = accounts.get("hq")!;
  const ids = retail.map((s) => s.id);
  const [kept, opening, payments, statements] = await Promise.all([
    db.ledgerBalance.groupBy({ by: ["storeId"], where: { companyId, accountId: hq, period, storeId: { in: ids } }, _sum: { debitCents: true, creditCents: true } }),
    db.journalLine.groupBy({ by: ["storeId"], where: { companyId, accountId: hq, period, storeId: { in: ids }, journal: { status: "POSTED", source: "opening" } }, _sum: { amountCents: true } }),
    db.statementPayment.groupBy({ by: ["storeId"], where: { storeId: { in: ids }, paidOn: { gte: dateOf(monthStart(period)), lte: dateOf(monthEnd(period)) } }, _sum: { amountCents: true } }),
    Promise.all(retail.map((s) => franchiseStatement(s.id, period))),
  ]);
  return retail.map((s, i) => {
    const net = statements[i].net;
    const paid = n(payments.find((p) => p.storeId === s.id)?._sum.amountCents);
    const k = kept.find((r) => r.storeId === s.id);
    const actual = n(k?._sum.debitCents) - n(k?._sum.creditCents) - n(opening.find((r) => r.storeId === s.id)?._sum.amountCents);
    return check({
      key: `statement:${s.id}`, label: `${s.name}: Herbal Holland account vs statement`, expected: net + paid, actual,
      detail: `The ${monthName(period)} statement nets ${net >= 0 ? `${zar(net)} to the store` : `${zar(-net)} to HQ`}${paid ? `, with ${zar(Math.abs(paid))} paid ${paid > 0 ? "to" : "by"} HQ in the month` : ""}; the account moved ${zar(actual)}.`,
      href: ledger("hq", { store: s.id }),
    });
  });
}

/** HQ: franchisee accounts vs each franchisee's books (the month's movement), vouchers, points and trade debtors. */
async function networkChecks(ctx: Ctx): Promise<BooksCheck[]> {
  const [mirror, vouchers, points, debtors] = await Promise.all([mirrorChecks(ctx), voucherCheck(ctx), pointsCheck(ctx), debtorChecks(ctx)]);
  return [...mirror, vouchers, points, ...debtors];
}

/**
 * HQ's "Franchisee current accounts" per company and store must be the mirror image of each franchisee's "Herbal
 * Holland current account" for the month: HQ's debit is the franchisee's credit. Listed per franchisee that differs.
 */
async function mirrorChecks({ companyId, period, accounts, ledger }: Ctx): Promise<BooksCheck[]> {
  const theirs = await db.ledgerAccount.findMany({ where: { key: "hq" }, select: { id: true, companyId: true } });
  const [hqLines, kept, opening] = await Promise.all([
    db.journalLine.groupBy({ by: ["partyId", "storeId"], where: { companyId, accountId: accounts.get("franchisees")!, period, journal: { status: "POSTED", source: { not: "opening" } } }, _sum: { amountCents: true } }),
    // Grouped by company, so the franchisees' accounts go in rounds (D1 binds at most 100 parameters) and the rounds add up.
    Promise.all(chunk(theirs, 45).map((part) => db.ledgerBalance.groupBy({ by: ["companyId", "storeId"], where: { companyId: { in: part.map((a) => a.companyId) }, accountId: { in: part.map((a) => a.id) }, period }, _sum: { debitCents: true, creditCents: true } }))).then((r) => r.flat()),
    Promise.all(chunk(theirs, 45).map((part) => db.journalLine.groupBy({ by: ["companyId", "storeId"], where: { companyId: { in: part.map((a) => a.companyId) }, accountId: { in: part.map((a) => a.id) }, period, journal: { status: "POSTED", source: "opening" } }, _sum: { amountCents: true } }))).then((r) => r.flat()),
  ]);
  const key = (c: string | null, s: string | null) => `${c ?? ""}|${s ?? ""}`;
  const actual = new Map(hqLines.map((l) => [key(l.partyId, l.storeId), n(l._sum.amountCents)]));
  const expected = new Map<string, number>();
  for (const r of kept) expected.set(key(r.companyId, r.storeId), n(r._sum.creditCents) - n(r._sum.debitCents));
  for (const r of opening) expected.set(key(r.companyId, r.storeId), (expected.get(key(r.companyId, r.storeId)) ?? 0) + n(r._sum.amountCents));
  const off = differences(expected, actual);
  if (!off.length)
    return [check({ key: "franchisees", label: "Franchisee accounts vs franchisees' books", expected: total(expected), actual: total(actual), detail: `HQ's franchisee accounts mirror every franchisee's Herbal Holland account for ${monthName(period)}.`, href: ledger("franchisees") })];
  const byCompany = new Map<string, typeof off>();
  for (const o of off) {
    const c = o.key.split("|")[0];
    byCompany.set(c, [...(byCompany.get(c) ?? []), o]);
  }
  const shown = [...byCompany.keys()].slice(0, SHOWN);
  const [companies, stores] = await Promise.all([
    db.company.findMany({ where: { id: { in: shown } }, select: { id: true, name: true } }),
    db.store.findMany({ where: { id: { in: off.map((o) => o.key.split("|")[1]).filter(Boolean) } }, select: { id: true, name: true } }),
  ]);
  const rows = shown.map((c) => {
    const diffs = byCompany.get(c)!;
    const name = companies.find((x) => x.id === c)?.name ?? "A franchisee";
    return check({
      key: `franchisees:${c}`, label: `${name}: HQ's account vs their books`,
      expected: diffs.reduce((s, d) => s + d.expected, 0), actual: diffs.reduce((s, d) => s + d.actual, 0),
      detail: `${monthName(period)} differs at ${diffs.map((d) => `${stores.find((s) => s.id === d.key.split("|")[1])?.name ?? "no store"} (${zar(d.difference)})`).join(", ")}.`,
      href: ledger("franchisees", { party: c }),
    });
  });
  if (byCompany.size > SHOWN)
    rows.push(check({ key: "franchisees:more", label: `${plural(byCompany.size - SHOWN, "more franchisee")} differ`, expected: 0, actual: 0, ok: false, detail: "Fix the ones above first, then check again.", href: ledger("franchisees") }));
  return rows;
}

// What checkout takes for an online order (gift voucher money, points) leaves the register at once, but the books move
// with the order's sale (posted at collection, or when a delivery goes out; its trading day posts it): orders with no
// sale yet at the cutoff are a timing item. Online orders don't stay open for months, so the look-back is bounded.
const OPEN_ORDER_DAYS = 120;

/**
 * Gift vouchers in issue = what's left on every voucher sold and not expired, plus what checkout took for online
 * orders not handed over yet, all taken back to the cutoff.
 */
async function voucherCheck({ companyId, when, accounts, ledger }: Ctx): Promise<BooksCheck> {
  const [r] = await db.$queryRaw<{ left: bigint; held: bigint }[]>`
    SELECT COALESCE(SUM(v."amountCents" - COALESCE(x.used, 0)), 0) AS left, COALESCE(SUM(x.held), 0) AS held
    FROM "GiftVoucher" v
    LEFT JOIN (
      SELECT r."voucherId", SUM(r.cents) AS used,
        SUM(CASE WHEN r."saleId" IS NULL AND r."orderId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Sale" s WHERE s."orderId" = r."orderId" AND s."createdAt" < ${when.cutoff}) THEN r.cents ELSE 0 END) AS held
      FROM "VoucherRedemption" r
      WHERE NOT r.reversed AND r."createdAt" < ${when.cutoff}
      GROUP BY 1
    ) x ON x."voucherId" = v.id
    WHERE v."issuedAt" < ${when.cutoff} AND v.status IN ('ACTIVE', 'REDEEMED', 'EXPIRED') AND NOT (v.status = 'EXPIRED' AND v."expiresAt" < ${when.cutoff})`;
  const left = n(r?.left), held = n(r?.held);
  const kept = 0 - total(await storeBalances(companyId, [accounts.get("vouchers")!], when.asAt));
  return check({
    key: "vouchers", label: "Gift vouchers in issue vs voucher balances", expected: left + held, actual: kept,
    detail: `Vouchers held ${zar(left)} on ${dayLabel(when.asAt)}${held ? `, plus ${zar(held)} taken at checkout for online orders not handed over yet (the books move at handover)` : ""}; the books show ${zar(kept)}.`,
    href: ledger("vouchers"),
  });
}

/**
 * Rewards points owed = members' points at the cutoff × the point value, plus points taken at checkout for online
 * orders not handed over yet, less points franchisee stores issued in a month that isn't over (its statements charge
 * them at month end).
 */
async function pointsCheck({ companyId, when, accounts, ledger }: Ctx): Promise<BooksCheck> {
  const storeIds = (await db.store.findMany({ select: { id: true } })).map((s) => s.id);
  const from = addDays(when.cutoff, -OPEN_ORDER_DAYS);
  const asAtMonth = periodOf(when.asAt);
  const [[held], [since], [onOrders], [unbilled]] = await Promise.all([
    db.$queryRaw<{ points: bigint }[]>`SELECT COALESCE(SUM(points), 0) AS points FROM "Customer"`,
    // Entries since the cutoff, through the (storeId, createdAt) index: HQ's own (no store) and every store's.
    db.$queryRaw<{ points: bigint }[]>`
      SELECT COALESCE(SUM(points), 0) AS points FROM (
        SELECT points FROM "LoyaltyEntry" WHERE "storeId" IS NULL AND "createdAt" >= ${when.cutoff}
        UNION ALL
        SELECT points FROM "LoyaltyEntry" WHERE "storeId" IN (${inList(storeIds)}) AND "createdAt" >= ${when.cutoff}
      ) x`,
    // Points checkout took for online orders with no sale yet at the cutoff, and not given back by cancelling before it.
    db.$queryRaw<{ points: bigint }[]>`
      SELECT COALESCE(SUM(o."pointsRedeemed"), 0) AS points FROM "Order" o
      WHERE o."createdAt" >= ${from} AND o."createdAt" < ${when.cutoff} AND o."pointsRedeemed" > 0
        AND NOT EXISTS (SELECT 1 FROM "Sale" s WHERE s."orderId" = o.id AND s."createdAt" < ${when.cutoff})
        AND NOT (o.status = 'CANCELLED' AND o."updatedAt" < ${when.cutoff})`,
    // A month not over yet (the cutoff falls inside it): what franchisee stores issued in it isn't on a statement yet.
    when.asAt === monthEnd(asAtMonth)
      ? [{ points: BigInt(0) }]
      : db.$queryRaw<{ points: bigint }[]>`
          SELECT COALESCE(SUM(d."pointsIssued"), 0) AS points FROM "DailyStoreStat" d JOIN "Store" s ON s.id = d."storeId" JOIN "Company" c ON c.id = s."companyId"
          WHERE d.date >= ${dateOf(monthStart(asAtMonth))} AND d.date <= ${dateOf(when.asAt)} AND c.kind = 'FRANCHISEE'`,
  ]);
  const points = n(held?.points) - n(since?.points), open = n(onOrders?.points), issued = n(unbilled?.points);
  const kept = 0 - total(await storeBalances(companyId, [accounts.get("points")!], when.asAt));
  const timing = [
    open ? `plus ${open.toLocaleString("en-US")} taken at checkout for online orders not handed over yet` : "",
    issued ? `less ${issued.toLocaleString("en-US")} issued at franchisee stores this month (the statements charge them at month end)` : "",
  ].filter(Boolean);
  return check({
    key: "points", label: "Rewards points owed vs members' points", expected: (points + open - issued) * POINT_VALUE_CENTS, actual: kept,
    detail: `Members held ${points.toLocaleString("en-US")} points on ${dayLabel(when.asAt)}${timing.length ? `, ${timing.join(", ")}` : ""}: ${zar((points + open - issued) * POINT_VALUE_CENTS)} at ${zar(POINT_VALUE_CENTS)} a point; the books show ${zar(kept)}.`,
    href: ledger("points"),
  });
}

/**
 * Trade debtors per trade account = that account's trade-ledger balance at the cutoff. Entries for EFT orders are left
 * out: those are paid ahead and go through "Online orders paid, not yet fulfilled", never the account.
 */
async function debtorChecks({ companyId, when, accounts, ledger }: Ctx): Promise<BooksCheck[]> {
  const [register, kept] = await Promise.all([
    db.$queryRaw<{ tradeAccountId: string; cents: bigint; eft: bigint }[]>`
      SELECT e."tradeAccountId", COALESCE(SUM(CASE WHEN o."payMethod" IS NOT 'EFT' THEN e.cents ELSE 0 END), 0) AS cents, COUNT(CASE WHEN o."payMethod" = 'EFT' THEN 1 END) AS eft
      FROM "TradeLedgerEntry" e LEFT JOIN "TradeOrder" o ON o.id = e."tradeOrderId"
      WHERE e."createdAt" < ${when.cutoff}
      GROUP BY 1`,
    db.journalLine.groupBy({ by: ["partyId"], where: { companyId, accountId: accounts.get("debtors")!, date: { lte: dateOf(when.asAt) }, journal: { status: "POSTED" } }, _sum: { amountCents: true } }),
  ]);
  const expected = new Map(register.map((r) => [r.tradeAccountId, n(r.cents)]));
  const actual = new Map(kept.map((k) => [k.partyId ?? "", n(k._sum.amountCents)]));
  const eft = register.some((r) => n(r.eft) > 0) ? " Entries for EFT orders are left out: those are paid ahead, through prepaid." : "";
  const off = differences(expected, actual);
  if (!off.length)
    return [check({ key: "debtors", label: "Trade debtors vs the trade ledger", expected: total(expected), actual: total(actual), detail: `Every trade account agrees with the trade ledger on ${dayLabel(when.asAt)}.${eft}`, href: ledger("debtors") })];
  const names = new Map((await db.tradeAccount.findMany({ where: { id: { in: off.slice(0, SHOWN).map((o) => o.key) } }, select: { id: true, name: true, number: true } })).map((a) => [a.id, `${a.name} (${a.number})`]));
  const rows = off.slice(0, SHOWN).map((o) =>
    check({ key: `debtors:${o.key}`, label: `${names.get(o.key) ?? (o.key ? "A trade account" : "No trade account")}: books vs trade ledger`, expected: o.expected, actual: o.actual, detail: `The trade ledger says ${zar(o.expected)} on ${dayLabel(when.asAt)}; the books show ${zar(o.actual)}.${eft}`, href: ledger("debtors", { party: o.key }) }),
  );
  if (off.length > SHOWN) rows.push(check({ key: "debtors:more", label: `${plural(off.length - SHOWN, "more trade account")} differ`, expected: 0, actual: 0, ok: false, detail: "Fix the ones above first, then check again.", href: ledger("debtors") }));
  return rows;
}

/**
 * Stock per store = Σ on hand × unit cost, taken back to the cutoff by the movements since (each at its unit cost plus
 * any revaluation of its lot, as the store-day posts them), so it agrees to the cent. A single-store company's stock on
 * no store counts as that store's.
 */
async function stockChecks({ companyId, when, stores, accounts, ledger }: Ctx): Promise<BooksCheck[]> {
  if (!stores.length) return [];
  const ids = stores.map((s) => s.id);
  const [levels, later, kept] = await Promise.all([
    db.$queryRaw<{ storeId: string; cents: bigint }[]>`SELECT "storeId", SUM("onHand" * "unitCostCents") AS cents FROM "StockLevel" WHERE "storeId" IN (${inList(ids)}) GROUP BY 1`,
    // Each later movement at its cost, plus what it revalued the lot by (a re-averaged cost): the store-day posts both.
    db.$queryRaw<{ storeId: string; cents: bigint }[]>`SELECT "storeId", SUM(qty * "unitCostCents" + "revalueCents") AS cents FROM "StockMovement" WHERE "storeId" IN (${inList(ids)}) AND "createdAt" >= ${when.cutoff} GROUP BY 1`,
    storeBalances(companyId, [accounts.get("stock")!], when.asAt),
  ]);
  if (stores.length === 1) {
    kept.set(stores[0].id, (kept.get(stores[0].id) ?? 0) + (kept.get("") ?? 0));
    kept.delete("");
  }
  const rows = stores.map((s) => {
    const valued = n(levels.find((l) => l.storeId === s.id)?.cents) - n(later.find((l) => l.storeId === s.id)?.cents);
    const books = kept.get(s.id) ?? 0;
    return check({ key: `stock:${s.id}`, label: `${s.name}: stock vs valuation`, expected: valued, actual: books, detail: `On hand at cost ${zar(valued)} on ${dayLabel(when.asAt)}; the books show ${zar(books)}.`, href: ledger("stock", { store: s.id }) });
  });
  const loose = kept.get("") ?? 0;
  if (loose) rows.push(check({ key: "stock:none", label: "Stock on no store", expected: 0, actual: loose, detail: `${zar(loose)} of stock is on journal lines without a store. Add the store to those lines (reverse and re-enter them).`, href: ledger("stock") }));
  return rows;
}

/** Nothing failed in the posting queue (HQ: the whole queue; a franchisee: its stores' trading days and statements). */
async function queueCheck({ companyId, base }: Ctx, kind: string): Promise<BooksCheck> {
  const q = await queueCounts(companyId);
  return check({
    key: "queue", label: "Postings waiting", unit: "count", expected: 0, actual: q.failed, ok: q.failed === 0,
    detail: q.waiting
      ? `${plural(q.waiting, "posting")} waiting${q.failed ? `, ${q.failed} of them failed and ${q.failed === 1 ? "is" : "are"} being retried` : " (they post within 15 minutes)"}.`
      : "Nothing is waiting to post.",
    href: kind === "FRANCHISOR" && q.failed ? `${base}/close#failed` : null,
  });
}

/** Bank statement lines up to the month end that aren't matched or allocated yet. */
async function bankLineCheck({ companyId, period, base }: Ctx): Promise<BooksCheck> {
  const open = await db.bankLine.count({ where: { companyId, status: "UNMATCHED", date: { lte: dateOf(monthEnd(period)) } } });
  return check({
    key: "bank-lines", label: "Bank lines matched", unit: "count", expected: 0, actual: open,
    detail: open ? `${plural(open, "bank statement line")} to the end of ${monthName(period)} still to match or allocate.` : `Every imported bank line to the end of ${monthName(period)} is matched or allocated.`,
    href: `${base}/bank`,
  });
}

// ── The books index: a quick health read for many companies (no per-company check runs) ──

export type BooksHealth = { drafts: number; issues: string[] };

/**
 * For a page of companies: drafts waiting, and the checks that can be read cheaply across companies (debits equal
 * credits, failed postings, unmatched bank lines and, for franchisees, last month's Herbal Holland account vs HQ's mirror).
 */
export async function booksHealth(companies: { id: string; kind: string }[], now = new Date()): Promise<Map<string, BooksHealth>> {
  const ids = companies.map((c) => c.id);
  const out = new Map<string, BooksHealth>(ids.map((id) => [id, { drafts: 0, issues: [] }]));
  if (!ids.length) return out;
  const month = addMonths(periodOf(dayKey(now)), -1);
  const franchisees = companies.filter((c) => c.kind === "FRANCHISEE").map((c) => c.id);
  const hq = await db.company.findFirst({ where: { kind: "FRANCHISOR" }, select: { id: true } });
  const [tb, drafts, bank, failedHq, failedStores, theirHq, hqMirror] = await Promise.all([
    // Grouped by company, so the companies go in rounds (D1 binds at most 100 parameters) and the rounds add up.
    Promise.all(chunk(ids).map((part) => db.ledgerBalance.groupBy({ by: ["companyId"], where: { companyId: { in: part } }, _sum: { debitCents: true, creditCents: true } }))).then((r) => r.flat()),
    Promise.all(chunk(ids).map((part) => db.journal.groupBy({ by: ["companyId"], where: { companyId: { in: part }, status: "DRAFT" }, _count: { _all: true } }))).then((r) => r.flat()),
    Promise.all(chunk(ids).map((part) => db.bankLine.groupBy({ by: ["companyId"], where: { companyId: { in: part }, status: "UNMATCHED" }, _count: { _all: true } }))).then((r) => r.flat()),
    db.ledgerQueue.count({ where: { attempts: { gt: 0 } } }),
    franchisees.length
      ? db.$queryRaw<{ companyId: string; failed: bigint }[]>`
          SELECT s."companyId", count(*) AS failed FROM "LedgerQueue" q JOIN "Store" s ON s.id = substr(q."sourceId", 1, instr(q."sourceId", ':') - 1)
          WHERE q.attempts > 0 AND instr(q."sourceId", ':') > 0 AND s."companyId" IN (${inList(franchisees)}) GROUP BY 1`
      : [],
    inBatches(franchisees, (part) => db.ledgerAccount.findMany({ where: { key: "hq", companyId: { in: part } }, select: { id: true, companyId: true } })),
    hq && franchisees.length ? db.ledgerAccount.findFirst({ where: { companyId: hq.id, key: "franchisees" }, select: { id: true } }) : null,
  ]);
  const flag = (id: string, issue: string) => out.get(id)?.issues.push(issue);
  for (const r of tb) if (n(r._sum.debitCents) !== n(r._sum.creditCents)) flag(r.companyId, "Debits don't equal credits");
  for (const r of drafts) out.get(r.companyId)!.drafts = r._count._all;
  for (const c of companies) {
    const failed = c.kind === "FRANCHISOR" ? failedHq : n(failedStores.find((f) => f.companyId === c.id)?.failed);
    if (failed) flag(c.id, `${plural(failed, "posting")} failed`);
  }
  for (const r of bank) flag(r.companyId, `${plural(r._count._all, "unmatched bank line")}`);
  if (hq && hqMirror && theirHq.length) {
    // Grouped by company (party), so the franchisees go in rounds (D1 binds at most 100 parameters) and the rounds add up.
    const [kept, opening, mirror] = await Promise.all([
      Promise.all(chunk(theirHq, 45).map((part) => db.ledgerBalance.groupBy({ by: ["companyId"], where: { companyId: { in: part.map((a) => a.companyId) }, accountId: { in: part.map((a) => a.id) }, period: month }, _sum: { debitCents: true, creditCents: true } }))).then((r) => r.flat()),
      Promise.all(chunk(theirHq, 45).map((part) => db.journalLine.groupBy({ by: ["companyId"], where: { companyId: { in: part.map((a) => a.companyId) }, accountId: { in: part.map((a) => a.id) }, period: month, journal: { status: "POSTED", source: "opening" } }, _sum: { amountCents: true } }))).then((r) => r.flat()),
      Promise.all(chunk(franchisees).map((part) => db.journalLine.groupBy({ by: ["partyId"], where: { companyId: hq.id, accountId: hqMirror.id, period: month, partyId: { in: part }, journal: { status: "POSTED", source: { not: "opening" } } }, _sum: { amountCents: true } }))).then((r) => r.flat()),
    ]);
    for (const id of franchisees) {
      const k = kept.find((r) => r.companyId === id);
      const theirs = n(k?._sum.debitCents) - n(k?._sum.creditCents) - n(opening.find((r) => r.companyId === id)?._sum.amountCents);
      const ours = n(mirror.find((r) => r.partyId === id)?._sum.amountCents);
      if (theirs + ours !== 0) flag(id, `${monthName(month)} differs from HQ's books`);
    }
  }
  return out;
}
