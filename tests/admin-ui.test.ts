import { describe, expect, it } from "vitest";
import { chord, inTextField, maskRecipient, normaliseQuery, pageTitle, paletteSearches, parseViews, pushRecent, saveView, searchPalette, switchStorePath, viewsKey, CHORD_MS } from "@/lib/admin-ui";

describe("keyboard chords", () => {
  it("g then o jumps to orders, per area", () => {
    const s1 = chord(null, "g", 1000, "store", "PTA01");
    expect(s1.next).toEqual({ at: 1000 });
    expect(chord(s1.next, "o", 1400, "store", "PTA01").href).toBe("/store/PTA01/orders");
    expect(chord({ at: 1000 }, "i", 1400, "hq").href).toBe("/hq/catalogue");
    expect(chord({ at: 1000 }, "r", 1400, "hq").href).toBe("/hq/reports");
  });
  it("forgets a stale g and ignores other keys", () => {
    expect(chord({ at: 1000 }, "o", 1000 + CHORD_MS + 1, "hq")).toEqual({ next: null });
    expect(chord(null, "o", 1000, "hq")).toEqual({ next: null });
    expect(chord({ at: 1000 }, "z", 1200, "hq")).toEqual({ next: null });
  });
  it("knows which controls own the keyboard", () => {
    expect(inTextField({ tagName: "INPUT", getAttribute: () => "search" })).toBe(true);
    expect(inTextField({ tagName: "INPUT", getAttribute: () => "checkbox" })).toBe(false);
    expect(inTextField({ tagName: "TEXTAREA" })).toBe(true);
    expect(inTextField({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(inTextField({ tagName: "BUTTON" })).toBe(false);
    expect(inTextField(null)).toBe(false);
  });
});

describe("command palette", () => {
  const items = [
    { href: "/hq", label: "Network overview", kind: "nav" as const },
    { href: "/hq/orders", label: "Online orders", group: "Supply", kind: "nav" as const },
    { href: "/hq/customers", label: "Members & CRM", group: "Members", kind: "nav" as const },
    { href: "/hq/marketing", label: "Campaigns", group: "Members", kind: "nav" as const },
  ];
  it("matches every word against label and group, prefix first", () => {
    expect(searchPalette(items, "mem").map((i) => i.label)).toEqual(["Members & CRM", "Campaigns"]);
    expect(searchPalette(items, "online ord").map((i) => i.href)).toEqual(["/hq/orders"]);
    expect(searchPalette(items, "nothing")).toEqual([]);
    expect(searchPalette(items, "", 2)).toHaveLength(2);
  });
  it("keeps recent pages unique and newest first", () => {
    const a = pushRecent([], { href: "/hq/orders", title: "Online orders", at: 1 });
    const b = pushRecent(a, { href: "/hq/customers", title: "Members", at: 2 });
    const c = pushRecent(b, { href: "/hq/orders", title: "Online orders", at: 3 });
    expect(c.map((r) => r.href)).toEqual(["/hq/orders", "/hq/customers"]);
    expect(pushRecent(c, { href: "/x", title: "x", at: 4 }, 2)).toHaveLength(2);
  });
  it("strips the brand suffix from document titles", () => {
    expect(pageTitle("Members & CRM · Herbal Holland")).toBe("Members & CRM");
    expect(pageTitle("Herbal Holland")).toBe("Herbal Holland");
  });
});

describe("saved views", () => {
  it("normalises query strings so equal filters compare equal", () => {
    expect(normaliseQuery("?status=OPEN&page=3&q=abc")).toBe("q=abc&status=OPEN");
    expect(normaliseQuery("q=abc&status=OPEN&m=saved")).toBe("q=abc&status=OPEN");
    expect(normaliseQuery("")).toBe("");
  });
  it("parses stored views defensively", () => {
    expect(parseViews(null)).toEqual([]);
    expect(parseViews("nonsense")).toEqual([]);
    expect(parseViews(JSON.stringify([{ name: "Low stock", query: "status=LOW&page=2", at: 5 }, { name: "", query: "x=1" }, 7]))).toEqual([{ name: "Low stock", query: "status=LOW", at: 5 }]);
  });
  it("replaces a view with the same name and caps the list", () => {
    let list = saveView([], { name: "Low stock", query: "?status=LOW", at: 1 });
    list = saveView(list, { name: "low STOCK", query: "status=LOW&cat=flower", at: 2 });
    expect(list).toEqual([{ name: "low STOCK", query: "cat=flower&status=LOW", at: 2 }]);
    for (let i = 0; i < 20; i++) list = saveView(list, { name: `v${i}`, query: `q=${i}`, at: i });
    expect(list.length).toBe(12);
    expect(saveView(list, { name: "   ", query: "q=1", at: 1 })).toBe(list);
    expect(viewsKey("u1", "store-orders")).toBe("hh.views.u1.store-orders");
  });
});

describe("recipient masking", () => {
  it("masks emails, mobiles and leaves other recipients readable", () => {
    expect(maskRecipient("thabo@example.com")).toBe("th•••@example.com");
    expect(maskRecipient("+27821234567")).toBe("+27 82 ••• 4567");
    expect(maskRecipient("0821234567")).toBe("08 21 ••• 4567");
    expect(maskRecipient("user:abc123")).toBe("user:abc123");
    expect(maskRecipient("merch partner")).toBe("merch partner");
  });
});

describe("palette keywords, record searches and store switching", () => {
  it("matches keywords without showing them", () => {
    const items = [
      { href: "/store/PTA01/banking", label: "Banking", group: "Money", keywords: "deposit slip cash bank", kind: "nav" as const },
      { href: "/store/PTA01/team", label: "Team", group: "People", keywords: "staff pin people add", kind: "nav" as const },
    ];
    expect(searchPalette(items, "deposit slip").map((i) => i.label)).toEqual(["Banking"]);
    expect(searchPalette(items, "pin").map((i) => i.label)).toEqual(["Team"]);
  });
  it("offers record searches per area", () => {
    expect(paletteSearches("  ", "hq")).toEqual([]);
    expect(paletteSearches("Mpho A", "hq").map((i) => i.href)).toEqual(["/hq/customers?q=Mpho%20A", "/hq/catalogue?q=Mpho%20A", "/hq/orders?q=Mpho%20A"]);
    expect(paletteSearches("HH01", "store", "PTA01").map((i) => i.href)).toEqual(["/store/PTA01/customers?q=HH01", "/store/PTA01/inventory?q=HH01", "/store/PTA01/orders?q=HH01"]);
  });
  it("switches store at the section level and keeps the date range", () => {
    expect(switchStorePath("/store/PTA01/orders/abc123", "?range=7d&q=x", "JHB02")).toBe("/store/JHB02/orders?range=7d");
    expect(switchStorePath("/store/PTA01", "", "JHB02")).toBe("/store/JHB02");
    expect(switchStorePath("/store/PTA01/inventory", "?from=2026-09-01&to=2026-09-30", "JHB02")).toBe("/store/JHB02/inventory?from=2026-09-01&to=2026-09-30");
  });
});
