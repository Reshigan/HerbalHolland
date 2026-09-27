import { Badge, type Tone } from "./badge";

const MAP: Record<string, [string, Tone]> = {
  // Orders
  PENDING_PAYMENT: ["Awaiting payment", "amber"],
  PLACED: ["New", "orange"],
  PICKING: ["Picking", "blue"],
  READY: ["Ready", "green"],
  OUT_FOR_DELIVERY: ["Out for delivery", "violet"],
  COMPLETED: ["Completed", "neutral"],
  CANCELLED: ["Cancelled", "red"],
  // Stock orders
  DRAFT: ["Draft", "neutral"],
  SUBMITTED: ["Submitted", "orange"],
  APPROVED: ["Approved", "blue"],
  SHIPPED: ["In transit", "violet"],
  RECEIVED: ["Received", "green"],
  REJECTED: ["Rejected", "red"],
  // Batches
  RELEASED: ["Released", "green"],
  QUARANTINE: ["Quarantine", "amber"],
  RECALLED: ["Recalled", "red"],
  // Stock takes / stores / campaigns
  COUNTING: ["Counting", "orange"],
  ACTIVE: ["Active", "green"],
  OPENING_SOON: ["Opening soon", "amber"],
  CLOSED: ["Closed", "neutral"],
  SCHEDULED: ["Scheduled", "blue"],
  SENT: ["Sent", "green"],
  // Payment
  PAID: ["Paid", "green"],
  UNPAID: ["Unpaid", "amber"],
  REFUNDED: ["Refunded", "neutral"],
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const [label, tone] = MAP[status] ?? [status.replaceAll("_", " ").toLowerCase(), "neutral" as Tone];
  return (
    <Badge tone={tone} dot className={className}>
      {label}
    </Badge>
  );
}

export const TIER_TONE: Record<string, Tone> = { SEED: "neutral", SPROUT: "green", BLOOM: "violet", ORANJE: "orange" };
export function TierBadge({ tier }: { tier: string }) {
  return <Badge tone={TIER_TONE[tier] ?? "neutral"}>{tier.charAt(0) + tier.slice(1).toLowerCase()}</Badge>;
}
