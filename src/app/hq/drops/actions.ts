"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { guard, DENIED, fail, done, flashTo, type ActionState } from "@/server/hq/guard";
import { str, list, bool, parseInt10, parseLocal } from "@/server/hq/form";
import { screenCopy, REG_CLASS_LABEL } from "@/lib/compliance";
import { marketingWindow, nextMarketingSlot } from "@/lib/sa";
import { fmtDateTime } from "@/lib/format";
import type { Tier } from "@/generated/prisma/client";
import { blockedClasses, firstOpen } from "./load";

const EARLY_TIERS: Tier[] = ["SPROUT", "BLOOM", "HARVEST"];

export async function saveDrop(dropId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const before = dropId ? await db.drop.findUnique({ where: { id: dropId } }) : null;
  if (dropId && !before) return fail("That drop no longer exists.");
  const fields: Record<string, string> = {};

  const name = str(fd, "name");
  if (name.length < 3 || name.length > 80) fields.name = "3–80 characters";
  const slug = str(fd, "slug").toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 80) fields.slug = "Lowercase letters, numbers and dashes (3–80)";
  else if (await db.drop.count({ where: { slug, ...(dropId && { id: { not: dropId } }) } })) fields.slug = "Another drop uses this address";
  const blurb = str(fd, "blurb");
  if (blurb.length < 10 || blurb.length > 300) fields.blurb = "10–300 characters";
  const flags = screenCopy(`${name} ${blurb}`);
  if (flags.length) fields.blurb = `“${flags[0].term}” — ${flags[0].reason}`;

  // Never licensed medicines: no promotion, incentive or public listing (Medicines Act s18A / s20).
  const variantIds = list(fd, "variantIds");
  if (!variantIds.length) fields.variantIds = "Pick at least one product";
  else if (variantIds.length > 50) fields.variantIds = "At most 50 products in one drop";
  else {
    const [found, blocked] = await Promise.all([
      db.variant.findMany({ where: { id: { in: variantIds } }, select: { id: true, name: true, product: { select: { name: true, regClass: true } } } }),
      blockedClasses(),
    ]);
    const bad = found.find((v) => blocked.includes(v.product.regClass));
    if (found.length !== variantIds.length) fields.variantIds = "Some products no longer exist — refresh and pick again";
    else if (bad) fields.variantIds = `${bad.product.name} is in ${REG_CLASS_LABEL[bad.product.regClass]} — medicines can't be part of a drop (Medicines Act s18A)`;
  }

  const startsAt = parseLocal(str(fd, "startsAt"));
  if (!startsAt) fields.startsAt = "Pick the opening date and time";
  const endsAt = str(fd, "endsAt") ? parseLocal(str(fd, "endsAt")) : null;
  if (str(fd, "endsAt") && !endsAt) fields.endsAt = "Pick a valid date and time";
  else if (startsAt && endsAt && endsAt <= startsAt) fields.endsAt = "Must end after it opens";
  else if (endsAt && endsAt <= new Date() && !before) fields.endsAt = "The end is in the past"; // editing may end a drop early

  const earlyTier = (str(fd, "earlyTier") || null) as Tier | null;
  if (earlyTier && !EARLY_TIERS.includes(earlyTier)) fields.earlyTier = "Choose a tier";
  const earlyMinutes = earlyTier ? parseInt10(str(fd, "earlyMinutes")) : 0;
  if (earlyTier && (earlyMinutes == null || earlyMinutes < 5 || earlyMinutes > 1440)) fields.earlyMinutes = "5 minutes to 24 hours";
  const perMemberLimit = parseInt10(str(fd, "perMemberLimit"));
  if (perMemberLimit == null || perMemberLimit < 1 || perMemberLimit > 20) fields.perMemberLimit = "1 to 20";
  if (Object.keys(fields).length) return fail(flags.length ? "The copy needs changes before the drop can be saved." : "Check the highlighted fields.", fields);

  const data = { name, slug, blurb, variantIds, startsAt: startsAt!, endsAt, earlyTier, earlyMinutes: earlyMinutes ?? 0, perMemberLimit: perMemberLimit!, membersOnly: bool(fd, "membersOnly") };
  const now = new Date();
  if (!before) {
    const d = await db.drop.create({ data });
    await audit(db, g.actor, "drop.create", { entity: "Drop", entityId: d.id, data: { name, slug, variants: variantIds.length, startsAt: startsAt!.toISOString() } });
    revalidatePath("/hq/drops");
    flashTo(`/hq/drops/${d.id}`, `“${name}” is scheduled. Members can tap “notify me” on its page now.`);
  }
  // Moved to a later opening: watchers are alerted again at the new time.
  const reopen = {
    ...(before.notifiedAt && startsAt! > now && startsAt!.getTime() !== before.startsAt.getTime() && { notifiedAt: null }),
    ...(before.notifiedEarlyAt && firstOpen(data) > now && firstOpen(data).getTime() !== firstOpen(before).getTime() && { notifiedEarlyAt: null }),
  };
  await db.drop.update({ where: { id: before.id }, data: { ...data, ...reopen } });
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(data[k]));
  if (changed.length) await audit(db, g.actor, "drop.update", { entity: "Drop", entityId: before.id, data: { changed } });
  revalidatePath("/hq/drops");
  revalidatePath(`/hq/drops/${before.id}`);
  if (!changed.length) return done("No changes to save.");
  const held = [firstOpen(data), data.startsAt].find((d) => d > now && !marketingWindow(d).allowed);
  return done(`Drop saved.${held ? ` Heads up: “notify me” alerts for ${fmtDateTime(held)} wait until ${fmtDateTime(nextMarketingSlot(held))} (CPA send window).` : ""}`);
}

export async function deleteDrop(dropId: string, _: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const d = await db.drop.findUnique({ where: { id: dropId }, include: { _count: { select: { watchers: true } } } });
  if (!d) return fail("That drop no longer exists.");
  await db.drop.delete({ where: { id: dropId } });
  await audit(db, g.actor, "drop.delete", { entity: "Drop", entityId: dropId, data: { name: d.name, slug: d.slug, watchers: d._count.watchers, startsAt: d.startsAt.toISOString() } });
  revalidatePath("/hq/drops");
  flashTo("/hq/drops", `“${d.name}” deleted — its limits no longer apply and its watchers won't be alerted.`);
}
