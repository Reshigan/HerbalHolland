import { describe, expect, it } from "vitest";
import { canBuyOnline, fulfilmentForPhase, isLaunchPhase, LAUNCH_PHASES, PHASE_LABEL } from "@/lib/launch-phase";

describe("launch phase", () => {
  it("knows its phases", () => {
    expect(LAUNCH_PHASES).toEqual(["BRAND", "ONLINE", "STORES"]);
    for (const p of LAUNCH_PHASES) expect(PHASE_LABEL[p].title).toBeTruthy();
    expect(isLaunchPhase("ONLINE")).toBe(true);
    expect(isLaunchPhase("online")).toBe(false);
    expect(isLaunchPhase(null)).toBe(false);
  });
  it("opens buying after the brand phase", () => {
    expect(canBuyOnline("BRAND")).toBe(false);
    expect(canBuyOnline("ONLINE")).toBe(true);
    expect(canBuyOnline("STORES")).toBe(true);
  });
  it("keeps collection and same-day for the stores phase", () => {
    expect(fulfilmentForPhase("BRAND")).toEqual([]);
    expect(fulfilmentForPhase("ONLINE")).toEqual(["COURIER"]);
    expect(fulfilmentForPhase("STORES")).toEqual(["COLLECT", "SAME_DAY", "COURIER"]);
  });
});
