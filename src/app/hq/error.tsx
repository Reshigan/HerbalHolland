"use client";
import { PageError } from "@/components/admin/page-error";

export default function HqError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageError {...props} home={{ href: "/hq", label: "Network overview" }} />;
}
