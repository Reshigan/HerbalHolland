// The three web app manifests: the Rewards app (src/app/manifest.ts), the till and the back office. Icons are rendered
// by routes rather than kept as files, so each icon src is checked against the route that serves it.
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
  it("service workers exist and the Rewards one handles fetch", () => {
    for (const f of ["sw.js", "rewards-sw.js", "staff-sw.js"]) expect(existsSync(`public/${f}`), f).toBe(true);
    expect(readFileSync("public/rewards-sw.js", "utf8")).toContain('addEventListener("fetch"');
    expect(readFileSync("public/_headers", "utf8")).toMatch(/\/rewards-sw\.js\n\s+Cache-Control: no-cache/);
  });
});
