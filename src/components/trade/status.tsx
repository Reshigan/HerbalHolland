import { Tag } from "@/components/shop/ui";
import { accountStatus, orderStatus } from "./format";

export function OrderStatusTag({ status, className }: { status: string; className?: string }) {
  const [label, tone] = orderStatus(status);
  return (
    <Tag tone={tone} className={className}>
      {label}
    </Tag>
  );
}

export function AccountStatusTag({ status, className }: { status: string; className?: string }) {
  const [label, tone] = accountStatus(status);
  return (
    <Tag tone={tone} className={className}>
      {label}
    </Tag>
  );
}
