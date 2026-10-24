import { describe, expect, it } from "vitest";
import { browserHandoff, DAY_MS, detectPlatform, dismissedUntil, installKey, installState, parseDismissal } from "@/lib/install";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1",
  iphoneFirefox: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0 (iPhone15,2; iOS 17_5; en_ZA; scale=3.00)",
  iphoneFacebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0.0.0;FBBV/0;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBCR/;FBID/phone;FBLC/en_ZA;FBOP/5]",
  ipadDesktopUa: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  androidWebview: "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.113 Mobile Safari/537.36",
  androidWhatsApp: "Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.54 Mobile Safari/537.36 WhatsApp/2.24.10.85 A",
  desktopChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  desktopEdgeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
  desktopFirefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
};

const NOW = Date.UTC(2026, 8, 29, 9, 0, 0);
const state = (ua: string, over: Partial<Parameters<typeof installState>[0]> = {}) => installState({ ua, standalone: false, now: NOW, ...over });

describe("install: platform detection", () => {
  it("iPhone Safari gets the two-step Home Screen route", () => {
    expect(state(UA.iphoneSafari)).toEqual({ platform: "ios", installed: false, show: true, mode: "ios-steps" });
  });
  it("Chrome and Firefox on iPhone can't add to the Home Screen from their menus", () => {
    expect(state(UA.iphoneChrome)).toMatchObject({ platform: "ios", show: false, mode: "none" });
    expect(state(UA.iphoneFirefox)).toMatchObject({ platform: "ios", show: false, mode: "none" });
  });
  it("in-app browsers never get a nudge", () => {
    for (const ua of [UA.iphoneInstagram, UA.iphoneFacebook, UA.androidWebview, UA.androidWhatsApp]) expect(state(ua)).toMatchObject({ show: false, mode: "none" });
    expect(detectPlatform(UA.iphoneInstagram)).toMatchObject({ platform: "ios", inApp: true, iosSafari: false });
    expect(detectPlatform(UA.androidWhatsApp)).toMatchObject({ platform: "android", inApp: true });
  });
  it("an iPad with a desktop user agent is told apart by its touch screen", () => {
    expect(state(UA.ipadDesktopUa, { touchPoints: 5 })).toMatchObject({ platform: "ios", mode: "ios-steps" });
    expect(state(UA.ipadDesktopUa, { touchPoints: 0 })).toMatchObject({ platform: "desktop", mode: "prompt" });
  });
  it("Android browsers wait for the browser's own prompt", () => {
    expect(state(UA.androidChrome)).toEqual({ platform: "android", installed: false, show: true, mode: "prompt" });
    expect(state(UA.androidSamsung)).toMatchObject({ platform: "android", mode: "prompt" });
  });
  it("desktop browsers wait for the browser's own prompt (Firefox simply never fires it)", () => {
    expect(state(UA.desktopChrome)).toEqual({ platform: "desktop", installed: false, show: true, mode: "prompt" });
    expect(state(UA.desktopEdgeMac)).toMatchObject({ platform: "desktop", mode: "prompt" });
    expect(state(UA.desktopFirefoxLinux)).toMatchObject({ platform: "desktop", mode: "prompt" });
  });
  it("an unknown or empty user agent is 'other'", () => {
    expect(state("")).toMatchObject({ platform: "other", mode: "prompt" });
    expect(detectPlatform("Mozilla/5.0 (Mobile; rv:48.0) Gecko/48.0 Firefox/48.0 KAIOS/2.5").platform).toBe("other");
  });
});

describe("install: already installed", () => {
  it("never shows in standalone display mode, on any platform", () => {
    for (const ua of [UA.iphoneSafari, UA.androidChrome, UA.desktopChrome]) {
      expect(state(ua, { standalone: true })).toMatchObject({ installed: true, show: false, mode: "none" });
    }
  });
});

describe("install: dismissal windows", () => {
  it("a dismissal hides the nudge for 30 days", () => {
    expect(state(UA.androidChrome, { dismissedAt: NOW - 29 * DAY_MS }).show).toBe(false);
    expect(state(UA.androidChrome, { dismissedAt: NOW - 30 * DAY_MS }).show).toBe(true);
    expect(state(UA.iphoneSafari, { dismissedAt: NOW - 10 * DAY_MS })).toMatchObject({ show: false, mode: "ios-steps" });
    expect(state(UA.iphoneSafari, { dismissedAt: NOW - 31 * DAY_MS }).show).toBe(true);
  });
  it("'Not now' on the till hides it for a day", () => {
    expect(state(UA.androidChrome, { dismissedAt: NOW - 12 * 3600_000, dismissKind: "later" }).show).toBe(false);
    expect(state(UA.androidChrome, { dismissedAt: NOW - 25 * 3600_000, dismissKind: "later" }).show).toBe(true);
    expect(dismissedUntil(NOW, "later")).toBe(NOW + DAY_MS);
    expect(dismissedUntil(NOW)).toBe(NOW + 30 * DAY_MS);
    expect(dismissedUntil(null)).toBe(0);
  });
  it("a once-only placement stays hidden after it has been shown", () => {
    expect(state(UA.androidChrome, { seenAt: NOW - 5 * 60_000 }).show).toBe(false);
    expect(state(UA.androidChrome, { seenAt: null }).show).toBe(true);
  });
  it("reads stored dismissals defensively", () => {
    expect(parseDismissal(JSON.stringify({ at: NOW, kind: "later" }))).toEqual({ at: NOW, kind: "later" });
    expect(parseDismissal(JSON.stringify({ at: NOW }))).toEqual({ at: NOW, kind: "dismissed" });
    expect(parseDismissal(JSON.stringify({ at: "yesterday" }))).toBeNull();
    expect(parseDismissal("not json")).toBeNull();
    expect(parseDismissal(null)).toBeNull();
    expect(installKey("till")).toBe("hh-install:till:dismissed");
    expect(installKey("rewards", "seen")).toBe("hh-install:rewards:seen");
  });
});

describe("browserHandoff", () => {
  const url = "https://shop.herbalholland.com/club?welcome=1";
  it("reopens an Android in-app browser's page in Chrome, falling back to the page", () => {
    const h = browserHandoff(UA.androidWhatsApp, url);
    expect(h).toEqual({ platform: "android", href: `intent://shop.herbalholland.com/club?welcome=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end` });
  });
  it("tells iPhone in-app browsers and other iOS browsers to open Safari", () => {
    for (const ua of [UA.iphoneInstagram, UA.iphoneFacebook, UA.iphoneChrome]) expect(browserHandoff(ua, url)).toEqual({ platform: "ios" });
  });
  it("stays out of the way where the app installs, and on desktop", () => {
    for (const ua of [UA.iphoneSafari, UA.androidChrome, UA.androidSamsung, UA.desktopChrome]) expect(browserHandoff(ua, url)).toBeNull();
  });
});
