import { describe, expect, it } from "vitest";
import { fill, layout, longDate, screenDraft, type Fields, type Playbook } from "@/lib/studio";
import { PLAYBOOKS } from "@/lib/studio-playbooks";
import { postizPost, screenSocial, SOCIAL_IMAGES } from "@/lib/social";

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

describe("postizPost", () => {
  it("sends the short version where the caption is too long for the network", () => {
    const long = "x".repeat(400);
    const body = postizPost({
      mode: "schedule", at: new Date("2026-11-01T08:00:00Z"), content: long, short: "Short.", image: { id: "i", path: "https://p/i.jpg" },
      channels: [{ id: "1", name: "hh", identifier: "instagram" }, { id: "2", name: "hh", identifier: "bluesky" }, { id: "3", name: "hh", identifier: "telegram" }],
    });
    expect(body.posts.map((p) => [p.settings.__type, p.value[0].content])).toEqual([["instagram", long], ["bluesky", "Short."], ["telegram", long]]);
  });
});

describe("the playbooks", () => {
  const keys = PLAYBOOKS.map((p) => p.key);
  it("has the launch campaigns, each with unique item keys", () => {
    expect(keys).toEqual(expect.arrayContaining(["brand-launch", "shop-launch", "store-opening", "founding-members", "hiring", "merch-drop"]));
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of PLAYBOOKS) expect(new Set(p.items.map((i) => i.key)).size, p.key).toBe(p.items.length);
  });

  it("passes every screen once laid out for a store (no field left, no rule broken, nothing on a holiday)", () => {
    const problems: string[] = [];
    for (const p of PLAYBOOKS) {
      for (const anchor of ["2026-12-01", "2026-11-02", "2027-03-15"]) {
        for (const d of layout(p, anchor, { ...F, date: longDate(anchor) })) {
          for (const f of screenDraft(d)) problems.push(`${p.key}/${d.key} @${anchor}: "${f.term}" (${f.reason})`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("keeps own channels inside the CPA windows and uses only real pictures", () => {
    const images = new Set(SOCIAL_IMAGES.map((i) => i.key));
    for (const p of PLAYBOOKS)
      for (const i of p.items) {
        const [h, m] = i.time.split(":").map(Number);
        const minutes = h * 60 + m;
        if (["EMAIL", "SMS", "PUSH"].includes(i.channel)) expect(minutes >= 9 * 60 && minutes < 13 * 60, `${p.key}/${i.key} ${i.time}: 09:00–13:00 fits every day it may land on`).toBe(true);
        if (i.card?.image) expect(images.has(i.card.image), `${p.key}/${i.key}`).toBe(true);
        if (!p.store) expect(JSON.stringify(i), `${p.key}/${i.key} uses a store field in a network campaign`).not.toMatch(/\{(store|town|address|hours)\}/);
      }
  });
});
