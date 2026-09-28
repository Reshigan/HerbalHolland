import { describe, expect, it } from "vitest";
import { siteLinks, siteRoute } from "@/lib/site";

const env = { siteUrl: "https://herbalholland.com", appUrl: "https://herbalholland.co.za" };
const on = (host: string, path: string, search = "") => siteRoute({ host, path, search, ...env });

describe("site routing", () => {
  it("serves the site's pages on its own host", () => {
    expect(on("herbalholland.com", "/")).toEqual({ kind: "rewrite", path: "/site" });
    expect(on("HerbalHolland.com:443", "/franchise", "?src=linkedin")).toEqual({ kind: "rewrite", path: "/site/franchise" });
    expect(on("herbalholland.com", "/site/opengraph-image")).toEqual({ kind: "next" });
    expect(on("herbalholland.com", "/icon.svg")).toEqual({ kind: "next" });
    expect(on("herbalholland.com", "/sitemap.xml")).toEqual({ kind: "next" });
    expect(on("herbalholland.com", "/apple-icon")).toEqual({ kind: "next" });
  });
  it("sends shop links to the shop, www to the bare domain, and /site on the shop to the site", () => {
    expect(on("herbalholland.com", "/p/rooibos-cbd-tea", "?v=2")).toEqual({ kind: "redirect", url: "https://herbalholland.co.za/p/rooibos-cbd-tea?v=2" });
    expect(on("www.herbalholland.com", "/press")).toEqual({ kind: "redirect", url: "https://herbalholland.com/press" });
    expect(on("herbalholland.co.za", "/site/careers")).toEqual({ kind: "redirect", url: "https://herbalholland.com/careers" });
    expect(on("herbalholland.co.za", "/site")).toEqual({ kind: "redirect", url: "https://herbalholland.com/" });
    expect(on("herbalholland.co.za", "/shop")).toEqual({ kind: "next" });
  });
  it("leaves everything alone without SITE_URL (the site lives at /site)", () => {
    expect(siteRoute({ host: "localhost:3000", path: "/site/about", search: "" })).toEqual({ kind: "next" });
  });
  it("builds links for either set-up", () => {
    const live = siteLinks({ SITE_URL: "https://herbalholland.com/", APP_URL: "https://herbalholland.co.za" });
    expect([live.page("/"), live.page("/press"), live.abs("/"), live.abs("/press"), live.join]).toEqual(["/", "/press", "https://herbalholland.com", "https://herbalholland.com/press", "https://herbalholland.co.za/club/join?src=site"]);
    const dev = siteLinks({ APP_URL: "http://localhost:3000" });
    expect([dev.page("/"), dev.page("/press"), dev.abs("/about")]).toEqual(["/site", "/site/press", "http://localhost:3000/site/about"]);
  });
});
