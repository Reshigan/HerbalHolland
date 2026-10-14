// The six months' campaigns laid out exactly as the Studio lays them out (the same calendar tests/studio-calendar.test.ts
// holds to the limits), written as JSON for the plan page: every post with its day, time, channel, audience and words.
//   npx tsx scripts/plan-export.ts > plan.json
import { layout, longDate, spreadFeed, type Fields } from "@/lib/studio";
import { NEW_ONLINE_DAYS, PLAYBOOKS } from "@/lib/studio-playbooks";
import { dayKey } from "@/lib/format";

const TOWNS = ["Hillcrest", "Hilton"];
const CALENDAR: { key: string; anchor: string; town?: string; stagger?: number; skipShared?: boolean; until?: string }[] = [
  { key: "brand-launch", anchor: "2026-10-13", until: "2026-10-27" },
  { key: "shop-launch", anchor: "2026-10-27" },
  ...TOWNS.map((town, i) => ({ key: "store-opening", anchor: "2026-12-01", town, stagger: i * 7, skipShared: i > 0 })),
  { key: "hiring", anchor: "2026-10-30" },
  { key: "founding-members", anchor: "2026-12-06" },
  { key: "merch-drop", anchor: "2026-12-10" },
  ...PLAYBOOKS.filter((p) => p.date).map((p) => ({ key: p.key, anchor: p.date! })),
  ...NEW_ONLINE_DAYS.map((anchor) => ({ key: "new-online", anchor })),
];
const time = (d: Date) => new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
const busy = new Set<string>();
const posts = CALENDAR.flatMap((c) => {
  const pb = PLAYBOOKS.find((p) => p.key === c.key)!;
  const f: Fields = {
    date: longDate(c.anchor),
    ...(c.town && { store: `Herbal Holland ${c.town}`, town: c.town, towns: TOWNS.join(" and "), address: `[${c.town} store address]`, hours: "[store hours]" }),
    ...(pb.product && { product: "[the product]", facts: "[its pack size, CBD and allergens]", category: "[its category]", link: "shop.herbalholland.com/p/[product]" }),
  };
  const going = layout(pb, c.anchor, f, c.stagger).filter((d) => !(c.until && dayKey(d.at) >= c.until) && !(c.skipShared && d.shared));
  return spreadFeed(going, busy, dayKey).map((d) => ({
    campaign: pb.name + (c.town ? `: ${c.town}` : "") + (pb.key === "new-online" ? ` (${longDate(c.anchor)})` : ""),
    pack: pb.key, day: dayKey(d.at), time: time(d.at), channel: d.channel, title: d.title ?? null, text: d.text, short: d.short ?? null,
    audience: d.audience ?? (c.town ? `${c.town} members` : pb.product ? "Members who chose its interest" : d.channel === "EMAIL" || d.channel === "SMS" || d.channel === "PUSH" ? "All members" : null),
    linkedin: d.linkedin ?? null, brief: d.brief ?? null, card: d.card ?? null, pinned: !!d.pinned, note: d.moved ?? null,
  }));
});
const packs = PLAYBOOKS.map((p) => ({ key: p.key, name: p.name, blurb: p.blurb, anchor: p.anchor }));
process.stdout.write(JSON.stringify({ posts: posts.sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time)), packs }));
