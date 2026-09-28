// Franchise-lead presentation shared by the HQ list and detail pages (server-safe).
import { Badge, type Tone } from "@/components/ui/badge";
import { LEAD_STATUS, type LeadStatusKey } from "@/lib/leads";

export const LEAD_TONE: Record<LeadStatusKey, Tone> = {
  NEW: "orange",
  CONTACTED: "blue",
  INFO_EVENING: "violet",
  DISCLOSURE_SENT: "amber",
  SIGNED: "green",
  NOT_A_FIT: "neutral",
};

/** Status as a dotted badge with its words (never colour alone). */
export function LeadStatusBadge({ status, className }: { status: LeadStatusKey; className?: string }) {
  return (
    <Badge tone={LEAD_TONE[status]} dot className={className}>
      {LEAD_STATUS[status].label}
    </Badge>
  );
}
