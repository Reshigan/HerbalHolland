import { describe, expect, it } from "vitest";
import { statementTerms } from "@/lib/supplier-invoice-rules";

describe("statementTerms", () => {
  it("is due on the last day of the month it was received and settles from the next month", () => {
    expect(statementTerms("2026-10-04")).toEqual({
      month: "2026-10", dueDay: "2026-10-31", settledFrom: "2026-11-01",
      settles: "Settles on the October 2026 franchise statement", settled: "Settled on the October 2026 franchise statement",
    });
    expect(statementTerms("2028-02-10").dueDay).toBe("2028-02-29"); // leap year
    expect(statementTerms("2026-12-31")).toMatchObject({ dueDay: "2026-12-31", settledFrom: "2027-01-01", settled: "Settled on the December 2026 franchise statement" });
  });
});
