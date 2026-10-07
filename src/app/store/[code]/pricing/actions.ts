"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { isHq, requireStaff } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { attempt, done, fail, manage, UserError, type ActionState } from "@/server/store/context";
import { str } from "@/server/store/rules";
import { marginPct } from "@/lib/pricing-rules";
import { plural } from "@/lib/plural";

// Competition Act s5(2): HQ recommends prices and never sets a franchisee's selling price (docs/COMPLIANCE.md).
async function managePrices(code: string) {
  if (isHq(await requireStaff())) throw new UserError("Shelf prices are the franchisee's to set");
  return manage(code);
}

/** Saves edited shelf prices (null = back to the recommended / list price). Warnings only — never blocks. */
export async function savePrices(code: string, changes: { variantId: string; priceCents: number | null }[]): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await managePrices(code);
    if (!Array.isArray(changes) || !changes.length) return fail("No changes to save");
    if (changes.length > 2_000) return fail("Too many changes at once");
    const rows = await db.storeVariant.findMany({
      where: { storeId: store.id, variantId: { in: changes.map((c) => c.variantId) } },
      include: { variant: { select: { sku: true, priceCents: true, wholesaleCents: true } } },
    });
    const by = new Map(rows.map((r) => [r.variantId, r]));
    for (const c of changes) {
      const r = by.get(c.variantId);
      if (!r) return fail("One of these items isn't ranged at your store any more. Refresh the page.");
      if (c.priceCents != null && (!Number.isInteger(c.priceCents) || c.priceCents < 100 || c.priceCents > r.variant.priceCents * 5))
        return fail(`${r.variant.sku}: enter a price between R1 and five times the RRP`);
    }
    const min = (await getSettings()).pricing.minMarginPct / 100;
    await db.$transaction(changes.map((c) => db.storeVariant.update({ where: { storeId_variantId: { storeId: store.id, variantId: c.variantId } }, data: { priceCents: c.priceCents } })));
    await db.auditLog.createMany({
      data: changes.map((c) => ({
        actorType: actor.type,
        actorId: actor.id ?? null,
        actorName: actor.name ?? null,
        storeId: store.id,
        action: "price.override",
        entity: "Variant",
        entityId: c.variantId,
        data: { sku: by.get(c.variantId)!.variant.sku, from: by.get(c.variantId)!.priceCents, to: c.priceCents },
      })),
    });
    const thin = changes.filter((c) => c.priceCents != null && marginPct(c.priceCents, by.get(c.variantId)!.variant.wholesaleCents) < min).length;
    revalidatePath(`/store/${store.code}/pricing`);
    return done(`Saved ${changes.length} price${changes.length === 1 ? "" : "s"}.${thin ? ` ${thin} ${thin === 1 ? "is" : "are"} below the ${min * 100}% margin guide, but it's your call.` : ""} New prices apply at your tills straight away.`);
  });
}

/** Bulk: set a category to a % above/below RRP (rounded to the rand), or clear own prices. */
export async function bulkPrices(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await managePrices(code);
    const category = str(fd, "category");
    const mode = str(fd, "mode") === "reset" ? "reset" : "pct";
    const pct = Number(str(fd, "pct").replace(",", "."));
    if (mode === "pct" && (!Number.isFinite(pct) || pct < -50 || pct > 100)) return fail("Enter a percentage between −50 and +100", "pct");
    const rows = await db.storeVariant.findMany({
      where: { storeId: store.id, variant: { active: true, ...(category && { product: { category: { slug: category } } }) } },
      include: { variant: { select: { priceCents: true } } },
    });
    if (!rows.length) return fail("No ranged items in that category");
    const next = (rrp: number) => (mode === "reset" ? null : Math.max(100, Math.round((rrp * (100 + pct)) / 100 / 100) * 100));
    await db.$transaction(rows.map((r) => db.storeVariant.update({ where: { storeId_variantId: { storeId: store.id, variantId: r.variantId } }, data: { priceCents: next(r.variant.priceCents) } })));
    await audit(db, actor, "price.override", { storeId: store.id, data: { bulk: true, category: category || "ALL", mode, pct: mode === "pct" ? pct : null, count: rows.length } });
    revalidatePath(`/store/${store.code}/pricing`);
    return done(mode === "reset" ? `Cleared your own prices on ${plural(rows.length, "item")}. They follow the recommended price again.` : `Set ${plural(rows.length, "item")} to ${pct >= 0 ? "+" : ""}${pct}% vs RRP, rounded to the rand.`);
  });
}
