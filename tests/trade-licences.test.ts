// The licences a trade account must hold (src/lib/trade-licences.ts): which ones each kind of business needs for its
// ranges, whether the account holds them (verified and in date), and how a typed licence is checked.
import { describe, expect, it } from "vitest";
import { checkLicenceInput, expiryOf, LICENCE_REMIND_DAYS, licenceStanding, requiredLicences, type LicenceRecord } from "@/lib/trade-licences";

const kinds = (kind: string, classes: string[]) => requiredLicences(kind, classes).map((r) => r.kind);
const NOW = new Date("2026-10-04T10:00:00+02:00");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
let seq = 0;
const rec = (over: Partial<LicenceRecord>): LicenceRecord => ({ id: `l${++seq}`, kind: "PHARMACY_LICENCE", number: "PL123", status: "VERIFIED", expiresAt: null, createdAt: day(-100), ...over });

describe("which licences each kind of business needs", () => {
  it("asks a pharmacy for its licence to own the pharmacy and its SAPC recording", () => {
    expect(kinds("PHARMACY", ["CBD", "CBD_TOPICAL"])).toEqual(["PHARMACY_LICENCE", "SAPC_RECORDING"]);
  });
  it("adds the food certificate for anyone selling CBD food and drink", () => {
    expect(kinds("PHARMACY", ["CBD_FOOD"])).toEqual(["PHARMACY_LICENCE", "SAPC_RECORDING", "FOOD_COA"]);
    expect(kinds("RETAILER", ["CBD_FOOD", "ACCESSORY"])).toEqual(["FOOD_COA", "CIPC_REGISTRATION"]);
  });
  it("asks a café for its business licence and food certificate whatever it buys", () => {
    expect(kinds("CAFE", ["ACCESSORY"])).toEqual(["FOOD_COA", "BUSINESS_LICENCE"]);
  });
  it("asks a distributor of CBD supplements for a SAHPRA licence, but not one that only resells accessories", () => {
    expect(kinds("DISTRIBUTOR", ["CBD", "HEMP"])).toEqual(["SAHPRA_LICENCE", "CIPC_REGISTRATION"]);
    expect(kinds("DISTRIBUTOR", ["ACCESSORY", "APPAREL"])).toEqual(["CIPC_REGISTRATION"]);
  });
  it("asks a practice for its practice number, and retailers, online shops and others for their registration", () => {
    expect(kinds("PRACTICE", ["CBD"])).toEqual(["PRACTICE_NUMBER"]);
    for (const k of ["RETAILER", "ONLINE_SHOP", "OTHER"]) expect(kinds(k, ["GROW"])).toEqual(["CIPC_REGISTRATION"]);
  });
  it("never needs a licence twice, and every kind needs at least one", () => {
    for (const k of ["PHARMACY", "RETAILER", "CAFE", "PRACTICE", "ONLINE_SHOP", "DISTRIBUTOR", "OTHER"]) {
      const list = kinds(k, ["CBD", "CBD_FOOD", "CBD_TOPICAL", "HEMP", "SUPPLEMENT", "ACCESSORY", "APPAREL", "GROW"]);
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

describe("whether the account holds them", () => {
  const need = requiredLicences("PHARMACY", ["CBD"]);
  it("is in order with both licences verified and in date", () => {
    const s = licenceStanding(need, [rec({}), rec({ kind: "SAPC_RECORDING", number: "P123" })], NOW);
    expect(s.ok).toBe(true);
    expect(s.lines.map((l) => l.state)).toEqual(["ok", "ok"]);
  });
  it("names what's missing, waiting, not accepted or lapsed", () => {
    const s = licenceStanding(need, [rec({ status: "SUBMITTED" }), rec({ kind: "SAPC_RECORDING", status: "REJECTED", rejectReason: "Blurred photo" })], NOW);
    expect(s.ok).toBe(false);
    expect(s.problems).toEqual(["Pharmacy licence is waiting to be checked", "SAPC pharmacy recording wasn't accepted (Blurred photo) — upload a new one"]);
    const lapsed = licenceStanding(requiredLicences("PRACTICE", []), [rec({ kind: "PRACTICE_NUMBER", number: "0123456", expiresAt: day(-1) })], NOW);
    expect(lapsed.lines[0].state).toBe("expired");
    expect(lapsed.problems[0]).toMatch(/^Practice number expired on .+ — upload the renewed one$/);
    expect(licenceStanding(need, [], NOW).problems).toEqual(["Pharmacy licence is needed — upload it", "SAPC pharmacy recording is needed — upload it"]);
  });
  it("keeps trading on a licence in date while its renewal waits, and warns when it lapses soon", () => {
    const need = requiredLicences("PRACTICE", []);
    const current = rec({ kind: "PRACTICE_NUMBER", number: "0123456", expiresAt: day(LICENCE_REMIND_DAYS - 2), createdAt: day(-300) });
    const renewal = rec({ kind: "PRACTICE_NUMBER", number: "0123456", status: "SUBMITTED", expiresAt: day(400), createdAt: day(-1) });
    const s = licenceStanding(need, [current, renewal], NOW);
    expect(s.ok).toBe(true);
    expect(s.lines[0]).toMatchObject({ state: "expiring", current: { id: current.id }, pending: { id: renewal.id } });
  });
  it("uses the newest verified licence still in date, whatever was rejected after it", () => {
    const need = requiredLicences("PRACTICE", []);
    const ok = rec({ kind: "PRACTICE_NUMBER", number: "0123456", expiresAt: day(200), createdAt: day(-50) });
    const bad = rec({ kind: "PRACTICE_NUMBER", number: "9999999", status: "REJECTED", createdAt: day(-2) });
    expect(licenceStanding(need, [ok, bad], NOW).lines[0]).toMatchObject({ state: "ok", current: { id: ok.id } });
  });
});

describe("checking a licence as typed", () => {
  it("tidies the number and checks its format where there is one", () => {
    expect(checkLicenceInput("PHARMACY_LICENCE", { number: "  pl  1234 " }, NOW)).toEqual({ ok: true, number: "PL 1234", expiresAt: null });
    expect(checkLicenceInput("PRACTICE_NUMBER", { number: "012 3456", expiresAt: "2027-02-28" }, NOW)).toMatchObject({ ok: true, number: "0123456" });
    expect(checkLicenceInput("PRACTICE_NUMBER", { number: "12345", expiresAt: "2027-02-28" }, NOW)).toEqual({ ok: false, fields: { number: "A practice number is seven digits" } });
    expect(checkLicenceInput("CIPC_REGISTRATION", { number: "2015/123456/07" }, NOW)).toMatchObject({ ok: true, number: "2015/123456/07" });
    expect(checkLicenceInput("FOOD_COA", { number: "" }, NOW)).toEqual({ ok: false, fields: { number: "Enter the certificate of acceptability (food premises) number" } });
  });
  it("requires the expiry date of a licence that lapses, in the future, valid all of its last day", () => {
    expect(checkLicenceInput("SAHPRA_LICENCE", { number: "W123" }, NOW)).toEqual({ ok: false, fields: { expiresAt: "Enter the date the SAHPRA licence to wholesale or distribute expires" } });
    expect(checkLicenceInput("SAHPRA_LICENCE", { number: "W123", expiresAt: "2026-10-03" }, NOW)).toEqual({ ok: false, fields: { expiresAt: "This licence has expired — upload the renewed one" } });
    expect(checkLicenceInput("SAHPRA_LICENCE", { number: "W123", expiresAt: "2026-02-30" }, NOW)).toEqual({ ok: false, fields: { expiresAt: "Enter the expiry date" } });
    expect(checkLicenceInput("SAHPRA_LICENCE", { number: "W123", expiresAt: "2026-10-04" }, NOW)).toEqual({ ok: true, number: "W123", expiresAt: expiryOf("2026-10-04") });
    expect(expiryOf("2026-10-04").toISOString()).toBe("2026-10-04T21:59:59.000Z");
  });
});
