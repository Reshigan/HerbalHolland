"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, CreditCard, History, Image as ImageIcon, LifeBuoy, MessageCircle, Package, Receipt, Settings, Share2 } from "lucide-react";
import { copyText, whatsappUrl } from "./share";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/club", label: "Card", icon: CreditCard },
  { href: "/club/orders", label: "Orders", icon: Package },
  { href: "/club/points", label: "Points", icon: History },
  { href: "/club/invoices", label: "Purchases", icon: Receipt },
  { href: "/club/support", label: "Help", icon: LifeBuoy },
  { href: "/club/settings", label: "Settings", icon: Settings },
];

/**
 * Rewards section nav: tabs on larger screens, an app-style bottom bar on phones. On larger screens one underline
 * slides between the tabs (a 1px bar, moved and stretched with a transform only); until it has been measured, and
 * without html.motion, each tab underlines itself.
 */
export function ClubNav() {
  const path = usePathname();
  const bar = useRef<HTMLElement>(null);
  const [slide, setSlide] = useState<string | null>(null);
  const hidden = path.startsWith("/club/join");
  useLayoutEffect(() => {
    const nav = bar.current;
    if (hidden || !nav || !document.documentElement.classList.contains("motion")) return;
    const on = nav.querySelector<HTMLElement>("a[aria-current]");
    if (!on) return setSlide(null);
    setSlide(`translateX(${on.offsetLeft}px) scaleX(${on.offsetWidth})`);
  }, [path, hidden]);
  if (hidden) return null;
  const active = (href: string) => (href === "/club" ? path === "/club" : path.startsWith(href));
  return (
    <>
      <nav ref={bar} aria-label="Rewards" data-slide={slide ? "" : undefined} className="scrollbar-none group/nav relative -mx-4 hidden gap-1 overflow-x-auto border-b border-ink-850 px-4 app:flex sm:mx-0 sm:flex sm:px-0">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined} className={cn("relative -mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors", active(t.href) ? "border-brand-500 text-white group-data-[slide]/nav:border-transparent" : "border-transparent text-ink-400 hover:text-white")}>
            <t.icon className="h-4 w-4" /> {t.label}
          </Link>
        ))}
        {slide && <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-px origin-left bg-brand-500 transition-transform duration-[var(--dur)] ease-[var(--ease-out-expo)] motion-reduce:transition-none" style={{ transform: slide }} />}
      </nav>
      <nav aria-label="Rewards" className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur app:hidden sm:hidden">
        <ul className="grid grid-cols-6">
          {TABS.map((t) => (
            <li key={t.href}>
              <Link href={t.href} aria-current={active(t.href) ? "page" : undefined} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[0.68rem] font-semibold", active(t.href) ? "text-brand-400" : "text-ink-400")}>
                <t.icon className="h-5 w-5" strokeWidth={1.9} /> {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/** Invite link: the link itself with copy, the phone's share sheet where there is one, and WhatsApp. */
/** Shares the 9:16 Status card as a file where the phone allows it (straight into WhatsApp Status), else opens it to save. */
async function shareStatus(src: string, text: string, url: string) {
  const type = "image/png";
  // Checked before any await: a browser that can't share files opens the card inside the click, past popup blockers.
  if (!navigator.canShare?.({ files: [new File([], "card.png", { type })] })) return void window.open(src, "_blank", "noopener");
  try {
    const blob = await (await fetch(src)).blob();
    await navigator.share({ files: [new File([blob], "herbal-holland-rewards.png", { type })], text: `${text} ${url}` });
  } catch (e) {
    if ((e as Error).name !== "AbortError") window.location.assign(src);
  }
}

export function ShareLink({ url, text, shareLabel = "Share your invite", status }: { url: string; text: string; shareLabel?: string; status?: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && "share" in navigator), []);
  const copy = async () => {
    if (!(await copyText(url))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div>
      <div className="flex items-center gap-2 rounded-2xl border border-ink-700 bg-ink-950 p-1.5 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink-200">{url.replace(/^https?:\/\//, "")}</span>
        <button type="button" onClick={copy} className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-ink-850 px-3 text-sm font-semibold text-white hover:bg-ink-800" aria-live="polite">
          {copied ? <Check className="h-4 w-4 text-leaf-500" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {canShare && (
          <button type="button" onClick={() => navigator.share({ title: "Herbal Holland Rewards", text, url }).catch(() => undefined)} className="flex h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-semibold text-ink-950 hover:bg-brand-400">
            <Share2 className="h-4 w-4" /> {shareLabel}
          </button>
        )}
        <a href={whatsappUrl(text, url)} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center gap-2 rounded-full border border-ink-700 px-5 text-sm font-semibold text-ink-100 hover:border-leaf-500 hover:text-white">
          <MessageCircle className="h-4 w-4 text-leaf-500" /> WhatsApp
        </a>
        {status && (
          <button type="button" onClick={() => shareStatus(status, text, url)} className="flex h-11 items-center gap-2 rounded-full border border-ink-700 px-5 text-sm font-semibold text-ink-100 hover:border-brand-500 hover:text-white">
            <ImageIcon className="h-4 w-4 text-brand-500" /> Status card
          </button>
        )}
      </div>
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
                className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40", on ? "bg-brand-500" : "bg-ink-700")}
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
