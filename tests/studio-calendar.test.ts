// The next six months as HQ lays them out (docs/MARKETING-PLAN.md §9): the launch on its real days, both stores
// opening together, the month packs, and a product going online on the planned Tuesdays, each laid out the way
// createPlan does it, in that order (so the feed keeps to one post a day across campaigns). Then the limits, for the
// brand's channels and for any one member (counted as the member who'd get the most: every interest, either store).
import { describe, expect, it } from "vitest";
import { layout, longDate, spreadFeed, type Draft, type Fields } from "@/lib/studio";
import { NEW_ONLINE_DAYS, PLAYBOOKS } from "@/lib/studio-playbooks";
import { dayKey } from "@/lib/format";

const TOWNS = ["Hillcrest", "Hilton"];
const PRODUCT = { product: "Rest Body Balm", facts: "50 ml a pack, 300 mg CBD a pack.", category: "Skin care", link: "https://shop.herbalholland.com/p/rest-body-balm?src=studio" };
const OPENING_WEEKS = ["week of 2026-10-26", "week of 2026-11-30"];

type Plan = { key: string; anchor: string; town?: string; stagger?: number; skipShared?: boolean; until?: string };
const CALENDAR: Plan[] = [
  { key: "brand-launch", anchor: "2026-10-13", until: "2026-10-27" },
  { key: "shop-launch", anchor: "2026-10-27" },
  ...TOWNS.map((town, i) => ({ key: "store-opening", anchor: "2026-12-01", town, stagger: i * 7, skipShared: i > 0 })),
  { key: "hiring", anchor: "2026-10-30" },
  { key: "founding-members", anchor: "2026-12-06" },
  { key: "merch-drop", anchor: "2026-12-10" },
  ...PLAYBOOKS.filter((p) => p.date).map((p) => ({ key: p.key, anchor: p.date! })),
  ...NEW_ONLINE_DAYS.map((anchor) => ({ key: "new-online", anchor })),
];

type Out = Draft & { plan: string; to: string };
function lay(calendar = CALENDAR): Out[] {
  const busy = new Set<string>();
  return calendar.flatMap((c) => {
    const pb = PLAYBOOKS.find((p) => p.key === c.key)!;
    const f: Fields = {
      date: longDate(c.anchor),
      ...(c.town && { store: `Herbal Holland ${c.town}`, town: c.town, towns: TOWNS.join(" and "), address: `1 Main Road, ${c.town}`, hours: "Mon–Fri 09:00–18:00, Sat 09:00–14:00" }),
      ...(pb.product && PRODUCT),
    };
    const going = layout(pb, c.anchor, f, c.stagger).filter((d) => !(c.until && dayKey(d.at) >= c.until) && !(c.skipShared && d.shared));
    const plan = `${c.key}${c.town ? ` (${c.town})` : ""} @${c.anchor}`;
    // Who a members' message reaches: its audience, else the store's members (a store's campaign), else everyone.
    return spreadFeed(going, busy, dayKey).map((d) => ({ ...d, plan, to: d.audience ?? (c.town ? `store:${c.town}` : pb.product ? "interest:CBD" : "ALL") }));
  });
}

const week = (ymd: string) => {
  const x = new Date(`${ymd}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};
const tally = (items: Out[], key: (d: Out) => string) => {
  const m = new Map<string, string[]>();
  for (const d of items) m.set(key(d), [...(m.get(key(d)) ?? []), `${d.plan}: ${d.key}`]);
  return m;
};
const over = (m: Map<string, string[]>, max: number, what: string) => [...m].filter(([, v]) => v.length > max).map(([k, v]) => `${what} ${k}: ${v.length} (${v.join("; ")})`);

describe("the six months on their real days", () => {
  const all = lay();

  it("keeps product launches to the second and fourth Tuesdays, in order", () => {
    const nth = (ymd: string) => Math.ceil(Number(ymd.slice(8)) / 7);
    expect(NEW_ONLINE_DAYS.filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() !== 2 || ![2, 4].includes(nth(d)))).toEqual([]);
    expect([...NEW_ONLINE_DAYS].sort()).toEqual(NEW_ONLINE_DAYS);
  });

  it("lays every campaign out without a refused day or a clash it can't settle", () => {
    expect(all.filter((d) => d.blocked).map((d) => `${d.plan}: ${d.key}: ${d.blocked}`)).toEqual([]);
    expect(all.filter((d) => /Shares its day|Another campaign/.test(d.moved ?? "")).map((d) => `${d.plan}: ${d.key} @${dayKey(d.at)}: ${d.moved}`)).toEqual([]);
  });

  it("keeps the brand's feed to one post a day (or a pinned pair) and five a week (seven in an opening week), WhatsApp to one a week", () => {
    const feed = all.filter((d) => d.channel === "SOCIAL" && d.linkedin !== "only");
    const days = [...tally(feed, (d) => dayKey(d.at))].filter(([day, v]) => v.length > 1 && feed.some((d) => dayKey(d.at) === day && !d.pinned));
    expect(days.map(([day, v]) => `${day}: ${v.join(" + ")}`)).toEqual([]);
    // Five a week; seven in the week the shop opens and the week the doors open.
    const weeks = tally(feed, (d) => week(dayKey(d.at)));
    expect([...over(weeks, 5, "feed, week of").filter((w) => !OPENING_WEEKS.some((o) => w.includes(o))), ...over(weeks, 7, "feed, week of")]).toEqual([]);
    expect(over(tally(all.filter((d) => d.channel === "WHATSAPP"), (d) => week(dayKey(d.at))), 1, "WhatsApp, week of")).toEqual([]);
  });

  it("sends any one member at most one email a day, two a week and four a month; two pushes a week; two texts a month", () => {
    const problems = TOWNS.flatMap((town) => {
      const mine = all.filter((d) => d.to !== "early-access" && (!d.to.startsWith("store:") || d.to === `store:${town}`));
      const of = (ch: string) => mine.filter((d) => d.channel === ch);
      return [
        ...over(tally(of("EMAIL"), (d) => dayKey(d.at)), 1, `${town} email, day`),
        ...over(tally(of("EMAIL"), (d) => week(dayKey(d.at))), 2, `${town} email, week of`),
        ...over(tally(of("EMAIL"), (d) => dayKey(d.at).slice(0, 7)), 4, `${town} email, month`),
        ...over(tally(of("PUSH"), (d) => week(dayKey(d.at))), 2, `${town} push, week of`),
        ...over(tally(of("SMS"), (d) => dayKey(d.at).slice(0, 7)), 2, `${town} SMS, month`),
      ];
    });
    expect(problems).toEqual([]);
  });
});

// The Founding Members social drive (launch-social.ts) is a second track for the same six weeks, built to fill the
// list: laid out for both towns on its own feed (HQ runs it in place of, or with, the launch packs' feed posts, and
// the Studio moves what clashes), it keeps to one post a day and five a week, with three Reels a week and the
// milestones placed by hand.
describe("the Founding Members social drive, both towns, the list's six weeks", () => {
  const all = lay(TOWNS.map((town, i) => ({ key: "founding-social", anchor: "2026-12-06", town, stagger: i * 7, skipShared: i > 0 })));
  const feed = all.filter((d) => d.channel === "SOCIAL");
  const reel = (d: Out) => d.title?.startsWith("[Reel/TikTok]") ?? false;

  it("lays out without a refused day or a clash, from the day the list opens to the night it closes", () => {
    expect(all.filter((d) => d.blocked || /Shares its day|Another campaign/.test(d.moved ?? "")).map((d) => `${d.plan}: ${d.key}: ${d.blocked ?? d.moved}`)).toEqual([]);
    const days = feed.map((d) => dayKey(d.at)).sort();
    expect([days[0], days.at(-1)]).toEqual(["2026-10-27", "2026-12-06"]);
    expect(all.every((d) => d.channel === "SOCIAL")).toBe(true);
  });

  it("keeps to one post a day and five a week, three of them Reels, with the four milestones marked for posting by hand", () => {
    expect(over(tally(feed, (d) => dayKey(d.at)), 1, "feed, day")).toEqual([]);
    const weeks = tally(feed, (d) => week(dayKey(d.at)));
    expect(over(weeks, 5, "feed, week of")).toEqual([]);
    expect([...weeks].map(([w, v]) => [w, v.length]), "five a week, every week").toEqual(expect.arrayContaining([["2026-10-26", 5], ["2026-11-30", 5]]));
    expect(over(tally(feed.filter(reel), (d) => week(dayKey(d.at))), 3, "Reels, week of")).toEqual([]);
    expect([...tally(feed.filter(reel), (d) => week(dayKey(d.at)))].every(([, v]) => v.length === 3)).toBe(true);
    expect(feed.filter((d) => d.milestone).map((d) => d.milestone)).toEqual([500, 1000, 1500, 2026]);
    expect(feed.length).toBe(30);
  });

  it("gives each town its own Fridays, Hilton's a week after Hillcrest's", () => {
    const own = feed.filter((d) => !d.shared);
    expect(own.map((d) => `${d.plan.split(" ")[1]} ${d.key} ${dayKey(d.at)}`)).toEqual([
      "(Hillcrest) town-hello 2026-10-30", "(Hillcrest) town-advisors 2026-11-13", "(Hillcrest) town-windows 2026-11-27",
      "(Hilton) town-hello 2026-11-06", "(Hilton) town-advisors 2026-11-20", "(Hilton) town-windows 2026-12-04",
    ]);
  });
});
