"use client";
import { PageError } from "@/components/admin/page-error";

export default function TradeError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageError {...props} home={{ href: "/trade", label: "Trade home" }} dark />;
}
