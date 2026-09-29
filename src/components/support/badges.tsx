// Support presentation shared by HQ and the store back office (server-safe): status, priority, category and SLA badges
// with their words (never colour alone).
import { Badge, type Tone } from "@/components/ui/badge";
import { SUPPORT_CATEGORY, SUPPORT_PRIORITY, SUPPORT_STATUS, slaLabel, type SlaState, type SupportCategoryKey, type SupportPriorityKey, type SupportStatusKey } from "@/lib/support";

export const TICKET_TONE: Record<SupportStatusKey, Tone> = { OPEN: "orange", WAITING_MEMBER: "blue", RESOLVED: "neutral" };
export const PRIORITY_TONE: Record<SupportPriorityKey, Tone> = { LOW: "neutral", NORMAL: "blue", HIGH: "red" };

export function TicketStatusBadge({ status, className }: { status: SupportStatusKey; className?: string }) {
  return (
    <Badge tone={TICKET_TONE[status]} dot className={className}>
      {SUPPORT_STATUS[status].label}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority: SupportPriorityKey; className?: string }) {
  return (
    <Badge tone={PRIORITY_TONE[priority]} className={className}>
      {SUPPORT_PRIORITY[priority]}
    </Badge>
  );
}

export function CategoryBadge({ category, className }: { category: SupportCategoryKey; className?: string }) {
  return (
    <Badge tone="neutral" className={className}>
      {SUPPORT_CATEGORY[category].label}
    </Badge>
  );
}

/** The SLA at a glance: the next deadline that matters, overdue in red. */
export function SlaBadge({ t, sla, now, className }: { t: { status: SupportStatusKey; firstResponseDueAt: Date; resolveDueAt: Date }; sla: SlaState; now: Date; className?: string }) {
  if (sla.firstResponse !== "met") {
    const over = sla.firstResponse === "overdue";
    return (
      <Badge tone={over ? "red" : "amber"} dot className={className}>
        First reply {slaLabel(t.firstResponseDueAt, now)}
      </Badge>
    );
  }
  if (sla.resolve === "met")
    return (
      <Badge tone="green" className={className}>
        Resolved
      </Badge>
    );
  if (sla.resolve === "paused")
    return (
      <Badge tone="neutral" className={className}>
        Waiting for member
      </Badge>
    );
  return (
    <Badge tone={sla.resolve === "overdue" ? "red" : "neutral"} dot={sla.resolve === "overdue"} className={className}>
      Resolve {slaLabel(t.resolveDueAt, now)}
    </Badge>
  );
}
