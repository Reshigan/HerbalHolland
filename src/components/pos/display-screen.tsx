"use client";
// Customer-facing display (/pos/display): mirrors the till's sale for the person being served. Two feeds:
// a BroadcastChannel from a till in the same browser profile (a second window on the same device), and a light
// poll of /api/pos/display keyed by the paired device + pairing key for a screen on another device. It only ever
// receives what lib/display.ts lets through: first name, points, lines (licensed medicine anonymised), totals.
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Nfc, Sparkles } from "lucide-react";
import { Lockup, Mark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { fmtPoints } from "@/lib/loyalty-rules";
import { Beadwork } from "./beadwork";
import { BRAND_MESSAGES, DISPLAY_CHANNEL, isSnapshot, type DisplaySnapshot, tenderName } from "./lib/display";
import { tierName, useReducedMotion } from "./ui";

const POLL_MS = 2000;
const STALE_MS = 4 * 60_000; // a till that hasn't spoken for this long is treated as gone

export function DisplayScreen({ deviceId, feedKey }: { deviceId: string | null; feedKey: string | null }) {
  const [snap, setSnap] = useState<DisplaySnapshot | null>(null);
  const [stale, setStale] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const lastAt = useRef(0);
  const remote = !!deviceId && !!feedKey;

  const take = useCallback((x: unknown) => {
    if (!isSnapshot(x)) return;
    lastAt.current = Date.now();
    setStale(false);
    setSnap((prev) => (prev && prev.at > x.at ? prev : x));
  }, []);

  // Same device: the till broadcasts every change; on load we say hello so it re-sends the current state.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(DISPLAY_CHANNEL);
    ch.onmessage = (e) => take(e.data);
    ch.postMessage({ type: "hello" });
    const t = setInterval(() => !lastAt.current && ch.postMessage({ type: "hello" }), 5000);
    return () => {
      clearInterval(t);
      ch.close();
    };
  }, [take]);

  // Another device: poll the server feed.
  useEffect(() => {
    if (!remote) return;
    let live = true;
    let misses = 0;
    const tick = async () => {
      try {
        const res = await fetch(`/api/pos/display?d=${encodeURIComponent(deviceId!)}&k=${encodeURIComponent(feedKey!)}`, { cache: "no-store" });
        if (!live) return;
        if (res.ok) {
          misses = 0;
          setRemoteError(null);
          take(((await res.json()) as { snapshot: unknown }).snapshot);
        } else if (res.status === 404) {
          if (++misses >= 3 && !lastAt.current) setRemoteError("Waiting for the till. Turn on “Send to a separate screen” under Shift → This till → Customer display.");
        } else setRemoteError("This display link isn't valid. Open the link the till shows.");
      } catch {
        if (live && ++misses >= 3) setRemoteError("Display not connected. Check the Wi-Fi.");
      }
    };
    void tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [remote, deviceId, feedKey, take]);

  // Staleness, screen wake lock and fullscreen on tap.
  useEffect(() => {
    const t = setInterval(() => lastAt.current && Date.now() - lastAt.current > STALE_MS && setStale(true), 10_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    type WakeLock = { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    const wl = (navigator as unknown as { wakeLock?: WakeLock }).wakeLock;
    if (!wl) return;
    let lock: { release: () => Promise<void> } | null = null;
    const grab = () => wl.request("screen").then((l) => (lock = l)).catch(() => undefined);
    void grab();
    const onVis = () => document.visibilityState === "visible" && void grab();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, []);
  const fullscreen = () => {
    const el = document.documentElement;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.().catch(() => undefined);
  };

  const s = stale ? null : snap;
  const state = s?.state ?? "idle";
  const training = !!s?.training;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-ink-950 text-ink-100 select-none" onClick={fullscreen} data-testid="display" data-state={state}>
      {training && (
        <div className="shrink-0 bg-brand-500 px-6 py-2 text-center font-display text-lg font-bold uppercase tracking-[0.18em] text-ink-950" data-testid="display-training">
          Training: nothing is real
        </div>
      )}
      <Beadwork size={16} />
      <header className="flex shrink-0 items-center justify-between px-8 pt-5 sm:px-12">
        <div className="flex items-center gap-3 text-brand-500">
          <Mark className="h-12 w-12" />
          <div className="leading-tight">
            <div className="eyebrow text-brand-500">Herbal Holland</div>
            <div className="font-display text-xl font-semibold text-white">{s?.store.name ?? "Welcome"}</div>
          </div>
        </div>
        <div className="text-right text-sm text-ink-450">
          {s?.trade && state !== "idle" ? (
            <div className="font-display text-lg font-semibold text-white" data-testid="display-trade">
              Trade sale · {s.trade.account}
            </div>
          ) : null}
          <div>Adults 18+</div>
        </div>
      </header>

      <main className="min-h-0 flex-1 px-8 py-6 sm:px-12">
        {state === "idle" && <IdleView messages={s?.idle?.length ? s.idle : BRAND_MESSAGES} note={remoteError ?? (stale ? "The till has been quiet for a while." : !snap && !remote ? "Waiting for the till…" : null)} />}
        {state === "sale" && s && <SaleView s={s} />}
        {state === "pay" && s && <PayView s={s} />}
        {state === "done" && s && <DoneView s={s} />}
      </main>

      <footer className="shrink-0">
        <div className="flex items-center justify-between px-8 pb-3 text-xs text-ink-450 sm:px-12">
          <span>{s?.trade && state !== "idle" ? "Herbal Holland Trade · prices ex VAT, VAT shown separately" : "Herbal Holland Rewards · members earn points on every visit"}</span>
          <span>shop.herbalholland.com</span>
        </div>
        <Beadwork size={16} />
      </footer>
      {training && <div className="pointer-events-none fixed inset-0 border-[6px] border-brand-500" aria-hidden />}
    </div>
  );
}

function IdleView({ messages, note }: { messages: string[]; note: string | null }) {
  const [i, setI] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 7000);
    return () => clearInterval(t);
  }, []);
  const msg = messages[i % messages.length];
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <Lockup className="h-[clamp(9rem,28vh,15rem)]" spin={!reduced} />
      <p key={msg} className="mt-10 max-w-3xl font-display text-[clamp(1.6rem,3.6vw,3rem)] font-medium leading-snug text-white motion-safe:animate-rise" data-testid="display-idle-message">
        {msg}
      </p>
      {note && (
        <p className="mt-8 text-base text-ink-450" data-testid="display-note">
          {note}
        </p>
      )}
    </div>
  );
}

function SaleView({ s }: { s: DisplaySnapshot }) {
  const deals = s.discountCents + s.savingsCents;
  const trade = !!s.trade;
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section className="flex min-h-0 flex-col" aria-label="Items">
        <div className="eyebrow mb-3 text-brand-500">Your basket</div>
        <ul className="min-h-0 flex-1 divide-y divide-ink-850 overflow-hidden" data-testid="display-lines">
          {s.lines.slice(-8).map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-6 py-3 motion-safe:animate-rise">
              <div className="min-w-0">
                <div className="truncate font-display text-[clamp(1.4rem,2.6vw,2.2rem)] font-medium text-white">{l.name}</div>
                <div className="text-lg text-ink-400">
                  {l.detail ? `${l.detail} · ` : ""}
                  {l.qty} × {zar(Math.round((l.totalCents + l.discountCents) / l.qty))}
                  {l.discountCents > 0 && <span className="ml-3 font-semibold text-[#7fd49a]">−{zar(l.discountCents)}</span>}
                </div>
              </div>
              <div className="shrink-0 font-display text-[clamp(1.4rem,2.6vw,2.2rem)] font-semibold text-white tnum">{zar(l.totalCents)}</div>
            </li>
          ))}
          {s.lines.length === 0 && <li className="py-6 text-xl text-ink-400">Nothing yet. We&apos;re adding your items.</li>}
        </ul>
      </section>
      <aside className="flex flex-col justify-end">
        {s.member && (
          <div className="mb-5 rounded-3xl bg-ink-900 px-6 py-5 ring-1 ring-brand-500/40" data-testid="display-member">
            <div className="flex items-center gap-3">
              <Sparkles className="h-7 w-7 text-brand-400" />
              <div className="font-display text-3xl font-semibold text-white">Hi {s.member.firstName}</div>
            </div>
            <div className="mt-2 text-lg text-ink-300">
              {tierName(s.member.tier)} member · {fmtPoints(s.member.points)}
              {s.member.pointsEstimate > 0 && <span className="text-brand-300"> · earns +{fmtPoints(s.member.pointsEstimate)} today</span>}
            </div>
          </div>
        )}
        {s.promos.length > 0 && (
          <div className="mb-5 rounded-3xl bg-leaf-500/10 px-6 py-4 text-lg text-[#9be0b0] ring-1 ring-leaf-500/30" data-testid="display-promos">
            Deal applied: {s.promos.join(" · ")}
          </div>
        )}
        <dl className="space-y-2 text-xl text-ink-300">
          {trade ? (
            <>
              <div className="flex justify-between">
                <dt>Subtotal ex VAT</dt>
                <dd className="tnum" data-testid="display-ex-vat">
                  {zar(s.exCents ?? s.totalCents - s.vatCents)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>VAT 15%</dt>
                <dd className="tnum">{zar(s.vatCents)}</dd>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tnum">{zar(s.subtotalCents)}</dd>
            </div>
          )}
          {deals > 0 && (
            <div className="flex justify-between text-[#7fd49a]">
              <dt>{trade ? "Trade deals" : "Deals & Rewards savings"}</dt>
              <dd className="tnum">−{zar(deals)}</dd>
            </div>
          )}
          <div className="flex items-end justify-between border-t border-ink-800 pt-4">
            <dt className="font-display text-3xl font-semibold text-white">{trade ? "Total incl VAT" : "Total"}</dt>
            <dd className="font-display text-[clamp(3rem,7vw,6rem)] font-semibold leading-none tracking-tight text-white tnum" data-testid="display-total">
              {zar(s.totalCents)}
            </dd>
          </div>
          {s.vatCents > 0 && !trade && (
            <div className="flex justify-between text-base text-ink-450">
              <dt>Includes VAT</dt>
              <dd className="tnum">{zar(s.vatCents)}</dd>
            </div>
          )}
        </dl>
      </aside>
    </div>
  );
}

function PayView({ s }: { s: DisplaySnapshot }) {
  const p = s.pay ?? { dueCents: s.totalCents, paidCents: 0, tapping: false, method: null };
  const due = Math.max(0, p.dueCents - p.paidCents);
  return (
    <div className="flex h-full flex-col items-center justify-center text-center" data-testid="display-pay">
      <div className="relative grid h-40 w-40 place-items-center rounded-full bg-brand-500 text-ink-950">
        {p.tapping && <span className="absolute inset-0 rounded-full bg-brand-500/60 motion-safe:animate-pulse-ring" aria-hidden />}
        <Nfc className="relative h-20 w-20" strokeWidth={1.9} />
      </div>
      <div className="mt-8 eyebrow text-brand-500">{p.tapping ? "Tap to pay" : p.paidCents > 0 ? "Still to pay" : "Ready to pay"}</div>
      <div className="mt-2 font-display text-[clamp(3.5rem,9vw,7rem)] font-semibold leading-none tracking-tight text-white tnum">{zar(due)}</div>
      <p className="mt-6 max-w-xl text-2xl text-ink-300" data-testid="display-tender">
        {p.tapping
          ? "Hold your card, phone or watch on the reader."
          : tenderName(p.method)
            ? `${tenderName(p.method)}${p.paidCents > 0 ? ` · ${zar(p.paidCents)} paid so far` : ""}`
            : p.paidCents > 0
              ? `${zar(p.paidCents)} paid so far.`
              : "Your cashier will take your payment from here."}
      </p>
      {s.member && <p className="mt-4 text-lg text-brand-300">Thanks, {s.member.firstName}. Your points are on their way.</p>}
    </div>
  );
}

function DoneView({ s }: { s: DisplaySnapshot }) {
  const d = s.done!;
  return (
    <div className="flex h-full flex-col items-center justify-center text-center" data-testid="display-done">
      <CheckCircle2 className="h-24 w-24 text-[#7fd49a]" strokeWidth={1.6} />
      <div className="mt-6 font-display text-[clamp(2.4rem,6vw,4.5rem)] font-semibold tracking-tight text-white">Thank you{d.firstName ? `, ${d.firstName}` : ""}</div>
      <div className="mt-3 text-2xl text-ink-300">
        Paid {zar(d.totalCents)}
        {d.changeCents > 0 && (
          <>
            {" "}
            · change <b className="text-white">{zar(d.changeCents)}</b>
          </>
        )}
      </div>
      {d.pointsEarned > 0 && (
        <div className={cn("mt-8 inline-flex items-center gap-3 rounded-full bg-brand-500/15 px-6 py-3 text-2xl text-brand-200 ring-1 ring-brand-500/40")} data-testid="display-points">
          <Sparkles className="h-7 w-7 text-brand-400" /> +{fmtPoints(d.pointsEarned)} earned{d.balance != null && ` · balance ${fmtPoints(d.balance)}`}
        </div>
      )}
      <p className="mt-10 text-lg text-ink-450">See you again soon. Adults 18+.</p>
    </div>
  );
}
