// Daily rollups, incremented inside the posting transaction (race-free upserts).
import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "./db";

export type StoreStatDelta = {
  storeId: string;
  date: string; // YYYY-MM-DD (SAST business day)
  channel: "POS" | "ONLINE";
  sales?: number;
  refunds?: number;
  units?: number;
  grossCents?: number;
  vatCents?: number;
  costCents?: number;
  discountCents?: number;
  memberSavingsCents?: number;
  cardCents?: number;
  cashCents?: number;
  payshapCents?: number;
  eftCents?: number;
  loyaltyCents?: number;
  onlineCents?: number;
  members?: number;
  pointsIssued?: number;
};

const COLS = [
  "sales", "refunds", "units", "grossCents", "vatCents", "costCents", "discountCents", "memberSavingsCents", "cardCents",
  "cashCents", "payshapCents", "eftCents", "loyaltyCents", "onlineCents", "members", "pointsIssued",
] as const;

export async function bumpStoreStat(t: Tx, d: StoreStatDelta) {
  const values = COLS.map((c) => d[c] ?? 0);
  const cols = Prisma.raw(COLS.map((c) => `"${c}"`).join(", "));
  const sets = Prisma.raw(COLS.map((c) => `"${c}" = "DailyStoreStat"."${c}" + EXCLUDED."${c}"`).join(", "));
  await t.$executeRaw`
    INSERT INTO "DailyStoreStat" ("storeId", "date", "channel", ${cols})
    VALUES (${d.storeId}, ${d.date}::date, ${d.channel}::"Channel", ${Prisma.join(values)})
    ON CONFLICT ("storeId", "date", "channel") DO UPDATE SET ${sets}`;
}

export async function bumpVariantStats(
  t: Tx,
  storeId: string,
  date: string,
  rows: { variantId: string; units: number; netCents: number; costCents: number }[],
) {
  if (!rows.length) return;
  const values = Prisma.join(rows.map((r) => Prisma.sql`(${storeId}, ${date}::date, ${r.variantId}, ${r.units}, ${r.netCents}, ${r.costCents})`));
  await t.$executeRaw`
    INSERT INTO "DailyVariantStat" ("storeId", "date", "variantId", "units", "netCents", "costCents")
    VALUES ${values}
    ON CONFLICT ("storeId", "date", "variantId") DO UPDATE SET
      "units" = "DailyVariantStat"."units" + EXCLUDED."units",
      "netCents" = "DailyVariantStat"."netCents" + EXCLUDED."netCents",
      "costCents" = "DailyVariantStat"."costCents" + EXCLUDED."costCents"`;
}

export function paymentColumn(method: string): keyof StoreStatDelta {
  return ({ CARD: "cardCents", CASH: "cashCents", PAYSHAP: "payshapCents", EFT: "eftCents", LOYALTY: "loyaltyCents", ONLINE: "onlineCents" } as const)[
    method as "CARD"
  ];
}
