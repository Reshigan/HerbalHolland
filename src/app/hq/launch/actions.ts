"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getSettings, saveSetting } from "@/server/settings";
import { assignFounding, launchState } from "@/server/launch";
import { guard, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { str, parseInt10, parseLocal } from "@/server/hq/form";
import { fmtDateTime } from "@/lib/format";
import type { TierKey } from "@/lib/loyalty-rules";

const FLOOR_TIERS: TierKey[] = ["SPROUT", "BLOOM", "HARVEST"];

/** Launch date and founding programme (settings.launch). Locked once founding numbers exist. */
export async function saveLaunch(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  if (await db.customer.count({ where: { foundingNo: { not: null } } }))
    return fail("Founding numbers are already assigned, so the launch settings are locked. Changing them now would rewrite who joined before launch.");
  const fields: Record<string, string> = {};
  const raw = str(fd, "launchAt");
  const at = raw ? parseLocal(raw) : null;
  if (raw && !at) fields.launchAt = "Pick a date and time";
  const int = (name: string, min: number, max: number, msg: string) => {
    const v = parseInt10(str(fd, name));
    if (v == null || v < min || v > max) fields[name] = msg;
    return v ?? min;
  };
  const foundingCap = int("foundingCap", 1, 100_000, "1 to 100,000 places");
  const foundingMonths = int("foundingMonths", 1, 36, "1 to 36 months");
  const referralBoost = int("referralBoost", 0, 10_000, "0 to 10,000 places");
  const firstYearMonths = int("firstYearMonths", 0, 36, "0 (off) to 36 months");
  const foundingTier = str(fd, "foundingTier") as TierKey;
  if (!FLOOR_TIERS.includes(foundingTier)) fields.foundingTier = "Choose Sprout, Bloom or Harvest";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);

  const before = (await getSettings()).launch;
  const next = { launchAt: at?.toISOString() ?? null, foundingCap, foundingTier, foundingMonths, referralBoost, firstYearMonths };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => before[k] !== next[k]);
  if (!changed.length) return done("No changes to save.");
  await saveSetting("launch", { ...before, ...next });
  await audit(db, g.actor, "settings.launch", {
    entity: "Setting",
    entityId: "launch",
    data: { before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])) },
  });
  revalidatePath("/hq/launch");
  if (!at) return done("Saved. There's no closing date, so there's no Founding Members list.");
  return done(
    at > new Date()
      ? `Saved. The Founding Members list closes ${fmtDateTime(at)}.`
      : `Saved. The closing time has passed: the scheduler numbers the Founding Members within 15 minutes, or you can assign them now below.`,
  );
}

/** Numbers the first `foundingCap` waitlist places now instead of waiting for the scheduler. */
export async function assignFoundingNow(_: ActionState): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const s = await launchState();
  if (!s.at) return fail("Set a launch date first.");
  if (s.preLaunch) return fail(`Founding numbers can only be assigned once the launch time has passed (${fmtDateTime(s.at)}).`);
  if (await db.customer.count({ where: { foundingNo: { not: null } } })) return fail("Founding numbers are already assigned.");
  const { assigned, firstYear } = await assignFounding();
  await audit(db, g.actor, "launch.assign_founding", { entity: "Setting", entityId: "launch", data: { assigned, firstYear, cap: s.foundingCap, tier: s.foundingTier } });
  revalidatePath("/hq/launch");
  return done(`${assigned.toLocaleString()} Founding Members numbered${firstYear ? ` and ${firstYear.toLocaleString()} First Year Members set` : ""}. Their cards show it and at least ${s.foundingTier.charAt(0)}${s.foundingTier.slice(1).toLowerCase()} from now.`);
}
