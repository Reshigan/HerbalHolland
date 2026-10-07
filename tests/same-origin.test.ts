import { describe, expect, it } from "vitest";
import { sameOrigin } from "@/lib/same-origin";

const bag = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });
const URL_ = "https://app.herbalholland.co.za/api/pos/sales";

describe("sameOrigin", () => {
  it("goes by Sec-Fetch-Site when the browser sends it", () => {
    expect(sameOrigin(bag({ "sec-fetch-site": "same-origin" }), URL_)).toBe(true);
    expect(sameOrigin(bag({ "sec-fetch-site": "none" }), URL_)).toBe(true); // typed into the address bar, a bookmark
    expect(sameOrigin(bag({ "sec-fetch-site": "cross-site", origin: "https://app.herbalholland.co.za" }), URL_)).toBe(false);
    expect(sameOrigin(bag({ "sec-fetch-site": "same-site" }), URL_)).toBe(false);
  });

  it("otherwise compares Origin with the host the request was sent to", () => {
    expect(sameOrigin(bag({ origin: "https://app.herbalholland.co.za", host: "app.herbalholland.co.za" }), URL_)).toBe(true);
    expect(sameOrigin(bag({ origin: "https://evil.example", host: "app.herbalholland.co.za" }), URL_)).toBe(false);
    expect(sameOrigin(bag({ origin: "http://localhost:3000", host: "localhost:3000" }), "http://localhost:3000/logout")).toBe(true);
    expect(sameOrigin(bag({ origin: "http://localhost:3001", host: "localhost:3000" }), "http://localhost:3000/logout")).toBe(false);
  });

  it("prefers x-forwarded-host (its first entry) over Host behind a proxy", () => {
    expect(sameOrigin(bag({ origin: "https://app.herbalholland.co.za", host: "10.0.0.5:3000", "x-forwarded-host": "app.herbalholland.co.za, 10.0.0.5" }), URL_)).toBe(true);
    expect(sameOrigin(bag({ origin: "https://10.0.0.5:3000", host: "10.0.0.5:3000", "x-forwarded-host": "app.herbalholland.co.za" }), URL_)).toBe(false);
  });

  it("falls back to the URL's host, lets header-less clients through and refuses opaque origins", () => {
    expect(sameOrigin(bag({ origin: "https://app.herbalholland.co.za" }), URL_)).toBe(true);
    expect(sameOrigin(bag({}), URL_)).toBe(true);
    expect(sameOrigin(bag({ origin: "null", host: "app.herbalholland.co.za" }), URL_)).toBe(false);
  });
});
