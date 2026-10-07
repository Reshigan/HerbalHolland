"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getSettings, saveSetting } from "@/server/settings";
import { generateOffers } from "@/server/offers";
import { guard, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { str, bool, parseInt10, parseNum } from "@/server/hq/form";
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
  return done("Programme rules saved. They apply to the next sale, sign-up and redemption network-wide.");
}

/** Instant Rewards savings (% off the shelf price) per tier: the Xtra-Savings-style member price. */
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
  return done("Instant savings updated. Members see the new prices on their next basket.");
}

/** My Deals programme settings (settings.offers). Deals already on members' cards keep their terms. */
export async function saveOffers(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const percent = parseInt10(str(fd, "offerPercent"));
  if (percent == null || percent < 5 || percent > 30) fields.offerPercent = "5–30%";
  const validDays = parseInt10(str(fd, "offerDays"));
  if (validDays == null || validDays < 3 || validDays > 14) fields.offerDays = "3–14 days";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  const before = (await getSettings()).offers;
  const next = { enabled: bool(fd, "offersEnabled"), percent: percent!, validDays: validDays! };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => before[k] !== next[k]);
  if (!changed.length) return done("No changes to save.");
  await saveSetting("offers", { ...before, ...next });
  await audit(db, g.actor, "settings.offers", { entity: "Setting", entityId: "offers", data: { before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])) } });
  revalidatePath("/hq/loyalty");
  return done(
    next.enabled
      ? `My Deals saved. New deals are ${next.percent}% off for ${next.validDays} days. Deals already on cards keep their terms.`
      : "My Deals switched off, so no new deals load. Deals already on members' cards stay valid until they expire.",
  );
}

/** Loads this week's deals now instead of waiting for Monday's job. Idempotent: members with a live deal are skipped. */
export async function generateDealsNow(_: ActionState): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  if (!(await getSettings()).offers.enabled) return fail("My Deals is switched off. Switch it on and save first.");
  const { created } = await generateOffers();
  await audit(db, g.actor, "offers.generate", { entity: "MemberOffer", data: { created } });
  revalidatePath("/hq/loyalty");
  return done(
    created
      ? `${created.toLocaleString()} new deals loaded onto members' cards. They apply automatically at the till and online.`
      : "Every opted-in member who bought recently already has a live deal, so there's nothing new to load.",
  );
}
