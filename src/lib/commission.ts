// Staff commission: basis points of net sales ex VAT per product class, clawed back when a sale is refunded.
// Medicines never earn commission (Medicines Act s18A: no incentive schemes for supplying medicine). Those are the classes
// incentiveExcluded() returns: licensed products in medical mode, and noIncentives (CBD supplements by default).
import type { RegClass } from "./compliance";

export type CommissionLine = { regClass: RegClass; netCents: number }; // ex VAT; refunds are negative

export function commissionCents(lines: CommissionLine[], bps: Partial<Record<RegClass, number>>, excluded: RegClass[]) {
  const byClass = new Map<RegClass, number>();
  for (const l of lines) if (!excluded.includes(l.regClass)) byClass.set(l.regClass, (byClass.get(l.regClass) ?? 0) + l.netCents);
  let total = 0;
  for (const [cls, net] of byClass) total += Math.round((net * Math.max(0, bps[cls] ?? 0)) / 10_000);
  return total;
}
