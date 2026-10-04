// When a click & collect order will be ready, from the store's hours (SAST).
import { describe, expect, it } from "vitest";
import { collectReady, parseHours } from "@/server/shop/hours";

const hours = parseHours({ mon: ["09:00", "18:00"], tue: ["09:00", "18:00"], sat: ["09:00", "13:00"] });
// 2026-10-05 is a Monday. SAST is UTC+2.
const at = (iso: string) => new Date(`${iso}+02:00`);

describe("collectReady", () => {
  it("is within 2 hours while the store is open for at least that long", () => {
    expect(collectReady(hours, at("2026-10-05T10:00:00"))).toEqual({ soon: true, label: "Usually ready within 2 hours" });
  });
  it("is from the next opening before opening, near closing and after hours", () => {
    expect(collectReady(hours, at("2026-10-05T07:30:00")).label).toBe("Ready today from 09:00");
    expect(collectReady(hours, at("2026-10-05T17:00:00")).label).toBe("Ready tomorrow from 09:00");
    expect(collectReady(hours, at("2026-10-06T21:00:00")).label).toBe("Ready Saturday from 09:00");
    expect(collectReady({}, at("2026-10-05T10:00:00")).label).toBe("Ready when the store reopens");
  });
});
