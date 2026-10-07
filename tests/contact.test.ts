// One contact and one legal entity: pages read the franchisor's company record and fall back to these, never to their
// own hard-coded addresses or names.
import { describe, expect, it } from "vitest";
import { FALLBACK_EMAIL, FALLBACK_LEGAL_NAME, contactEmailOf, legalNameOf } from "@/lib/contact";

describe("franchisor contact and entity", () => {
  it("come from the company record when it has them", () => {
    const hq = { legalName: "Vantax (Pty) Ltd", email: "info@example.co.za" };
    expect(legalNameOf(hq)).toBe("Vantax (Pty) Ltd");
    expect(contactEmailOf(hq)).toBe("info@example.co.za");
  });

  it("fall back to the company that owns the online business and its public mailbox", () => {
    expect([FALLBACK_LEGAL_NAME, FALLBACK_EMAIL]).toEqual(["Vantax (Pty) Ltd", "hello@herbalholland.com"]);
    for (const c of [null, undefined, {}, { legalName: " ", email: "" }, { legalName: null, email: null }]) {
      expect(legalNameOf(c)).toBe(FALLBACK_LEGAL_NAME);
      expect(contactEmailOf(c)).toBe(FALLBACK_EMAIL);
    }
  });
});
