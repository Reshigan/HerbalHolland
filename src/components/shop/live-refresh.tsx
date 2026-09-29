"use client";
// Keeps an open order's page current: re-renders on the server when the tab comes back into view, and every
// minute while it is visible. Nothing runs once the order is completed or cancelled.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LiveRefresh({ active, every = 60_000 }: { active: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const tick = () => document.visibilityState === "visible" && router.refresh();
    const t = setInterval(tick, every);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [active, every, router]);
  return null;
}
