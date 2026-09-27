"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Check, Copy, CreditCard, Download, History, Package, Receipt, Settings, Share2 } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/club", label: "Card", icon: CreditCard },
  { href: "/club/orders", label: "Orders", icon: Package },
  { href: "/club/points", label: "Points", icon: History },
  { href: "/club/invoices", label: "Invoices", icon: Receipt },
  { href: "/club/settings", label: "Settings", icon: Settings },
];

/** Rewards section nav: tabs on larger screens, an app-style bottom bar on phones. */
export function ClubNav() {
  const path = usePathname();
  if (path.startsWith("/club/join")) return null;
  const active = (href: string) => (href === "/club" ? path === "/club" : path.startsWith(href));
  return (
    <>
      <nav aria-label="Rewards" className="scrollbar-none -mx-4 hidden gap-1 overflow-x-auto border-b border-ink-850 px-4 sm:mx-0 sm:flex sm:px-0">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined} className={cn("relative -mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition", active(t.href) ? "border-oranje-500 text-white" : "border-transparent text-ink-400 hover:text-white")}>
            <t.icon className="h-4 w-4" /> {t.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Rewards" className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <ul className="grid grid-cols-5">
          {TABS.map((t) => (
            <li key={t.href}>
              <Link href={t.href} aria-current={active(t.href) ? "page" : undefined} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[0.68rem] font-semibold", active(t.href) ? "text-oranje-400" : "text-ink-400")}>
                <t.icon className="h-5 w-5" strokeWidth={1.9} /> {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

export function ShareLink({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && "share" in navigator), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy your link", url);
    }
  };
  return (
    <div>
      <div className="flex items-center gap-2 rounded-2xl border border-ink-700 bg-ink-950 p-1.5 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink-200">{url.replace(/^https?:\/\//, "")}</span>
        <button type="button" onClick={copy} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-ink-850 px-3 text-sm font-semibold text-white hover:bg-ink-800" aria-live="polite">
          {copied ? <Check className="h-4 w-4 text-leaf-500" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {canShare && (
        <button type="button" onClick={() => navigator.share({ title: "Herbal Holland Rewards", text, url }).catch(() => undefined)} className="mt-3 flex h-11 items-center gap-2 rounded-full bg-oranje-500 px-5 text-sm font-semibold text-ink-950 hover:bg-oranje-400">
          <Share2 className="h-4 w-4" /> Share your invite
        </button>
      )}
    </div>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** "Add to home screen" for the Rewards PWA (Android prompt; iOS instructions). */
export function InstallPrompt() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [done, setDone] = useState(true);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    if (standalone) return;
    setDone(false);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const on = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  if (done || (!evt && !ios)) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/70 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-oranje-500 text-ink-950">
        <Download className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold text-white">Keep your card on your home screen</div>
        <div className="text-ink-400">{ios ? "Tap Share, then “Add to Home Screen”." : "Open it in one tap at the till — works like an app."}</div>
      </div>
      {evt && (
        <button
          onClick={async () => {
            await evt.prompt();
            await evt.userChoice;
            setDone(true);
          }}
          className="h-10 shrink-0 rounded-full bg-oranje-500 px-4 text-sm font-semibold text-ink-950 hover:bg-oranje-400"
        >
          Install
        </button>
      )}
    </div>
  );
}

type Channel = "WHATSAPP" | "SMS" | "EMAIL" | "PUSH";
export function ConsentToggles({ channels, action }: { channels: { key: Channel; label: string; on: boolean; note: string; disabled?: string }[]; action: (channel: Channel, granted: boolean) => Promise<{ error?: string } | void> }) {
  const [state, setState] = useState(() => Object.fromEntries(channels.map((c) => [c.key, c.on])) as Record<Channel, boolean>);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <ul className="divide-y divide-ink-800">
        {channels.map((c) => {
          const on = state[c.key];
          return (
            <li key={c.key} className="flex items-center justify-between gap-4 py-3.5">
              <div className="min-w-0">
                <div className="font-medium text-white">{c.label}</div>
                <div className="text-xs text-ink-400">{c.disabled ?? c.note}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${c.label} marketing messages`}
                disabled={pending || !!c.disabled}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    setState((s) => ({ ...s, [c.key]: !on }));
                    const r = await action(c.key, !on);
                    if (r && "error" in r && r.error) {
                      setState((s) => ({ ...s, [c.key]: on }));
                      setError(r.error);
                    }
                  })
                }
                className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40", on ? "bg-oranje-500" : "bg-ink-700")}
              >
                <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-sm text-rose-100" role="alert">{error}</p>}
    </div>
  );
}
