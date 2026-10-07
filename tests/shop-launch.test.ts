import { describe, expect, it } from "vitest";
import { countdownParts, dropPhase, earlyLabel, earlyWho, fmtCountdown, fmtLead, foundingLabel, icsEvent, readableDropBlock, waitlistView } from "@/server/shop/launch-rules";
import { dropBlock, type DropRule } from "@/lib/drops";
import { joinTag } from "@/server/customers";

const at = new Date("2026-10-02T07:00:00Z");
const drop: DropRule = { name: "Sunset Hoodie No. 1", startsAt: at, endsAt: new Date("2026-10-09T07:00:00Z"), earlyTier: "HARVEST", earlyMinutes: 120, perMemberLimit: 1, membersOnly: true };

describe("Founding Member numbers", () => {
  it("pads to four digits", () => {
    expect(foundingLabel(42)).toBe("#0042");
    expect(foundingLabel(10_000)).toBe("#10000");
  });
});

describe("countdowns", () => {
  it("splits time left and stops at zero", () => {
    expect(countdownParts(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
    expect(countdownParts(0)).toBeNull();
    expect(countdownParts(-5)).toBeNull();
  });
  it("formats compactly", () => {
    expect(fmtCountdown(((3 * 24 + 4) * 3600) * 1000)).toBe("3d 04h");
    expect(fmtCountdown((4 * 3600 + 12 * 60) * 1000)).toBe("4h 12m");
    expect(fmtCountdown((12 * 60 + 5) * 1000)).toBe("12m 05s");
    expect(fmtCountdown(-1)).toBe("now");
  });
});

describe("drop labels and phases", () => {
  it("names who gets in early", () => {
    expect(earlyWho("HARVEST")).toBe("Harvest members");
    expect(earlyWho("BLOOM")).toBe("Bloom & Harvest members");
    expect(earlyWho("SPROUT")).toBe("Sprout members and up");
    expect(fmtLead(120)).toBe("2 hours");
    expect(fmtLead(60)).toBe("1 hour");
    expect(fmtLead(45)).toBe("45 minutes");
    expect(earlyLabel(drop)).toBe("Harvest members get in 2 hours early");
    expect(earlyLabel({ earlyTier: null, earlyMinutes: 60 })).toBeNull();
  });
  it("opens early for the early tier only", () => {
    const early = new Date(at.getTime() - 60 * 60_000);
    expect(dropPhase(drop, "HARVEST", early).phase).toBe("early");
    expect(dropPhase(drop, "BLOOM", early)).toEqual({ phase: "upcoming", opensAt: at });
    expect(dropPhase(drop, null, at).phase).toBe("live");
    expect(dropPhase(drop, "HARVEST", new Date("2026-10-10T00:00:00Z")).phase).toBe("ended");
    expect(dropPhase({ ...drop, endsAt: null }, null, new Date("2027-01-01T00:00:00Z")).phase).toBe("live");
  });
  it("rewrites each refusal in plain words", () => {
    const d = { name: drop.name, perMemberLimit: 1, opensLabel: "on 2 Oct 2026 at 09:00" };
    const members = readableDropBlock(dropBlock(drop, { member: false, tier: null, bought: 0 }, 1, at)!, d);
    expect(members.kind).toBe("members");
    expect(members.title).toBe("Sunset Hoodie No. 1 is for members");
    const early = readableDropBlock(dropBlock(drop, { member: true, tier: "SEED", bought: 0 }, 1, new Date(at.getTime() - 1000))!, d);
    expect(early.kind).toBe("early");
    expect(early.body).toContain("on 2 Oct 2026 at 09:00");
    const limit = readableDropBlock(dropBlock(drop, { member: true, tier: "SEED", bought: 1 }, 1, at)!, d);
    expect(limit).toMatchObject({ kind: "limit", title: "Sunset Hoodie No. 1 is limited to 1 per member" });
    expect(readableDropBlock("Something else").kind).toBe("other");
    // Without the drop at hand (checkout fallback), names containing ": " still parse.
    expect(readableDropBlock("Heritage Month: pin + bucket hat: limit 2 per member").title).toBe("Heritage Month: pin + bucket hat is limited to 2 per member");
    expect(readableDropBlock("Heritage Month: pin + bucket hat isn't open yet").title).toBe("Heritage Month: pin + bucket hat isn't open yet");
  });
});

describe("waitlist card", () => {
  it("shows the Founding zone and how many friends it takes", () => {
    expect(waitlistView({ place: 42, total: 18_600, boost: 250 }, 10_000)).toMatchObject({ founding: true, toFounding: 0, friendsNeeded: 0 });
    const w = waitlistView({ place: 10_600, total: 18_600, boost: 250 }, 10_000);
    expect(w).toMatchObject({ founding: false, toFounding: 600, friendsNeeded: 3, behind: 8000 });
    expect(w.zone).toBeCloseTo(10_000 / 18_600);
    expect(waitlistView({ place: 1, total: 1, boost: 250 }, 10_000)).toMatchObject({ marker: 0, zone: 1 });
  });
});

describe("calendar file", () => {
  it("writes a valid, escaped, folded VEVENT", () => {
    const ics = icsEvent({
      uid: "evt-1@herbalholland.com",
      title: "Members' evening: heritage landraces",
      description: "Tastings, talks; and the growers — adults 18+.\nBring your ID.",
      location: "Herbal Holland Hatfield, 1 Burnett St, Hatfield, Pretoria",
      url: "https://shop.herbalholland.com/events/hatfield-members-evening",
      startsAt: new Date("2026-10-01T16:00:00Z"),
      endsAt: new Date("2026-10-01T18:30:00Z"),
      stamp: new Date("2026-09-27T10:00:00Z"),
    });
    expect(ics).toContain("DTSTART:20261001T160000Z\r\n");
    expect(ics).toContain("DTEND:20261001T183000Z\r\n");
    expect(ics).toContain("DTSTAMP:20260927T100000Z\r\n");
    expect(ics).toContain("SUMMARY:Members' evening: heritage landraces\r\n");
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("talks\\; and the growers");
    expect(unfolded).toContain("\\nBring your ID.");
    expect(unfolded).toContain("Hatfield\\, Pretoria");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("join tags", () => {
  it("keeps clean ?src= tags and drops anything else", () => {
    expect(joinTag(" QR-Window-Hillcrest ")).toBe("qr-window-hillcrest");
    expect(joinTag("highway-mail")).toBe("highway-mail");
    for (const bad of ["", null, undefined, "-lead", "flyer hilton", "<script>", "x".repeat(41)]) expect(joinTag(bad)).toBeNull();
  });
});
