"use server";
import { revalidatePath } from "next/cache";
import { zar } from "@/lib/money";
import { redirect } from "next/navigation";
import { db, tx } from "@/server/db";
import { audit } from "@/server/audit";
import { guard, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { announced, announceProducts } from "@/server/studio";
import { str, opt, bool, list, parseNum, parseRand, parseInt10, splitList, slugify } from "@/server/hq/form";
import { PRODUCT_STATUSES, REG_CLASSES } from "@/server/hq/catalogue";
import { ALLERGENS, PRODUCT_FACTS, REG_CLASS_LABEL, CBD_CLASSES, complianceChange, screenCopy, validateProduct } from "@/lib/compliance";
import type { Prisma, ProductStatus, RegClass, StoreFormat, StrainType } from "@/generated/prisma/client";

const STRAINS: StrainType[] = ["INDICA", "SATIVA", "HYBRID", "CBD"];

export async function saveProduct(productId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const name = str(fd, "name");
  if (!name) fields.name = "Product name is required";
  const slug = slugify(str(fd, "slug") || name);
  if (!slug) fields.slug = "Slug is required";
  else if (await db.product.count({ where: { slug, ...(productId && { id: { not: productId } }) } })) fields.slug = "Another product already uses this URL";
  const description = str(fd, "description");
  if (description.length < 20) fields.description = "Write at least a sentence. It appears on the product page.";
  const categoryId = str(fd, "categoryId");
  if (!(await db.category.count({ where: { id: categoryId } }))) fields.categoryId = "Choose a category";
  const regClass = str(fd, "regClass") as RegClass;
  if (!REG_CLASSES.includes(regClass)) fields.regClass = "Choose a regulatory class";
  const status = str(fd, "status") as ProductStatus;
  if (!PRODUCT_STATUSES.includes(status)) fields.status = "Choose a status";
  const strainRaw = str(fd, "strain");
  const strain = STRAINS.includes(strainRaw as StrainType) ? (strainRaw as StrainType) : null;

  const range = (k: string) => {
    const v = parseNum(str(fd, k));
    if (v != null && (v < 0 || v > 100)) fields[k] = "0–100%";
    return v;
  };
  const thcMin = range("thcMin"), thcMax = range("thcMax"), cbdMin = range("cbdMin"), cbdMax = range("cbdMax");
  if (thcMin != null && thcMax != null && thcMin > thcMax) fields.thcMax = "Max must be at least the min";
  if (cbdMin != null && cbdMax != null && cbdMin > cbdMax) fields.cbdMax = "Max must be at least the min";

  const terpNames = fd.getAll("terpName").map((v) => String(v).trim());
  const terpPcts = fd.getAll("terpPct").map((v) => parseNum(String(v)));
  const terpenes = terpNames.map((n, i) => ({ name: n, pct: terpPcts[i] })).filter((t) => t.name);
  if (terpenes.some((t) => t.pct == null || t.pct < 0 || t.pct > 10)) fields.terpenes = "Each terpene needs a % between 0 and 10";

  const cbdPackRaw = str(fd, "cbdMgPerPack");
  const cbdMgPerPack = parseInt10(cbdPackRaw);
  if (cbdPackRaw && cbdMgPerPack == null) fields.cbdMgPerPack = "Whole milligrams";
  const cbdMgPerDay = parseNum(str(fd, "cbdMgPerDay"));
  const claims = fd.getAll("claim").map((v) => String(v).trim()).filter(Boolean);
  for (const c of claims) {
    const flags = screenCopy(c);
    if (flags.length) fields.claims = `"${c}": ${flags[0].reason}`;
  }

  // Product facts (food, supplements, skin care, CBD supplements): stored only for the classes that carry them.
  const facts = PRODUCT_FACTS[regClass] ?? [];
  const netRaw = str(fd, "netContent");
  const netContent = parseNum(netRaw);
  if (netRaw && (netContent == null || netContent <= 0 || netContent > 100_000)) fields.netContent = "A number above 0, e.g. 250";
  const netUnit = ["g", "ml"].includes(str(fd, "netUnit")) ? str(fd, "netUnit") : null;
  const ingredients = opt(fd, "ingredients");
  if (ingredients && ingredients.length > 2_000) fields.ingredients = "Keep it under 2,000 characters";
  const allergens = list(fd, "allergens");
  const naturalCbd = bool(fd, "naturalCbd");

  const issues = validateProduct({ regClass, cbdMgPerPack, cbdMgPerDay, thcMax, claims, netContent, netUnit, ingredients, allergens, naturalCbd });
  if (issues.length) fields.compliance = issues.join(" · ");
  const copy = [name, str(fd, "tagline"), description].join(" ");
  const copyFlags = screenCopy(copy);
  if (copyFlags.length) fields.description = `"${copyFlags[0].term}": ${copyFlags[0].reason}`;
  if (Object.keys(fields).length)
    return fail(
      !fields.compliance ? "Check the highlighted fields." : regClass === "CBD" ? "This product doesn't meet Schedule 0 CBD rules. Fix it before saving." : `This product doesn't meet the rules for ${REG_CLASS_LABEL[regClass]}. Fix it before saving.`,
      fields,
    );

  const data = {
    name, slug, description, categoryId, regClass, status, strain, thcMin, thcMax, cbdMin, cbdMax,
    tagline: opt(fd, "tagline"),
    brand: str(fd, "brand") || "Herbal Holland",
    line: opt(fd, "line"),
    terpenes: terpenes.length ? (terpenes as Prisma.InputJsonValue) : undefined,
    effects: splitList(str(fd, "effects")).map((s) => s.toLowerCase()),
    flavours: splitList(str(fd, "flavours")),
    lineage: opt(fd, "lineage"),
    origin: opt(fd, "origin"),
    heritage: bool(fd, "heritage"),
    featured: bool(fd, "featured"),
    legalBasis: opt(fd, "legalBasis"),
    cbdMgPerPack: CBD_CLASSES.includes(regClass) ? cbdMgPerPack : null,
    cbdMgPerDay: regClass === "CBD" ? cbdMgPerDay : null,
    claims,
    tobaccoRelated: bool(fd, "tobaccoRelated"),
    netContent: facts.includes("netContent") ? netContent : null,
    netUnit: facts.includes("netContent") && netContent != null ? netUnit : null,
    ingredients: facts.includes("ingredients") ? ingredients : null,
    allergens: facts.includes("allergens") ? allergens.filter((a) => a in ALLERGENS) : [],
    naturalCbd: regClass === "CBD_FOOD" && naturalCbd,
  };

  // Going live (new as Active, or out of draft) with "Announce it" ticked: its "New online" campaign, as drafts.
  const launch = async (id: string) => (bool(fd, "announce") && status === "ACTIVE" ? announced(await announceProducts({ productIds: [id], by: g.user.name, actor: g.actor })) : "");
  if (!productId) {
    const p = await db.product.create({ data });
    await audit(db, g.actor, "product.create", { entity: "Product", entityId: p.id, data: { name, regClass, status } });
    const m = await launch(p.id);
    revalidatePath("/hq/catalogue");
    redirect(`/hq/catalogue/${p.id}?created=1${m ? `&m=${encodeURIComponent(m)}` : ""}`);
  }
  const before = await db.product.findUniqueOrThrow({ where: { id: productId } });
  await db.product.update({ where: { id: productId }, data: { ...data, terpenes: terpenes.length ? (terpenes as Prisma.InputJsonValue) : [] } });
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(data[k] ?? null));
  const compliance = complianceChange(changed, regClass);
  await audit(db, g.actor, compliance ? "compliance.product" : "product.update", {
    entity: "Product", entityId: productId, data: { changed },
  });
  const m = before.status === "DRAFT" ? await launch(productId) : "";
  revalidatePath(`/hq/catalogue/${productId}`);
  revalidatePath("/hq/catalogue");
  return done(changed.length ? `Product saved.${m && ` ${m}`}` : "No changes to save.");
}

export async function saveVariant(productId: string, variantId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const sku = str(fd, "sku").toUpperCase();
  if (!/^[A-Z0-9-]{3,32}$/.test(sku)) fields.sku = "Letters, digits and dashes";
  else if (await db.variant.count({ where: { sku, ...(variantId && { id: { not: variantId } }) } })) fields.sku = "SKU already in use";
  const barcode = str(fd, "barcode").replace(/\s/g, "") || null;
  if (barcode && !/^\d{8,14}$/.test(barcode)) fields.barcode = "8–14 digits (EAN/UPC)";
  else if (barcode && (await db.variant.count({ where: { barcode, ...(variantId && { id: { not: variantId } }) } }))) fields.barcode = "Barcode already in use";
  const podSku = str(fd, "podSku").trim() || null; // made to order by the merch partner
  if (podSku && !/^[A-Za-z0-9._\/-]{2,64}$/.test(podSku)) fields.podSku = "The partner's code: letters, digits, dots, dashes";
  const name = str(fd, "name");
  if (!name) fields.name = "Required";
  const grams = parseNum(str(fd, "grams"));
  if (grams != null && (grams < 0 || grams > 1000)) fields.grams = "0–1000 g";
  const priceCents = parseRand(str(fd, "price"));
  const wholesaleCents = parseRand(str(fd, "wholesale"));
  const costCents = parseRand(str(fd, "cost"));
  if (!priceCents || priceCents <= 0) fields.price = "RRP incl. VAT";
  if (wholesaleCents == null || wholesaleCents < 0) fields.wholesale = "Ex VAT";
  if (costCents == null || costCents < 0) fields.cost = "Ex VAT";
  const caseQty = parseInt10(str(fd, "caseQty") || "1");
  if (caseQty == null || caseQty < 1 || caseQty > 1000) fields.caseQty = "1–1000 units per case";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  const data = { sku, barcode, podSku, name, grams, priceCents: priceCents!, wholesaleCents: wholesaleCents!, costCents: costCents!, active: bool(fd, "active"), caseQty: caseQty! };

  if (!variantId) {
    const v = await tx(async (t) => {
      const count = await t.variant.count({ where: { productId } });
      const v = await t.variant.create({ data: { ...data, productId, sortOrder: count, active: true } });
      let ranged = 0;
      if (bool(fd, "rangeWithProduct")) {
        const stores = await t.storeVariant.findMany({ where: { variant: { productId } }, distinct: ["storeId"], select: { storeId: true } });
        ranged = (await t.storeVariant.createMany({ data: stores.map((s) => ({ storeId: s.storeId, variantId: v.id })), skipDuplicates: true })).count;
      }
      await audit(t, g.actor, "variant.create", { entity: "Variant", entityId: v.id, data: { sku, priceCents: data.priceCents, ranged } });
      return v;
    });
    revalidatePath(`/hq/catalogue/${productId}`);
    return done(`${v.name} added.`);
  }
  const before = await db.variant.findUniqueOrThrow({ where: { id: variantId } });
  if (before.productId !== productId) return DENIED;
  await db.variant.update({ where: { id: variantId }, data });
  const priceChange = before.priceCents !== data.priceCents || before.wholesaleCents !== data.wholesaleCents || before.costCents !== data.costCents;
  await audit(db, g.actor, priceChange ? "variant.price" : "variant.update", {
    entity: "Variant", entityId: variantId,
    data: { sku, ...(priceChange && { before: { rrp: before.priceCents, wholesale: before.wholesaleCents, cost: before.costCents }, after: { rrp: data.priceCents, wholesale: data.wholesaleCents, cost: data.costCents } }), active: data.active, ...(before.caseQty !== data.caseQty && { caseQty: { before: before.caseQty, after: data.caseQty } }) },
  });
  revalidatePath(`/hq/catalogue/${productId}`);
  return done(`${sku} saved.`);
}

/** One variant's recommended retail price, from the catalogue list. Audited as a price change like the full editor. */
export async function saveVariantPrice(variantId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const priceCents = parseRand(str(fd, "price"));
  if (!priceCents || priceCents <= 0) return fail("Enter the RRP incl. VAT, like 249.00", { price: "RRP incl. VAT" });
  if (priceCents > 1_000_000_00) return fail("That's more than R1,000,000. Check the amount.", { price: "Too high" });
  const before = await db.variant.findUnique({ where: { id: variantId }, select: { id: true, sku: true, productId: true, priceCents: true, wholesaleCents: true, costCents: true } });
  if (!before) return fail("That variant no longer exists.");
  if (before.priceCents === priceCents) return done(`${before.sku} is already ${zar(priceCents)}.`);
  await db.variant.update({ where: { id: variantId }, data: { priceCents } });
  await audit(db, g.actor, "variant.price", {
    entity: "Variant", entityId: variantId,
    data: { sku: before.sku, before: { rrp: before.priceCents, wholesale: before.wholesaleCents, cost: before.costCents }, after: { rrp: priceCents, wholesale: before.wholesaleCents, cost: before.costCents } },
  });
  revalidatePath("/hq/catalogue");
  revalidatePath(`/hq/catalogue/${before.productId}`);
  return done(`${before.sku}: RRP ${zar(priceCents)} saved.`);
}

/** Range or unrange a variant at every matching store (by format and/or region). */
export async function rangeVariant(productId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const variantId = str(fd, "variantId");
  const variant = await db.variant.findFirst({ where: { id: variantId, productId }, select: { id: true, sku: true, active: true } });
  if (!variant) return fail("Choose a variant.", { variantId: "Choose a variant" });
  const mode = str(fd, "mode");
  const format = str(fd, "format") as StoreFormat | "";
  const regionId = str(fd, "regionId");
  const stores = await db.store.findMany({
    where: { kind: "RETAIL", status: { not: "CLOSED" }, ...(format && { format }), ...(regionId && { regionId }) },
    select: { id: true },
  });
  const storeIds = stores.map((s) => s.id);
  if (!storeIds.length) return fail("No stores match that format and region.");
  let n = 0;
  let holding = 0;
  if (mode === "range") {
    if (!variant.active) return fail("Activate the variant before ranging it.");
    n = (await db.storeVariant.createMany({ data: storeIds.map((storeId) => ({ storeId, variantId })), skipDuplicates: true })).count;
  } else if (mode === "unrange") {
    n = (await db.storeVariant.deleteMany({ where: { variantId, storeId: { in: storeIds } } })).count;
    holding = (await db.stockLevel.groupBy({ by: ["storeId"], where: { variantId, storeId: { in: storeIds }, onHand: { gt: 0 } } })).length;
  } else return fail("Choose range or unrange.");
  await audit(db, g.actor, `ranging.${mode}`, { entity: "Variant", entityId: variantId, data: { sku: variant.sku, format: format || "ALL", regionId: regionId || "ALL", stores: n } });
  revalidatePath(`/hq/catalogue/${productId}`);
  if (mode === "range") return done(n ? `${variant.sku} ranged at ${n} more store${n === 1 ? "" : "s"}.` : `${variant.sku} was already ranged at all ${storeIds.length} matching stores.`);
  return done(`${variant.sku} unranged at ${n} store${n === 1 ? "" : "s"}.${holding ? ` ${holding} still hold stock, which they can sell through or return.` : ""}`);
}
