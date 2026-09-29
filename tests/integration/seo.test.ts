// Search-facing routes against the real services: the sitemap lists public products only, licensed medicines stay
// noindex, and a Learn article's alias slug is a permanent redirect to its one canonical URL.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import sitemap from "@/app/sitemap";
import { generateMetadata as productMetadata } from "@/app/(shop)/p/[slug]/page";
import { generateMetadata as articleMetadata } from "@/app/(shop)/learn/[slug]/page";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeAll(async () => {
  process.env.APP_URL = "https://shop.example.co.za";
  await resetDb();
  w = await buildWorld();
});
afterAll(() => db.$disconnect());

describe("sitemap", () => {
  it("lists public products with their real updatedAt and never a licensed medicine", async () => {
    const [urls, coffee] = await Promise.all([sitemap(), db.product.findUniqueOrThrow({ where: { id: w.coffeeV.productId }, select: { updatedAt: true } })]);
    const loc = (path: string) => urls.find((u) => u.url === `https://shop.example.co.za${path}`);
    expect(loc("/p/test-coffee")?.lastModified).toEqual(coffee.updatedAt);
    expect(loc("/p/test-oil")).toBeTruthy();
    expect(loc("/p/test-haze")).toBeUndefined(); // THC: licensed, dispensary only
    expect(loc("/shop?category=coffee-drinks")?.lastModified).toEqual(coffee.updatedAt);
    expect(loc("/shop?category=flower")).toBeUndefined(); // only licensed products in it
    expect(loc("/stores/tst01")).toBeTruthy();
    expect(loc("/stores/tst01")).not.toHaveProperty("lastModified"); // no timestamp on Store: none invented
    expect(loc("/learn/heritage-landraces")?.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(loc("/learn/heritage-landraces-story")).toBeUndefined(); // aliases are redirects, not pages
    expect(urls.every((u) => !u.url.includes("/dispensary") && !u.url.includes("/batch/"))).toBe(true);
  });
});

describe("product pages", () => {
  it("keep licensed medicines out of the index and give public products a canonical", async () => {
    expect(await productMetadata(params("test-haze"))).toMatchObject({ title: "Dispensary", robots: { index: false, follow: false } });
    const coffee = await productMetadata(params("test-coffee"));
    expect(coffee).toMatchObject({ title: "Test CBD Coffee", alternates: { canonical: "/p/test-coffee" } });
    expect(String(coffee.description).length).toBeGreaterThanOrEqual(120);
    expect(String(coffee.description).length).toBeLessThanOrEqual(160);
  });
});

describe("Learn article aliases", () => {
  it("redirect permanently (308) to the canonical article", async () => {
    await expect(articleMetadata(params("heritage-landraces-story"))).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/learn\/heritage-landraces;308/) });
    await expect(articleMetadata(params("heritage-landraces"))).resolves.toMatchObject({ alternates: { canonical: "/learn/heritage-landraces" } });
    await expect(articleMetadata(params("no-such-guide"))).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404") });
  });
});
