"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, tx } from "@/server/db";
import { audit } from "@/server/audit";
import { guard, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { getSettings, saveSetting } from "@/server/settings";
import { str, list, bool, parseNum, parseInt10, parseLocal, parseRand } from "@/server/hq/form";
import type { Channel, PriceListKind, Tier } from "@/generated/prisma/client";

const KINDS: PriceListKind[] = ["ZONE", "CHANNEL", "MEMBER"];
const TIERS: Tier[] = ["SEED", "SPROUT", "BLOOM", "HARVEST"];

export async function savePriceList(listId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const name = str(fd, "name");
  if (!name) fields.name = "Give the list a name";
  const kind = str(fd, "kind") as PriceListKind;
  if (!KINDS.includes(kind)) fields.kind = "Choose a type";
  const ch = str(fd, "channel");
  const channel: Channel | null = ch === "POS" || ch === "ONLINE" ? ch : null;
  if (kind === "CHANNEL" && !channel) fields.channel = "A channel list needs a channel";
  const tiers = kind === "MEMBER" ? (list(fd, "tiers").filter((t) => TIERS.includes(t as Tier)) as Tier[]) : [];
  const storeIds = list(fd, "storeIds");
  const regionIds = list(fd, "regionIds");
  const adjRaw = str(fd, "adjustPct");
  const adjustPct = adjRaw ? parseNum(adjRaw) : null;
  if (adjRaw && (adjustPct == null || adjustPct < -90 || adjustPct > 100)) fields.adjustPct = "Between −90% and +100%";
  const startsAt = str(fd, "startsAt") ? parseLocal(str(fd, "startsAt")) : null;
  const endsAt = str(fd, "endsAt") ? parseLocal(str(fd, "endsAt")) : null;
  if (str(fd, "startsAt") && !startsAt) fields.startsAt = "Invalid date";
  if (str(fd, "endsAt") && !endsAt) fields.endsAt = "Invalid date";
  if (startsAt && endsAt && endsAt <= startsAt) fields.endsAt = "Must end after it starts";
  const priority = parseInt10(str(fd, "priority") || "0");
  if (priority == null || priority < -100 || priority > 100) fields.priority = "Whole number, −100 to 100";

  const variantIds = fd.getAll("itemVariant").map(String);
  const prices = fd.getAll("itemPrice").map(String);
  const qtys = fd.getAll("itemMinQty").map(String);
  const items: { variantId: string; priceCents: number; minQty: number }[] = [];
  const seen = new Set<string>();
  variantIds.forEach((variantId, i) => {
    if (!variantId && !prices[i]) return;
    const priceCents = parseRand(prices[i]);
    const minQty = parseInt10(qtys[i] || "1");
    if (!variantId || !priceCents || priceCents <= 0 || !minQty || minQty < 1) {
      fields.items = `Row ${i + 1}: choose an item, a price above R0 and a minimum quantity of 1 or more`;
      return;
    }
    const key = `${variantId}:${minQty}`;
    if (seen.has(key)) fields.items = `Row ${i + 1} repeats an item at the same minimum quantity`;
    seen.add(key);
    items.push({ variantId, priceCents, minQty });
  });
  if (!items.length && adjustPct == null) fields.items = "Add at least one item price, or set a blanket adjustment";
  if (items.length && (await db.variant.count({ where: { id: { in: [...new Set(items.map((i) => i.variantId))] } } })) !== new Set(items.map((i) => i.variantId)).size) fields.items = "One of the items no longer exists";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);

  const data = { name, kind, channel, tiers, storeIds, regionIds, adjustPct, startsAt, endsAt, priority: priority!, active: bool(fd, "active") };
  const saved = await tx(async (t) => {
    const pl = listId ? await t.priceList.update({ where: { id: listId }, data }) : await t.priceList.create({ data });
    await t.priceListItem.deleteMany({ where: { priceListId: pl.id } });
    if (items.length) await t.priceListItem.createMany({ data: items.map((i) => ({ ...i, priceListId: pl.id })) });
    await audit(t, g.actor, listId ? "pricelist.update" : "pricelist.create", { entity: "PriceList", entityId: pl.id, data: { name, kind, items: items.length, adjustPct, active: data.active } });
    return pl;
  });
  revalidatePath("/hq/pricing");
  if (!listId) redirect(`/hq/pricing/${saved.id}?saved=1`);
  revalidatePath(`/hq/pricing/${saved.id}`);
  return done(`Saved. ${data.active ? "Tills and the web shop use it on the next quote." : "It's switched off."}`);
}

export async function deletePriceList(listId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const pl = await db.priceList.findUnique({ where: { id: listId }, include: { _count: { select: { items: true } } } });
  if (!pl) return fail("Price list not found.");
  if (str(fd, "confirm").toUpperCase() !== "DELETE") return fail("Type DELETE to confirm.");
  await db.priceList.delete({ where: { id: listId } });
  await audit(db, g.actor, "pricelist.delete", { entity: "PriceList", entityId: listId, data: { name: pl.name, kind: pl.kind, items: pl._count.items } });
  revalidatePath("/hq/pricing");
  redirect(`/hq/pricing?m=${encodeURIComponent(`“${pl.name}” deleted — prices fall back to the next matching list or RRP.`)}`);
}

/** Network pricing guardrails: near-expiry markdowns at the till and the store margin guide. */
export async function savePricingRules(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const read = (k: string, min: number, max: number) => {
    const v = parseInt10(str(fd, k));
    if (v == null || v < min || v > max) fields[k] = `${min}–${max}`;
    return v ?? min;
  };
  const next = { markdownDays: read("markdownDays", 0, 120), markdownPct: read("markdownPct", 0, 75), minMarginPct: read("minMarginPct", 0, 80) };
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  const before = (await getSettings()).pricing;
  if (JSON.stringify(before) === JSON.stringify({ ...before, ...next })) return done("No changes to save.");
  await saveSetting("pricing", { ...before, ...next });
  await audit(db, g.actor, "settings.pricing", { entity: "Setting", entityId: "pricing", data: { before, after: next } });
  revalidatePath("/hq/pricing");
  return done(next.markdownPct ? `Saved. Stock within ${next.markdownDays} days of expiry is marked down ${next.markdownPct}% at the till.` : "Saved. Near-expiry markdowns are off.");
}
