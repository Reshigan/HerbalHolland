// Pure rules for the launch-programme screens (no I/O): drop and event phases, early-access labels, the launch
// countdown and welcome-gift wording. Shared by HQ and store pages; covered by tests/hq-launch.test.ts.
import { opensFor } from "@/lib/drops";
import { tierInfo, type TierKey } from "@/lib/loyalty-rules";

type DropTiming = { startsAt: Date; endsAt: Date | null; earlyTier: string | null; earlyMinutes: number };

/** The moment the first members can buy: the early-access tier's opening (lib/drops opensFor), else the start. */
export const firstOpen = (d: Omit<DropTiming, "endsAt">) =>
  d.earlyTier ? opensFor({ ...d, name: "", endsAt: null, perMemberLimit: 1, membersOnly: true, earlyTier: d.earlyTier as TierKey }, d.earlyTier as TierKey) : d.startsAt;

export type DropPhase = "live" | "early" | "upcoming" | "past";

/** Past once it ends; live from the start; "early" while only the early-access tier can buy. */
export function dropPhase(d: DropTiming, now = new Date()): DropPhase {
  if (d.endsAt && d.endsAt <= now) return "past";
  if (d.startsAt <= now) return "live";
  return firstOpen(d) <= now ? "early" : "upcoming";
}

/** "Harvest 2 h early", "Bloom 90 min early"; null without early access. */
export function earlyLabel(tier: string | null, minutes: number) {
  if (!tier || !minutes) return null;
  return `${tierInfo(tier as TierKey).name} ${minutes % 60 ? `${minutes} min` : `${minutes / 60} h`} early`;
}

export type EventPhase = "upcoming" | "on" | "ended";
export const eventPhase = (e: { startsAt: Date; endsAt: Date }, now = new Date()): EventPhase => (e.endsAt <= now ? "ended" : e.startsAt <= now ? "on" : "upcoming");

/** "12 days, 4 hours" / "3 hours, 20 min" / "5 min" until `to` (never negative). */
export function countdown(to: Date, now = new Date()) {
  const m = Math.max(0, Math.round((to.getTime() - now.getTime()) / 60_000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return d ? `${part(d, "day")}${h ? `, ${part(h, "hour")}` : ""}` : h ? `${part(h, "hour")}${min ? `, ${min} min` : ""}` : `${min} min`;
}

type GiftPromo = { firstPurchaseOnly: boolean; kind: string; buyQty: number | null; minSpendCents: number; getQty: number | null; rewardPercent: number | null };

/** A welcome gift with no trigger would read "Spend R0, get 1 free" — say what it is instead (null for other deals). */
export function welcomeLine(p: GiftPromo) {
  if (!p.firstPurchaseOnly || p.kind !== "BUY_X_GET_Y" || p.buyQty || p.minSpendCents) return null;
  const off = p.rewardPercent == null || p.rewardPercent >= 100 ? "free" : `at ${p.rewardPercent}% off`;
  return `${p.getQty ?? 1} ${off} with a member's first purchase`;
}
