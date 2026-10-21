// Daily rollups, incremented inside the posting transaction (race-free upserts).
import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "./db";
import { chunk } from "@/lib/json-list";

const dateCol = (day: string) => new Date(`${day}T00:00:00Z`); // a YYYY-MM-DD day as the date columns hold it

export type StoreStatDelta = {
  storeId: string;
  date: string; // YYYY-MM-DD (SAST business day)
  channel: "POS" | "ONLINE" | "WHOLESALE";
  sales?: number;
  refunds?: number;
  units?: number;
  grossCents?: number;
  vatCents?: number;
  costCents?: number;
  discountCents?: number;
  memberSavingsCents?: number;
  offerCents?: number;
  cardCents?: number;
  cashCents?: number;
  payshapCents?: number;
  eftCents?: number;
  loyaltyCents?: number;
  onlineCents?: number;
  accountCents?: number; // trade sales on account (invoiced, not money)
  members?: number;
  pointsIssued?: number;
};

const COLS = [
  "sales", "refunds", "units", "grossCents", "vatCents", "costCents", "discountCents", "memberSavingsCents", "offerCents", "cardCents",
  "cashCents", "payshapCents", "eftCents", "loyaltyCents", "onlineCents", "accountCents", "members", "pointsIssued",
] as const;

export async function bumpStoreStat(t: Tx, d: StoreStatDelta) {
  const values = COLS.map((c) => d[c] ?? 0);
  const cols = Prisma.raw(COLS.map((c) => `"${c}"`).join(", "));
  const sets = Prisma.raw(COLS.map((c) => `"${c}" = "DailyStoreStat"."${c}" + EXCLUDED."${c}"`).join(", "));
  await t.$executeRaw`
    INSERT INTO "DailyStoreStat" ("storeId", "date", "channel", ${cols})
    VALUES (${d.storeId}, ${dateCol(d.date)}, ${d.channel}, ${Prisma.join(values)})
    ON CONFLICT ("storeId", "date", "channel") DO UPDATE SET ${sets}`;
}

export async function bumpVariantStats(
  t: Tx,
  storeId: string,
  date: string,
  rows: { variantId: string; units: number; netCents: number; costCents: number }[],
) {
  if (!rows.length) return;
  // Six bound values a row, under D1's 100 a statement.
  for (const part of chunk(rows, 15)) {
    const values = Prisma.join(part.map((r) => Prisma.sql`(${storeId}, ${dateCol(date)}, ${r.variantId}, ${r.units}, ${r.netCents}, ${r.costCents})`));
    await t.$executeRaw`
      INSERT INTO "DailyVariantStat" ("storeId", "date", "variantId", "units", "netCents", "costCents")
      VALUES ${values}
      ON CONFLICT ("storeId", "date", "variantId") DO UPDATE SET
        "units" = "DailyVariantStat"."units" + EXCLUDED."units",
        "netCents" = "DailyVariantStat"."netCents" + EXCLUDED."netCents",
        "costCents" = "DailyVariantStat"."costCents" + EXCLUDED."costCents"`;
  }
}

/**
 * The rollup delta for one posted sale or refund: what it adds to its store's day under its channel (POS, ONLINE, or
 * WHOLESALE for trade sales), with every tender in its own column. Pure, so it is unit-tested (tests/rollups-trade.test.ts);
 * the posting transaction applies the same figures with bumpStoreStat. Refunds carry negative figures and count under
 * `refunds`; a member counts once per sale, never per refund.
 */
export function saleStatDelta(
  s: {
    storeId: string;
    date: string;
    channel: StoreStatDelta["channel"];
    kind?: "SALE" | "REFUND";
    units: number;
    grossCents: number;
    vatCents: number;
    costCents: number;
    discountCents?: number;
    memberSavingsCents?: number;
    offerCents?: number;
    member?: boolean;
    pointsIssued?: number;
  },
  payments: { method: string; amountCents: number }[],
): StoreStatDelta {
  const refund = s.kind === "REFUND";
  const d: StoreStatDelta = {
    storeId: s.storeId, date: s.date, channel: s.channel, ...(refund ? { refunds: 1 } : { sales: 1 }),
    units: s.units, grossCents: s.grossCents, vatCents: s.vatCents, costCents: s.costCents,
    discountCents: s.discountCents ?? 0, memberSavingsCents: s.memberSavingsCents ?? 0, offerCents: s.offerCents ?? 0,
    members: s.member && !refund ? 1 : 0, pointsIssued: s.pointsIssued ?? 0,
  };
  for (const p of payments) {
    const col = paymentColumn(p.method) as "cardCents" | undefined;
    if (!col) throw new Error(`No rollup column for tender ${p.method}`);
    d[col] = (d[col] ?? 0) + p.amountCents;
  }
  return d;
}

/** The DailyStoreStat columns the upsert carries (every tender column, so a new tender can never be dropped on the floor). */
export const STAT_COLUMNS: readonly string[] = COLS;

/**
 * The rollup column a tender lands in. A gift voucher (VOUCHER) counts with money collected by HQ (`onlineCents`): the
 * voucher was paid for online, its liability is HQ's, and HQ settles the store for it on the monthly statement, the
 * same as an online payment. The Payment rows keep it a "Gift voucher" tender everywhere they are read. A trade
 * account's credit terms (ACCOUNT) are not money at the time of sale: they go to `accountCents` (invoiced on HQ's trade
 * ledger, settled later) and never into a cash, card or online figure.
 */
export function paymentColumn(method: string): keyof StoreStatDelta {
  return ({ CARD: "cardCents", CASH: "cashCents", PAYSHAP: "payshapCents", EFT: "eftCents", LOYALTY: "loyaltyCents", ONLINE: "onlineCents", VOUCHER: "onlineCents", ACCOUNT: "accountCents" } as const)[
    method as "CARD"
  ];
}
