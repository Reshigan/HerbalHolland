"use client";
// One-time confirmation after an action whose own button disappears (recall, cancel,
// deactivate…). Actions redirect with ?m=…; this shows it and strips it from the URL
// so a refresh doesn't show it again.
import { useEffect } from "react";
import { Notice } from "@/components/ui/page";

export function Flash({ message, className = "mb-6" }: { message?: string; className?: string }) {
  useEffect(() => {
    if (!message) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("m")) return;
    url.searchParams.delete("m");
    window.history.replaceState(window.history.state, "", url);
  }, [message]);
  if (!message) return null;
  return (
    <Notice tone="success" className={className}>
      {message}
    </Notice>
  );
}
