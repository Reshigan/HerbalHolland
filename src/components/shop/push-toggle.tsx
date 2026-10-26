"use client";
// App notifications for this device: registers the Rewards service worker (/rewards-sw.js, scope "/"), subscribes
// with the VAPID key and hands the subscription to the server. Each browser/phone is its own subscription.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing, Smartphone } from "lucide-react";
import { cn } from "@/lib/cn";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
type Mode = "checking" | "soon" | "ios" | "unsupported" | "denied" | "off" | "on";

const key = (b64url: string) => {
  const raw = atob((b64url + "=".repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || !!(navigator as { standalone?: boolean }).standalone;

export function PushToggle({ vapidKey, devices, enable, disable }: { vapidKey: string | null; devices: number; enable: (sub: Sub) => Promise<{ error?: string }>; disable: (endpoint: string | null) => Promise<{ error?: string }> }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(vapidKey ? "checking" : "soon");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!vapidKey) return;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setMode(isIos() && !isStandalone() ? "ios" : "unsupported");
      if (Notification.permission === "denied") return setMode("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      setMode((await reg?.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setMode("unsupported"));
  }, [vapidKey]);

  const turnOn = () =>
    start(async () => {
      setError(null);
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return setMode(perm === "denied" ? "denied" : "off");
        await navigator.serviceWorker.register("/rewards-sw.js", { scope: "/" });
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(vapidKey!) }));
        const j = sub.toJSON();
        const r = await enable({ endpoint: sub.endpoint, keys: { p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" } });
        if (r.error) {
          await sub.unsubscribe().catch(() => undefined);
          return setError(r.error);
        }
        setMode("on");
        router.refresh();
      } catch {
        setError("We couldn't turn on notifications on this device. Please try again.");
      }
    });

  const turnOff = () =>
    start(async () => {
      setError(null);
      try {
        const sub = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
        const r = await disable(sub?.endpoint ?? null);
        if (r.error) return setError(r.error);
        await sub?.unsubscribe().catch(() => undefined);
        setMode("off");
        router.refresh();
      } catch {
        setError("We couldn't turn notifications off just now. Please try again.");
      }
    });

  const on = mode === "on";
  const usable = mode === "on" || mode === "off";
  const others = Math.max(0, devices - (on ? 1 : 0));
  const note: Record<Mode, string> = {
    checking: "Checking this device…",
    soon: "App notifications are almost ready. We'll switch them on here soon.",
    ios: "On iPhone, add Herbal Holland to your Home Screen first.",
    unsupported: "This browser can't show notifications. Try Chrome, Edge, Firefox or Safari on a recent device.",
    denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back here.",
    off: "Off on this device",
    on: "On for this device",
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", on ? "bg-brand-500 text-ink-950" : "bg-ink-850 text-ink-300")}>
            {on ? <BellRing className="h-5 w-5" strokeWidth={1.9} /> : <BellOff className="h-5 w-5" strokeWidth={1.9} />}
          </span>
          <div className="min-w-0">
            <div className="font-medium text-white">This device</div>
            <div className="text-xs text-ink-400" aria-live="polite">
              {note[mode]}
              {others > 0 && ` · also on for ${others} other device${others === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="App notifications on this device"
          disabled={pending || !usable}
          onClick={on ? turnOff : turnOn}
          className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40", on ? "bg-brand-500" : "bg-ink-700")}
        >
          <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-rose-100" role="alert">
          {error}
        </p>
      )}
      <p className={cn("mt-3 flex gap-2.5 rounded-xl px-3.5 py-3 text-xs leading-relaxed", mode === "ios" ? "border border-brand-500/35 bg-brand-500/10 text-brand-100" : "bg-ink-850 text-ink-400")}>
        <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
        <span>
          <strong className="font-semibold text-ink-100">On iPhone?</strong> Notifications need iOS 16.4 or later and the app on your Home Screen: tap Share (under ⋯ on newer iPhones), then “Add to Home Screen”, open Herbal Holland from there and switch them on here.
        </span>
      </p>
    </div>
  );
}
