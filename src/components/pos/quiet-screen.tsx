"use client";
// Quiet hours: after a few idle minutes with no sale open, the Sell screen shows a calm dashboard (today's takings,
// online orders to hand over, low stock, what's waiting and the next event) from data the till already holds.
// Any tap or key returns to selling. Reduced motion: nothing moves.
import { useEffect, useState } from "react";
import { CalendarDays, ClipboardList, PackageCheck, Sparkles, TrendingUp, Boxes } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { api } from "./lib/api";
import { quietDashboard, type QuietDashboard } from "./lib/idle";
import { usePos, type PosTab } from "./context";
import { useReducedMotion } from "./ui";
import { Beadwork } from "./beadwork";
import type { BootShift, ZReport } from "@/server/pos/types";

export function QuietScreen({ onWake }: { onWake: (tab?: PosTab) => void }) {
  const pos = usePos();
  const [x, setX] = useState<ZReport | null>(null);
  const [now, setNow] = useState(() => new Date());
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!pos.online || !pos.boot.shift || pos.boot.shift.id === "training") return;
    let live = true;
    api<{ shift: BootShift | null; report: ZReport | null }>("/api/pos/shift", { quiet401: true })
      .then((r) => live && setX(r.report))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pos.online, pos.boot.shift]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const d: QuietDashboard = quietDashboard({ boot: pos.boot, orders: pos.orders, outbox: pos.outbox, x, online: pos.online, now });

  return (
    <div
      className="absolute inset-0 z-30 flex cursor-pointer flex-col overflow-hidden bg-ink-950 motion-safe:animate-rise"
      onPointerDown={() => onWake()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onWake()}
      aria-label="Quiet hours: tap anywhere to return to selling"
      data-testid="quiet-screen"
    >
      <Beadwork size={12} />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 sm:px-8">
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-center gap-4 text-brand-500">
            <Mark className="h-14 w-14" spin={!reduced} />
            <div>
              <div className="eyebrow text-brand-500">{pos.boot.store.name} · quiet hours</div>
              <div className="font-display text-3xl font-semibold text-white">Tap anywhere to sell</div>
            </div>
          </div>
          <div className="font-display text-5xl font-light tracking-tight text-white tnum">{fmtTime(now)}</div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Tile icon={<TrendingUp className="h-5 w-5" />} title="Takings so far" testId="quiet-takings" onOpen={() => onWake("shift")}>
            {d.takings ? (
              <>
                <div className="font-display text-4xl font-semibold text-white tnum">{zar(d.takings.cents)}</div>
                <div className="mt-1 text-sm text-ink-400">
                  {d.takings.sales} sale{d.takings.sales === 1 ? "" : "s"}
                  {d.takings.refunds ? ` · ${d.takings.refunds} refund${d.takings.refunds === 1 ? "" : "s"}` : ""} this shift
                </div>
              </>
            ) : (
              <div className="text-sm text-ink-400">{pos.boot.shift ? (pos.online ? "Loading the shift…" : "Offline: the shift total loads when you're back online") : "No shift open on this till"}</div>
            )}
          </Tile>

          <Tile icon={<PackageCheck className="h-5 w-5" />} title="Online orders to hand over" testId="quiet-orders" onOpen={() => onWake("orders")}>
            {d.handover.length === 0 ? (
              <div className="text-sm text-ink-400">{d.toPick ? `${d.toPick} to pick, nothing ready yet` : "Nothing waiting for collection"}</div>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {d.handover.slice(0, 4).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3">
                    <span className="truncate text-white">
                      <span className="font-mono font-semibold">{o.code}</span> · {o.customer.name.split(" ")[0]}
                    </span>
                    <span className="shrink-0 text-ink-400">ready {o.readyAt ? fmtTime(o.readyAt) : ""}</span>
                  </li>
                ))}
                {d.handover.length > 4 && <li className="text-ink-400">+{d.handover.length - 4} more</li>}
              </ul>
            )}
          </Tile>

          <Tile icon={<Boxes className="h-5 w-5" />} title="Low stock" testId="quiet-stock" onOpen={() => onWake("stock")}>
            {d.lowStock.length === 0 ? (
              <div className="text-sm text-ink-400">Every line has 4 or more on the shelf</div>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {d.lowStock.map((l) => (
                  <li key={`${l.name}-${l.variantName}`} className="flex items-center justify-between gap-3">
                    <span className="truncate text-white">
                      {l.name} <span className="text-ink-400">· {l.variantName}</span>
                    </span>
                    <span className={cn("shrink-0 font-semibold tnum", l.available <= 0 ? "text-[#f29b9b]" : "text-[#f3c65a]")}>{Math.max(0, l.available)} left</span>
                  </li>
                ))}
              </ul>
            )}
          </Tile>

          <Tile icon={<ClipboardList className="h-5 w-5" />} title="Waiting on this till" testId="quiet-tasks" className="md:col-span-2 xl:col-span-2">
            <ul className="space-y-1.5 text-sm">
              {d.tasks.map((t) => (
                <li key={t.key} className="flex items-start gap-2">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", t.tone === "warn" ? "bg-amber-500" : "bg-leaf-500")} aria-hidden />
                  <span className={t.tone === "warn" ? "text-[#f3c65a]" : "text-ink-200"}>{t.text}</span>
                </li>
              ))}
            </ul>
          </Tile>

          <Tile icon={<CalendarDays className="h-5 w-5" />} title="Next event" testId="quiet-event">
            {d.nextEvent ? (
              <>
                <div className="font-display text-xl font-semibold text-white">{d.nextEvent.title}</div>
                <div className="mt-1 text-sm text-ink-400">{fmtDateTime(d.nextEvent.startsAt)} · check guests in by scanning their ticket</div>
              </>
            ) : (
              <div className="text-sm text-ink-400">Nothing scheduled at this store yet</div>
            )}
          </Tile>
        </div>

        <p className="mt-auto flex items-center gap-2 text-xs text-ink-450">
          <Sparkles className="h-3.5 w-3.5 text-brand-500" /> Scanning a barcode or member card also starts a sale straight away.
        </p>
      </div>
      <Beadwork size={12} />
    </div>
  );
}

function Tile({ icon, title, children, testId, className, onOpen }: { icon: React.ReactNode; title: string; children: React.ReactNode; testId?: string; className?: string; onOpen?: () => void }) {
  return (
    <section
      className={cn("rounded-3xl bg-ink-900 p-5 ring-1 ring-ink-800", onOpen && "hover:ring-brand-500/50", className)}
      data-testid={testId}
      onPointerDown={(e) => {
        if (!onOpen) return;
        e.stopPropagation();
        onOpen();
      }}
    >
      <div className="mb-3 flex items-center gap-2 text-ink-300">
        <span className="text-brand-400">{icon}</span>
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">{title}</h2>
      </div>
      {children}
    </section>
  );
}
