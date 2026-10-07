// Buy again: stock, availability, class access and the bag's limits decide what goes back into the bag.
import { describe, expect, it } from "vitest";
import { planReorder, reorderSummary, type ReorderLine } from "@/lib/reorder";

const line = (over: Partial<ReorderLine> = {}): ReorderLine => ({ variantId: "v1", name: "Calm CBD Oil · 30 ml", qty: 2, active: true, onSale: true, allowed: true, available: 10, ...over });

describe("planReorder", () => {
  it("re-adds what is on sale and in stock, merging with the bag", () => {
    const p = planReorder([line(), line({ variantId: "v2", name: "Grinder", qty: 1 })], [{ variantId: "v1", qty: 1 }]);
    expect(p.cart).toEqual([{ variantId: "v1", qty: 3 }, { variantId: "v2", qty: 1 }]);
    expect(p.added.map((a) => a.qty)).toEqual([2, 1]);
    expect(p.skipped).toEqual([]);
    expect(reorderSummary(p)).toBe("Added 3 items to your bag.");
  });
  it("leaves out what can't be bought today and says why", () => {
    const p = planReorder(
      [line({ active: false }), line({ variantId: "v2", name: "Old Tee", onSale: false }), line({ variantId: "v3", name: "Haze", allowed: false }), line({ variantId: "v4", name: "Tea", available: 0 })],
      [],
    );
    expect(p.cart).toEqual([]);
    expect(p.skipped.map((s) => s.reason)).toEqual(["no longer available", "no longer available", "needs your patient authorisation, so order it from the dispensary", "out of stock right now"]);
    expect(reorderSummary(p)).toMatch(/^Nothing could be added to your bag\. Left out: Calm CBD Oil · 30 ml \(no longer available\);/);
  });
  it("caps at the stock on hand and the bag's limits, and made-to-order merch needs no stock", () => {
    const p = planReorder([line({ qty: 5, available: 3 }), line({ variantId: "v2", name: "Hoodie", qty: 2, available: 0, made: true })], [], { maxLines: 30, maxQty: 20 });
    expect(p.cart).toEqual([{ variantId: "v1", qty: 3 }, { variantId: "v2", qty: 2 }]);
    expect(p.skipped).toEqual([{ variantId: "v1", name: "Calm CBD Oil · 30 ml", reason: "only 3 in stock, so we added 3" }]);
    const full = planReorder([line({ qty: 4 })], [{ variantId: "v1", qty: 19 }], { maxLines: 30, maxQty: 20 });
    expect(full.cart).toEqual([{ variantId: "v1", qty: 20 }]);
    expect(full.skipped[0].reason).toBe("we added 1: the most one bag can hold");
    const noRoom = planReorder([line()], [{ variantId: "v1", qty: 20 }], { maxLines: 30, maxQty: 20 });
    expect(noRoom.skipped[0].reason).toBe("already 20 in your bag");
    const noLines = planReorder([line({ variantId: "v9", name: "Tea" })], [{ variantId: "a", qty: 1 }, { variantId: "b", qty: 1 }], { maxLines: 2, maxQty: 20 });
    expect(noLines.skipped[0].reason).toBe("your bag is full");
  });
});
