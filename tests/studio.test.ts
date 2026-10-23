import { describe, expect, it } from "vitest";
import { fill, firstDayT, layout, longDate, screenDraft, spreadFeed, type Fields, type Playbook } from "@/lib/studio";
import { marketingWindow } from "@/lib/sa";
import { PLAYBOOKS } from "@/lib/studio-playbooks";
import { captionFor, screenSocial, SOCIAL_IMAGES } from "@/lib/social";

const F: Fields = {
  store: "Herbal Holland Hillcrest",
  town: "Hillcrest",
  address: "Shop 4, Hillcrest Corner, Old Main Road, Hillcrest",
  hours: "Mon–Fri 09:00–19:00, Sat 09:00–17:00, Sun 10:00–14:00",
  date: "Tuesday 1 December",
};

const pb = (items: Playbook["items"]): Playbook => ({ key: "t", name: "T", blurb: "", store: false, anchor: "Day T", items });

describe("layout", () => {
  it("puts each item on its day and time in South African time, in order", () => {
    const out = layout(pb([
      { key: "b", day: 1, time: "09:30", channel: "SOCIAL", text: "Two", card: { template: "headline", headline: "Two" } },
      { key: "a", day: -2, time: "18:00", channel: "SOCIAL", text: "One", card: { template: "headline", headline: "One" } },
    ]), "2026-11-10", F);
    expect(out.map((d) => [d.key, d.at.toISOString()])).toEqual([
      ["a", "2026-11-08T16:00:00.000Z"],
      ["b", "2026-11-11T07:30:00.000Z"],
    ]);
  });

  it("moves anything off a public holiday, and members' own channels off Sundays", () => {
    const out = layout(pb([
      { key: "election", day: 0, time: "10:00", channel: "SOCIAL", text: "x", card: { template: "headline", headline: "x" } },
      { key: "sunday-sms", day: 4, time: "10:00", channel: "SMS", text: "Hi" },
      { key: "sunday-post", day: 4, time: "10:00", channel: "SOCIAL", text: "x", card: { template: "headline", headline: "x" } },
    ]), "2026-11-04", F); // Wed 4 Nov 2026: local government elections; Sun 8 Nov
    const at = Object.fromEntries(out.map((d) => [d.key, d]));
    expect(at.election.at.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(at.election.moved).toMatch(/elections/);
    expect(at["sunday-sms"].at.toISOString().slice(0, 10)).toBe("2026-11-09");
    expect(at["sunday-post"].at.toISOString().slice(0, 10)).toBe("2026-11-08");
  });

  it("fills the store's fields and day T, and leaves a campaign's own {{tokens}} alone", () => {
    expect(fill("Hi {{firstName}}, {store} opens {date} at {address}.", F)).toBe(`Hi {{firstName}}, Herbal Holland Hillcrest opens Tuesday 1 December at ${F.address}.`);
    expect(longDate("2026-12-01")).toBe("Tuesday 1 December");
  });

  it("never moves a pinned post: a day it can't go out on refuses day T instead", () => {
    const out = layout(pb([{ key: "tomorrow", day: -1, time: "10:00", channel: "SMS", text: "See you tomorrow.", pinned: true }]), "2026-11-02", F); // Sunday 1 November
    expect(out[0].blocked).toMatch(/Sunday/);
    expect(out[0].at.toISOString().slice(0, 10)).toBe("2026-11-01");
  });

  it("moves a second town's own feed posts a week later, off holidays; pinned posts and members' messages stay", () => {
    const card = { template: "headline" as const, headline: "x" };
    const out = layout(pb([
      { key: "own", day: 0, time: "19:00", channel: "SOCIAL", text: "Ours", card },
      { key: "today", day: 0, time: "07:00", channel: "SOCIAL", text: "Today", card, pinned: true },
      { key: "sms", day: 0, time: "10:00", channel: "SMS", text: "Hi" },
    ]), "2026-12-09", F, 7); // a week later is 16 December
    const at = Object.fromEntries(out.map((d) => [d.key, [d.at.toISOString().slice(0, 10), d.moved ?? ""]]));
    expect(at).toEqual({ own: ["2026-12-17", "Moved from Day of Reconciliation"], today: ["2026-12-09", ""], sms: ["2026-12-09", ""] });
  });

  it("keeps the feed to one post a day: a second post moves to the next free day; pinned and LinkedIn-only posts stay", () => {
    const d = (key: string, iso: string, more?: { pinned?: true; linkedin?: "only" }) => ({ key, channel: "SOCIAL" as const, text: key, at: new Date(iso), ...more });
    const ymd = (x: Date) => x.toISOString().slice(0, 10);
    const out = spreadFeed(
      [d("a", "2026-11-10T05:00:00Z"), d("li", "2026-11-10T10:00:00Z", { linkedin: "only" }), d("b", "2026-11-10T17:00:00Z"), d("e", "2026-11-11T05:00:00Z", { pinned: true }), d("c", "2026-11-12T05:00:00Z", { pinned: true })],
      new Set(["2026-11-11"]), // another campaign's post
      ymd,
    );
    expect(out.map((x) => [x.key, ymd(x.at), x.moved ?? ""])).toEqual([
      ["a", "2026-11-10", ""],
      ["li", "2026-11-10", ""],
      ["b", "2026-11-13", "Moved so the feed gets one post a day"], // the 11th is taken, and the 12th is pinned
      ["e", "2026-11-11", "Another campaign posts that day: move its post"],
      ["c", "2026-11-12", ""],
    ]);
  });
});

describe("screenDraft", () => {
  const card = { template: "headline" as const, headline: "Holland, meet the Hills." };
  it("blocks unfilled fields but not a campaign's tokens", () => {
    expect(screenDraft({ channel: "SOCIAL", text: "Opening at {address}.", card }).map((f) => f.term)).toContain("{address}");
    expect(screenDraft({ channel: "SMS", text: "Hi {{firstName}}, you have {{points}} points." })).toEqual([]);
  });
  it("keeps WhatsApp and Google to brand, store and event news", () => {
    expect(screenDraft({ channel: "WHATSAPP", text: "New CBD range in store this week." }).map((f) => f.term)).toContain("CBD");
    expect(screenDraft({ channel: "GOOGLE", text: "20% off this Friday." }).map((f) => f.term)).toEqual(expect.arrayContaining(["20% off"]));
    expect(screenDraft({ channel: "WHATSAPP", text: "Sawubona! Our Hillcrest doors open on Tuesday at 09:00. Adults 18+." })).toEqual([]);
  });
  it("asks for a short version, a card, a push title and an email subject", () => {
    const terms = (d: Parameters<typeof screenDraft>[0]) => screenDraft(d).map((f) => f.term);
    expect(terms({ channel: "SOCIAL", text: "x".repeat(300), card })).toContain("short version");
    expect(terms({ channel: "SOCIAL", text: "A short caption." })).toContain("card");
    expect(terms({ channel: "PUSH", text: "Open the app." })).toContain("title");
    expect(terms({ channel: "EMAIL", text: "Hello." })).toContain("subject");
    expect(terms({ channel: "SOCIAL", text: "Hi", card: { template: "headline", headline: "x".repeat(61) } })).toContain("card headline");
  });
  it("flags a public holiday", () => {
    expect(screenDraft({ channel: "SOCIAL", text: "Hi", card, at: new Date("2026-12-16T08:00:00Z") }).map((f) => f.reason).join()).toMatch(/Day of Reconciliation/);
  });
});

describe("screenSocial: the marketing plan's rules", () => {
  it("blocks cannabis hashtags, 4/20 and leaf or smoke emoji", () => {
    expect(screenSocial("New in the hills #cbd").map((f) => f.term)).toContain("#cbd");
    expect(screenSocial("Happy 4/20 everyone").map((f) => f.term)).toContain("4/20");
    expect(screenSocial("Fresh air 🌿").map((f) => f.term)).toContain("🌿");
    expect(screenSocial("Call us on 031 420 1234. #HerbalHolland #HollandMeetsTheHills")).toEqual([]);
    expect(screenSocial("Hi #a #b #c #d #e #f").map((f) => f.reason)).toContain("Instagram takes 5 hashtags at most");
  });
});

describe("captionFor", () => {
  it("sends the short version where the caption is too long for the network", () => {
    const long = "x".repeat(400);
    expect(["instagram", "bluesky", "telegram"].map((n) => captionFor(n, long, "Short."))).toEqual([long, "Short.", long]);
    expect(captionFor("bluesky", long)).toBe(long);
  });
});

describe("the playbooks", () => {
  const keys = PLAYBOOKS.map((p) => p.key);
  it("has the launch campaigns, each with unique item keys", () => {
    expect(keys).toEqual(expect.arrayContaining(["brand-launch", "shop-launch", "store-opening", "founding-members", "hiring", "merch-drop"]));
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of PLAYBOOKS) expect(new Set(p.items.map((i) => i.key)).size, p.key).toBe(p.items.length);
  });

  // Day T for each playbook: its own date, or the next six days T it can start on from 2 November 2026 (across a
  // month end, past the holidays).
  const anchorsOf = (p: Playbook) => {
    if (p.date) return [p.date];
    const next = (ymd: string) => new Date(Date.parse(`${ymd}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const out = [firstDayT(p, "2026-11-02")];
    while (out.length < 6) out.push(firstDayT(p, next(out.at(-1)!)));
    return out;
  };
  const PRODUCT = { product: "Rest Body Balm", facts: "50 ml a pack, 300 mg CBD a pack.", category: "Skin care", link: "https://shop.herbalholland.com/p/rest-body-balm?src=studio" };
  const fieldsFor = (p: Playbook, anchor: string): Fields => ({ ...(p.store && { ...F, towns: "Hillcrest and Hilton" }), ...(p.product && PRODUCT), date: longDate(anchor) });
  const sast = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(d);
  const dow = (d: Date) => new Date(`${sast(d)}T12:00:00Z`).getUTCDay();
  const hhmm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit" }).format(d);
  const words = (i: Playbook["items"][number]) => [i.title, i.text, i.short, i.card?.eyebrow, i.card?.headline, i.card?.sub, ...(i.card?.lines ?? [])].filter(Boolean).join("\n");
  // The research-led slots (docs/MARKETING-PLAN.md §8): weekday feed at 07:00 or 19:00 (12:00 for "tonight"),
  // Saturdays 07:30 or 09:00, Sundays 08:00 or 18:30; LinkedIn-only at 12:00 on a weekday.
  const FEED: Record<number, string[]> = { 0: ["08:00", "18:30"], 6: ["07:30", "09:00"] };
  const feedSlots = (day: number, i: Playbook["items"][number]) => (i.linkedin === "only" ? ["12:00"] : FEED[day] ?? ["07:00", "12:00", "19:00"]);
  const SLOTS: Partial<Record<string, string[]>> = { WHATSAPP: ["09:30", "12:30"], GOOGLE: ["08:00", "08:30", "09:00"], EMAIL: ["09:05", "16:00"], SMS: ["09:00", "10:00"], PUSH: ["09:00", "11:00", "18:30"] };

  for (const p of PLAYBOOKS)
    describe(p.key, () => {
      it("starts on its weekday or its own date", () => {
        expect(p.weekday !== undefined || !!p.date, `${p.key}: give it a weekday (or a date)`).toBe(true);
      });

      it("passes every screen once laid out (no field left, no rule broken), and nothing lands on a holiday", () => {
        const problems: string[] = [];
        for (const anchor of anchorsOf(p))
          for (const d of layout(p, anchor, fieldsFor(p, anchor))) {
            for (const f of screenDraft(d)) problems.push(`${d.key} @${anchor}: "${f.term}" (${f.reason})`);
            if (d.blocked) problems.push(`${d.key} @${anchor}: ${d.blocked}`);
          }
        expect(problems).toEqual([]);
      });

      it("keeps the house rules: no pharmacy, franchise, stroopwafels, 'members first', exclamation marks or emoji; three hashtags at most", () => {
        const problems: string[] = [];
        for (const i of p.items) {
          const w = words(i);
          const bad = w.match(/pharmac|franchis|stroopwafel|members first|!|\p{Extended_Pictographic}/iu);
          if (bad) problems.push(`${i.key}: "${bad[0]}"`);
          if ((i.text.match(/#\w+/g) ?? []).length > 3) problems.push(`${i.key}: more than three hashtags`);
          if (/\b(today|tonight|tomorrow|last call|last day|\d+ days? to go)\b/i.test(w) && !i.pinned) problems.push(`${i.key}: names its day, so pin it`);
          if (i.card?.image && !SOCIAL_IMAGES.some((x) => x.key === i.card!.image)) problems.push(`${i.key}: no picture "${i.card.image}"`);
          if (!p.store && /\{(store|town|towns|address|hours)\}/.test(JSON.stringify(i))) problems.push(`${i.key}: a store field in a network campaign`);
          if (!p.product && /\{(product|facts|category|link)\}/.test(JSON.stringify(i))) problems.push(`${i.key}: a product field in a campaign without a product`);
        }
        expect(problems).toEqual([]);
      });

      it("posts in the slots, inside the legal hours, one feed post a day, five a week, two pushes a week and two texts a month", () => {
        const problems: string[] = [];
        for (const anchor of anchorsOf(p)) {
          // As the Studio lays it out: the feed spread to one post a day.
          const drafts = spreadFeed(layout(p, anchor, fieldsFor(p, anchor)).filter((d) => !d.blocked), new Set(), sast);
          const days = new Map<string, string[]>();
          const count = new Map<string, number>();
          const bump = (k: string) => count.set(k, (count.get(k) ?? 0) + 1);
          for (const d of drafts) {
            const item = p.items.find((i) => i.key === d.key)!;
            const slots = d.channel === "SOCIAL" ? feedSlots(dow(d.at), item) : SLOTS[d.channel];
            if (d.moved?.startsWith("Shares its day")) problems.push(`${d.key} @${anchor}: ${d.moved}`);
            if (slots && !d.moved && !slots.includes(hhmm(d.at))) problems.push(`${d.key} @${anchor}: ${hhmm(d.at)} on a ${longDate(sast(d.at)).split(" ")[0]} isn't a ${d.channel} slot (${slots.join(", ")})`);
            if (["EMAIL", "SMS", "PUSH"].includes(d.channel) && !marketingWindow(d.at).allowed) problems.push(`${d.key} @${anchor}: outside the legal hours (${marketingWindow(d.at).reason})`);
            const week = (() => { const x = new Date(`${sast(d.at)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); })();
            if (d.channel === "SOCIAL" && item.linkedin !== "only") {
              days.set(sast(d.at), [...(days.get(sast(d.at)) ?? []), `${d.key}${item.pinned ? "*" : ""}`]);
              bump(`feed ${week}`);
            }
            if (d.channel === "PUSH") bump(`push ${week}`);
            if (d.channel === "SMS") bump(`sms ${sast(d.at).slice(0, 7)}`);
          }
          for (const [day, ks] of days) if (ks.length > 1 && ks.some((k) => !k.endsWith("*"))) problems.push(`@${anchor} ${day}: ${ks.join(" + ")} (one feed post a day; only pinned posts may share)`);
          for (const [k, n] of count) if ((k.startsWith("feed") && n > 5) || (k.startsWith("push") && n > 2) || (k.startsWith("sms") && n > 2)) problems.push(`@${anchor} ${k}: ${n}`);
        }
        expect(problems).toEqual([]);
      });
    });
});
