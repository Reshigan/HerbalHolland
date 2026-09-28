import { describe, expect, it } from "vitest";
import { csvEscape, csvFilename, csvValue, sastStamp, toCsv } from "@/lib/csv";

describe("csv values", () => {
  it("writes money as rands with two decimals and no symbol", () => {
    expect(csvValue(123450, "zar")).toBe("1234.50");
    expect(csvValue(-599, "zar")).toBe("-5.99");
    expect(csvValue(0, "zar")).toBe("0.00");
    expect(csvValue(1234.6, "zar")).toBe("12.35"); // rounds to the cent first
    expect(csvValue(null, "zar")).toBe("");
  });
  it("writes percentages spreadsheets recognise", () => {
    expect(csvValue(0.1234, "pct")).toBe("12.34%");
    expect(csvValue(-0.05, "pct")).toBe("-5.00%");
    expect(csvValue(Infinity, "pct")).toBe("");
  });
  it("keeps numbers plain", () => {
    expect(csvValue(1500, "number")).toBe("1500");
    expect(csvValue(1.456, "number")).toBe("1.46");
    expect(csvValue(NaN, "number")).toBe("");
    expect(csvValue(250, "points")).toBe("250");
  });
  it("writes dates and times in South African time", () => {
    // 22:30 UTC on the 26th is 00:30 SAST on the 27th.
    const d = new Date("2026-09-26T22:30:00Z");
    expect(csvValue(d, "date")).toBe("2026-09-27");
    expect(csvValue("2026-09-01", "day")).toBe("2026-09-01");
    expect(csvValue(d, "datetime")).toBe("2026-09-27 00:30");
    expect(sastStamp(new Date("2026-09-27T12:05:00Z"))).toBe("2026-09-27 14:05");
    expect(csvValue("not a date", "date")).toBe("");
  });
  it("guards text against formula injection", () => {
    expect(csvValue("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(csvValue("+27 82 555 1234")).toBe("'+27 82 555 1234");
    expect(csvValue("-R50 short")).toBe("'-R50 short");
    expect(csvValue("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvValue("Hatfield")).toBe("Hatfield");
    expect(csvValue(true)).toBe("Yes");
    expect(csvValue(["a", "b"])).toBe("a; b");
  });
});

describe("csv escaping", () => {
  it("quotes only when needed and doubles quotes", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("Rooibos, honey")).toBe('"Rooibos, honey"');
    expect(csvEscape('7" pipe')).toBe('"7"" pipe"');
    expect(csvEscape("two\nlines")).toBe('"two\nlines"');
  });
});

describe("toCsv", () => {
  const columns = [
    { key: "name", label: "Product" },
    { key: "units", label: "Units", format: "number" as const },
    { key: "net", label: "Net sales", format: "zar" as const },
  ];
  it("writes a BOM, a header, rows, a totals row and CRLF line endings", () => {
    const csv = toCsv({ columns, rows: [{ name: "Windmill Haze, 3.5g", units: 3, net: 45000 }, { name: "Papers", units: 1, net: null }], totals: { units: 4, net: 45000 } });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual(["Product,Units,Net sales", '"Windmill Haze, 3.5g",3,450.00', "Papers,1,", "Total,4,450.00", ""]);
  });
  it("keeps a text label in a totals row even under a date column", () => {
    const csv = toCsv({ columns: [{ key: "day", label: "Day", format: "day" }, { key: "net", label: "Net", format: "zar" }], rows: [{ day: "2026-09-27", net: 100 }], totals: { day: "Total", net: 100 } }, { bom: false });
    expect(csv).toBe("Day,Net\r\n2026-09-27,1.00\r\nTotal,1.00\r\n");
  });
  it("keeps an explicit totals label and can skip the BOM", () => {
    const csv = toCsv({ columns, rows: [], totals: { name: "All products", units: 0, net: 0 } }, { bom: false });
    expect(csv).toBe("Product,Units,Net sales\r\nAll products,0,0.00\r\n");
  });
  it("separates several tables with a blank line and their titles", () => {
    const csv = toCsv([{ columns, rows: [{ name: "A", units: 1, net: 100 }] }, { title: "Where it is now", columns: [{ key: "store", label: "Store" }], rows: [{ store: "Hatfield" }] }], { bom: false });
    expect(csv).toBe("Product,Units,Net sales\r\nA,1,1.00\r\n\r\nWhere it is now\r\nStore\r\nHatfield\r\n");
  });
});

describe("csv filenames", () => {
  it("slugs the parts", () => {
    expect(csvFilename("herbal-holland", "sales-overview", "PTA01", "2026-08-29", "2026-09-27")).toBe("herbal-holland_sales-overview_PTA01_2026-08-29_2026-09-27.csv");
    expect(csvFilename("herbal holland", "region:GPN", null, "")).toBe("herbal-holland_region-GPN.csv");
    expect(csvFilename()).toBe("report.csv");
  });
});
