"use client";
// Filter controls that submit their (GET) form as soon as they change.
import { Select, type SelectProps } from "@/components/ui/form";

export function AutoSelect(props: SelectProps) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
