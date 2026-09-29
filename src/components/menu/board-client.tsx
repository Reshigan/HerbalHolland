"use client";
// The menu board's light client script: rotates the panels every ~12 s, keeps a clock, polls live stock and prices
// every 60 s (patching the server-rendered items in place), asks for a wake lock so the TV never sleeps, and
// re-renders the page from the server every 10 minutes so new lines, deals and events appear without a reload.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { BoardLive } from "@/server/menu-board";

export const ROTATE_MS = 12_000;
export const LIVE_MS = 60_000;
const REFRESH_MS = 10 * 60_000;

export function MenuRotator({ count, interval = ROTATE_MS, children }: { count: number; interval?: number; children: React.ReactNode[] }) {
  const [i, setI] = useState(0);
  const n = Math.max(1, count);
  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), interval);
    return () => clearInterval(t);
  }, [n, interval]);
  const current = i % n;
  return (
    <div className="relative h-full">
      {children.map((c, k) => (
        <section key={k} aria-hidden={k !== current} className={cn("menu-panel absolute inset-0", k === current ? "is-current" : "pointer-events-none")}>
          {c}
        </section>
      ))}
      {n > 1 && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-[0.8vmin]" aria-hidden>
          {Array.from({ length: n }, (_, k) => (
            <span key={k} className="relative h-[0.7vmin] flex-1 overflow-hidden rounded-full bg-ink-800">
              {k === current && <span key={`${k}-${i}`} className="menu-progress absolute inset-y-0 left-0 rounded-full bg-brand-500" style={{ animationDuration: `${interval}ms` }} />}
              {k < current && <span className="absolute inset-0 rounded-full bg-brand-500/40" />}
            </span>
          ))}
        </div>
      )}
      <style>{`
        .menu-panel{opacity:0;transform:translateY(1.6vmin);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
        .menu-panel.is-current{opacity:1;transform:none}
        @keyframes menu-progress{from{width:0}to{width:100%}}
        .menu-progress{animation:menu-progress linear forwards}
        @media (prefers-reduced-motion:reduce){.menu-panel{transition:none;transform:none}.menu-progress{animation:none;width:100%}}
      `}</style>
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
      <span className="tnum font-display text-[4.2vmin] font-semibold text-white">{time}</span>
      <span className="mt-[0.5vmin] text-[1.5vmin] text-ink-400">{day}</span>
    </span>
  );
}

const zar = (cents: number) => `R${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Applies a live snapshot to the server-rendered items: sold-out state, "last few", prices and member prices. */
export function applyLive(root: ParentNode, live: BoardLive) {
  for (const it of live.items) {
    for (const el of root.querySelectorAll<HTMLElement>(`[data-variant="${it.v}"]`)) {
      const soldOut = it.q <= 0;
      if (soldOut) el.setAttribute("data-sold-out", "");
      else el.removeAttribute("data-sold-out");
      if (!soldOut && it.q <= 3) el.setAttribute("data-low", "");
      else el.removeAttribute("data-low");
      const price = el.querySelector<HTMLElement>("[data-price]");
      if (price && price.textContent !== zar(it.p)) price.textContent = zar(it.p);
      const member = el.querySelector<HTMLElement>("[data-member]");
      if (member) {
        if (it.m != null && it.m < it.p) {
          member.textContent = `Members ${zar(it.m)}`;
          member.hidden = false;
        } else member.hidden = true;
      }
    }
  }
}

/** Effects only: the live poll, the periodic server refresh and the wake lock. Renders the "live" dot. */
export function BoardRuntime({ slug }: { slug: string }) {
  const router = useRouter();
  const [liveAt, setLiveAt] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/menu/${slug}/live`, { cache: "no-store" });
        if (!res.ok) return;
        const live = (await res.json()) as BoardLive;
        if (stop) return;
        applyLive(document, live);
        setLiveAt(live.at);
      } catch {
        /* offline for a moment: the board keeps showing what it has */
      }
    };
    const t = setInterval(tick, LIVE_MS);
    const first = setTimeout(tick, 5_000);
    return () => {
      stop = true;
      clearInterval(t);
      clearTimeout(first);
    };
  }, [slug]);

  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  // Keep the screen on. The lock is released when the tab is hidden; ask again when it comes back.
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
    const ask = async () => {
      if (!nav.wakeLock || document.visibilityState !== "visible") return;
      try {
        lock = await nav.wakeLock.request("screen");
      } catch {
        /* not allowed here (http, battery saver): the kiosk's own setting keeps the screen on */
      }
    };
    void ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      document.removeEventListener("visibilitychange", ask);
      void lock?.release();
    };
  }, []);

  const time = liveAt ? new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(liveAt)) : null;
  return (
    <span className="flex items-center gap-[0.6vmin] text-[1.4vmin] text-ink-450" data-live-at={liveAt ?? ""}>
      <span className={cn("h-[0.9vmin] w-[0.9vmin] rounded-full", time ? "bg-leaf-500" : "bg-ink-600")} aria-hidden />
      {time ? `Live · updated ${time}` : "Live stock"}
    </span>
  );
}
