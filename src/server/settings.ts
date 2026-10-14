import type { LaunchPhase } from "@/lib/launch-phase";
import { cache } from "react";
import { db } from "./db";
import { DEFAULT_COMPLIANCE, type ComplianceSettings } from "@/lib/compliance";
import { DEFAULT_TIER_SAVINGS, type TierKey } from "@/lib/loyalty-rules";
import { DEFAULT_LOSS } from "@/lib/loss";
import { DEFAULT_DELIVERY_DAYS, type DeliveryDays } from "@/lib/delivery";
import type { RegClass } from "@/lib/compliance";

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
    minMarginPct: 25, // franchisee price-setting guardrail (warning only, never enforced)
  },
  launch: {
    phase: "STORES" as LaunchPhase, // BRAND (site + social only) → ONLINE (courier shopping) → STORES (everything); see @/lib/launch-phase
    launchAt: null as string | null, // ISO date-time when the Founding Members list closes (null = no list)
    foundingCap: 2_026, // the first N waitlist places become numbered Founding Members
    foundingTier: "SPROUT" as TierKey, // …who hold at least this tier
    foundingMonths: 14, // …for this long after launch
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
    merchNotice: "", // shown with made-to-order merch, e.g. the partner's festive closure and the last order date for Christmas
    sameDayCutoffHour: 15,
    unpaidHoldMinutes: 60, // unpaid online orders are cancelled (stock released) after this
    collectHoldDays: 7, // pay-in-store collections not picked up are cancelled after this
    deliveryDays: DEFAULT_DELIVERY_DAYS as DeliveryDays, // courier working days door to door, by province (min, max)
  },
  banking: {
    dueBusinessDays: 1, // cash from a cash-up is in the bank by the end of this many business days
    shortToleranceCents: 5_000, // a deposit more than this under its cash-ups raises an alert
  },
  loss: DEFAULT_LOSS,
  commission: {
    // Basis points of net sales ex VAT, by product class. Classes in compliance.noIncentives and licensed medicines never
    // earn commission (s18A), whatever is set.
    bps: { THC: 0, CBD: 200, CBD_FOOD: 200, CBD_TOPICAL: 200, HEMP: 200, SUPPLEMENT: 200, ACCESSORY: 200, APPAREL: 200, GROW: 200 } as Record<RegClass, number>,
  },
  operations: {
    // The store's Today list: a category is due a cycle count this many days after its last approved count…
    cycleCountDays: 30,
    cycleCountByCategory: {} as Record<string, number>, // …or its own cadence by category slug
    batchExpiryDays: 30, // lots expiring within this many days are flagged
    patientAuthDays: 14, // patient authorisations lapsing within this many days are flagged
    supplierInvoiceDays: 7, // supplier invoices due within this many days are flagged
  },
  trade: {
    // The trade (wholesale) channel: businesses buying at ex-VAT prices online (courier from the DC, or click &
    // collect at a store) and at the till. Amounts are cents ex VAT; VAT is added per line.
    minOrderCents: 200_000, // R2,000 ex VAT, after any promotion
    deliveryCents: 15_000, // courier from the DC: a flat R150 ex VAT…
    freeDeliveryOverCents: 500_000, // …free from R5,000 ex VAT
    collectHandlingCents: 7_500, // click & collect: the store's handling fee, R75 ex VAT (no delivery fee)
    eftHoldDays: 3, // an EFT order's payment must arrive within this many days or the order lapses
    overdueGraceDays: 7, // an invoice this many days past due puts an account on hold (lifted when it's settled)
    statementDay: 1, // day of the month the previous month's statements go out
    termsVersion: "trade-1", // the trade terms applicants accept (stored on the account)
    bank: { bank: "", accountName: "", accountNumber: "", branchCode: "" }, // where EFT payments go (printed on pro formas)
  },
  legal: {
    // HQ → Compliance: ticked once counsel has signed off the legal texts. Until then the legal pages and the trade terms
    // carry a review note, and each line counsel must confirm shows its question.
    reviewed: false,
  },
};
type Defaults = typeof DEFAULT_SETTINGS;
/** The settings as read: `ecommerce.deliveryDays` is optional in a saved value (older rows, the HQ form) and falls back to the defaults. */
export type Settings = Omit<Defaults, "ecommerce"> & { ecommerce: Omit<Defaults["ecommerce"], "deliveryDays"> & { deliveryDays?: DeliveryDays } };
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
