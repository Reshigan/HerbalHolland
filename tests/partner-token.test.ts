import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openMember, sealMember } from "@/lib/partner-token";

const key = randomBytes(32);
const now = 1_800_000_000_000;
const inAnHour = now / 1000 + 3600;
const member = { firstName: "Thandi", lastName: "Mokoena", phone: "0821234567", email: "t@example.com", externalId: "G-1" };

describe("partner member tokens", () => {
  it("opens what it sealed", () => {
    expect(openMember(sealMember(member, key, inAnHour), key, now)).toEqual(member);
  });

  it("refuses a wrong key or a changed token", () => {
    const t = sealMember(member, key, inAnHour);
    expect(openMember(t, randomBytes(32), now)).toBeNull();
    const flipped = Buffer.from(t, "base64url");
    flipped[20] ^= 1;
    expect(openMember(flipped.toString("base64url"), key, now)).toBeNull();
  });

  it("refuses expired tokens and ones that live longer than a week", () => {
    expect(openMember(sealMember(member, key, now / 1000 - 1), key, now)).toBeNull();
    expect(openMember(sealMember(member, key, now / 1000 + 8 * 24 * 3600), key, now)).toBeNull();
  });

  it("refuses short, oversized and phoneless tokens", () => {
    expect(openMember("", key, now)).toBeNull();
    expect(openMember("abc", key, now)).toBeNull();
    expect(openMember("a".repeat(2049), key, now)).toBeNull();
    expect(openMember(sealMember({ phone: "" }, key, inAnHour), key, now)).toBeNull();
  });

  it("drops fields that are the wrong type or too long", () => {
    const odd = { phone: "0821234567", firstName: "x".repeat(61), email: 7 } as unknown as typeof member;
    expect(openMember(sealMember(odd, key, inAnHour), key, now)).toEqual({ phone: "0821234567" });
  });
});
