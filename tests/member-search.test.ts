import { describe, expect, it } from "vitest";
import { looserMemberQuery, nameWords, parseMemberQuery } from "@/lib/member-search";

describe("parseMemberQuery", () => {
  it("reads names in any order, with or without a comma", () => {
    expect(parseMemberQuery("Abrahams Mpho")).toEqual({ kind: "names", words: ["Abrahams", "Mpho"] });
    expect(parseMemberQuery("Abrahams, Mpho")).toEqual({ kind: "names", words: ["Abrahams", "Mpho"] });
    expect(parseMemberQuery("  thabo  ")).toEqual({ kind: "names", words: ["thabo"] });
  });

  it("reads full phone numbers", () => {
    expect(parseMemberQuery("082 015 9585")).toEqual({ kind: "phone", phone: "+27820159585" });
    expect(parseMemberQuery("+27820159585")).toEqual({ kind: "phone", phone: "+27820159585" });
  });

  it("treats partial digits as a phone or member-number tail", () => {
    expect(parseMemberQuery("0159585")).toEqual({ kind: "digits", digits: "0159585", memberNo: "HH0159585", tail: "0159585" });
    expect(parseMemberQuery("9585")).toEqual({ kind: "digits", digits: "9585", memberNo: "HH0009585", tail: "9585" });
    expect(parseMemberQuery("12")).toEqual({ kind: "digits", digits: "12", memberNo: "HH0000012", tail: null });
  });

  it("pads member numbers with or without HH", () => {
    expect(parseMemberQuery("100001")).toMatchObject({ kind: "digits", memberNo: "HH0100001" });
    expect(parseMemberQuery("0100001")).toMatchObject({ kind: "digits", memberNo: "HH0100001" });
    expect(parseMemberQuery("hh100001")).toEqual({ kind: "memberNo", memberNo: "HH0100001" });
    expect(parseMemberQuery("HH0100001")).toEqual({ kind: "memberNo", memberNo: "HH0100001" });
  });

  it("reads emails and empty input", () => {
    expect(parseMemberQuery("Mpho@Example.com")).toEqual({ kind: "email", email: "mpho@example.com" });
    expect(parseMemberQuery("")).toEqual({ kind: "empty" });
    expect(parseMemberQuery(" , ")).toEqual({ kind: "empty" });
  });
});

describe("looserMemberQuery", () => {
  it("offers the longest word, or the start of a single long word", () => {
    expect(looserMemberQuery(parseMemberQuery("Abrahams Mphoo"))).toBe("Abrahams");
    expect(looserMemberQuery(parseMemberQuery("Abrahms"))).toBe("Abra");
    expect(looserMemberQuery(parseMemberQuery("Mpho"))).toBeNull();
    expect(looserMemberQuery(parseMemberQuery("9585"))).toBeNull();
  });
});

describe("nameWords (close-match search)", () => {
  it("keeps the words with letters, in any order, without punctuation", () => {
    expect(nameWords("Abrahms")).toEqual(["Abrahms"]);
    expect(nameWords("Abrahms, Mpho")).toEqual(["Abrahms", "Mpho"]);
    expect(nameWords("  ndlovo  ")).toEqual(["ndlovo"]);
    expect(nameWords("O'Brien")).toEqual(["O'Brien"]);
    expect(nameWords("van der Merwe")).toEqual(["van", "der", "Merwe"]);
  });
  it("leaves out numbers, phone digits and email addresses (nothing to match against names)", () => {
    expect(nameWords("Mpho 0820159585")).toEqual(["Mpho"]);
    expect(nameWords("HH0100001")).toEqual([]);
    expect(nameWords("9585")).toEqual([]);
    expect(nameWords("mpho@example.com")).toEqual([]);
    expect(nameWords("")).toEqual([]);
    expect(nameWords(undefined)).toEqual([]);
  });
  it("takes at most four words", () => {
    expect(nameWords("a b c d e f")).toEqual(["a", "b", "c", "d"]);
  });
});
