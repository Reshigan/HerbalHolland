import { describe, expect, it } from "vitest";
import { isEmail } from "@/lib/email";

describe("email addresses", () => {
  it("accepts ordinary addresses and refuses malformed ones", () => {
    for (const ok of ["thabo@mokoenaretail.co.za", "first.last+orders@sub.example.com", "a@b.io"]) expect(isEmail(ok)).toBe(true);
    for (const bad of ["", "thabo", "thabo@", "@mokoena.co.za", "a b@c.com", "a@b", "a@b.c", "a@b..com", "a@@b.com", "a@b.com.", `${"a".repeat(250)}@b.com`]) expect(isEmail(bad)).toBe(false);
  });

  it("answers at once on a long crafted string, whatever its length", () => {
    const attack = `a@${".".repeat(2_000_000)}@`;
    const t = performance.now();
    expect(isEmail(attack)).toBe(false);
    expect(/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(`a@${"b.".repeat(1_000_000)}@`)).toBe(false); // the pattern itself, uncapped
    expect(performance.now() - t).toBeLessThan(500);
  });
});
