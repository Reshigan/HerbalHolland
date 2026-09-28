// Severity and status badges for loss-prevention alerts: an icon or dot plus words, never colour alone.
import { Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ALERT_STATUS, SEVERITY } from "./labels";
import type { AlertSeverity, AlertStatus } from "@/generated/prisma/client";

const ICON: Record<AlertSeverity, LucideIcon> = { HIGH: OctagonAlert, MEDIUM: TriangleAlert, LOW: Info };

export function SeverityBadge({ severity, className }: { severity: AlertSeverity; className?: string }) {
  const s = SEVERITY[severity];
  const Icon = ICON[severity];
  return (
    <Badge tone={s.tone} className={className}>
      <Icon className="h-3 w-3" strokeWidth={2.2} aria-hidden />
      {s.label}
      <span className="sr-only"> severity</span>
    </Badge>
  );
}

export function AlertStatusBadge({ status, className }: { status: AlertStatus; className?: string }) {
  const s = ALERT_STATUS[status];
  return (
    <Badge tone={s.tone} dot className={className}>
      {s.label}
    </Badge>
  );
}
