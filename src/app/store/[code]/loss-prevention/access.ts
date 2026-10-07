// Who works loss-prevention alerts at a store, and how an alert moves. Shared by the pages and their server actions.
// Alerts name colleagues, so the pages are for the people who act on them: managers, owners, area managers and HQ,
// not budtenders. Nobody sees an alert about themselves (visibleAlerts in @/server/loss).
import { canManageStore } from "@/server/scope";
import type { Staff } from "@/server/auth";
import type { AlertStatus, Role } from "@/generated/prisma/client";

export const ALERT_ROLES: Role[] = ["HQ_ADMIN", "HQ_STAFF", "AREA_MANAGER", "OWNER", "MANAGER"];

/** Managers, owners and HQ admin (canManageStore), plus area managers and the HQ team. */
export const canActOnAlerts = (u: Staff) => canManageStore(u) || u.role === "AREA_MANAGER" || u.role === "HQ_STAFF";

/** Allowed moves: open → investigating → resolved / dismissed; closed alerts can be reopened. */
export const NEXT_STATUS: Record<AlertStatus, AlertStatus[]> = {
  OPEN: ["INVESTIGATING", "RESOLVED", "DISMISSED"],
  INVESTIGATING: ["RESOLVED", "DISMISSED"],
  RESOLVED: ["OPEN"],
  DISMISSED: ["OPEN"],
};
