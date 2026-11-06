import { describe, expect, it } from "vitest";
import { isUnattended, needsReload, reloadsOnResume } from "@/lib/app-update";
import { appOnlyOpen } from "@/lib/install";

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
  it("updates members on coming back to the app, but never at checkout", () => {
    expect(reloadsOnResume("/club")).toBe(true);
    expect(reloadsOnResume("/shop")).toBe(true);
    expect(reloadsOnResume("/checkout")).toBe(false);
  });
});

describe("app only", () => {
  it("leaves open what a browser must reach, and closes the rest", () => {
    for (const p of ["/go", "/app", "/club/join", "/club/partners", "/legal/terms", "/batch/B123", "/orders/HH123", "/s/abc", "/pos", "/pos/display", "/hq/settings", "/store/pta01", "/login", "/pwa-icon/192", "/apple-icon", "/trade", "/trade/apply", "/trade/terms", "/trade/login"]) expect(appOnlyOpen(p)).toBe(true);
    for (const p of ["/", "/shop", "/p/amnesia-haze", "/cart", "/checkout", "/gift", "/learn", "/learn/points", "/stores", "/drops", "/specials", "/club", "/club/orders", "/r/1/abc", "/trade/range", "/trade/cart", "/trade/checkout", "/trade/orders", "/gopher", "/applied", "/nowhere"]) expect(appOnlyOpen(p)).toBe(false);
  });
});
