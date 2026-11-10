import { describe, expect, it } from "vitest";
import { wedgeBurst } from "@/components/pos/lib/wedge";

/** Types `text` into a fresh tracker, `gap` ms between keys, then Enter `enterGap` ms later. */
function type(text: string, gap: number, enterGap = gap, start = 1000) {
  const feed = wedgeBurst();
  let t = start;
  let value = "";
  for (const key of text) {
    value += key;
    expect(feed({ key, timeStamp: (t += gap), currentTarget: { value } })).toBeNull();
  }
  return feed({ key: "Enter", timeStamp: t + enterGap, currentTarget: { value } });
}

describe("wedgeBurst", () => {
  it("a fast burst then Enter is a scan", () => expect(type("HH0100001", 10)).toBe(true));
  it("typing by hand is not", () => expect(type("HH0100001", 150)).toBe(false));
  it("a slow Enter after a fast burst is not", () => expect(type("HH0100001", 10, 200)).toBe(false));
  it("fewer than four characters is not", () => expect(type("HH0", 10)).toBe(false));
  it("a paste (value longer than the burst) is not", () => {
    const feed = wedgeBurst();
    expect(feed({ key: "Enter", timeStamp: 1000, currentTarget: { value: "HH0100001" } })).toBe(false);
  });
  it("text already in the box plus a burst is not", () => {
    const feed = wedgeBurst();
    let t = 1000;
    for (const key of "HH0100001") feed({ key, timeStamp: (t += 10), currentTarget: { value: "x" } });
    expect(feed({ key: "Enter", timeStamp: t + 10, currentTarget: { value: "abcHH0100001" } })).toBe(false);
  });
});
