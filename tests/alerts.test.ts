import { describe, expect, it } from "vitest";
import { admitAlert, alertGate, alertKey, alertSummary, isControlFlow, scrubAlert, HOUR, MAX_PER_HOUR } from "@/lib/alerts";

describe("server-error alerts", () => {
  it("sends one alert per distinct error an hour, whatever ids its message carries", () => {
    const g = alertGate();
    const key = alertKey("/store/[code]/purchasing/[id]", "Order PO-000123 not found");
    expect(key).toBe(alertKey("/store/[code]/purchasing/[id]", "Order PO-000987 not found"));
    expect(key).not.toBe(alertKey("/hq", "Order PO-000123 not found"));
    expect(admitAlert(g, key, 0)).toBe(true);
    expect(admitAlert(g, key, HOUR - 1)).toBe(false);
    expect(admitAlert(g, alertKey("/hq", "Database timeout"), HOUR - 1)).toBe(true);
    expect(admitAlert(g, key, HOUR)).toBe(true);
  });

  it("never sends more than the hourly cap, then starts again", () => {
    const g = alertGate();
    const sent = Array.from({ length: MAX_PER_HOUR + 5 }, (_, i) => admitAlert(g, `/r error ${"x".repeat(i)}`, 1000)).filter(Boolean);
    expect(sent).toHaveLength(MAX_PER_HOUR);
    expect(admitAlert(g, "/r a new error", 1000 + HOUR)).toBe(true);
    expect(g.last.size).toBe(1); // last hour's keys are dropped with the window
  });

  it("puts the cause in the subject", () => {
    expect(alertSummary("\nInvalid `prisma.store.findMany()` invocation:\n\n\nDatabase `hh` does not exist on the database server\n")).toBe("Database `hh` does not exist on the database server");
    expect(alertSummary("Order not found")).toBe("Order not found");
    expect(alertSummary("")).toBe("Unknown error");
  });

  it("ignores Next.js control flow", () => {
    expect(isControlFlow("NEXT_REDIRECT;replace;/login;307;")).toBe(true);
    expect(isControlFlow("NEXT_HTTP_ERROR_FALLBACK;404")).toBe(true);
    expect(isControlFlow("2841592318")).toBe(false);
    expect(isControlFlow(null)).toBe(false);
  });

  it("takes addresses and long numbers out of what's emailed, keeping file paths", () => {
    const t = scrubAlert("550 <thandi.m@example.co.za> rejected; SMS to +27821234567 failed (ID 9001015009087)\n    at x (node_modules/@prisma/client/runtime/client.js:12:345)");
    expect(t).not.toMatch(/thandi|821234567|9001015009087/);
    expect(t).toContain("[email]");
    expect(t).toContain("node_modules/@prisma/client/runtime/client.js:12:345");
    const t0 = performance.now();
    scrubAlert("a".repeat(500_000) + "@".repeat(1000) + "9".repeat(100_000));
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
