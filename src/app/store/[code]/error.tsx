"use client";
import { PageError } from "@/components/admin/page-error";

export default function StoreError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageError {...props} home={{ href: "/store", label: "Back to my store" }} />;
}
