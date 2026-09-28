import { describe, expect, it } from "vitest";
import { presign } from "@/lib/sigv4";
import { bankBy, cashToBank, isBusinessDay, isOverdue, lastDueDay } from "@/lib/banking";
import { commissionCents } from "@/lib/commission";
import { aboveNorm, cashShort, DEFAULT_LOSS, median, refundFlags } from "@/lib/loss";
import { sniffType } from "@/lib/files";

describe("storage signing", () => {
  it("matches the AWS SigV4 presigned-URL example", () => {
    const url = presign({
      method: "GET",
      url: "https://examplebucket.s3.amazonaws.com/test.txt",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      expires: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });
  it("signs R2 path-style object keys", () => {
    const url = presign({ method: "PUT", url: "https://acc.r2.cloudflarestorage.com/hh-files/slips/PTA01/2026-09/a b.jpg", region: "auto", accessKeyId: "k", secretAccessKey: "s", expires: 300, now: new Date("2026-09-28T08:00:00Z") });
    expect(url).toMatch(/^https:\/\/acc\.r2\.cloudflarestorage\.com\/hh-files\/slips\/PTA01\/2026-09\/a%20b\.jpg\?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=k%2F20260928%2Fauto%2Fs3%2Faws4_request&/);
  });
});

describe("cash banking", () => {
  it("banks what was counted, less the float", () => {
    expect(cashToBank({ countedCashCents: 350_000, openingFloatCents: 100_000 })).toBe(250_000);
    expect(cashToBank({ countedCashCents: 80_000, openingFloatCents: 100_000 })).toBe(0);
  });
  it("is due by the next business day, skipping weekends and public holidays", () => {
    expect(isBusinessDay("2026-09-28")).toBe(true); // Monday
    expect(isBusinessDay("2026-09-24")).toBe(false); // Heritage Day
    expect(bankBy(new Date("2026-09-28T17:00:00Z"), 1)).toBe("2026-09-29"); // Monday evening → Tuesday
    expect(bankBy(new Date("2026-09-25T17:00:00Z"), 1)).toBe("2026-09-28"); // Friday → Monday
    expect(bankBy(new Date("2026-09-23T17:00:00Z"), 1)).toBe("2026-09-25"); // Wednesday → Friday (Thursday is Heritage Day)
    expect(bankBy(new Date("2026-12-24T17:00:00Z"), 2)).toBe("2026-12-29"); // Christmas, Day of Goodwill, weekend
    expect(isOverdue(new Date("2026-09-25T17:00:00Z"), 1, new Date("2026-09-28T20:00:00Z"))).toBe(false);
    expect(isOverdue(new Date("2026-09-25T17:00:00Z"), 1, new Date("2026-09-29T06:00:00Z"))).toBe(true);
    // Monday: Friday's cash is due today; Wednesday's and Thursday's (Heritage Day) were due Friday.
    expect(lastDueDay(new Date("2026-09-28T08:00:00Z"), 1)).toBe("2026-09-24");
    expect(lastDueDay(new Date("2026-09-29T08:00:00Z"), 1)).toBe("2026-09-27");
  });
  it("recognises slips by their bytes, not their name", () => {
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe("image/png");
    expect(sniffType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("commission", () => {
  const bps = { THC: 200, CBD: 200, HEMP: 200, ACCESSORY: 300, APPAREL: 200, GROW: 200 };
  it("pays basis points of net sales ex VAT, clawed back on refunds, never on licensed medicines", () => {
    const lines = [
      { regClass: "CBD" as const, netCents: 100_000 },
      { regClass: "ACCESSORY" as const, netCents: 50_000 },
      { regClass: "THC" as const, netCents: 400_000 },
      { regClass: "CBD" as const, netCents: -20_000 }, // refund
    ];
    expect(commissionCents(lines, bps, ["THC"])).toBe(1_600 + 1_500);
    expect(commissionCents([{ regClass: "CBD", netCents: 10_000 }, { regClass: "CBD", netCents: -10_000 }], bps, ["THC"])).toBe(0);
  });
});

describe("loss prevention rules", () => {
  it("flags cash shortages by size", () => {
    expect(cashShort(-4_000, DEFAULT_LOSS)).toBeNull();
    expect(cashShort(20_000, DEFAULT_LOSS)).toBeNull();
    expect(cashShort(-5_000, DEFAULT_LOSS)).toBe("MEDIUM");
    expect(cashShort(-60_000, DEFAULT_LOSS)).toBe("HIGH");
  });
  it("scores refunds: one ordinary flag is normal, cash back on a card sale never is", () => {
    const base = { cashForCard: false, otherPersonsSale: false, minutesAfterSale: 600, minutesBeforeClose: null };
    expect(refundFlags(base, DEFAULT_LOSS).severity).toBeNull();
    expect(refundFlags({ ...base, otherPersonsSale: true }, DEFAULT_LOSS).severity).toBeNull();
    expect(refundFlags({ ...base, otherPersonsSale: true, minutesAfterSale: 12 }, DEFAULT_LOSS).severity).toBe("MEDIUM");
    expect(refundFlags({ ...base, cashForCard: true }, DEFAULT_LOSS).severity).toBe("MEDIUM");
    const r = refundFlags({ ...base, cashForCard: true, minutesBeforeClose: 5 }, DEFAULT_LOSS);
    expect(r.severity).toBe("HIGH");
    expect(r.reasons).toEqual(["a card sale refunded in cash", "just before the shift was closed"]);
  });
  it("compares against the norm with a floor", () => {
    expect(aboveNorm(9, 2, 3, 5)).toBe(true);
    expect(aboveNorm(5, 2, 3, 5)).toBe(false);
    expect(aboveNorm(4, 0, 3, 5)).toBe(false);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
