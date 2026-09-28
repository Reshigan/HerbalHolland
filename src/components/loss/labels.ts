// Loss-prevention labels shared by the store and HQ screens (pure: safe on server and client).
import type { Tone } from "@/components/ui/badge";
import type { AlertSeverity, AlertStatus, Prisma } from "@/generated/prisma/client";

export const SEVERITIES: AlertSeverity[] = ["HIGH", "MEDIUM", "LOW"];

/** Weight is the store risk score: open alerts count high 3, medium 2, low 1. */
export const SEVERITY: Record<AlertSeverity, { label: string; tone: Tone; weight: number }> = {
  HIGH: { label: "High", tone: "red", weight: 3 },
  MEDIUM: { label: "Medium", tone: "amber", weight: 2 },
  LOW: { label: "Low", tone: "neutral", weight: 1 },
};
export const isSeverity = (v: string): v is AlertSeverity => Object.hasOwn(SEVERITY, v);

export const ALERT_STATUS: Record<AlertStatus, { label: string; tone: Tone }> = {
  OPEN: { label: "Open", tone: "orange" },
  INVESTIGATING: { label: "Investigating", tone: "blue" },
  RESOLVED: { label: "Resolved", tone: "green" },
  DISMISSED: { label: "Dismissed", tone: "neutral" },
};

/** Still being worked. */
export const ACTIVE: AlertStatus[] = ["OPEN", "INVESTIGATING"];
export const CLOSED: AlertStatus[] = ["RESOLVED", "DISMISSED"];

/** List views (?status=): open & investigating by default. */
export const VIEWS: Record<"active" | "resolved" | "dismissed" | "all", { label: string; statuses: AlertStatus[] | null }> = {
  active: { label: "Open & investigating", statuses: ACTIVE },
  resolved: { label: "Resolved", statuses: ["RESOLVED"] },
  dismissed: { label: "Dismissed", statuses: ["DISMISSED"] },
  all: { label: "All", statuses: null },
};
export type View = keyof typeof VIEWS;
export const VIEW_KEYS = Object.keys(VIEWS) as View[];
export const viewOf = (v: string | undefined): View => (v && Object.hasOwn(VIEWS, v) ? (v as View) : "active");
export const statusWhere = (v: View): Prisma.AlertWhereInput => {
  const s = VIEWS[v].statuses;
  return s ? { status: { in: s } } : {};
};

export const ROLE_LABEL: Record<string, string> = {
  HQ_ADMIN: "HQ administrator",
  HQ_STAFF: "HQ team",
  AREA_MANAGER: "Area manager",
  OWNER: "Owner",
  MANAGER: "Store manager",
  BUDTENDER: "Budtender",
};
