import { describe, expect, it } from "vitest";
import { cleanPath, cleanSrc, isBot, parseBeacon, referrerHost } from "@/lib/analytics";

const CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Mobile Safari/537.36";
const OWN = ["shop.herbalholland.com", "localhost:3000"];
const ok = { visitor: "3f2b8c1e-9a4d-4c2e-8f1a-2b3c4d5e6f70", path: "/shop" };

describe("page-view beacons", () => {
  it("keeps the path alone, and only site paths", () => {
    expect(cleanPath("/p/cbd-oil?src=qr#reviews")).toBe("/p/cbd-oil");
    expect(cleanPath("/" + "a".repeat(400))).toHaveLength(200);
    expect(cleanPath("https://evil.example/")).toBeNull();
    expect(cleanPath("//evil.example/")).toBeNull();
    expect(cleanPath(42)).toBeNull();
  });

  it("keeps the referrer's host only, never our own", () => {
    expect(referrerHost("https://www.google.com/search?q=cbd")).toBe("google.com");
    expect(referrerHost("https://l.instagram.com/?u=x")).toBe("l.instagram.com");
    expect(referrerHost("https://shop.herbalholland.com/cart", OWN)).toBeNull();
    expect(referrerHost("http://localhost:3000/", OWN)).toBeNull();
    expect(referrerHost("android-app://com.google.android.gm/")).toBeNull();
    expect(referrerHost("not a url")).toBeNull();
    expect(referrerHost("")).toBeNull();
  });

  it("takes ?src= tags of letters, digits and dashes only", () => {
    expect(cleanSrc("QR-Window-Hillcrest")).toBe("qr-window-hillcrest");
    expect(cleanSrc("a b")).toBeNull();
    expect(cleanSrc("x".repeat(41))).toBeNull();
    expect(cleanSrc("<script>")).toBeNull();
  });

  it("parses a view, falling back to the user agent for the platform", () => {
    expect(parseBeacon({ ...ok, entry: true, app: true, src: "ig-bio", referrer: "https://instagram.com/", platform: "ios" }, { ua: CHROME, ownHosts: OWN })).toEqual({
      kind: "view", visitor: ok.visitor, path: "/shop", entry: true, app: true, src: "ig-bio", referrer: "instagram.com", platform: "ios",
    });
    // Only the entry page says where the visit came from.
    expect(parseBeacon({ ...ok, src: "ig-bio", referrer: "https://instagram.com/" })).toMatchObject({ entry: false, src: null, referrer: null });
    expect(parseBeacon({ ...ok, kind: "install", entry: true })?.entry).toBe(false);
    expect(parseBeacon({ ...ok, platform: "fridge", app: "yes" }, { ua: CHROME })).toMatchObject({ platform: "android", app: false, src: null, referrer: null });
    expect(parseBeacon({ ...ok, kind: "install" })?.kind).toBe("install");
    expect(parseBeacon({ ...ok, kind: "purchase" })?.kind).toBe("view");
  });

  it("ignores bodies without a visitor id or a path", () => {
    expect(parseBeacon(null)).toBeNull();
    expect(parseBeacon("view")).toBeNull();
    expect(parseBeacon({ path: "/shop" })).toBeNull();
    expect(parseBeacon({ ...ok, visitor: "x" })).toBeNull();
    expect(parseBeacon({ ...ok, visitor: "someone@example.com" })).toBeNull();
    expect(parseBeacon({ ...ok, path: "shop" })).toBeNull();
  });

  it("tells bots from people", () => {
    expect(isBot(CHROME)).toBe(false);
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/125.0.0.0 Safari/537.36")).toBe(true);
    expect(isBot("curl/8.4.0")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(null)).toBe(true);
  });
});
