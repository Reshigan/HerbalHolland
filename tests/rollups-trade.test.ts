import { describe, expect, it } from "vitest";
import { STAT_COLUMNS, paymentColumn, saleStatDelta } from "@/server/rollups";

describe("rollup delta for a sale", () => {
  it("lands a trade sale on account in the WHOLESALE row with the tender in accountCents", () => {
    const d = saleStatDelta(
      { storeId: "dc", date: "2026-10-03", channel: "WHOLESALE", units: 24, grossCents: 800_400, vatCents: 104_400, costCents: 384_000 },
      [{ method: "ACCOUNT", amountCents: 800_400 }],
    );
    expect(d).toMatchObject({ storeId: "dc", date: "2026-10-03", channel: "WHOLESALE", sales: 1, units: 24, grossCents: 800_400, vatCents: 104_400, costCents: 384_000, accountCents: 800_400, members: 0, pointsIssued: 0 });
    for (const col of ["cardCents", "cashCents", "payshapCents", "eftCents", "loyaltyCents", "onlineCents"]) expect(d[col as "cardCents"]).toBeUndefined();
    expect(d.refunds).toBeUndefined();
  });

  it("keeps every tender in its own column, split tenders included", () => {
    const d = saleStatDelta(
      { storeId: "s", date: "2026-10-03", channel: "WHOLESALE", units: 3, grossCents: 34_500, vatCents: 4_500, costCents: 15_000 },
      [{ method: "EFT", amountCents: 20_000 }, { method: "ACCOUNT", amountCents: 10_000 }, { method: "ACCOUNT", amountCents: 4_500 }],
    );
    expect(d.eftCents).toBe(20_000);
    expect(d.accountCents).toBe(14_500);
    expect(d.cashCents).toBeUndefined();
  });

  it("matches the posting code for retail sales and refunds", () => {
    const sale = saleStatDelta(
      { storeId: "s", date: "2026-10-03", channel: "POS", units: 2, grossCents: 45_800, vatCents: 5_974, costCents: 13_000, discountCents: 1_000, memberSavingsCents: 2_000, offerCents: 500, member: true, pointsIssued: 45 },
      [{ method: "CASH", amountCents: 40_000 }, { method: "LOYALTY", amountCents: 5_800 }],
    );
    expect(sale).toMatchObject({ sales: 1, members: 1, pointsIssued: 45, cashCents: 40_000, loyaltyCents: 5_800, discountCents: 1_000, memberSavingsCents: 2_000, offerCents: 500 });
    const refund = saleStatDelta(
      { storeId: "s", date: "2026-10-03", channel: "ONLINE", kind: "REFUND", units: -1, grossCents: -22_900, vatCents: -2_987, costCents: -6_500, member: true, pointsIssued: -22 },
      [{ method: "VOUCHER", amountCents: -10_000 }, { method: "ONLINE", amountCents: -12_900 }],
    );
    expect(refund).toMatchObject({ refunds: 1, members: 0, units: -1, grossCents: -22_900, pointsIssued: -22, onlineCents: -22_900 });
    expect(refund.sales).toBeUndefined();
  });

  it("maps every tender to a column the upsert carries", () => {
    expect(paymentColumn("ACCOUNT")).toBe("accountCents");
    expect(paymentColumn("VOUCHER")).toBe("onlineCents");
    for (const m of ["CARD", "CASH", "PAYSHAP", "EFT", "LOYALTY", "ONLINE", "VOUCHER", "ACCOUNT"]) expect(STAT_COLUMNS).toContain(paymentColumn(m));
    expect(() => saleStatDelta({ storeId: "s", date: "2026-10-03", channel: "POS", units: 1, grossCents: 1, vatCents: 0, costCents: 0 }, [{ method: "CHEQUE", amountCents: 1 }])).toThrow(/CHEQUE/);
  });
});
