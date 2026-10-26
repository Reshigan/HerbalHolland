import { describe, expect, it } from "vitest";
import { clampDay, daysInMonth, dobValue } from "@/lib/dob";

describe("date of birth pickers", () => {
  it("knows month lengths and leap years", () => {
    expect([daysInMonth(1990, 1), daysInMonth(1990, 4), daysInMonth(2000, 2), daysInMonth(2001, 2), daysInMonth(1900, 2)]).toEqual([31, 30, 29, 28, 28]);
    expect(daysInMonth(0, 2)).toBe(29);
  });
  it("keeps the day inside a shorter month", () => {
    expect(clampDay(1990, 4, 31)).toBe(30);
    expect(clampDay(2001, 2, 29)).toBe(28);
    expect(clampDay(1990, 1, 15)).toBe(15);
  });
  it("sends YYYY-MM-DD only once all three are chosen", () => {
    expect(dobValue(1990, 4, 31)).toBe("1990-04-30");
    expect(dobValue(1994, 5, 7)).toBe("1994-05-07");
    expect(dobValue(0, 5, 7)).toBe("");
    expect(dobValue(1994, 0, 7)).toBe("");
    expect(dobValue(1994, 5, 0)).toBe("");
  });
});
