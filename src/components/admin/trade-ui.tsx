// Trade (wholesale) channel: the labels and badges the HQ console and the store back office share (order and account
// statuses, fulfilment, payment, terms, ledger kinds and the ageing chips). Server-safe (no hooks).
import { Badge, type Tone } from "@/components/ui/badge";
import { zar } from "@/lib/money";
import { TRADE_KINDS, type Ageing } from "@/lib/trade";
import { cn } from "@/lib/cn";

export const ORDER_STATUS: Record<string, [string, Tone]> = {
  PENDING_PAYMENT: ["Awaiting EFT", "amber"],
  PLACED: ["To pick", "orange"],
  PICKING: ["Picking", "blue"],
  READY: ["Ready to collect", "green"],
  SHIPPED: ["Shipped", "violet"],
  COLLECTED: ["Collected", "neutral"],
  CANCELLED: ["Cancelled", "red"],
};
export const ACCOUNT_STATUS: Record<string, [string, Tone]> = {
  PENDING: ["Pending approval", "amber"],
  APPROVED: ["Approved", "green"],
  ON_HOLD: ["On hold", "red"],
  CLOSED: ["Closed", "neutral"],
};
export const FULFIL_LABEL: Record<string, string> = { COURIER: "Courier from the DC", COLLECT: "Click & collect", SAME_DAY: "Same-day" };
export const PAY_LABEL: Record<string, string> = { EFT: "EFT (prepaid)", ACCOUNT: "On account" };
export const LEDGER_LABEL: Record<string, string> = { INVOICE: "Invoice", PAYMENT: "Payment", CREDIT_NOTE: "Credit note", ADJUSTMENT: "Adjustment" };
export const LEDGER_TONE: Record<string, Tone> = { INVOICE: "orange", PAYMENT: "green", CREDIT_NOTE: "blue", ADJUSTMENT: "neutral" };
export const EVENT_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Pro forma sent, awaiting EFT",
  PLACED: "Confirmed, stock reserved",
  PICKING: "Picking started",
  READY: "Packed and ready to collect",
  SHIPPED: "Shipped",
  COLLECTED: "Handed over",
  CANCELLED: "Cancelled",
};

export const kindLabel = (k: string) => TRADE_KINDS[k as keyof typeof TRADE_KINDS] ?? k;
export const termsLabel = (a: { terms: string; paymentDays: number }) => (a.terms === "ACCOUNT" ? `On account · ${a.paymentDays} days` : "Prepaid (EFT)");
export const statusLabel = (status: string) => ORDER_STATUS[status]?.[0] ?? status.toLowerCase().replace("_", " ");

export function TradeOrderBadge({ status, className }: { status: string; className?: string }) {
  const [label, tone] = ORDER_STATUS[status] ?? [status.toLowerCase().replace("_", " "), "neutral" as Tone];
  return (
    <Badge tone={tone} dot className={className}>
      {label}
    </Badge>
  );
}

export function TradeAccountBadge({ status, className }: { status: string; className?: string }) {
  const [label, tone] = ACCOUNT_STATUS[status] ?? [status.toLowerCase().replace("_", " "), "neutral" as Tone];
  return (
    <Badge tone={tone} dot className={className}>
      {label}
    </Badge>
  );
}

/** Current · 30 · 60 · 90+ days, with the overdue buckets in red and the amounts always written out. */
export function AgeingChips({ ageing, className }: { ageing: Ageing; className?: string }) {
  const buckets: { label: string; cents: number; overdue: boolean }[] = [
    { label: "Current", cents: ageing.current, overdue: false },
    { label: "30 days", cents: ageing.d30, overdue: true },
    { label: "60 days", cents: ageing.d60, overdue: true },
    { label: "90+ days", cents: ageing.d90plus, overdue: true },
  ];
  return (
    <dl className={cn("flex flex-wrap gap-2", className)} aria-label="Age analysis">
      {buckets.map((b) => (
        <div key={b.label} className={cn("rounded-xl border px-3 py-1.5 text-xs", b.overdue && b.cents > 0 ? "border-rose-200 bg-rose-50 text-rose-700" : "border-ink-150 bg-white text-ink-600")}>
          <dt className="inline">{b.label}</dt>
          <dd className={cn("tnum ml-2 inline font-semibold", b.overdue && b.cents > 0 ? "text-rose-700" : "text-ink-900")}>{zar(b.cents)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "12 × case of 6 (72 units)" for a trade line, or "72 units" when the item has no case pack. */
export function casesLabel(qty: number, caseQty: number) {
  const c = Math.max(1, caseQty || 1);
  if (c === 1) return `${qty.toLocaleString()} unit${qty === 1 ? "" : "s"}`;
  const cases = qty / c;
  return Number.isInteger(cases) ? `${cases.toLocaleString()} × case of ${c} (${qty.toLocaleString()} units)` : `${qty.toLocaleString()} units (case of ${c})`;
}
