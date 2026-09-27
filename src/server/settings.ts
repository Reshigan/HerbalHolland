import { cache } from "react";
import { db } from "./db";
import { DEFAULT_COMPLIANCE, type ComplianceSettings } from "@/lib/compliance";
import { DEFAULT_TIER_SAVINGS, type TierKey } from "@/lib/loyalty-rules";

export const DEFAULT_SETTINGS = {
  compliance: DEFAULT_COMPLIANCE as ComplianceSettings,
  loyalty: {
    earnPer100: 5,
    signupBonus: 25,
    referralBonus: 50,
    birthdayBonus: 100,
    tierSavingsPct: DEFAULT_TIER_SAVINGS as Record<TierKey, number>, // instant Rewards prices by tier
    minRedeem: 20,
    maxRedeemPct: 50,
  },
  pricing: {
    markdownDays: 21, // stock expiring within this many days is marked down at the till
    markdownPct: 20,
    minMarginPct: 25, // franchisee price-setting guardrail (warning only — never enforced)
  },
  launch: {
    launchAt: null as string | null, // ISO date-time; before it the storefront runs as a waitlist
    foundingCap: 10_000, // the first N waitlist places become numbered Founding Members
    foundingTier: "SPROUT" as TierKey, // …who hold at least this tier
    foundingMonths: 12, // …for this long after launch
    referralBoost: 250, // waitlist places gained per friend who joins before launch
  },
  offers: {
    enabled: true, // My Deals: weekly personal offer on each opted-in member's favourite product (HQ-funded)
    percent: 15,
    validDays: 7,
  },
  ecommerce: {
    sameDayFeeCents: 6_500,
    courierFeeCents: 9_900,
    freeDeliveryOverCents: 90_000,
    merchCourierCents: 10_000, // made-to-order merch: the merch partner's courier at cost (Aramex), always on top of the price
    sameDayCutoffHour: 15,
    unpaidHoldMinutes: 60, // unpaid online orders are cancelled (stock released) after this
    collectHoldDays: 7, // pay-in-store collections not picked up are cancelled after this
  },
};
export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;

export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await db.setting.findMany();
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) if (r.key in out) Object.assign(out[r.key as SettingKey], r.value as object);
  return out;
});

export async function saveSetting<K extends SettingKey>(key: K, value: Settings[K]) {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
