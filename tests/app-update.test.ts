import { describe, expect, it } from "vitest";
import { isUnattended, needsReload } from "@/lib/app-update";
import { appOnlyExempt } from "@/lib/install";

describe("auto-update", () => {
  it("reloads for a new build, once", () => {
    expect(needsReload("a", "b", null)).toBe(true);
    expect(needsReload("a", "a", null)).toBe(false);
    expect(needsReload("a", "b", "b")).toBe(false); // already reloaded for b and still on a: don't loop
    expect(needsReload("a", "c", "b")).toBe(true);
    expect(needsReload("a", null, null)).toBe(false);
  });
  it("treats only the boards and the customer display as unattended", () => {
    expect(isUnattended("/menu/pta01")).toBe(true);
    expect(isUnattended("/pos/display")).toBe(true);
    expect(isUnattended("/pos")).toBe(false);
    expect(isUnattended("/menus")).toBe(false);
  });
});

describe("app only", () => {
  it("leaves open what a browser must reach, and walls the rest", () => {
    for (const p of ["/go", "/club/join", "/legal/terms", "/batch/B123", "/orders/HH123"]) expect(appOnlyExempt(p)).toBe(true);
    for (const p of ["/", "/shop", "/club", "/club/orders", "/checkout", "/gopher"]) expect(appOnlyExempt(p)).toBe(false);
  });
});
