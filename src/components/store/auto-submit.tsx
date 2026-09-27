"use client";
// Form controls that submit their (GET) filter form as soon as they change.
import { Select } from "@/components/ui/form";

export function AutoSelect(props: React.ComponentProps<typeof Select>) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

export function AutoInput(props: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return <input {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
