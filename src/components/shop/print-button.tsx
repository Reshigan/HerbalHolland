"use client";
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("dark", "md")}>
      <Printer className="h-4 w-4" /> {label}
    </button>
  );
}
