"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getSettings, saveSetting } from "@/server/settings";
import { guard, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { str, parseInt10, parseNum } from "@/server/hq/form";
import { TIERS, type TierKey } from "@/lib/loyalty-rules";

const RULES = {
  earnPer100: [1, 50, "1–50 points per R100"],
  signupBonus: [0, 1000, "0–1,000 points"],
  referralBonus: [0, 1000, "0–1,000 points"],
  birthdayBonus: [0, 1000, "0–1,000 points"],
  minRedeem: [1, 10_000, "1–10,000 points"],
  maxRedeemPct: [1, 100, "1–100%"],
} as const;

export async function saveLoyalty(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const next = Object.fromEntries(
    (Object.keys(RULES) as (keyof typeof RULES)[]).map((k) => {
      const [min, max, msg] = RULES[k];
      const v = parseInt10(str(fd, k));
      if (v == null || v < min || v > max) fields[k] = msg;
      return [k, v ?? min];
    }),
  ) as Record<keyof typeof RULES, number>;
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  const before = (await getSettings()).loyalty;
  const after = { ...before, ...next };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => before[k] !== next[k]);
  if (!changed.length) return done("No changes to save.");
  await saveSetting("loyalty", after);
  await audit(db, g.actor, "settings.loyalty", { entity: "Setting", entityId: "loyalty", data: { before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])) } });
  revalidatePath("/hq/loyalty");
  return done("Programme rules saved — they apply to the next sale, sign-up and redemption network-wide.");
}

/** Instant Rewards savings (% off the shelf price) per tier — the Xtra-Savings-style member price. */
export async function saveTierSavings(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const pct = Object.fromEntries(
    TIERS.map((t) => {
      const v = parseNum(str(fd, `save_${t.key}`));
      if (v == null || v < 0 || v > 30 || Math.abs(Math.round(v * 10) - v * 10) > 1e-9) fields[`save_${t.key}`] = "0–30, whole or one decimal";
      return [t.key, v ?? 0];
    }),
  ) as Record<TierKey, number>;
  if (!Object.keys(fields).length && TIERS.some((t, i) => i > 0 && pct[t.key] < pct[TIERS[i - 1].key])) fields.save_HARVEST = "Higher tiers should save at least as much as lower ones";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  const before = (await getSettings()).loyalty;
  if (JSON.stringify(before.tierSavingsPct) === JSON.stringify(pct)) return done("No changes to save.");
  await saveSetting("loyalty", { ...before, tierSavingsPct: pct });
  await audit(db, g.actor, "settings.tier_savings", { entity: "Setting", entityId: "loyalty", data: { before: before.tierSavingsPct, after: pct } });
  revalidatePath("/hq/loyalty");
  return done("Instant savings updated — members see the new prices on their next basket.");
}
