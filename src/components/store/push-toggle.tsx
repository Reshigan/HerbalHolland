"use client";
// "Notify me on this phone": registers the staff service worker (/staff-sw.js, scope "/store/"), subscribes with the
// VAPID key and hands the subscription to the server. Each phone or browser is its own subscription; the person's
// role decides which stores' events reach it.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing, Smartphone } from "lucide-react";
import { cn } from "@/lib/cn";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
type Mode = "checking" | "soon" | "ios" | "unsupported" | "denied" | "off" | "on";
const SCOPE = "/store/";

const key = (b64url: string) => {
  const raw = atob((b64url + "=".repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || !!(navigator as { standalone?: boolean }).standalone;

export function StaffPushToggle({ vapidKey, devices, enable, disable }: { vapidKey: string | null; devices: number; enable: (sub: Sub, userAgent: string) => Promise<{ error?: string }>; disable: (endpoint: string | null) => Promise<{ error?: string }> }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(vapidKey ? "checking" : "soon");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!vapidKey) return;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setMode(isIos() && !isStandalone() ? "ios" : "unsupported");
      if (Notification.permission === "denied") return setMode("denied");
      const reg = await navigator.serviceWorker.getRegistration(SCOPE);
      setMode((await reg?.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setMode("unsupported"));
  }, [vapidKey]);

  const turnOn = () =>
    start(async () => {
      setError(null);
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return setMode(perm === "denied" ? "denied" : "off");
        const reg = await navigator.serviceWorker.register("/staff-sw.js", { scope: SCOPE });
        await navigator.serviceWorker.ready.catch(() => undefined);
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(vapidKey!) }));
        const j = sub.toJSON();
        const r = await enable({ endpoint: sub.endpoint, keys: { p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" } }, navigator.userAgent);
        if (r.error) {
          await sub.unsubscribe().catch(() => undefined);
          return setError(r.error);
        }
        setMode("on");
        router.refresh();
      } catch {
        setError("We couldn't switch notifications on here — check the browser's site settings and try again.");
      }
    });

  const turnOff = () =>
    start(async () => {
      setError(null);
      try {
        const sub = await (await navigator.serviceWorker.getRegistration(SCOPE))?.pushManager.getSubscription();
        const r = await disable(sub?.endpoint ?? null);
        if (r.error) return setError(r.error);
        await sub?.unsubscribe().catch(() => undefined);
        setMode("off");
        router.refresh();
      } catch {
        setError("We couldn't switch notifications off just now — please try again.");
      }
    });

  const on = mode === "on";
  const usable = mode === "on" || mode === "off";
  const others = Math.max(0, devices - (on ? 1 : 0));
  const note: Record<Mode, string> = {
    checking: "Checking this phone…",
    soon: "Push notifications aren't set up on this server yet (WEB_PUSH keys) — ask HQ.",
    ios: "On iPhone, add the back office to your Home Screen first.",
    unsupported: "This browser can't show notifications. Use Chrome, Edge, Firefox or Safari on a recent phone.",
    denied: "Notifications are blocked for this site. Allow them in the browser's site settings, then come back here.",
    off: "Off on this phone",
    on: "On for this phone",
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 py-1">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", on ? "bg-brand-500 text-ink-950" : "bg-ink-100 text-ink-500")}>
            {on ? <BellRing className="h-5 w-5" strokeWidth={1.9} /> : <BellOff className="h-5 w-5" strokeWidth={1.9} />}
          </span>
          <div className="min-w-0">
            <div className="font-medium text-ink-900">Notify me on this phone</div>
            <div className="text-xs text-ink-500" aria-live="polite">
              {note[mode]}
              {others > 0 && ` · also on for ${others} other device${others === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Notify me on this phone"
          disabled={pending || !usable}
          onClick={on ? turnOff : turnOn}
          className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40", on ? "bg-brand-500" : "bg-ink-300")}
        >
          <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      )}
      {mode === "ios" && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs leading-relaxed text-brand-800">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">On iPhone?</strong> Notifications need iOS 16.4 or later and the site on your Home Screen: tap Share, then “Add to Home Screen”, open it from there and switch them on here.
          </span>
        </p>
      )}
    </div>
  );
}
