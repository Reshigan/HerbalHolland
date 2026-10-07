// Minimal but complete network for integration tests: a DC, a licensed store, staff, three products with two lots
// each, and two customers. The products: licensed flower and a CBD oil (medicines: no incentives under s18A) and a CBD
// coffee (CBD food & drink: promotions, member prices and points allowed).
import { db } from "@/server/db";
import { putStock } from "@/server/inventory";
import { tx } from "@/server/db";

export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

const days = (n: number) => new Date(Date.now() + n * 86_400_000);

export async function buildWorld() {
  const region = await db.region.create({ data: { code: "GPN", name: "Tshwane & North" } });
  const hq = await db.company.create({ data: { kind: "FRANCHISOR", name: "Herbal Holland", legalName: "Herbal Holland (Pty) Ltd", vatNumber: "4870123456", email: "hq@example.co.za" } });
  const owner = await db.company.create({ data: { kind: "FRANCHISEE", name: "Test Retail", legalName: "Test Retail (Pty) Ltd", vatNumber: "4410000000", email: "owner@example.co.za" } });
  const base = { suburb: "Hatfield", city: "Pretoria", province: "GP" as const, postalCode: "0083", regionId: region.id };
  const dc = await db.store.create({ data: { ...base, code: "DC-T", slug: "dc-t", name: "Test DC", kind: "WAREHOUSE", companyId: hq.id, addressLine: "1 DC Road", licences: ["THC"] } });
  const store = await db.store.create({ data: { ...base, code: "TST01", slug: "tst01", name: "Test Store", companyId: owner.id, dcId: dc.id, addressLine: "1 Burnett St", licences: ["THC"], sameDay: true } });
  const manager = await db.user.create({ data: { name: "Mia Manager", role: "MANAGER", storeId: store.id, canDispense: true } });
  const budtender = await db.user.create({ data: { name: "Ben Budtender", role: "BUDTENDER", storeId: store.id, canDispense: false } });
  const device = await db.device.create({ data: { storeId: store.id, name: "Till 1", prefix: "A", tokenHash: "test-device" } });

  const flowerCat = await db.category.create({ data: { slug: "flower", name: "Flower", icon: "Flower2" } });
  const wellCat = await db.category.create({ data: { slug: "wellness", name: "CBD Wellness", icon: "Leaf" } });
  const coffeeCat = await db.category.create({ data: { slug: "coffee-drinks", name: "Coffee & drinks", icon: "Coffee" } });
  const flower = await db.product.create({
    data: { slug: "test-haze", name: "Test Haze", categoryId: flowerCat.id, description: "x", regClass: "THC", strain: "SATIVA", effects: [], flavours: [], claims: [] },
  });
  const oil = await db.product.create({
    data: { slug: "test-oil", name: "Calm Oil", categoryId: wellCat.id, description: "x", regClass: "CBD", effects: [], flavours: [], claims: [], cbdMgPerPack: 600, cbdMgPerDay: 20 },
  });
  const coffee = await db.product.create({
    data: {
      slug: "test-coffee", name: "Test CBD Coffee", categoryId: coffeeCat.id, description: "x", regClass: "CBD_FOOD", effects: [], flavours: [], claims: [], cbdMgPerPack: 15, thcMax: 0.001,
      netContent: 250, netUnit: "g", ingredients: "Arabica coffee, hemp flower", allergens: ["none"], naturalCbd: true,
    },
  });
  const flowerV = await db.variant.create({ data: { productId: flower.id, sku: "FLW-T-35", name: "3.5g", grams: 3.5, priceCents: 65_000, wholesaleCents: 29_000, costCents: 16_000 } });
  const oilV = await db.variant.create({ data: { productId: oil.id, sku: "WEL-T-30", name: "30ml", priceCents: 59_500, wholesaleCents: 28_000, costCents: 17_000 } });
  const coffeeV = await db.variant.create({ data: { productId: coffee.id, sku: "COF-T-250", name: "250g", priceCents: 22_900, wholesaleCents: 11_000, costCents: 6_500 } });

  const lot = (variantId: string, code: string, packedDaysAgo: number, expiresInDays: number) =>
    db.batch.create({ data: { variantId, code, supplier: "Test Farm", packedAt: days(-packedDaysAgo), expiresAt: days(expiresInDays) } });
  const flowerOld = await lot(flowerV.id, "TH-A", 90, 120);
  const flowerNew = await lot(flowerV.id, "TH-B", 10, 300);
  const oilOld = await lot(oilV.id, "OIL-A", 200, 30);
  const oilNew = await lot(oilV.id, "OIL-B", 20, 500);
  const coffeeOld = await lot(coffeeV.id, "COF-A", 60, 40);
  const coffeeNew = await lot(coffeeV.id, "COF-B", 10, 250);

  await tx(async (t) => {
    for (const [storeId, v, b, qty, cost] of [
      [store.id, flowerV.id, flowerOld.id, 3, 29_000],
      [store.id, flowerV.id, flowerNew.id, 10, 29_000],
      [store.id, oilV.id, oilOld.id, 2, 28_000],
      [store.id, oilV.id, oilNew.id, 10, 28_000],
      [store.id, coffeeV.id, coffeeOld.id, 2, 11_000],
      [store.id, coffeeV.id, coffeeNew.id, 10, 11_000],
      [dc.id, flowerV.id, flowerNew.id, 100, 16_000],
      [dc.id, oilV.id, oilOld.id, 5, 17_000],
      [dc.id, oilV.id, oilNew.id, 100, 17_000],
    ] as const)
      await putStock(t, { storeId, variantId: v, batchId: b, qty, unitCostCents: cost, type: "RECEIVE" });
  });
  await db.storeVariant.createMany({ data: [flowerV.id, oilV.id, coffeeV.id].map((variantId) => ({ storeId: store.id, variantId, reorderPoint: 4, parLevel: 12 })) });

  const patient = await db.customer.create({
    data: { memberNo: "HH0000001", phone: "+27820000001", firstName: "Pat", dob: new Date("1985-01-01"), ageCheck: "VERIFIED", ageVerifiedAt: new Date(), referralCode: "PAT0001", homeStoreId: store.id },
  });
  await db.patientAuth.create({
    data: { customerId: patient.id, authNumber: "S21/2026/00001", prescriber: "Dr Test", prescriberRegNo: "MP0000001", scope: "Dried flower", monthlyLimitGrams: 30, validFrom: days(-30), validTo: days(300) },
  });
  const walkIn = await db.customer.create({
    data: { memberNo: "HH0000002", phone: "+27820000002", firstName: "Wally", dob: new Date("1990-01-01"), ageCheck: "ID_NUMBER", ageVerifiedAt: new Date(), referralCode: "WAL0002", homeStoreId: store.id, points: 200 },
  });
  await db.loyaltyEntry.create({ data: { customerId: walkIn.id, points: 200, kind: "ADJUST", note: "opening" } });

  return { region, hq, owner, dc, store, manager, budtender, device, flowerV, oilV, coffeeV, flowerOld, flowerNew, oilOld, oilNew, coffeeOld, coffeeNew, patient, walkIn };
}
export type World = Awaited<ReturnType<typeof buildWorld>>;

export const onHand = async (storeId: string, batchId: string) =>
  (await db.stockLevel.findFirst({ where: { storeId, batchId } }))?.onHand ?? 0;
