"use client";
// "Add to home screen" for the three installable apps: Rewards (members), the till and the back office. One component:
// it keeps the browser's `beforeinstallprompt` event and shows a native install button where the browser offers one
// (Chrome, Edge and Samsung Internet on Android and desktop), or the two-step route on iPhone/iPad Safari. It never
// renders on the server, in an installed app, in a browser that can't install, or inside a remembered dismissal
// (30 days; "Not now" on the till is a day). Everything it remembers stays in localStorage — nothing goes to the server.
//
// Variants: "card" (a rounded card: Rewards home, the pair screen), "bar" (a slim strip under a mobile header),
// "menu" (a row in a side menu) and "button" (a pill among other till actions).
import { useCallback, useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { installKey, installState, parseDismissal, type DismissKind, type InstallApp, type InstallPlatform, type InstallState } from "@/lib/install";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
declare global {
  interface Window {
    /** The last `beforeinstallprompt`, stashed by the root layout's inline script so it isn't missed before hydration. */
    __hhInstall?: PromptEvent | null;
  }
}
/** Fired on window when one InstallPrompt used (or lost) the shared event, so its siblings update too. */
const SYNC = "hh:installprompt";

const COPY: Record<InstallApp, { name: string; title: (p: InstallPlatform) => string; benefit: string; dismiss: DismissKind; dismissLabel: string; eyebrow?: string }> = {
  rewards: {
    name: "Herbal Holland",
    title: (p) => (p === "desktop" ? "Install Herbal Holland on this computer" : "Add Herbal Holland to your home screen"),
    benefit: "Your card, points and orders, one tap away.",
    dismiss: "dismissed",
    dismissLabel: "Not now",
  },
  till: {
    name: "Herbal Holland Till",
    title: () => "Install the till app",
    benefit: "Installs full-screen and works offline.",
    dismiss: "later",
    dismissLabel: "Not now",
    eyebrow: "Before you pair · optional",
  },
  staff: {
    name: "Herbal Holland Back office",
    title: (p) => (p === "desktop" ? "Install the back office on this computer" : "Add the back office to your phone"),
    benefit: "Orders, stock, banking and alerts wherever you are.",
    dismiss: "dismissed",
    dismissLabel: "Not now",
  },
};

const isStandalone = () => {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || !!(navigator as { standalone?: boolean }).standalone;
  } catch {
    return false;
  }
};
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode or storage blocked: the nudge simply shows again next time */
  }
};

/** The iOS Safari route, with the share glyph the phone shows. */
function IosSteps({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-1", className)}>
      Tap <Share className="h-4 w-4 text-brand-400" strokeWidth={1.9} aria-hidden /> <b className="font-semibold text-white">Share</b>, then <SquarePlus className="h-4 w-4 text-brand-400" strokeWidth={1.9} aria-hidden />{" "}
      <b className="font-semibold text-white">Add to Home Screen</b>
    </span>
  );
}

export function InstallPrompt({ app, variant = "card", once = false, className }: { app: InstallApp; variant?: "card" | "bar" | "menu" | "button"; once?: boolean; className?: string }) {
  const [state, setState] = useState<InstallState | null>(null);
  const [evt, setEvt] = useState<PromptEvent | null>(null);
  const [gone, setGone] = useState(false);
  const [open, setOpen] = useState(false); // menu/button: the iOS steps unfolded
  const [busy, setBusy] = useState(false);
  const copy = COPY[app];
  const passive = variant === "menu" || variant === "button"; // a menu entry is never "dismissed"; it just sits there until the app is installed

  useEffect(() => {
    const dismissal = passive ? null : parseDismissal(read(installKey(app)));
    const seenAt = once ? Number(read(installKey(app, "seen"))) || null : null;
    const s = installState({
      ua: navigator.userAgent,
      standalone: isStandalone(),
      touchPoints: navigator.maxTouchPoints,
      dismissedAt: dismissal?.at ?? null,
      dismissKind: dismissal?.kind,
      seenAt,
    });
    setState(s);
    if (!s.show) return;
    const sync = () => setEvt(window.__hhInstall ?? null);
    sync();
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__hhInstall = e as PromptEvent;
      setEvt(e as PromptEvent);
    };
    const onInstalled = () => {
      window.__hhInstall = null;
      setGone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener(SYNC, sync);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(SYNC, sync);
    };
  }, [app, once, passive]);

  const visible = !!state && state.show && !gone && (state.mode === "ios-steps" || (state.mode === "prompt" && !!evt));

  // A once-only placement (the shop home) counts as shown the first time it actually appears.
  useEffect(() => {
    if (visible && once) write(installKey(app, "seen"), String(Date.now()));
  }, [visible, once, app]);

  const dismiss = useCallback(
    (kind: DismissKind) => {
      write(installKey(app), JSON.stringify({ at: Date.now(), kind }));
      setGone(true);
    },
    [app],
  );

  const install = async () => {
    const e = evt;
    if (!e || busy) return;
    setBusy(true);
    // The event is single-use: hand it over now so a sibling on the same page doesn't try it too.
    window.__hhInstall = null;
    window.dispatchEvent(new Event(SYNC));
    try {
      await e.prompt();
      const { outcome } = await e.userChoice;
      if (outcome === "accepted") setGone(true);
      else dismiss(copy.dismiss);
    } catch {
      dismiss("later");
    } finally {
      setBusy(false);
    }
  };

  if (!visible || !state) return null;
  const ios = state.mode === "ios-steps";
  const title = copy.title(state.platform);
  const shared = { "data-testid": `install-${variant}`, "data-app": app, "data-mode": state.mode };

  if (variant === "menu")
    return (
      <div className={className} {...shared}>
        <button
          type="button"
          onClick={ios ? () => setOpen((o) => !o) : install}
          aria-expanded={ios ? open : undefined}
          disabled={busy}
          className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[0.84rem] font-medium text-ink-300 transition-colors hover:bg-ink-850 hover:text-white disabled:opacity-60"
        >
          <Download className="h-[18px] w-[18px] text-brand-400" strokeWidth={1.9} aria-hidden />
          Install app
        </button>
        {ios && open && (
          <p className="px-3 pb-2 text-xs leading-relaxed text-ink-400">
            <IosSteps />
          </p>
        )}
      </div>
    );

  if (variant === "button")
    return (
      <>
        <button
          type="button"
          onClick={ios ? () => setOpen((o) => !o) : install}
          aria-expanded={ios ? open : undefined}
          disabled={busy}
          className={cn("inline-flex h-12 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full bg-ink-800 px-5 text-[0.95rem] font-semibold text-ink-50 transition hover:bg-ink-700 active:scale-[0.98] disabled:opacity-40", className)}
          {...shared}
        >
          <Download className="h-4 w-4" aria-hidden /> {title}
        </button>
        {ios && open && (
          <p className="basis-full text-sm text-ink-400">
            <IosSteps />
          </p>
        )}
      </>
    );

  if (variant === "bar")
    return (
      <div className={cn("flex items-center gap-3 border-t border-ink-850 bg-ink-950 px-4 py-1.5 text-ink-100", className)} role="region" aria-label={title} {...shared}>
        <Download className="h-5 w-5 shrink-0 text-brand-400" strokeWidth={1.9} aria-hidden />
        <div className="min-w-0 flex-1 text-[0.8rem] leading-snug">
          {ios ? (
            <IosSteps className="text-ink-200" />
          ) : (
            <>
              <span className="block truncate font-semibold text-white">{title}</span>
              <span className="block truncate text-ink-400">{copy.benefit}</span>
            </>
          )}
        </div>
        {!ios && (
          <button type="button" onClick={install} disabled={busy} className="h-11 shrink-0 rounded-full bg-brand-500 px-4 text-sm font-semibold text-ink-950 hover:bg-brand-400 disabled:opacity-60">
            Install
          </button>
        )}
        <button type="button" onClick={() => dismiss(copy.dismiss)} aria-label={copy.dismissLabel} title={copy.dismissLabel} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-ink-800 hover:text-white">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
    );

  // "card"
  const till = app === "till";
  return (
    <section className={cn("rounded-2xl border border-ink-800 bg-ink-900/70 p-4 text-ink-100 sm:p-5", className)} aria-label={title} {...shared}>
      {copy.eyebrow && <div className="eyebrow mb-3 text-[0.62rem] text-brand-500">{copy.eyebrow}</div>}
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-ink-950">
          <Download className="h-5 w-5" strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold leading-snug text-white">{title}</h2>
          <p className="mt-0.5 text-sm text-ink-400">{copy.benefit}</p>
          {ios && (
            <p className="mt-3 text-sm leading-relaxed text-ink-300">
              <IosSteps />
            </p>
          )}
          {(till || !ios) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {!ios && (
                <button type="button" onClick={install} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-semibold text-ink-950 hover:bg-brand-400 disabled:opacity-60">
                  <Download className="h-4 w-4" aria-hidden /> Install
                </button>
              )}
              {till && (
                <button type="button" onClick={() => dismiss(copy.dismiss)} className="inline-flex h-11 items-center rounded-full border border-ink-700 px-4 text-sm font-semibold text-ink-200 hover:border-ink-500 hover:text-white">
                  {copy.dismissLabel}
                </button>
              )}
            </div>
          )}
        </div>
        {!till && (
          <button type="button" onClick={() => dismiss(copy.dismiss)} aria-label={copy.dismissLabel} title={copy.dismissLabel} className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-ink-800 hover:text-white">
            <X className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>
    </section>
  );
}
