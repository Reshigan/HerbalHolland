import { describe, expect, it } from "vitest";
import { cardHolderMayView, pickStore } from "../src/server/insights";

describe("insights store filter", () => {
  const stores = [{ code: "PTA01" }, { code: "PTA02" }];
  it("no filter means every store in scope", () => expect(pickStore(stores, undefined)).toBeUndefined());
  it("finds a store in scope", () => expect(pickStore(stores, "PTA02")).toEqual({ code: "PTA02" }));
  it("refuses a store outside scope", () => expect(pickStore(stores, "JHB01")).toBeNull());
});

describe("member card opens Insights", () => {
  const u = { active: true, mustChangePassword: false, role: "HQ_ADMIN" as const };
  it("an active HQ admin's card may", () => expect(cardHolderMayView(u)).toBe(true));
  it("an unlinked card may not", () => expect(cardHolderMayView(null)).toBe(false));
  it("a deactivated account may not", () => expect(cardHolderMayView({ ...u, active: false })).toBe(false));
  it("a temporary password may not", () => expect(cardHolderMayView({ ...u, mustChangePassword: true })).toBe(false));
  it("a cashier's card may not", () => expect(cardHolderMayView({ ...u, role: "BUDTENDER" as const })).toBe(false));
});
