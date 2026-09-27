"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { audienceSize, sendCampaign } from "@/server/marketing";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { bool, list, parseClock, parseLocal, parseRand, parseWhole, str } from "@/server/store/rules";
import { screenCopy } from "@/lib/compliance";
import { isAudience } from "@/lib/rfm";
import { fmtDateTime } from "@/lib/format";
import type { MsgChannel, PromoKind, Prisma } from "@/generated/prisma/client";

const KINDS: PromoKind[] = ["PERCENT", "FIXED", "BUY_X_GET_Y", "MULTIBUY"];
const CHANNELS: MsgChannel[] = ["SMS", "EMAIL"];
const validSegment = isAudience;

/** Creates or updates one of the store's own till promotions. */
export async function savePromotion(code: string, promoId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const existing = promoId ? await db.promotion.findFirst({ where: { id: promoId, ownerStoreId: store.id } }) : null;
    if (promoId && !existing) return fail("That promotion isn't one of your store's");
    const name = str(fd, "name").slice(0, 80);
    if (name.length < 3) return fail("Give the promotion a name members will understand", "name");
    const kind = str(fd, "kind") as PromoKind;
    if (!KINDS.includes(kind)) return fail("Choose a deal type", "kind");

    let value = 0, buyQty: number | null = null, getQty: number | null = null, rewardPercent: number | null = null;
    if (kind === "PERCENT") {
      const v = parseWhole(str(fd, "percent"), 1, 90);
      if (v == null) return fail("Enter a discount between 1% and 90%", "percent");
      value = v;
    } else if (kind === "FIXED") {
      const v = parseRand(str(fd, "amount"));
      if (v == null || v <= 0 || v > 500_000) return fail("Enter a rand amount off, up to R5,000", "amount");
      value = v;
    } else if (kind === "MULTIBUY") {
      buyQty = parseWhole(str(fd, "bundleQty"), 2, 20);
      if (buyQty == null) return fail("A multi-buy needs 2 to 20 items", "bundleQty");
      const v = parseRand(str(fd, "bundlePrice"));
      if (v == null || v <= 0) return fail("Enter the bundle price", "bundlePrice");
      value = v;
    } else {
      buyQty = str(fd, "buyQty") ? parseWhole(str(fd, "buyQty"), 1, 20) : null;
      getQty = parseWhole(str(fd, "getQty"), 1, 10);
      rewardPercent = parseWhole(str(fd, "rewardPercent"), 1, 100);
      if (str(fd, "buyQty") && buyQty == null) return fail("Buy quantity must be 1 to 20", "buyQty");
      if (getQty == null) return fail("Reward quantity must be 1 to 10", "getQty");
      if (rewardPercent == null) return fail("Reward discount must be 1–100% (100 = free)", "rewardPercent");
    }
    const minSpendCents = str(fd, "minSpend") ? parseRand(str(fd, "minSpend")) : 0;
    if (minSpendCents == null || minSpendCents < 0) return fail("Minimum spend must be a rand amount", "minSpend");
    if (kind === "BUY_X_GET_Y" && !buyQty && !minSpendCents) return fail("Set a buy quantity or a minimum spend to trigger the reward", "buyQty");

    const [categoryIds, productIds, rewardCategoryIds, rewardProductIds] = ["categoryIds", "productIds", "rewardCategoryIds", "rewardProductIds"].map((k) => list(fd, k));
    const cats = await db.category.count({ where: { id: { in: [...categoryIds, ...rewardCategoryIds] } } });
    const prods = await db.product.count({ where: { id: { in: [...productIds, ...rewardProductIds] } } });
    if (cats !== new Set([...categoryIds, ...rewardCategoryIds]).size || prods !== new Set([...productIds, ...rewardProductIds]).size) return fail("Some selected items no longer exist — refresh and try again");

    const promoCode = str(fd, "code").toUpperCase().replace(/\s/g, "");
    if (promoCode && !/^[A-Z0-9]{4,16}$/.test(promoCode)) return fail("Codes are 4–16 letters or numbers", "code");
    if (promoCode && (await db.promotion.findFirst({ where: { code: promoCode, NOT: { id: promoId ?? "" } } }))) return fail("That code is already used somewhere in the network", "code");

    const startsAt = parseLocal(str(fd, "startsAt"));
    const endsAt = parseLocal(str(fd, "endsAt"));
    if (!startsAt) return fail("Choose when it starts", "startsAt");
    if (!endsAt) return fail("Choose when it ends", "endsAt");
    if (endsAt <= startsAt) return fail("It must end after it starts", "endsAt");
    if (!existing && endsAt <= new Date()) return fail("The end date is in the past", "endsAt");
    const days = list(fd, "days").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    const from = str(fd, "from") ? parseClock(str(fd, "from")) : null;
    const to = str(fd, "to") ? parseClock(str(fd, "to")) : null;
    if ((str(fd, "from") && from == null) || (str(fd, "to") && to == null)) return fail("Use 24-hour times like 16:00", "from");
    if ((from == null) !== (to == null)) return fail("Set both a start and an end time for happy hour, or neither", "from");
    if (from != null && to != null && to <= from) return fail("Happy hour must end after it starts", "to");
    const maxUses = str(fd, "maxUses") ? parseWhole(str(fd, "maxUses"), 1, 1_000_000) : null;
    if (str(fd, "maxUses") && maxUses == null) return fail("Max uses must be a whole number", "maxUses");

    const data: Prisma.PromotionUncheckedCreateInput = {
      name,
      description: str(fd, "description").slice(0, 200) || null,
      code: promoCode || null,
      kind,
      value,
      categoryIds,
      productIds,
      minSpendCents,
      buyQty,
      getQty,
      rewardPercent,
      rewardCategoryIds: kind === "BUY_X_GET_Y" ? rewardCategoryIds : [],
      rewardProductIds: kind === "BUY_X_GET_Y" ? rewardProductIds : [],
      channels: ["POS"],
      storeIds: [store.id],
      ownerStoreId: store.id,
      startsAt,
      endsAt,
      days,
      startMinute: from,
      endMinute: to,
      active: true,
      maxUses,
      firstPurchaseOnly: bool(fd, "firstPurchaseOnly"), // welcome gift: only for a member with no purchases yet
    };
    const saved = existing ? await db.promotion.update({ where: { id: existing.id }, data }) : await db.promotion.create({ data });
    await audit(db, actor, existing ? "promotion.update" : "promotion.create", { storeId: store.id, entity: "Promotion", entityId: saved.id, data: { name, kind, value, firstPurchaseOnly: data.firstPurchaseOnly } });
    revalidatePath(`/store/${store.code}/marketing`);
    return done(existing ? `“${name}” updated.` : `“${name}” created — it runs at your tills from ${fmtDateTime(startsAt)}.`);
  });
}

export async function endPromotion(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const p = await db.promotion.findFirst({ where: { id, ownerStoreId: store.id } });
    if (!p) return fail("Promotion not found");
    const now = new Date();
    await db.promotion.update({ where: { id }, data: { active: false, endsAt: p.endsAt > now ? now : p.endsAt } });
    await audit(db, actor, "promotion.end", { storeId: store.id, entity: "Promotion", entityId: id, data: { name: p.name } });
    revalidatePath(`/store/${store.code}/marketing`);
    return done(`“${p.name}” ended.`);
  });
}

/** Reach of a segment × channel among this store's members (consent-aware). */
export async function campaignReach(code: string, segment: string, channel: string) {
  const { store } = await manage(code);
  if (!validSegment(segment) || !CHANNELS.includes(channel as MsgChannel)) return { total: 0, reachable: 0 };
  return audienceSize(segment, channel as MsgChannel, store.id);
}

export async function createCampaign(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const name = str(fd, "name").slice(0, 80);
    if (name.length < 3) return fail("Name the campaign (members see it as the email subject)", "name");
    const segment = str(fd, "segment");
    if (!validSegment(segment)) return fail("Choose who to send to", "segment");
    const channel = str(fd, "channel") as MsgChannel;
    if (!CHANNELS.includes(channel)) return fail("Choose SMS or email", "channel");
    const message = str(fd, "message");
    if (message.length < 10) return fail("Write the message", "message");
    if (message.length > (channel === "SMS" ? 459 : 2_000)) return fail(channel === "SMS" ? "Keep SMS under 3 parts (459 characters)" : "Keep the email under 2,000 characters", "message");
    const flags = screenCopy(message);
    if (flags.length) return fail(`Change “${flags[0].term}” — ${flags[0].reason}`, "message");
    const promotionId = str(fd, "promotionId") || null;
    if (promotionId && !(await db.promotion.findFirst({ where: { id: promotionId, ownerStoreId: store.id } }))) return fail("Choose one of your store's promotions", "promotionId");
    if (message.includes("{{code}}") && !promotionId) return fail("Link a promotion with a code, or remove {{code}}", "promotionId");
    const c = await db.campaign.create({ data: { name, channel, segment, message, storeId: store.id, promotionId, status: "DRAFT" } });
    await audit(db, actor, "campaign.create", { storeId: store.id, entity: "Campaign", entityId: c.id, data: { name, channel, segment } });
    revalidatePath(`/store/${store.code}/marketing`);
    if (str(fd, "intent") !== "send") return done(`“${name}” saved as a draft.`);
    const r = await sendCampaign(c.id, actor);
    if ("scheduledAt" in r && r.scheduledAt) return done(`${r.reason ?? "Outside the legal send window"}. “${name}” is scheduled for ${fmtDateTime(r.scheduledAt)} — the first legal send time.`);
    return done(`Sent to ${r.sent.toLocaleString()} members. ${r.suppressed.toLocaleString()} were skipped (no consent or on a do-not-contact list).`);
  });
}

export async function sendDraft(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const c = await db.campaign.findFirst({ where: { id, storeId: store.id } });
    if (!c) return fail("Campaign not found");
    if (c.status !== "DRAFT") return fail("Only drafts can be sent from here");
    const r = await sendCampaign(c.id, actor);
    revalidatePath(`/store/${store.code}/marketing`);
    if ("scheduledAt" in r && r.scheduledAt) return done(`Scheduled for ${fmtDateTime(r.scheduledAt)} (${(r.reason ?? "outside the legal send window").toLowerCase()}).`);
    return done(`Sent to ${r.sent.toLocaleString()} members.`);
  });
}

export async function cancelCampaign(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const c = await db.campaign.findFirst({ where: { id, storeId: store.id } });
    if (!c) return fail("Campaign not found");
    if (c.status !== "DRAFT" && c.status !== "SCHEDULED") return fail("Sent campaigns can't be cancelled");
    await db.campaign.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(db, actor, "campaign.cancel", { storeId: store.id, entity: "Campaign", entityId: id });
    revalidatePath(`/store/${store.code}/marketing`);
    return done(`“${c.name}” cancelled.`);
  });
}
