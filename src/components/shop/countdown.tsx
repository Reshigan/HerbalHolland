"use client";
// Live countdown for drops and the launch date. Renders a static fallback on the server (no hydration mismatch),
// ticks every second in the browser and refreshes the page once when it reaches zero so the open state shows.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { countdownParts } from "@/server/shop/launch-rules";
import { cn } from "@/lib/cn";

const two = (n: number) => String(n).padStart(2, "0");

export function Countdown({ to, variant = "inline", label, fallback, className }: { to: string | Date; variant?: "inline" | "blocks"; label: string; fallback?: string; className?: string }) {
  const router = useRouter();
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  const running = useRef(false);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const p = now == null ? null : countdownParts(target - now);
  useEffect(() => {
    if (p) running.current = true;
    else if (now != null && running.current) {
      running.current = false; // only when it ran out while open, never in a loop
      router.refresh();
    }
  }, [p, now, router]);

  if (variant === "blocks") {
    const cells: [string, string][] = p
      ? [[String(p.days), p.days === 1 ? "day" : "days"], [two(p.hours), "hrs"], [two(p.minutes), "min"], [two(p.seconds), "sec"]]
      : [["–", "days"], ["––", "hrs"], ["––", "min"], ["––", "sec"]];
    return (
      <div role="timer" aria-label={label} className={cn("flex gap-2", className)}>
        {cells.map(([v, l]) => (
          <span key={l} className="flex min-w-[3.6rem] flex-col items-center rounded-2xl border border-ink-700 bg-ink-950/70 px-2 py-2.5 sm:min-w-[4.2rem]">
            <span className="tnum font-display text-2xl font-semibold leading-none text-white sm:text-3xl" aria-hidden>{v}</span>
            <span className="mt-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-400" aria-hidden>{l}</span>
          </span>
        ))}
      </div>
    );
  }
  const text = !p ? fallback ?? "" : p.days ? `${p.days}d ${two(p.hours)}h ${two(p.minutes)}m` : `${two(p.hours)}:${two(p.minutes)}:${two(p.seconds)}`;
  return (
    <span role="timer" aria-label={label} className={cn("tnum", className)}>
      <span aria-hidden>{text}</span>
    </span>
  );
}
