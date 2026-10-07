import { describe, expect, it } from "vitest";
import { centsToInput, parseRand } from "@/lib/money";
import { parseRand as hqParseRand } from "@/server/hq/form";
import { parseRand as storeParseRand } from "@/server/store/rules";
import { parseRands } from "@/components/pos/lib/rules";

describe("parseRand", () => {
  it("reads plain amounts with a decimal point or a decimal comma", () => {
    expect(parseRand("12")).toBe(1200);
    expect(parseRand("12.5")).toBe(1250);
    expect(parseRand("12.50")).toBe(1250);
    expect(parseRand("12,50")).toBe(1250);
    expect(parseRand("12,5")).toBe(1250);
    expect(parseRand("1,2")).toBe(120);
    expect(parseRand("1,23")).toBe(123);
    expect(parseRand("0")).toBe(0);
    expect(parseRand("0,00")).toBe(0);
    expect(parseRand(" 99 ")).toBe(9900);
  });

  it("reads thousands grouped by spaces or commas, with or without the R", () => {
    expect(parseRand("1 234,50")).toBe(123450);
    expect(parseRand("1 234.50")).toBe(123450);
    expect(parseRand("1,234.50")).toBe(123450);
    expect(parseRand("R1,234.50")).toBe(123450);
    expect(parseRand("R 1 234")).toBe(123400);
    expect(parseRand("r12")).toBe(1200);
    expect(parseRand("1,234")).toBe(123400); // a comma before exactly three digits groups thousands
    expect(parseRand("12,345")).toBe(1234500);
    expect(parseRand("1,234,567.89")).toBe(123456789);
    expect(parseRand("1 234 567")).toBe(123456700);
  });

  it("takes no-break and thin spaces as group separators (what Intl and banks print)", () => {
    expect(parseRand("1\u00A0234,50")).toBe(123450);
    expect(parseRand("1\u2009234")).toBe(123400);
    expect(parseRand("R\u00A01\u202F234,50")).toBe(123450);
    expect(parseRand(new Intl.NumberFormat("en-ZA", { minimumFractionDigits: 2 }).format(1234567.5))).toBe(123456750);
  });

  it("keeps a trailing decimal separator while someone is still typing", () => {
    expect(parseRand("12.")).toBe(1200);
    expect(parseRand("12,")).toBe(1200);
    expect(parseRand("1 234,")).toBe(123400);
  });

  it("rejects anything empty, malformed or ambiguous", () => {
    for (const bad of [
      "", "   ", "R", "-", "abc", "12a", "R5R", "+5", "5-", ".5", ",5", "1..5", "12.345", "1.234", "1,2345", "1234,567",
      "1.234,50", "1,234,50", "1,234 567", "1 234,567", "1 23", "12 34", "1  234", "1,23,456", "12\t34",
    ])
      expect(parseRand(bad), JSON.stringify(bad)).toBeNull();
    expect(parseRand(null)).toBeNull();
    expect(parseRand(undefined)).toBeNull();
  });

  it("caps the length before parsing and never returns an unsafe integer", () => {
    expect(parseRand("1".repeat(41))).toBeNull();
    expect(parseRand(" ".repeat(60) + "5")).toBeNull();
    expect(parseRand("9".repeat(20))).toBeNull();
    expect(parseRand("9".repeat(13))).toBe(999_999_999_999_900);
  });

  it("only takes a leading minus when the caller allows signed amounts", () => {
    for (const neg of ["-5", "-R5", "R-5", "R -5", "\u22125"]) expect(parseRand(neg), neg).toBeNull();
    expect(parseRand("-5", { signed: true })).toBe(-500);
    expect(parseRand("-R1,234.50", { signed: true })).toBe(-123450);
    expect(parseRand("R -50", { signed: true })).toBe(-5000);
    expect(parseRand("\u2212R5.00", { signed: true })).toBe(-500); // U+2212, as the app prints adjustments
    expect(Object.is(parseRand("-0", { signed: true }), 0)).toBe(true);
    expect(parseRand("--5", { signed: true })).toBeNull();
    expect(parseRand("-R-5", { signed: true })).toBeNull();
  });
});

describe("parseRand callers", () => {
  it("HQ forms read a decimal comma as cents (it used to make 12,50 into R1,250) and keep signed trade adjustments", () => {
    expect(hqParseRand("12,50")).toBe(1250);
    expect(hqParseRand("R 2 500.00")).toBe(250000);
    expect(hqParseRand("-500")).toBe(-50000);
    expect(hqParseRand("12.345")).toBeNull();
  });

  it("the back office keeps negatives for its own checks (journals, bank balances)", () => {
    expect(storeParseRand("-5")).toBe(-500);
    expect(storeParseRand("1,234")).toBe(123400);
    expect(storeParseRand("")).toBeNull();
  });

  it("the till takes thousands separators and never a negative amount", () => {
    expect(parseRands("1,234.50")).toBe(123450);
    expect(parseRands("R 1 234,50")).toBe(123450);
    expect(parseRands("-5")).toBeNull();
    expect(parseRands("12.")).toBe(1200);
  });
});

describe("centsToInput", () => {
  it("prints an amount input's value that reads straight back", () => {
    expect(centsToInput(123450)).toBe("1234.50");
    expect(centsToInput(1200)).toBe("12.00");
    expect(centsToInput(0)).toBe("0.00");
    expect(centsToInput(-500)).toBe("-5.00");
    expect(centsToInput(null)).toBe("");
    expect(centsToInput(undefined)).toBe("");
    for (const c of [1, 99, 1200, 123456, 100_000_000_00]) expect(parseRand(centsToInput(c))).toBe(c);
  });
});
