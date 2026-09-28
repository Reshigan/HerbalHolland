"use client";
// In-store TV menu (1920×1080): rotates category panels every ~10 s, keeps a live clock,
// and re-fetches prices and stock every 60 s without a page reload.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export function MenuRotator({ count, interval = 10_000, children }: { count: number; interval?: number; children: React.ReactNode[] }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % Math.max(1, count)), interval);
    return () => clearInterval(t);
  }, [count, interval]);
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(t);
  }, [router]);
  const current = i % Math.max(1, count);
  return (
    <div className="relative h-full">
      {children.map((c, n) => (
        <section key={n} aria-hidden={n !== current} className={cn("absolute inset-0 transition-opacity duration-700", n === current ? "opacity-100" : "pointer-events-none opacity-0")}>
          {c}
        </section>
      ))}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-[0.8vh]" aria-hidden>
        {Array.from({ length: count }, (_, n) => (
          <span key={n} className="relative h-[0.6vh] flex-1 overflow-hidden rounded-full bg-ink-800">
            {n === current && <span key={`${n}-${i}`} className="absolute inset-y-0 left-0 rounded-full bg-brand-500" style={{ animation: `menu-progress ${interval}ms linear forwards` }} />}
            {n < current && <span className="absolute inset-0 rounded-full bg-brand-500/40" />}
          </span>
        ))}
      </div>
      <style>{"@keyframes menu-progress{from{width:0}to{width:100%}}"}</style>
    </div>
  );
}

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span className="tnum">&nbsp;</span>;
  const time = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const day = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "long", day: "numeric", month: "long" }).format(now);
  return (
    <span className="flex flex-col items-end leading-none">
      <span className="tnum font-display text-[4.2vh] font-semibold text-white">{time}</span>
      <span className="mt-[0.5vh] text-[1.5vh] text-ink-400">{day}</span>
    </span>
  );
}
