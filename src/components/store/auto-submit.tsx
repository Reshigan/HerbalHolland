"use client";
// Filter controls that submit their (GET) form as soon as they change.
import { Select, type SelectProps } from "./select";

export function AutoSelect(props: SelectProps) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

export function AutoInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
