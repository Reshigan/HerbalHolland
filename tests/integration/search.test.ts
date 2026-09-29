// Shop search against the database: trigram similarity (pg_trgm) finds typos, the ranking puts exact names first and
// understands measures, and "Did you mean…" offers the product a fuzzy hit points to.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listCatalogue } from "@/server/shop/catalogue";
import { similarProducts } from "@/server/shop/search";
import { buildWorld, resetDb } from "./world";

const who = { tier: null };

beforeAll(async () => {
  await resetDb();
  await buildWorld();
  const wellness = await db.category.findUniqueOrThrow({ where: { slug: "wellness" } });
  const acc = await db.category.create({ data: { slug: "accessories", name: "Accessories", icon: "Package" } });
  await db.product.create({
    data: { slug: "calm-cbd-oil-600", name: "Calm CBD Oil 600", tagline: "Full-spectrum drops for the evening", categoryId: wellness.id, description: "x", regClass: "CBD", cbdMgPerPack: 600, cbdMgPerDay: 20, netContent: 30, netUnit: "ml", variants: { create: { sku: "WEL-CALM-600", name: "30ml", priceCents: 79_500, wholesaleCents: 38_000, costCents: 22_000 } } },
  });
  await db.product.create({
    data: { slug: "sunset-grinder", name: "Sunset Grinder", tagline: "Four-piece aluminium grinder", categoryId: acc.id, description: "x", regClass: "ACCESSORY", variants: { create: { sku: "ACC-GRIND", name: "One size", priceCents: 34_900, wholesaleCents: 17_000, costCents: 9_000 } } },
  });
});
afterAll(async () => {
  await db.$disconnect();
});

describe("similarity in the database", () => {
  it("finds names close to a typo, bounded to the classes given", async () => {
    const sims = await similarProducts("calm oli", ["CBD", "CBD_FOOD"]);
    const calm = await db.product.findUniqueOrThrow({ where: { slug: "test-oil" } });
    const calm600 = await db.product.findUniqueOrThrow({ where: { slug: "calm-cbd-oil-600" } });
    expect(sims.get(calm.id)).toBeGreaterThan(0.25);
    expect(sims.get(calm600.id)).toBeGreaterThan(0.25);
    expect((await similarProducts("calm oli", ["ACCESSORY"])).size).toBe(0);
    expect((await similarProducts("grindr", ["ACCESSORY"])).size).toBe(1);
    expect((await similarProducts("z", ["ACCESSORY"])).size).toBe(0);
  });
});

describe("the shop's search", () => {
  it("ranks the exact name first and understands a strength", async () => {
    const r = await listCatalogue("public", { q: "calm cbd oil 600", page: 1 }, who);
    expect(r.items[0].slug).toBe("calm-cbd-oil-600");
    expect(r.suggestion).toBeNull();
    const byStrength = await listCatalogue("public", { q: "oil 600mg", page: 1 }, who);
    expect(byStrength.items[0].slug).toBe("calm-cbd-oil-600");
    const bySize = await listCatalogue("public", { q: "oil 30ml", page: 1 }, who);
    expect(bySize.items.map((i) => i.slug).slice(0, 2).sort()).toEqual(["calm-cbd-oil-600", "test-oil"]);
    expect((await listCatalogue("public", { q: "coffee", page: 1 }, who)).items.map((i) => i.slug)).toEqual(["test-coffee"]);
  });

  it("forgives typos and offers a correction when the best hit was found only by similarity", async () => {
    const r = await listCatalogue("public", { q: "grindr", page: 1 }, who);
    expect(r.items.map((i) => i.slug)).toEqual(["sunset-grinder"]);
    expect(r.suggestion).toBe("Sunset Grinder");
    const typo = await listCatalogue("public", { q: "calm oli", page: 1 }, who);
    expect(typo.items.map((i) => i.slug).slice(0, 2).sort()).toEqual(["calm-cbd-oil-600", "test-oil"]);
    expect(typo.suggestion).toBeNull(); // "calm" is in the name: not a fuzzy-only match
    expect((await listCatalogue("public", { q: "zzzzzz", page: 1 }, who)).items).toEqual([]);
  });

  it("never reaches into the dispensary from the public shop", async () => {
    expect((await listCatalogue("public", { q: "haze", page: 1 }, who)).items).toEqual([]);
    expect((await listCatalogue("licensed", { q: "haze", page: 1 }, who)).items.map((i) => i.slug)).toEqual(["test-haze"]);
  });
});
