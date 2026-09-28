"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { guard, DENIED, fail, done, flashTo, type ActionState } from "@/server/hq/guard";
import { str, opt, list, bool, parseNum, parseInt10, parseLocal, parseRand, parseClock } from "@/server/hq/form";
import { screenCopy } from "@/lib/compliance";
import type { Channel, PromoKind } from "@/generated/prisma/client";

const KINDS: PromoKind[] = ["PERCENT", "FIXED", "MULTIPLIER", "BUY_X_GET_Y", "MULTIBUY"];

export async function savePromotion(promoId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const name = str(fd, "name");
  if (!name) fields.name = "Name the deal — it shows on receipts and shelf talkers";
  const description = opt(fd, "description");
  const flags = screenCopy(`${name} ${description ?? ""}`);
  if (flags.length) fields.name = `“${flags[0].term}” — ${flags[0].reason}`;
  const kind = str(fd, "kind") as PromoKind;
  if (!KINDS.includes(kind)) fields.kind = "Choose a deal type";

  let value = 0;
  let buyQty: number | null = null, getQty: number | null = null, rewardPercent: number | null = null;
  if (kind === "PERCENT") {
    const v = parseInt10(str(fd, "percent"));
    if (!v || v < 1 || v > 100) fields.percent = "Whole percent, 1–100";
    value = v ?? 0;
  } else if (kind === "FIXED") {
    const v = parseRand(str(fd, "amount"));
    if (!v || v <= 0) fields.amount = "Rand amount above R0";
    value = v ?? 0;
  } else if (kind === "MULTIPLIER") {
    const v = parseNum(str(fd, "multiplier"));
    if (!v || v <= 1 || v > 10) fields.multiplier = "Between 1.1× and 10×";
    value = Math.round((v ?? 0) * 100);
  } else if (kind === "MULTIBUY") {
    buyQty = parseInt10(str(fd, "buyQty"));
    if (!buyQty || buyQty < 2 || buyQty > 20) fields.buyQty = "2 to 20 items";
    const v = parseRand(str(fd, "bundlePrice"));
    if (!v || v <= 0) fields.bundlePrice = "Bundle price above R0";
    value = v ?? 0;
  } else if (kind === "BUY_X_GET_Y") {
    buyQty = str(fd, "buyQty") ? parseInt10(str(fd, "buyQty")) : null;
    if (str(fd, "buyQty") && (!buyQty || buyQty < 1 || buyQty > 20)) fields.buyQty = "1 to 20, or blank for a spend trigger";
    getQty = parseInt10(str(fd, "getQty"));
    if (!getQty || getQty < 1 || getQty > 10) fields.getQty = "1 to 10";
    rewardPercent = parseInt10(str(fd, "rewardPercent") || "100");
    if (!rewardPercent || rewardPercent < 1 || rewardPercent > 100) fields.rewardPercent = "1–100 (100 = free)";
  }
  const minSpendCents = str(fd, "minSpend") ? parseRand(str(fd, "minSpend")) : 0;
  if (minSpendCents == null || minSpendCents < 0) fields.minSpend = "Rand amount";
  if (kind === "BUY_X_GET_Y" && !buyQty && !minSpendCents) fields.buyQty = "Set a buy quantity or a minimum spend";

  const categoryIds = list(fd, "categoryIds"), productIds = list(fd, "productIds");
  const rewardCategoryIds = kind === "BUY_X_GET_Y" ? list(fd, "rewardCategoryIds") : [];
  const rewardProductIds = kind === "BUY_X_GET_Y" ? list(fd, "rewardProductIds") : [];
  const allCats = [...new Set([...categoryIds, ...rewardCategoryIds])], allProducts = [...new Set([...productIds, ...rewardProductIds])];
  if (allCats.length && (await db.category.count({ where: { id: { in: allCats } } })) !== allCats.length) fields.categoryIds = "Unknown category";
  if (allProducts.length && (await db.product.count({ where: { id: { in: allProducts } } })) !== allProducts.length) fields.productIds = "Unknown product";
  if (kind === "MULTIBUY" && !categoryIds.length && !productIds.length) fields.categoryIds = "Pick the items that count towards the bundle";

  const channels = list(fd, "channels").filter((c): c is Channel => c === "POS" || c === "ONLINE");
  if (!channels.length) fields.channels = "Pick at least one channel";
  const storeIds = list(fd, "storeIds");
  if (storeIds.length && (await db.store.count({ where: { id: { in: storeIds } } })) !== storeIds.length) fields.storeIds = "Unknown store";
  const days = list(fd, "days").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const startMinute = str(fd, "startTime") ? parseClock(str(fd, "startTime")) : null;
  const endMinute = str(fd, "endTime") ? parseClock(str(fd, "endTime")) : null;
  if (str(fd, "startTime") && startMinute == null) fields.startTime = "HH:MM";
  if (str(fd, "endTime") && endMinute == null) fields.endTime = "HH:MM";
  if (startMinute != null && endMinute != null && endMinute <= startMinute) fields.endTime = "Must end after it starts";
  const startsAt = parseLocal(str(fd, "startsAt"));
  const endsAt = parseLocal(str(fd, "endsAt"));
  if (!startsAt) fields.startsAt = "Start date and time";
  if (!endsAt) fields.endsAt = "End date and time";
  if (startsAt && endsAt && endsAt <= startsAt) fields.endsAt = "Must end after it starts";

  const code = str(fd, "code").toUpperCase().replace(/\s/g, "") || null;
  if (code && !/^[A-Z0-9]{4,20}$/.test(code)) fields.code = "4–20 letters and digits";
  else if (code && (await db.promotion.count({ where: { code, ...(promoId && { id: { not: promoId } }) } }))) fields.code = "Another promotion uses this code";
  const maxUses = str(fd, "maxUses") ? parseInt10(str(fd, "maxUses")) : null;
  if (str(fd, "maxUses") && (!maxUses || maxUses < 1)) fields.maxUses = "Whole number";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);

  const data = {
    name, description, kind, value, categoryIds, productIds, minSpendCents: minSpendCents ?? 0, buyQty, getQty, rewardPercent, rewardCategoryIds, rewardProductIds,
    channels, storeIds, days: days.length === 7 ? [] : days, startMinute, endMinute, startsAt: startsAt!, endsAt: endsAt!, code, maxUses, active: bool(fd, "active"),
    firstPurchaseOnly: bool(fd, "firstPurchaseOnly"), // welcome gift: quote() only offers it to a member with no purchases yet
  };
  if (!promoId) {
    const p = await db.promotion.create({ data });
    await audit(db, g.actor, "promotion.create", { entity: "Promotion", entityId: p.id, data: { name, kind, value, code, firstPurchaseOnly: data.firstPurchaseOnly } });
    revalidatePath("/hq/promotions");
    redirect(`/hq/promotions/${p.id}?saved=1`);
  }
  const before = await db.promotion.findUniqueOrThrow({ where: { id: promoId } });
  await db.promotion.update({ where: { id: promoId }, data });
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(data[k]));
  await audit(db, g.actor, "promotion.update", { storeId: before.ownerStoreId, entity: "Promotion", entityId: promoId, data: { changed } });
  revalidatePath(`/hq/promotions/${promoId}`);
  revalidatePath("/hq/promotions");
  return done(changed.length ? "Promotion saved — tills pick it up on the next basket." : "No changes to save.");
}

export async function setPromotionActive(promoId: string, active: boolean, _: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const p = await db.promotion.update({ where: { id: promoId }, data: { active } });
  await audit(db, g.actor, active ? "promotion.resume" : "promotion.pause", { storeId: p.ownerStoreId, entity: "Promotion", entityId: promoId, data: { name: p.name } });
  revalidatePath(`/hq/promotions/${promoId}`);
  revalidatePath("/hq/promotions");
  flashTo(`/hq/promotions/${promoId}`, active ? "Promotion resumed." : "Promotion paused — it stops applying immediately.");
}
