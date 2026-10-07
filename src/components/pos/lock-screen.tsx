"use client";
// Lock screen: store name, staff tiles (role + dispenser badge) and a PIN pad.
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CloudOff, Delete, ShieldCheck, Wifi } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { fmtTime } from "@/lib/format";
import { isTillManager } from "@/lib/pos-refund";
import { Alert, Chip } from "./ui";
import type { SessionInfo, StaffTile } from "@/server/pos/types";

const ROLE: Record<string, string> = { MANAGER: "Store manager", OWNER: "Owner", BUDTENDER: "Budtender" };

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function LockScreen({
  session,
  online,
  queued,
  reason,
  preselect,
  onUnlock,
  onCancel,
}: {
  session: SessionInfo;
  online: boolean;
  queued: number;
  reason?: "dispenser" | "manager" | "expired" | null;
  preselect?: string | null;
  onUnlock: (staff: StaffTile, pin: string) => Promise<string | null>; // returns an error message or null
  onCancel?: () => void;
}) {
  const [picked, setPicked] = useState<StaffTile | null>(() => session.staff.find((s) => s.id === preselect) ?? null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const eligible = (s: StaffTile) => (reason === "dispenser" ? s.canDispense : reason === "manager" ? isTillManager(s.role) : true);

  const submit = useCallback(
    async (code: string) => {
      if (!picked || busy) return;
      setBusy(true);
      setError(null);
      const err = await onUnlock(picked, code);
      setBusy(false);
      if (err) {
        setError(err);
        setCode("");
      }
    },
    [picked, busy, onUnlock],
  );

  const pinRef = useRef("");
  const setCode = (v: string) => {
    pinRef.current = v;
    setPin(v);
  };
  const press = useCallback(
    (d: string) => {
      if (busy) return;
      const p = pinRef.current;
      const next = d === "back" ? p.slice(0, -1) : d === "clear" ? "" : p.length < 4 ? p + d : p;
      setError(null);
      setCode(next);
      if (next.length === 4 && p.length === 3) void submit(next);
    },
    [busy, submit],
  );

  // Physical keyboards: digits, Backspace, Escape.
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    if (!picked) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) pressRef.current(e.key);
      else if (e.key === "Backspace") pressRef.current("back");
      else if (e.key === "Escape") (setPicked(null), setCode(""), setError(null));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked]);

  return (
    <div className="fixed inset-0 z-[55] flex flex-col overflow-y-auto bg-ink-950 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-ink-100 print:hidden lg:flex-row">
      {/* Brand + store panel */}
      <section className="relative flex shrink-0 flex-col justify-between gap-6 border-b border-ink-850 px-6 py-6 lg:w-[38%] lg:border-b-0 lg:border-r lg:px-10 lg:py-10">
        <div className="flex items-center gap-3 text-brand-500">
          <Mark className="h-11 w-11" />
          <div>
            <div className="eyebrow text-[0.65rem] text-brand-500">Herbal Holland till</div>
            <div className="font-display text-lg font-semibold leading-tight text-white">{session.store.name}</div>
          </div>
        </div>
        <div className="hidden lg:block">
          <div className="font-display text-7xl font-light tracking-tight text-white tnum" suppressHydrationWarning>
            {now ? fmtTime(now) : "--:--"}
          </div>
          <div className="mt-2 text-ink-400">
            {session.store.suburb}, {session.store.city} · {session.device.name} ({session.store.code}-{session.device.prefix})
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {online ? (
            <Chip tone="green" icon={<Wifi className="h-3.5 w-3.5" />}>
              Online
            </Chip>
          ) : (
            <Chip tone="amber" icon={<CloudOff className="h-3.5 w-3.5" />}>
              Offline
            </Chip>
          )}
          {queued > 0 && <Chip tone="amber">{queued} sale{queued === 1 ? "" : "s"} waiting to sync</Chip>}
          <span className="text-ink-500 lg:hidden">
            {session.device.name} · {session.store.code}-{session.device.prefix}
          </span>
        </div>
      </section>

      {/* Staff + PIN */}
      <section className="flex flex-1 flex-col px-5 py-6 lg:px-12 lg:py-10">
        {!picked ? (
          <>
            <h1 className="font-display text-2xl font-semibold text-white lg:text-3xl">{reason === "dispenser" ? "Switch to a dispenser" : reason === "manager" ? "Manager sign-in" : "Who's at the till?"}</h1>
            <p className="mt-1 text-ink-400">
              {reason === "dispenser"
                ? "An authorised dispenser must complete this sale. Your basket is kept."
                : reason === "expired"
                  ? "Your session ended. Sign in again with your PIN."
                  : "Tap your name, then enter your PIN."}
            </p>
            {!online && (
              <Alert tone="warn" className="mt-4">
                Offline: only staff who signed in on this till in the last 12 hours can unlock it until the connection is back.
              </Alert>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {session.staff.map((s) => {
                const ok = eligible(s);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!ok}
                    onClick={() => (setPicked(s), setCode(""), setError(null))}
                    className={cn(
                      "group flex min-h-40 flex-col items-center justify-center gap-3 rounded-3xl bg-ink-900 p-4 text-center ring-1 ring-ink-800 transition hover:bg-ink-850 hover:ring-brand-500/60 active:scale-[0.98]",
                      !ok && "opacity-35",
                    )}
                  >
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-500 font-display text-xl font-bold text-ink-950">{initials(s.name)}</span>
                    <span>
                      <span className="block font-semibold text-white">{s.name}</span>
                      <span className="mt-0.5 block text-[0.8rem] text-ink-400">{ROLE[s.role] ?? s.role}</span>
                    </span>
                    {s.canDispense && (
                      <Chip tone="orange" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
                        Dispenser
                      </Chip>
                    )}
                  </button>
                );
              })}
            </div>
            {session.staff.length === 0 && <Alert tone="warn" className="mt-6">No staff at this store have a till PIN yet. A manager can set PINs in the back office.</Alert>}
            {onCancel && (
              <button type="button" onClick={onCancel} className="mt-6 inline-flex h-12 items-center gap-2 self-start rounded-full px-4 text-sm font-semibold text-ink-300 hover:bg-ink-850">
                <ArrowLeft className="h-4 w-4" /> Back to the sale
              </button>
            )}
          </>
        ) : (
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center">
            <button type="button" onClick={() => (setPicked(null), setCode(""), setError(null))} className="mb-6 inline-flex h-12 items-center gap-2 self-start rounded-full px-3 text-sm font-semibold text-ink-300 hover:bg-ink-850">
              <ArrowLeft className="h-4 w-4" /> Not you?
            </button>
            <span className="grid h-20 w-20 place-items-center rounded-full bg-brand-500 font-display text-2xl font-bold text-ink-950">{initials(picked.name)}</span>
            <div className="mt-3 font-display text-2xl font-semibold text-white">{picked.name}</div>
            <div className="mt-1 text-sm text-ink-400">Enter your 4-digit PIN</div>
            <div className={cn("mt-6 flex gap-4", error && "animate-[shake_0.35s]")} aria-live="polite" aria-label={`${pin.length} of 4 digits entered`}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={cn("h-4 w-4 rounded-full ring-2 transition", i < pin.length ? "bg-brand-500 ring-brand-500" : "ring-ink-600")} />
              ))}
            </div>
            <div className="mt-3 min-h-6 text-center text-sm font-medium text-rose-400" role="alert">
              {error}
            </div>
            <div className="mt-3 grid w-full grid-cols-3 gap-3" role="group" aria-label="PIN pad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"].map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={busy}
                  onClick={() => press(k)}
                  aria-label={k === "back" ? "Delete digit" : k === "clear" ? "Clear PIN" : k}
                  className={cn(
                    "grid h-[4.25rem] place-items-center rounded-2xl text-2xl font-semibold transition active:scale-95 disabled:opacity-50",
                    k === "clear" || k === "back" ? "bg-transparent text-base text-ink-300 hover:bg-ink-850" : "bg-ink-900 font-display text-white ring-1 ring-ink-800 hover:bg-ink-850",
                  )}
                >
                  {k === "back" ? <Delete className="h-6 w-6" /> : k === "clear" ? "Clear" : k}
                </button>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-ink-500">Forgotten your PIN? Your store manager can reset it in the back office.</p>
          </div>
        )}
      </section>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}`}</style>
    </div>
  );
}
