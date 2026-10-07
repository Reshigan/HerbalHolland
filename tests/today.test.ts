import { describe, expect, it } from "vitest";
import { buildCompanyToday, buildToday, emptyFacts } from "@/lib/today";

describe("Today: low stock already on order", () => {
  const facts = (skus: number, out: number, onOrder?: number) => ({ ...emptyFacts(), lowStock: { skus, out, onOrder } });

  it("counts only SKUs still to order and mentions the ones already on order", () => {
    const [item] = buildToday(facts(13, 2, 7), "/store/X");
    expect(item.count).toBe(6);
    expect(item.title).toBe("6 SKUs to reorder");
    expect(item.line).toContain("7 more already on order");
    expect(item.href).toBe("/store/X/purchasing/new");
  });

  it("drops to a low-priority note when everything low is already on order", () => {
    const [item] = buildToday(facts(4, 0, 4), "/store/X");
    expect(item).toMatchObject({ severity: "low", count: 4, href: "/store/X/purchasing" });
  });

  it("works without the on-order fact", () => {
    const [item] = buildToday(facts(3, 0), "/store/X");
    expect(item).toMatchObject({ severity: "medium", count: 3, title: "3 SKUs to reorder" });
  });
});

describe("Today: consolidated (owner) list", () => {
  const none = { overdueCash: 0, highAlerts: 0, alerts: 0, negativeLots: 0, lowStock: 0, quiet: false };
  it("tags each item with its store and links into that store, most urgent first", () => {
    const items = buildCompanyToday([
      { code: "PTA01", name: "Hatfield", ...none, lowStock: 5 },
      { code: "JHB02", name: "Brooklyn", ...none, alerts: 1 },
      { code: "CPT01", name: "Sea Point", ...none, overdueCash: 2 },
      { code: "DBN01", name: "Umhlanga", ...none },
    ]);
    expect(items.map((i) => i.title)).toEqual(["Sea Point · 2 cash-ups overdue", "Brooklyn · 1 loss-prevention alert open", "Hatfield · 5 SKUs at or below reorder point"]);
    expect(items[1].href).toBe("/store/JHB02/loss-prevention");
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });
});
