import { describe, expect, it } from "vitest";
import {
  CAPITAL_BANDS,
  CAPITAL_LABEL,
  LEAD_MOVES,
  LEAD_STATUS,
  LEAD_STATUSES,
  OPEN_STATUSES,
  appendNote,
  capitalLabel,
  checkDisclosureDate,
  checkMove,
  earliestSigning,
  firstName,
  leadNumber,
  leadSource,
  noteLine,
  numberQuery,
  purgeCutoff,
  purgeOn,
  signingBlock,
  validateLead,
  type LeadStatusKey,
  type RawLead,
} from "@/lib/leads";

const valid: RawLead = {
  name: "  Sipho   Dlamini ",
  email: " Sipho.Dlamini@Example.co.za ",
  phone: "082 555 0101",
  area: " Ballito ",
  province: "kzn",
  experience: "Ran a pharmacy in Umhlanga for 12 years, 14 staff.",
  capital: "3-5m",
  pharmacist: "yes",
  message: "  ",
  consent: "on",
  source: " LinkedIn ",
};
const sast = (s: string) => new Date(`${s}+02:00`);

describe("franchise enquiry form", () => {
  it("cleans a valid enquiry: E.164 mobile, lower-case email, tidy text, province code, band key", () => {
    const r = validateLead(valid);
    expect(r).toEqual({
      ok: true,
      data: {
        name: "Sipho Dlamini",
        email: "sipho.dlamini@example.co.za",
        phone: "+27825550101",
        area: "Ballito",
        province: "KZN",
        experience: "Ran a pharmacy in Umhlanga for 12 years, 14 staff.",
        capital: "3-5m",
        pharmacist: true,
        message: null,
        source: "linkedin",
      },
    });
    const no = validateLead({ ...valid, pharmacist: "no", message: "Line one\r\n\r\n\r\n  line two  ", source: "<script>" });
    expect(no.ok && [no.data.pharmacist, no.data.message, no.data.source]).toEqual([false, "Line one\n\nline two", null]);
  });

  it("explains every missing field in plain words", () => {
    const r = validateLead({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.fields).sort()).toEqual(["area", "capital", "consent", "email", "experience", "name", "pharmacist", "phone", "province"]);
    expect(r.fields.consent).toMatch(/Tick the box/);
    expect(r.fields.phone).toMatch(/mobile number/);
  });

  it("checks each field's rules", () => {
    const errors = (patch: RawLead) => {
      const r = validateLead({ ...valid, ...patch });
      return r.ok ? {} : r.fields;
    };
    expect(errors({ email: "sipho@example" }).email).toMatch(/doesn't look like an email/);
    expect(errors({ phone: "011 555 0101" }).phone).toMatch(/South African mobile/); // landlines can't take the call-back SMS
    expect(errors({ phone: "+27 82 555 0101" })).toEqual({});
    expect(errors({ province: "XX" }).province).toBe("Choose a province");
    expect(errors({ capital: "R2m" }).capital).toMatch(/band/);
    expect(errors({ pharmacist: "maybe" }).pharmacist).toBe("Choose yes or no");
    expect(errors({ consent: "" }).consent).toBeDefined();
    expect(errors({ consent: true })).toEqual({});
    expect(errors({ name: "123" }).name).toMatch(/letters/);
    expect(errors({ name: "x".repeat(101) }).name).toMatch(/under 100/);
    expect(errors({ area: "B" }).area).toMatch(/town or area/);
  });

  it("wants at least 20 characters of experience and at most 2,000 of message", () => {
    const exp = (s: string) => validateLead({ ...valid, experience: s });
    expect(exp("x".repeat(19)).ok).toBe(false);
    expect(exp("x".repeat(20)).ok).toBe(true);
    expect(exp(` ${"x".repeat(19)}   `).ok).toBe(false); // spaces don't count
    const msg = (n: number) => validateLead({ ...valid, message: "y".repeat(n) });
    expect(msg(2_000).ok).toBe(true);
    const long = msg(2_001);
    expect(!long.ok && long.fields.message).toBe("Keep your message under 2,000 characters");
  });

  it("asks what capital they could put in — never what a store costs", () => {
    expect(CAPITAL_LABEL).toBe("Capital you could put in");
    expect(CAPITAL_BANDS.map((b) => b.label)).toEqual(["Under R1.5 million", "R1.5–3 million", "R3–5 million", "Over R5 million", "I'd rather discuss it"]);
    expect(capitalLabel("1.5-3m")).toBe("R1.5–3 million");
    expect(capitalLabel("legacy")).toBe("legacy");
  });

  it("tags the source like join links", () => {
    expect([leadSource("FASA-2027"), leadSource(" linkedin "), leadSource("-x"), leadSource("a b"), leadSource(null), leadSource("x".repeat(41))]).toEqual([
      "fasa-2027",
      "linkedin",
      null,
      null,
      null,
      null,
    ]);
  });

  it("numbers leads FL-000123 and finds them however they're typed", () => {
    expect(leadNumber(123)).toBe("FL-000123");
    expect(leadNumber(1_234_567)).toBe("FL-1234567");
    expect([numberQuery("fl-123"), numberQuery("FL000123"), numberQuery("FL 7"), numberQuery("Ballito"), numberQuery("123")]).toEqual(["FL-000123", "FL-000123", "FL-000007", null, null]);
    expect(firstName("  Thandiwe van Wyk")).toBe("Thandiwe");
  });
});

describe("franchise lead pipeline", () => {
  const now = sast("2026-10-20T10:00:00");
  it("labels every status and only lets “Disclosure sent” lead to “Signed”", () => {
    for (const s of LEAD_STATUSES) expect(LEAD_STATUS[s].label).toBeTruthy();
    const into = (to: LeadStatusKey) => LEAD_STATUSES.filter((s) => LEAD_MOVES[s].includes(to));
    expect(into("SIGNED")).toEqual(["DISCLOSURE_SENT"]);
    expect(into("NOT_A_FIT")).toEqual([...OPEN_STATUSES, "SIGNED"]); // a signed franchisee can still cancel in the cooling-off period
    expect(LEAD_MOVES.NOT_A_FIT).toEqual(["CONTACTED"]); // reopened
    for (const s of LEAD_STATUSES) expect(LEAD_MOVES[s]).not.toContain(s);
  });

  it("refuses moves that skip the rules", () => {
    const ctx = { disclosureSentAt: null, now };
    expect(checkMove("NEW", "CONTACTED", ctx)).toBeNull();
    expect(checkMove("NEW", "NEW", ctx)).toMatch(/already/);
    expect(checkMove("NEW", "SIGNED", ctx)).toMatch(/can't move to “Signed”/);
    expect(checkMove("NOT_A_FIT", "DISCLOSURE_SENT", ctx)).toMatch(/can't move/);
    expect(checkMove("CONTACTED", "DISCLOSURE_SENT", ctx)).toMatch(/day the disclosure document was sent/);
    expect(checkMove("CONTACTED", "DISCLOSURE_SENT", { disclosureSentAt: sast("2026-10-19T00:00:00"), now })).toBeNull();
  });

  it("signs no sooner than 14 days after the disclosure document (SAST days)", () => {
    // Sent late on 1 October (SAST) — still 1 October, though it's 21:30 UTC.
    const sent = sast("2026-10-01T23:30:00");
    expect(earliestSigning(sent).toISOString()).toBe("2026-10-14T22:00:00.000Z"); // 15 Oct 00:00 SAST
    expect(signingBlock(null, now)).toMatch(/Record the day the disclosure document was sent/);
    expect(signingBlock(sent, sast("2026-10-14T23:59:00"))).toBe(
      "Not yet: the disclosure document went out on 1 Oct 2026, so the earliest signing day is 15 Oct 2026 (at least 14 days, CPA franchise regulations).",
    );
    expect(signingBlock(sent, sast("2026-10-15T00:01:00"))).toBeNull();
    expect(checkMove("DISCLOSURE_SENT", "SIGNED", { disclosureSentAt: sent, now: sast("2026-10-10T12:00:00") })).toMatch(/earliest signing day is 15 Oct 2026/);
    expect(checkMove("DISCLOSURE_SENT", "SIGNED", { disclosureSentAt: sent, now })).toBeNull();
  });

  it("keeps the disclosure date honest", () => {
    expect(checkDisclosureDate("CONTACTED", sast("2026-10-21T00:00:00"), now)).toMatch(/future/);
    expect(checkDisclosureDate("CONTACTED", sast("2026-10-20T00:00:00"), now)).toBeNull();
    expect(checkDisclosureDate("CONTACTED", null, now)).toBeNull();
    expect(checkDisclosureDate("DISCLOSURE_SENT", null, now)).toMatch(/needs the day/);
    expect(checkDisclosureDate("SIGNED", sast("2026-10-01T00:00:00"), now)).toMatch(/can't change/);
  });

  it("writes a status note as a dated line in the notes", () => {
    const entry = noteLine({ at: now, by: "Naledi Khumalo", from: "NEW", to: "CONTACTED", note: "Called; keen on Ballito." });
    expect(entry).toBe("20 Oct 2026 · Naledi Khumalo · New → Contacted: Called; keen on Ballito.");
    expect(appendNote(null, entry)).toBe(entry);
    expect(appendNote("First call booked.\n", entry)).toBe(`First call booked.\n\n${entry}`);
  });

  it("deletes not-a-fit leads a year after their last change", () => {
    const cutoff = purgeCutoff(now);
    const changed = (days: number) => new Date(now.getTime() - days * 86_400_000);
    expect(changed(366) < cutoff).toBe(true);
    expect(changed(364) < cutoff).toBe(false);
    expect(purgeOn(changed(10)).toISOString()).toBe(new Date(now.getTime() + 355 * 86_400_000).toISOString());
  });
});
