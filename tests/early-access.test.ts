// The early-access list on herbalholland.com: what a sign-up must carry before the Worker keeps it.
import { describe, expect, it } from "vitest";
import { validateEarlyAccess } from "@/lib/leads";

const ok = { email: "Thandi@Example.co.za", adult: true, consent: true };

describe("early-access sign-up", () => {
  it("takes an email or a mobile number, cleaned", () => {
    expect(validateEarlyAccess(ok)).toEqual({ ok: true, data: { firstName: null, email: "thandi@example.co.za", mobile: null, province: null, source: null } });
    const m = validateEarlyAccess({ mobile: "082 123 4567", firstName: "  Thandi  ", province: "kzn", source: "Instagram", adult: "on", consent: "on" });
    expect(m).toEqual({ ok: true, data: { firstName: "Thandi", email: null, mobile: "+27821234567", province: "KZN", source: "instagram" } });
  });

  it("needs a way to reach you, 18+ and consent", () => {
    const r = validateEarlyAccess({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fields).sort()).toEqual(["adult", "consent", "contact"]);
  });

  it("refuses what doesn't check out", () => {
    const r = validateEarlyAccess({ ...ok, email: "not-an-email", mobile: "12", province: "XX", firstName: "1234" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fields).sort()).toEqual(["email", "firstName", "mobile", "province"]);
    expect(validateEarlyAccess({ ...ok, firstName: "a".repeat(61) }).ok).toBe(false);
  });

  it("an unticked box is not consent", () => {
    for (const v of [false, "", "off", null, undefined]) expect(validateEarlyAccess({ ...ok, consent: v }).ok).toBe(false);
  });
});
