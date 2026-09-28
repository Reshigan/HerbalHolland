"use client";
import { ReportError } from "@/components/reports/states";

export default function Error(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ReportError {...props} />;
}
