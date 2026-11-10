// The three web app manifests: the Rewards app (src/app/manifest.ts), the till and the back office. Icons are rendered
// by routes rather than kept as files, so each icon src is checked against the route that serves it.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { GET as posManifest } from "@/app/pos/manifest.webmanifest/route";
import { GET as staffManifest } from "@/app/staff/manifest.webmanifest/route";

const ICON_ROUTE = readFileSync("src/app/pwa-icon/[size]/route.tsx", "utf8");
const iconServed = (src: string) => {
  if (src === "/icon.svg") return existsSync("src/app/icon.svg");
  const m = /^\/pwa-icon\/(?:(till|office)-)?(192|512|maskable)$/.exec(src);
  return !!m && ICON_ROUTE.includes(`"${m[2]}"`) && (!m[1] || ICON_ROUTE.includes(`(till|office)`));
};
const pageDir = (url: string) => ["src/app", "src/app/(shop)"].some((root) => existsSync(`${root}${url}/page.tsx`));

describe("Rewards manifest", () => {
  const m = manifest();
  it("is installable: id, start_url inside scope, standalone, brand colours", () => {
    expect(m.id).toBe("/club");
    expect(m.start_url).toBe("/club");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBe("#0c0a09");
    expect(m.background_color).toBe("#0c0a09");
    expect(m.name).toBe("Herbal Holland");
    expect(m.short_name!.length).toBeLessThanOrEqual(12);
    expect(m.launch_handler).toBeTruthy();
  });
  it("has 192 and 512 PNG icons plus a maskable one, all served", () => {
    const png = m.icons!.filter((i) => i.type === "image/png");
    expect(png.map((i) => `${i.sizes}:${i.purpose ?? "any"}`)).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const i of m.icons!) expect(iconServed(i.src), i.src).toBe(true);
    // The maskable render keeps the Mark inside the safe zone (inset ≥ 10% a side; the route uses more).
    expect(Number(/maskable: \{ px: 512, inset: ([\d.]+)/.exec(ICON_ROUTE)?.[1])).toBeGreaterThanOrEqual(0.1);
  });
  it("shortcuts point at real pages with served icons", () => {
    expect(m.shortcuts!.length).toBeGreaterThan(0);
    for (const s of m.shortcuts!) {
      expect(pageDir(s.url), s.url).toBe(true);
      for (const i of s.icons ?? []) expect(iconServed(i.src), i.src).toBe(true);
    }
  });
});

describe("till and back-office manifests", () => {
  it("are distinct apps with their own served icons and the manifest content type", async () => {
    const ids = new Set<string>();
    for (const route of [posManifest, staffManifest]) {
      const res = route();
      expect(res.headers.get("content-type")).toMatch(/^application\/manifest\+json/);
      const j = (await res.json()) as { id: string; icons: { src: string; purpose?: string; sizes: string }[] };
      ids.add(j.id);
      expect(j.icons.some((i) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
      for (const i of j.icons.filter((i) => i.src.startsWith("/pwa-icon/"))) expect(iconServed(i.src), i.src).toBe(true);
    }
    expect(ids.size).toBe(2);
    expect(ids.has(manifest().id!)).toBe(false);
  });
  it("service workers exist and are served without a long cache", () => {
    for (const f of ["sw.js", "rewards-sw.js", "staff-sw.js"]) {
      expect(existsSync(`public/${f}`), f).toBe(true);
      expect(readFileSync("public/_headers", "utf8")).toMatch(new RegExp(`/${f.replace(".", "\\.")}\\n\\s+Cache-Control: no-cache`));
    }
  });
});

describe("Rewards service worker", () => {
  const SW = readFileSync("public/rewards-sw.js", "utf8");
  const offline = /const OFFLINE = "([^"]+)"/.exec(SW)![1];
  it("precaches only the offline page, which exists and is self-contained", () => {
    expect(existsSync(`public${offline}`), offline).toBe(true);
    const page = readFileSync(`public${offline}`, "utf8");
    // Works with no network: no scripts, stylesheets, fonts or images fetched from anywhere.
    expect(page).not.toMatch(/<script|<link|(src|href)="https?:|url\(|@import|<img/);
    expect(page).toMatch(/<a href="">/); // retry reloads the page the member asked for
    expect(page).toMatch(/name="robots" content="noindex"/);
    // Nothing else is ever written to a cache: no member page or API answer stays on a shared phone.
    expect(SW.match(/\.(add|addAll|put)\(/g)).toEqual([".add("]);
    expect(SW).toContain("new Request(OFFLINE, { cache: \"reload\" })");
  });
  it("renames its cache whenever the offline page changes, so installed devices fetch the new one", () => {
    const hash = createHash("sha1").update(readFileSync(`public${offline}`)).digest("hex").slice(0, 8);
    expect(SW, `set CACHE = "hh-offline-${hash}" in public/rewards-sw.js`).toContain(`const CACHE = "hh-offline-${hash}"`);
    expect(SW).toMatch(/k\.startsWith\("hh-offline-"\) && k !== CACHE/); // old versions deleted on activate
  });
  it("only answers page loads, network first, and uses served push icons", () => {
    expect(SW).toContain('req.mode !== "navigate" || req.method !== "GET") return');
    expect(SW).toMatch(/await event\.preloadResponse\) \|\| \(await fetch\(req\)\)/);
    for (const src of SW.match(/"\/(?:pwa-icon|club)\/[\w-]+"/g)!.map((s) => s.slice(1, -1))) {
      expect(iconServed(src) || existsSync(`src/app${src}/route.tsx`), src).toBe(true);
    }
  });
});
