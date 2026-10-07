// Every string on herbalholland.com passes the platform's copy screen, the same one that guards campaigns and product
// claims (ARB Code, Medicines Act s20), with no allow-list: rephrase whatever it flags. Plus the site's own voice rules.
import { describe, expect, it } from "vitest";
import * as content from "../sites/herbalholland.com/content";
import { PRESS, fill, plural, releasesOn, shopOpenClaim } from "../sites/herbalholland.com/content";
import { FACTS } from "../sites/herbalholland.com/facts";
import { screenCopy } from "@/lib/compliance";

/** Every string in the module, with where it lives ("PRESS.releases.items[0].title"). */
function strings(value: unknown, path: string, out: [string, string][] = []) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out);
  return out;
}
const ALL = strings(content, "");

describe("site copy", () => {
  it("covers every page's copy", () => {
    for (const page of ["HOME", "ABOUT", "STORES", "PRESS", "CAREERS", "CONTACT"]) expect(ALL.some(([p]) => p.startsWith(`${page}.`)), page).toBe(true);
    expect(ALL.length).toBeGreaterThan(250);
  });

  it("the screen still catches what it should, so a clean pass means something", () => {
    for (const bad of ["Guaranteed returns", "It may treat pain", "Helps prevent colds", "Great for kids", "Near the school", "Student deals", "Eases anxiety", "Get high tonight"])
      expect(screenCopy(bad), bad).not.toEqual([]);
  });

  it("passes screenCopy: no medical claims, conditions, intoxication, minors or absolute claims", () => {
    const flagged = ALL.flatMap(([path, text]) => screenCopy(text).map((f) => `${path}: "${f.term}" (${f.reason})`));
    expect(flagged).toEqual([]);
  });

  it("keeps the voice: members, no 'high' talk or clichés, no prices or deals, nothing 'proven'", () => {
    const RULES: [RegExp, string][] = [
      [/\b(customers?|shoppers?|clients?)\b/i, "say members"],
      [/\bhigh(er|est)?\b/i, "no 'high' language"],
      [/\b(weed|dagga|ganja|dank|stoner|munchies|4\/?20)\b/i, "no stoner clichés"],
      // (A statute's name isn't a deal: the PAIA manual cites the Promotion of Access to Information Act.)
      [/\bR ?\d|%|\b(deals?|specials?|promo(tion)?s?(?! of access to information)|coupons?|vouchers?|bargains?)\b/i, "no prices or deals on .com"],
      [/\b(proven|projected returns?|return on investment)\b/i, "no earnings or performance claims"],
    ];
    const broken = ALL.flatMap(([path, text]) => RULES.filter(([re]) => re.test(text)).map(([re, why]) => `${path}: "${text.match(re)![0]}" (${why})`));
    expect(broken).toEqual([]);
  });
});

describe("site copy helpers", () => {
  it("fills placeholders and plurals", () => {
    expect(fill("The first {cap} members, until {closes}", { cap: "2,026", closes: "6 Dec 2026" })).toBe("The first 2,026 members, until 6 Dec 2026");
    expect(fill("Keeps {unknown}", {})).toBe("Keeps {unknown}");
    expect([plural(1, ["{n} store", "{n} stores"]), plural(1200, ["{n} store", "{n} stores"])]).toEqual(["1 store", "1,200 stores"]);
  });

  it("shows a press release from its date (SAST) on, newest first, and never a draft (no date)", () => {
    const all = releasesOn("2099-12-31");
    expect(all.map((r) => r.date)).toEqual([...all.map((r) => r.date)].sort().reverse());
    for (const r of all) {
      expect(r.date, r.title).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const before = new Date(Date.parse(`${r.date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      expect(releasesOn(r.date).map((x) => x.slug), r.slug).toContain(r.slug);
      expect(releasesOn(before).map((x) => x.slug), r.slug).not.toContain(r.slug);
    }
    const drafts = PRESS.releases.items.filter((r) => r.date == null).map((r) => r.slug);
    for (const slug of drafts) expect(all.some((r) => r.slug === slug), slug).toBe(false);
  });

  it("never publishes a release saying the online shop is open before it is (the build checks the same)", () => {
    for (const said of ["Herbal Holland's online shop opens nationwide today.", "Shop online today.", "Delivering online orders nationwide."]) expect(shopOpenClaim(said), said).not.toBeNull();
    for (const fine of ["The online shop opens soon.", "Two new stores open on Tuesday 1 December 2026.", "Joining Herbal Holland Rewards is free."]) expect(shopOpenClaim(fine), fine).toBeNull();
    if (FACTS.shop.url) return;
    const live = releasesOn("2099-12-31").flatMap((r) => [r.title, r.pageTitle, r.description, r.summary, ...r.body].map(shopOpenClaim).filter(Boolean).map((s) => `${r.slug}: ${s}`));
    expect(live).toEqual([]);
  });
});
