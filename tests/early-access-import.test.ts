import { describe, expect, it } from "vitest";
import { parseEarlyAccess } from "@/lib/early-access";

describe("parseEarlyAccess", () => {
  it("reads the wrangler --json export, keeps emails lower-case and mobiles as +27, and leaves out rows with neither", () => {
    const raw = JSON.stringify([{ results: [
      { first_name: "Thandi", email: "Thandi@Example.co.za", mobile: "082 555 0101", province: "KZN", source: "home", created_at: "2026-10-14T08:00:00.000Z" },
      { first_name: "", email: "not-an-email", mobile: "123", province: null, source: null, created_at: "x" },
      { first_name: null, email: null, mobile: "+27 71 555 0102", province: "GP", source: "stores", created_at: "2026-10-15T09:30:00.000Z" },
    ], success: true }]);
    const { rows, skipped } = parseEarlyAccess(raw);
    expect(skipped).toBe(1);
    expect(rows.map((r) => [r.firstName, r.email, r.mobile, r.province])).toEqual([["Thandi", "thandi@example.co.za", "+27825550101", "KZN"], [null, null, "+27715550102", "GP"]]);
    expect(rows[0].signedUpAt.toISOString()).toBe("2026-10-14T08:00:00.000Z");
  });

  it("reads a CSV with a header row", () => {
    const { rows } = parseEarlyAccess('first_name,email,mobile,province,source,created_at\n"Sipho",sipho@example.com,,KZN,stores,2026-10-20T10:00:00Z');
    expect(rows).toEqual([{ firstName: "Sipho", email: "sipho@example.com", mobile: null, province: "KZN", source: "stores", signedUpAt: new Date("2026-10-20T10:00:00Z") }]);
  });
});
