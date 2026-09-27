import { cache } from "react";
import { db } from "./db";
import { DEFAULT_COMPLIANCE, type ComplianceSettings } from "@/lib/compliance";

export const DEFAULT_SETTINGS = {
  compliance: DEFAULT_COMPLIANCE as ComplianceSettings,
  loyalty: {
    earnPer100: 5,
    signupBonus: 25,
    referralBonus: 50,
    birthdayBonus: 100,
    minRedeem: 20,
    maxRedeemPct: 50,
  },
  pricing: {
    markdownDays: 21, // stock expiring within this many days is marked down at the till
    markdownPct: 20,
    minMarginPct: 25, // franchisee price-setting guardrail (warning only — never enforced)
  },
  ecommerce: {
    sameDayFeeCents: 6_500,
    courierFeeCents: 9_900,
    freeDeliveryOverCents: 90_000,
    sameDayCutoffHour: 15,
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
