// What each loss-prevention rule watches, in plain words and with today's thresholds — so every alert can be
// explained to the franchisee and to the person it's about. Server-only (reads the rule list from @/server/loss).
import { RULES, type Rule } from "@/server/loss";
import { pct, zar } from "@/lib/money";
import type { Settings } from "@/server/settings";

export type Thresholds = Pick<Settings, "loss" | "banking">;

export const RULE_KEYS = Object.keys(RULES) as Rule[];
export const isRule = (v: string): v is Rule => Object.hasOwn(RULES, v);
export const ruleLabel = (rule: string) => (isRule(rule) ? RULES[rule] : rule.replaceAll("_", " ").toLowerCase());

/** Rules grouped the way the screens (and the HQ thresholds form) present them. */
export const RULE_GROUPS: { title: string; rules: Rule[] }[] = [
  { title: "Cash", rules: ["CASH_SHORT", "CASH_SHORT_REPEAT", "DEPOSIT_OVERDUE", "DEPOSIT_SHORT"] },
  { title: "Refunds", rules: ["REFUND", "REFUND_RATE", "SALES_REFUNDED"] },
  { title: "Stock", rules: ["WRITE_OFFS"] },
  { title: "Tills & member cards", rules: ["OWN_MEMBER", "MEMBER_REPEAT", "OFFLINE_SHARE", "OFFLINE_VARIANCE", "AFTER_HOURS", "COMPLIANCE"] },
];

const times = (n: number) => `${n}×`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One line: what raises this alert. */
export function explainRule(rule: string, { loss: s, banking: b }: Thresholds): string {
  if (!isRule(rule)) return "Raised by the loss-prevention checks.";
  switch (rule) {
    case "CASH_SHORT":
      return `A shift is counted ${zar(s.cashShortCents)} or more under what the till expected at close — high severity from ${zar(s.cashShortHighCents)}.`;
    case "CASH_SHORT_REPEAT":
      return `The same person closes ${s.repeatShorts} or more shifts at least ${zar(s.cashShortCents)} short within 30 days.`;
    case "DEPOSIT_OVERDUE":
      return `Cash from a cash-up isn't banked within ${plural(b.dueBusinessDays, "business day")} of the shift closing — high severity once it's more than 3 days late.`;
    case "DEPOSIT_SHORT":
      return `A deposit is more than ${zar(b.shortToleranceCents)} under the cash from the cash-ups it covers (counted cash less the float).`;
    case "REFUND":
      return `A refund with two or more red flags — someone else's sale, within ${s.quickRefundMinutes} minutes of the sale, or just before the shift closed — or a card sale paid back in cash.`;
    case "REFUND_RATE":
      return `Someone's refund rate over 30 days is ${times(s.refundFactor)} the usual for their role across the network, with at least ${plural(s.refundMin, "refund")}.`;
    case "SALES_REFUNDED":
      return `${pct(s.refundedShare, 0)} or more of a person's own sales this month are refunded (at least ${plural(s.refundedMin, "refund")}) — refunded sales can inflate commission.`;
    case "WRITE_OFFS":
      return `The store writes off ${times(s.writeOffFactor)} its usual weekly value of damaged, stolen, lost, expired and stock-take losses, and at least ${zar(s.writeOffMinCents)} at cost.`;
    case "OWN_MEMBER":
      return "Someone rings up a sale on their own Rewards card — staff purchases are rung up by a colleague.";
    case "MEMBER_REPEAT":
      return `One member card collects points on ${s.memberRepeat} or more of the same person's sales in a day.`;
    case "OFFLINE_SHARE":
      return `The store rings up ${times(s.offlineFactor)} its usual share of till sales offline in a week (at least ${plural(s.offlineMin, "offline sale")}) — offline sales skip the live checks.`;
    case "AFTER_HOURS":
      return "A till sale more than 30 minutes outside the store's trading hours.";
    case "COMPLIANCE":
      return "A sale made while the till was offline broke a compliance rule it couldn't check at the time.";
    case "OFFLINE_VARIANCE":
      return "A sale rung up offline came in below today's price, paid short or over, or took more points than the member had.";
  }
}
