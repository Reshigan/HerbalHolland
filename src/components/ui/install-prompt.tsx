"use client";
// "Add to home screen" for the three installable apps: Rewards (members), the till and the back office. One component:
// it keeps the browser's `beforeinstallprompt` event and shows a native install button where the browser offers one
// (Chrome, Edge and Samsung Internet on Android and desktop), or the two-step route on iPhone/iPad Safari. It never
// renders on the server, in an installed app, in a browser that can't install (except right after joining, where it
// says how to open the page in Chrome or Safari), or inside a remembered dismissal
// (30 days; "Not now" on the till is a day). Everything it remembers stays in localStorage; nothing goes to the server.
//
// Variants: "card" (a rounded card: Rewards home, the pair screen), "bar" (a slim strip under a mobile header),
// "menu" (a row in a side menu), "button" (a pill among other till actions) and "sheet" (a bottom sheet that rises
// over the shop from the visitor's second page, a few seconds in).
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Compass, Download, Share, SquarePlus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { browserHandoff, installKey, installState, parseDismissal, type DismissKind, type InstallApp, type InstallPlatform, type InstallState } from "@/lib/install";

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

/**
 * `priority`: the moment right after joining. The card ignores an earlier "Not now", leads with the step, and says what
 * comes next (notifications), because the offer is the point of the page rather than a nudge beside it.
 */
export function InstallPrompt({ app, variant = "card", once = false, priority = false, className }: { app: InstallApp; variant?: "card" | "bar" | "menu" | "button" | "sheet"; once?: boolean; priority?: boolean; className?: string }) {
  const [state, setState] = useState<InstallState | null>(null);
  const [evt, setEvt] = useState<PromptEvent | null>(null);
  const [gone, setGone] = useState(false);
  const [open, setOpen] = useState(false); // menu/button: the iOS steps unfolded
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState<ReturnType<typeof browserHandoff>>(null);
  const copy = COPY[app];
  const passive = variant === "menu" || variant === "button"; // a menu entry is never "dismissed"; it just sits there until the app is installed

  useEffect(() => {
    const dismissal = passive || priority ? null : parseDismissal(read(installKey(app)));
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
    // Right after joining, a browser that can't install (WhatsApp, Instagram, Facebook…) still gets the way there.
    if (priority && !s.installed && s.mode === "none") setHandoff(browserHandoff(navigator.userAgent, location.href, navigator.maxTouchPoints));
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
  }, [app, once, passive, priority]);

  // The sheet waits for a second page in this visit, then a few seconds more: never in the way of a first look.
  const pathname = usePathname();
  const [armed, setArmed] = useState(variant !== "sheet");
  useEffect(() => {
    if (variant !== "sheet") return;
    let views = 1;
    try {
      views = Number(sessionStorage.getItem("hh-install:views") ?? 0) + 1;
      sessionStorage.setItem("hh-install:views", String(views));
    } catch {
      /* storage blocked: count this page only */
    }
    if (views < 2) return;
    const t = setTimeout(() => setArmed(true), 3500);
    return () => clearTimeout(t);
  }, [variant, pathname]);
  useEffect(() => {
    if (variant !== "sheet" || !armed) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss(copy.dismiss);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const visible = armed && !!state && state.show && !gone && (state.mode === "ios-steps" || (state.mode === "prompt" && !!evt));

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

  if (handoff && !gone && state)
    return (
      <section className={cn("rounded-2xl border border-brand-500/40 bg-brand-500/[0.06] p-4 text-ink-100 sm:p-5", className)} aria-label={copy.title(state.platform)}>
        <div className="eyebrow mb-3 text-[0.62rem] text-brand-500">One more step</div>
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-ink-950">
            <Download className="h-5 w-5" strokeWidth={1.9} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold leading-snug text-white">{copy.title(state.platform)}</h2>
            <p className="mt-0.5 text-sm text-ink-400">{copy.benefit} This app&apos;s browser can&apos;t add it, so open the page in {handoff.platform === "ios" ? "Safari" : "Chrome"} first.</p>
            {handoff.platform === "android" ? (
              <a href={handoff.href} className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-semibold text-ink-950 hover:bg-brand-400">
                <Compass className="h-4 w-4" aria-hidden /> Open in Chrome
              </a>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-ink-300">
                Tap <b className="font-semibold text-white">⋯</b> or <Share className="inline h-4 w-4 text-brand-400" strokeWidth={1.9} aria-hidden /> and choose <b className="font-semibold text-white">Open in Safari</b>. There, tap <b className="font-semibold text-white">Share</b>, then <b className="font-semibold text-white">Add to Home Screen</b>.
              </p>
            )}
          </div>
          <button type="button" onClick={() => setGone(true)} aria-label={copy.dismissLabel} title={copy.dismissLabel} className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-ink-800 hover:text-white">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </section>
    );
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

  if (variant === "sheet")
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4" {...shared}>
        <section role="dialog" aria-label={title} className={cn("animate-rise w-full max-w-md rounded-2xl border border-brand-500/40 bg-ink-900 p-5 text-ink-100 shadow-2xl shadow-black/60", className)}>
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500 text-ink-950">
              <Download className="h-5 w-5" strokeWidth={1.9} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold leading-snug text-white">{title}</h2>
              <p className="mt-0.5 text-sm text-ink-400">{copy.benefit} Free, and it takes a second.</p>
            </div>
          </div>
          {ios && (
            <p className="mt-4 rounded-xl bg-ink-850 px-4 py-3 text-sm leading-relaxed text-ink-300">
              <IosSteps />
            </p>
          )}
          <div className="mt-4 flex gap-2">
            {!ios && (
              <button type="button" onClick={install} disabled={busy} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-semibold text-ink-950 hover:bg-brand-400 disabled:opacity-60">
                <Download className="h-4 w-4" aria-hidden /> Install the app
              </button>
            )}
            <button type="button" onClick={() => dismiss(copy.dismiss)} className={cn("inline-flex h-12 items-center justify-center rounded-full border border-ink-700 px-5 text-sm font-semibold text-ink-200 hover:border-ink-500 hover:text-white", ios && "flex-1")}>
              {ios ? "Got it" : copy.dismissLabel}
            </button>
          </div>
        </section>
      </div>
    );

  // "card"
  const till = app === "till";
  const eyebrow = priority ? "One more step" : copy.eyebrow;
  return (
    <section className={cn("rounded-2xl border border-ink-800 bg-ink-900/70 p-4 text-ink-100 sm:p-5", priority && "border-brand-500/40 bg-brand-500/[0.06]", className)} aria-label={title} {...shared}>
      {eyebrow && <div className="eyebrow mb-3 text-[0.62rem] text-brand-500">{eyebrow}</div>}
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-ink-950">
          <Download className="h-5 w-5" strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={cn("font-display font-semibold leading-snug text-white", priority ? "text-lg" : "text-base")}>{title}</h2>
          <p className="mt-0.5 text-sm text-ink-400">{priority ? `${copy.benefit} Then switch on notifications in Settings to hear about drops and events first.` : copy.benefit}</p>
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
