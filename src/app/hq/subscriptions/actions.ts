"use server";
import { revalidatePath } from "next/cache";
import { db, tx } from "@/server/db";
import { audit } from "@/server/audit";
import { guard, inScope, DENIED, fail, done, flashTo, type ActionState } from "@/server/hq/guard";
import { str, bool, list, parseRand, parseNum, parseInt10 } from "@/server/hq/form";
import { screenCopy } from "@/lib/compliance";
import { planProblem } from "@/lib/subscriptions";
import { ensurePlanVariant, planCandidates, resumeSubscription, cancelSubscription, SubscriptionError } from "@/server/shop/subscriptions";
import type { PlanUnit, ProductStatus } from "@/generated/prisma/client";

const UNITS: PlanUnit[] = ["GRAMS", "UNITS"];
const STATUSES: ProductStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

export async function savePlan(planId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const before = planId ? await db.subscriptionPlan.findUnique({ where: { id: planId } }) : null;
  if (planId && !before) return fail("That plan no longer exists.");
  const fields: Record<string, string> = {};

  const name = str(fd, "name");
  const slug = str(fd, "slug").toLowerCase();
  const tagline = str(fd, "tagline");
  const description = str(fd, "description");
  const imageUrl = str(fd, "imageUrl");
  const itemWord = str(fd, "itemWord") || "items";
  const unit = str(fd, "unit") as PlanUnit;
  const status = str(fd, "status") as ProductStatus;
  const allowance = parseNum(str(fd, "allowance")) ?? 0;
  const priceCents = parseRand(str(fd, "price")) ?? -1;
  const sortOrder = parseInt10(str(fd, "sortOrder")) ?? 0;
  const eligible = list(fd, "eligible");
  const storeIds = list(fd, "storeIds");

  if (!UNITS.includes(unit)) fields.unit = "Choose grams or items";
  if (!STATUSES.includes(status)) fields.status = "Choose a status";
  if (name.length > 80) fields.name = "At most 80 characters";
  if (tagline.length > 120) fields.tagline = "At most 120 characters";
  if (description.length > 1000) fields.description = "At most 1,000 characters";
  if (itemWord.length > 30) fields.itemWord = "At most 30 characters";
  if (imageUrl && !/^(https:\/\/|\/)/.test(imageUrl)) fields.imageUrl = "An https:// address or a path on this site";
  if (slug && (await db.subscriptionPlan.count({ where: { slug, ...(planId && { id: { not: planId } }) } }))) fields.slug = "Another plan uses this address";

  // Only products a plan may offer: no licensed THC and nothing barred from incentives (Medicines Act s18A).
  if (eligible.length) {
    const ok = new Set((await planCandidates()).map((v) => v.id));
    const keep = new Set(before ? (before.eligible as string[]) : []);
    if (eligible.some((id) => !ok.has(id) && !keep.has(id))) fields.eligible = "Some products can't be on a plan (licensed, medicine or no longer on sale).";
  }
  if (storeIds.length && (await db.store.count({ where: { id: { in: storeIds } } })) !== storeIds.length) fields.storeIds = "Some stores no longer exist";

  const flags = screenCopy(`${name} ${tagline} ${description}`);
  if (flags.length) fields.description = `“${flags[0].term}”: ${flags[0].reason}`;
  const problem = planProblem({ name, slug, allowance, priceCents, eligibleCount: eligible.length, active: status === "ACTIVE" });
  if (problem) return fail(problem, fields);
  if (Object.keys(fields).length) return fail(flags.length ? "The copy needs changes before the plan can be saved." : "Check the highlighted fields.", fields);

  const data = { name, slug, tagline: tagline || null, description, imageUrl: imageUrl || null, itemWord, unit, status, allowance, priceCents, sortOrder, eligible, storeIds, rollover: bool(fd, "rollover") };
  const plan = before ? await db.subscriptionPlan.update({ where: { id: before.id }, data }) : await db.subscriptionPlan.create({ data });
  await tx((t) => ensurePlanVariant(t, plan));
  const changed = before ? (Object.keys(data) as (keyof typeof data)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(data[k])) : Object.keys(data);
  await audit(db, g.actor, before ? "subscription.plan.update" : "subscription.plan.create", { entity: "SubscriptionPlan", entityId: plan.id, data: { changed, price: priceCents, status } });
  revalidatePath("/hq/subscriptions");
  revalidatePath("/club/subscriptions");
  if (!before) flashTo(`/hq/subscriptions/${plan.id}`, `“${name}” is saved as ${status === "ACTIVE" ? "live" : status.toLowerCase()}.`);
  revalidatePath(`/hq/subscriptions/${plan.id}`);
  return done(
    changed.length
      ? before.priceCents !== priceCents
        ? "Saved. The new price applies to new members; current members keep their price until you give them notice and change it."
        : "Saved."
      : "No changes to save.",
  );
}

/** HQ keeps (undoes a pending cancel or restarts an overdue plan) or cancels a member's plan (a store in the user's scope only). */
export async function actOnSubscription(subscriptionId: string, act: "resume" | "cancel", _: ActionState, _fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const s = await db.subscription.findUnique({ where: { id: subscriptionId }, select: { id: true, customerId: true, storeId: true } });
  if (!s || !(await inScope(g.scope, s.storeId))) return fail("That subscription isn't in your stores.");
  const a = { customerId: s.customerId, firstName: "", subscriptionId: s.id };
  try {
    if (act === "resume") await resumeSubscription(a, g.actor);
    else await cancelSubscription(a, g.actor);
  } catch (e) {
    if (e instanceof SubscriptionError) return fail(e.message);
    throw e;
  }
  revalidatePath("/hq/subscriptions");
  return done(act === "resume" ? "Kept. The plan renews monthly again; the member gets a payment link when a month is due." : "Cancelled. It ends with the month already paid for, and that month's weekly allowance can still be collected.");
}
