// Returns presentation shared by HQ and the store back office (server-safe).
import { Badge, type Tone } from "@/components/ui/badge";
import { RETURN_REASON, RETURN_STATUS, type ReturnReasonKey, type ReturnStatusKey } from "@/lib/returns";

export const RETURN_TONE: Record<ReturnStatusKey, Tone> = { REQUESTED: "orange", APPROVED: "blue", COLLECTION_BOOKED: "violet", RECEIVED: "amber", REFUNDED: "green", DECLINED: "neutral" };

export function ReturnStatusBadge({ status, className }: { status: ReturnStatusKey; className?: string }) {
  return (
    <Badge tone={RETURN_TONE[status]} dot className={className}>
      {RETURN_STATUS[status].label}
    </Badge>
  );
}

export function ReasonBadge({ reason, className }: { reason: ReturnReasonKey; className?: string }) {
  return (
    <Badge tone={reason === "COOLING_OFF" ? "neutral" : "amber"} className={className}>
      {RETURN_REASON[reason].label}
    </Badge>
  );
}
