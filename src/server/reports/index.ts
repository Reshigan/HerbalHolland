// The report registry. Every report is a ReportDef: the catalogue pages list them,
// /store/[code]/reports/[key] and /hq/reports/[key] render them with <ReportView>, and
// /api/reports/[key] re-runs the same definition for the CSV export.
import type { Role } from "@/generated/prisma/client";
import { GROUPS, type ReportDef, type ReportScope } from "./types";
import { onlineOrders, payments, refunds, salesByCategory, salesByHour, salesByProduct, salesByStaff, salesByStore, salesOverview } from "./sales";
import { deadStock, expiry, lowStock, negativeStock, sellThrough, shrinkage, stockMovements, stockValuation } from "./inventory";
import { purchases, receiving } from "./purchasing";
import { cashUps, loyaltyLiability, pnl, statements, vat } from "./finance";
import { joinSources, memberAttach, newVsReturning, rewardsSavings, segments } from "./customers";
import { campaigns, promotions } from "./marketing";
import { ageChecks, batchTrace, complianceEvents, dispensingRegister, recalls } from "./compliance";

export * from "./types";

export const REPORTS: ReportDef[] = [
  // Sales
  salesOverview, salesByProduct, salesByCategory, salesByStore, salesByHour, salesByStaff, refunds, payments, onlineOrders,
  // Inventory
  stockValuation, stockMovements, shrinkage, expiry, deadStock, sellThrough, lowStock, negativeStock,
  // Purchasing
  purchases, receiving,
  // Finance
  pnl, vat, cashUps, statements, loyaltyLiability,
  // Members
  segments, newVsReturning, memberAttach, rewardsSavings, joinSources,
  // Marketing
  promotions, campaigns,
  // Compliance
  ageChecks, dispensingRegister, complianceEvents, recalls, batchTrace,
];

const BY_KEY = new Map(REPORTS.map((r) => [r.key, r]));

export const getReport = (key: string) => BY_KEY.get(key) ?? null;

export const canRun = (def: ReportDef, role: Role) => !def.roles || def.roles.includes(role);

/** Reports available in a scope to a role, grouped in catalogue order. */
export function catalogue(scope: ReportScope, role: Role, opts: { multiStore?: boolean } = {}) {
  const list = REPORTS.filter((r) => r.scopes.includes(scope) && canRun(r, role) && (scope === "hq" || !r.multiStore || opts.multiStore));
  return GROUPS.map((group) => ({ group, reports: list.filter((r) => r.group === group) })).filter((g) => g.reports.length);
}
