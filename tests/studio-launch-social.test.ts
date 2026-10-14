// The Founding Members social drive (src/lib/studio-playbooks/launch-social.ts): six weeks of social built to fill the
// list, held to the platforms' rules (no product, price, consumption or health words anywhere: Meta and TikTok remove
// cannabis and CBD promotion) and to its own shape: one feed post a day, five a week, three Reels a week with their
// scripts, the milestones by hand, Hillcrest and Hilton a week apart.
import { describe, expect, it } from "vitest";
import { layout, longDate, screenDraft, spreadFeed, type Draft, type Fields, type PlaybookItem } from "@/lib/studio";
import { LAUNCH_SOCIAL_HASHTAGS, LAUNCH_SOCIAL_STORIES, LAUNCH_SOCIAL_TIMES, PLAYBOOKS } from "@/lib/studio-playbooks";
import { screenCopy } from "@/lib/compliance";
import { screenSocial } from "@/lib/social";
import { dayKey } from "@/lib/format";

const pb = PLAYBOOKS.find((p) => p.key === "founding-social")!;
const TOWNS = ["Hillcrest", "Hilton"];
const CLOSE = "2026-12-06"; // the list closes at midnight on the Sunday after opening week
const isVideo = (i: PlaybookItem) => i.title?.startsWith("[Reel/TikTok]") ?? false;
const lines = (i: PlaybookItem) => [i.title, i.text, i.short, i.card?.eyebrow, i.card?.headline, i.card?.sub, ...(i.card?.lines ?? []), i.brief].filter((x): x is string => !!x);

const week = (ymd: string) => {
  const x = new Date(`${ymd}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};

/** Both towns, as HQ lays the pack out: Hillcrest first, Hilton's own posts a week later, the shared posts once. */
function bothTowns(): (Draft & { town: string })[] {
  const busy = new Set<string>();
  return TOWNS.flatMap((town, i) => {
    const f: Fields = { date: longDate(CLOSE), store: `Herbal Holland ${town}`, town, towns: TOWNS.join(" and "), address: `1 Main Road, ${town}`, hours: "Mon–Fri 09:00–18:00" };
    const going = layout(pb, CLOSE, f, i * 7).filter((d) => !(i > 0 && d.shared));
    return spreadFeed(going, busy, dayKey).map((d) => ({ ...d, town }));
  }).sort((a, b) => a.at.getTime() - b.at.getTime());
}

describe("the Founding Members social drive", () => {
  it("is a six-week, social-only store pack that ends the night the list closes", () => {
    expect(pb.store).toBe(true);
    expect(pb.weekday).toBe(0);
    expect(pb.items.every((i) => i.channel === "SOCIAL")).toBe(true);
    expect(Math.min(...pb.items.map((i) => i.day))).toBe(-40); // the Tuesday the list opens with the online shop
    expect(Math.max(...pb.items.map((i) => i.day))).toBe(0);
    expect(pb.items.length).toBe(27);
  });

  it("has fifteen Reels, each with its script: the hook line, three beats and the end card", () => {
    const videos = pb.items.filter(isVideo);
    expect(videos.length).toBe(15);
    for (const v of videos) {
      expect(v.brief, v.key).toMatch(/^Reel\/TikTok/);
      for (const part of ["Hook", "Beat 1", "Beat 2", "Beat 3", "End card"]) expect(v.brief, `${v.key}: ${part}`).toContain(part);
    }
    expect(pb.items.filter((i) => !isVideo(i)).every((i) => i.card && ["headline", "reveal", "countdown", "promise"].includes(i.card.template))).toBe(true);
  });

  it("marks the four milestones to post by hand when the list gets there, and the layout carries the flag", () => {
    const ms = pb.items.filter((i) => i.milestone);
    expect(ms.map((i) => i.milestone)).toEqual([500, 1000, 1500, 2026]);
    for (const m of ms) {
      expect(m.brief, m.key).toMatch(/by hand/);
      expect(m.text, m.key).toContain(m.milestone!.toLocaleString("en-US"));
      expect(m.pinned, `${m.key}: a milestone has no fixed day`).toBeUndefined();
    }
    const laid = layout(pb, CLOSE, { date: longDate(CLOSE), town: "Hillcrest", towns: "Hillcrest and Hilton" });
    expect(laid.filter((d) => d.milestone).map((d) => d.milestone)).toEqual([500, 1000, 1500, 2026]);
  });

  it("runs the sequence: the number, then proof, the mechanism, urgency and social proof", () => {
    const at = (key: string) => pb.items.find((i) => i.key === key)!.day;
    expect(pb.items[0].key).toBe("hook");
    expect(pb.items[0].card?.headline).toBe("2,026");
    expect(at("lab-tested")).toBeGreaterThan(at("hook"));
    expect(at("twenty-seconds")).toBeGreaterThan(at("the-people"));
    expect(at("closing-date")).toBeGreaterThan(at("move-up-250"));
    expect(at("milestone-2026")).toBeGreaterThan(at("two-weeks"));
    expect(pb.items.filter((i) => /\b250 places\b/.test(i.text)).length).toBeGreaterThanOrEqual(8);
    expect(pb.items.filter((i) => /20 seconds/.test(i.text)).length).toBeGreaterThanOrEqual(24); // the full list's thank-you says only 'join free'
  });

  it("says nothing Meta or TikTok would remove: every line, brief and Story passes screenCopy and screenSocial, with no product, price or consumption words", () => {
    const BANNED = /\b(cbd|thc|cannabis|marijuana|weed|dagga|hemp|strains?|pre-?rolls?|joints?|edibles?|gummies|tinctures?|oils?|vapes?|hash|smok(e|ing)|vap(e|ing)|dispensar(y|ies)|medicines?|medical|dose|mg|R ?\d+|\d+ ?%|price|special|discount|sale|promo|buy|in stock)\b/i;
    const problems: string[] = [];
    const check = (where: string, text: string) => {
      for (const f of [...screenCopy(text), ...screenSocial(text)]) problems.push(`${where}: "${f.term}" (${f.reason})`);
      const b = text.match(BANNED);
      if (b) problems.push(`${where}: "${b[0]}"`);
      if (/!|\p{Extended_Pictographic}/u.test(text)) problems.push(`${where}: an exclamation mark or emoji`);
    };
    for (const i of pb.items) for (const l of lines(i)) check(i.key, l);
    LAUNCH_SOCIAL_STORIES.forEach((s, n) => check(`story ${n + 1}`, s));
    for (const [net, tags] of Object.entries(LAUNCH_SOCIAL_HASHTAGS)) check(`hashtags ${net}`, tags.join(" "));
    expect(problems).toEqual([]);
    for (const i of pb.items) expect(i.text, i.key).toMatch(/Adults 18\+/);
  });

  it("keeps the South African texture light: a greeting here and there, the hills and the summer", () => {
    const all = pb.items.map((i) => i.text).join("\n");
    const greetings = all.match(/\b(sawubona|howzit)\b/gi) ?? [];
    expect(greetings.length).toBeGreaterThanOrEqual(2);
    expect(greetings.length).toBeLessThanOrEqual(6);
    for (const place of [/Upper Highway/, /Midlands/, /Thousand Hills/, /KwaZulu-Natal/, /summer/i, /windmill/i]) expect(all).toMatch(place);
    expect(all).not.toMatch(/\b(ships?|flags?|settlers?|colonial)\b/i); // no colonial imagery (membership is fine)
  });

  it("gives hashtag sets per network: Instagram five, TikTok five at most, Facebook none, no cannabis tags", () => {
    expect(LAUNCH_SOCIAL_HASHTAGS.instagram.length).toBeLessThanOrEqual(8);
    expect(screenSocial(LAUNCH_SOCIAL_HASHTAGS.instagram.join(" "))).toEqual([]); // which holds it to five
    expect(LAUNCH_SOCIAL_HASHTAGS.tiktok.length).toBeLessThanOrEqual(5);
    expect(LAUNCH_SOCIAL_HASHTAGS.facebook).toEqual([]);
    for (const tags of [LAUNCH_SOCIAL_HASHTAGS.instagram, LAUNCH_SOCIAL_HASHTAGS.tiktok]) {
      expect(tags).toContain("#HerbalHolland");
      expect(tags.every((t) => /^#[A-Za-z]+$/.test(t))).toBe(true);
    }
    for (const i of pb.items) expect((i.text.match(/#\w+/g) ?? []).length, i.key).toBeLessThanOrEqual(3);
  });

  it("posts at the South African times: 07:00, 12:00 or 19:00 on weekdays, 09:00 on Saturdays, 08:00 or 18:30 on Sundays", () => {
    const T = LAUNCH_SOCIAL_TIMES;
    for (const i of pb.items) {
      const dow = ((i.day % 7) + 7) % 7; // day T is a Sunday
      const slots = dow === 0 ? [T.sunday, T.sundayEvening] : dow === 6 ? [T.saturday] : [T.morning, T.midday, T.evening];
      expect(slots, `${i.key} on day ${i.day}`).toContain(i.time);
      expect(dow, `${i.key}: no Wednesday posts (election day falls on one)`).not.toBe(3);
    }
    expect(LAUNCH_SOCIAL_STORIES.length).toBe(7);
  });

  it("laid out for both towns: thirty posts, one a day and five a week, three Reels a week, Hilton a week behind Hillcrest, nothing refused", () => {
    const all = bothTowns();
    expect(all.filter((d) => d.blocked || /Shares its day|Another campaign/.test(d.moved ?? "")).map((d) => `${d.town}: ${d.key}: ${d.blocked ?? d.moved}`)).toEqual([]);
    expect(all.length).toBe(30);
    expect(all.filter((d) => d.title?.startsWith("[Reel/TikTok]")).length).toBe(18);
    const byDay = new Map<string, string[]>();
    for (const d of all) byDay.set(dayKey(d.at), [...(byDay.get(dayKey(d.at)) ?? []), d.key]);
    expect([...byDay].filter(([, v]) => v.length > 1)).toEqual([]);
    const byWeek = new Map<string, Draft[]>();
    for (const d of all) byWeek.set(week(dayKey(d.at)), [...(byWeek.get(week(dayKey(d.at))) ?? []), d]);
    expect([...byWeek].map(([w, v]) => [w, v.length, v.filter((d) => d.title?.startsWith("[Reel/TikTok]")).length])).toEqual([
      ["2026-10-26", 5, 3], ["2026-11-02", 5, 3], ["2026-11-09", 5, 3], ["2026-11-16", 5, 3], ["2026-11-23", 5, 3], ["2026-11-30", 5, 3],
    ]);
    // Each town's own posts: Hillcrest on its Fridays, Hilton's the Friday after, each naming its town.
    const own = all.filter((d) => !d.shared);
    expect(own.map((d) => [d.town, d.key, dayKey(d.at)])).toEqual([
      ["Hillcrest", "town-hello", "2026-10-30"], ["Hilton", "town-hello", "2026-11-06"],
      ["Hillcrest", "town-advisors", "2026-11-13"], ["Hilton", "town-advisors", "2026-11-20"],
      ["Hillcrest", "town-windows", "2026-11-27"], ["Hilton", "town-windows", "2026-12-04"],
    ]);
    for (const d of own) expect(d.text).toContain(d.town);
    expect(all.filter((d) => d.shared).every((d) => d.town === "Hillcrest")).toBe(true);
    expect(all.filter((d) => /\{(towns|town|date)\}/.test(d.text))).toEqual([]);
    // The last word is the close: Sunday 6 December at 08:00, pinned.
    const last = all.at(-1)!;
    expect([last.key, last.at.toISOString(), last.pinned]).toEqual(["closes-tonight", "2026-12-06T06:00:00.000Z", true]);
    // And every post passes the channel's screen on its day.
    expect(all.flatMap((d) => screenDraft(d).map((f) => `${d.key}: ${f.term} (${f.reason})`))).toEqual([]);
  });
});
