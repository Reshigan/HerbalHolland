// The shop's fixed consumer copy passes the same copy screen as herbalholland.com's (tests/site-copy.test.ts): the home
// page's landraces and moods, the Rewards tier perks and the Learn guides (rendered, so every sentence is read). The
// landraces share their names with licensed medicines, so they say nothing about effects. A guide may name what it
// warns about; only the phrases in WARNINGS may, and each must still be in use.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { screenCopy } from "@/lib/compliance";
import { DEFAULT_TIER_SAVINGS, TIERS } from "@/lib/loyalty-rules";
import { LANDRACES, MOODS } from "@/components/shop/home-copy";
import { ARTICLES } from "@/components/shop/learn/articles";
import { ArticleBody } from "@/components/shop/learn/bodies";
import type { Settings } from "@/server/settings";

const loyalty = { earnPer100: 5, signupBonus: 25, referralBonus: 50, birthdayBonus: 100, tierSavingsPct: DEFAULT_TIER_SAVINGS, minRedeem: 20, maxRedeemPct: 50 };
const settings = { loyalty } as unknown as Settings;

/** An article's body as the reader sees it: the rendered page's text, tags and entities gone. */
const bodyText = (slug: string) =>
  renderToStaticMarkup(createElement(ArticleBody, { slug, settings }))
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const GUIDES: [string, string][] = ARTICLES.flatMap((a) => [
  [`learn/${a.slug}.title`, a.title],
  [`learn/${a.slug}.dek`, a.dek],
  [`learn/${a.slug}`, bodyText(a.slug)],
]);

// Safety warnings and legal explainers that have to name what they're about.
const WARNINGS = [
  "away from children", // keep products locked away from children (responsible use)
  "treat, cure or prevent", // what Schedule 0 CBD may not claim
  "South African Depression and Anxiety Group", // the support organisation's name (SADAG)
];

const COPY: [string, string][] = [
  ...LANDRACES.flatMap((l, i) => [[`LANDRACES[${i}].note`, l.note], [`LANDRACES[${i}].origin`, l.origin]] as [string, string][]),
  ...Object.entries(MOODS).flatMap(([k, m]) => [[`MOODS.${k}.label`, m.label], [`MOODS.${k}.line`, m.line]] as [string, string][]),
  ...TIERS.flatMap((t) => t.perks.map((p, i) => [`TIERS.${t.key}.perks[${i}]`, p] as [string, string])),
  ...GUIDES.map(([path, text]) => [path, WARNINGS.reduce((s, w) => s.replaceAll(w, "…"), text)] as [string, string]),
];

describe("shop copy", () => {
  it("renders every Learn guide, and the allowed warnings are all still in use", () => {
    for (const a of ARTICLES) expect(bodyText(a.slug).length, a.slug).toBeGreaterThan(400);
    const all = GUIDES.map(([, t]) => t).join(" ");
    for (const w of WARNINGS) expect(all, w).toContain(w);
  });

  it("passes screenCopy: no medical claims, conditions, intoxication, minors or absolute claims", () => {
    const flagged = COPY.flatMap(([path, text]) => screenCopy(text).map((f) => `${path}: "${f.term}" — ${f.reason}`));
    expect(flagged).toEqual([]);
  });

  it("keeps the voice: members, no 'high' talk or clichés, nothing 'proven'", () => {
    const RULES: [RegExp, string][] = [
      [/\b(customers?|shoppers?|clients?)\b/i, "say members"],
      [/\bhigh(er|est)?\b/i, "no 'high' language"],
      [/\b(weed|dagga|ganja|dank|stoner|munchies|4\/?20)\b/i, "no stoner clichés"],
      [/\b(proven|guarantee[sd]?)\b/i, "no performance claims"],
    ];
    const broken = COPY.flatMap(([path, text]) => RULES.filter(([re]) => re.test(text)).map(([re, why]) => `${path}: "${text.match(re)![0]}" — ${why}`));
    expect(broken).toEqual([]);
  });

  it("tells the landraces' story by origin and history, never effects (they're medicines' namesakes)", () => {
    const EFFECTS = /\b(sativa|indica|uplift\w*|energi[sz]\w*|relax\w*|sociable|heady|euphori\w*|sedat\w*|calming|buzz\w*|potent|clear-headed)\b/i;
    const heritage = GUIDES.find(([p]) => p === "learn/heritage-landraces")![1];
    const said = [...LANDRACES.map((l) => l.note), heritage].map((t) => t.match(EFFECTS)?.[0]).filter(Boolean);
    expect(said).toEqual([]);
  });
});
