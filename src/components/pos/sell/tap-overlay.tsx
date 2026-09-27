"use client";
// Full-screen "tap on glass" prompt: the customer holds their card, phone or watch near
// the device; the provider (simulated Halo Dot by default) approves or declines.
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Nfc, XCircle } from "lucide-react";
import { zar } from "@/lib/money";
import { startCardPayment, type CardOutcome } from "../lib/tap";
import { PosButton } from "../ui";
import type { TapProviderKind } from "@/server/pos/types";

export function TapOverlay({
  amountCents,
  reference,
  provider,
  onApproved,
  onClose,
}: {
  amountCents: number;
  reference: string;
  provider: TapProviderKind;
  onApproved: (r: Extract<CardOutcome, { status: "APPROVED" }>) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<{ status: "WAITING" } | CardOutcome>({ status: "WAITING" });
  const [attempt, setAttempt] = useState(0);
  const simulate = useRef<"approve" | "decline">("approve");
  const ctrl = useRef<AbortController | null>(null);
  const approvedRef = useRef(onApproved);
  approvedRef.current = onApproved;

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      ctrl.current?.abort();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    const c = new AbortController();
    ctrl.current = c;
    setState({ status: "WAITING" });
    void startCardPayment({ provider, amountCents, reference, signal: c.signal, simulate: simulate.current }).then((r) => {
      if (c.signal.aborted && r.status === "CANCELLED") return;
      setState(r);
      if (r.status === "APPROVED") setTimeout(() => approvedRef.current(r), 1100);
    });
    return () => c.abort();
  }, [attempt, amountCents, reference, provider]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-ink-950 px-6 text-center" role="dialog" aria-modal="true" aria-label="Card payment" data-testid="tap-overlay">
      <div className="eyebrow text-oranje-500">Card · tap on glass</div>
      <div className="mt-3 font-display text-6xl font-semibold tracking-tight text-white tnum sm:text-7xl">{zar(amountCents)}</div>

      <div className="relative my-12 grid h-56 w-56 place-items-center" aria-live="polite">
        {state.status === "WAITING" && (
          <>
            <span className="absolute inset-0 rounded-full border-2 border-oranje-500/60 animate-pulse-ring" />
            <span className="absolute inset-0 rounded-full border-2 border-oranje-500/40 animate-pulse-ring [animation-delay:0.55s]" />
            <span className="absolute inset-0 rounded-full border-2 border-oranje-500/25 animate-pulse-ring [animation-delay:1.1s]" />
            <span className="grid h-36 w-36 place-items-center rounded-full bg-oranje-500 text-ink-950 shadow-glow">
              <Nfc className="h-16 w-16" strokeWidth={1.7} />
            </span>
          </>
        )}
        {state.status === "APPROVED" && (
          <span className="grid h-40 w-40 place-items-center rounded-full bg-leaf-500 text-white animate-rise">
            <CheckCircle2 className="h-20 w-20" strokeWidth={1.8} />
          </span>
        )}
        {(state.status === "DECLINED" || state.status === "NETWORK_ERROR") && (
          <span className="grid h-40 w-40 place-items-center rounded-full bg-rose-500 text-white animate-rise">
            <XCircle className="h-20 w-20" strokeWidth={1.8} />
          </span>
        )}
      </div>

      {state.status === "WAITING" && (
        <>
          <p className="font-display text-2xl font-semibold text-white sm:text-3xl">Hold card, phone or watch near the device</p>
          <p className="mt-2 text-ink-400">Waiting for the card… keep it still until you hear the beep.</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <PosButton variant="outline" size="lg" onClick={() => (ctrl.current?.abort(), onClose())}>
              Cancel
            </PosButton>
            {provider === "SIMULATED" && (
              <PosButton
                variant="ghost"
                size="lg"
                onClick={() => {
                  simulate.current = "decline";
                  setAttempt((a) => a + 1);
                }}
              >
                Simulate a decline
              </PosButton>
            )}
          </div>
        </>
      )}
      {state.status === "APPROVED" && (
        <>
          <p className="font-display text-3xl font-semibold text-white">Approved</p>
          <p className="mt-2 text-ink-300">
            {state.cardBrand} •••• {state.cardLast4} · auth {state.reference}
          </p>
        </>
      )}
      {(state.status === "DECLINED" || state.status === "NETWORK_ERROR") && (
        <>
          <p className="font-display text-3xl font-semibold text-white">{state.status === "DECLINED" ? "Declined" : "Couldn't reach the card network"}</p>
          <p className="mt-2 text-ink-300">{state.message}</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <PosButton
              variant="primary"
              size="lg"
              onClick={() => {
                simulate.current = "approve";
                setAttempt((a) => a + 1);
              }}
            >
              Try again
            </PosButton>
            <PosButton variant="outline" size="lg" onClick={onClose}>
              Choose another way to pay
            </PosButton>
          </div>
        </>
      )}
      <p className="absolute bottom-6 text-xs text-ink-500">{provider === "SIMULATED" ? "Simulated Halo Dot terminal (demo)" : provider === "HALO_APPLINK" ? "Halo Dot · Halo.Link" : "Card terminal"} · ref {reference}</p>
    </div>
  );
}
