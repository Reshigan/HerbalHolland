"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, LocateFixed, MapPin, Menu, Search, X } from "lucide-react";
import { choosePreferredStore, pickerStores } from "@/server/shop/actions";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string };
export type PickerStore = {
  code: string;
  name: string;
  suburb: string;
  city: string;
  province: string;
  lat: number | null;
  lng: number | null;
  status: string;
  open: boolean;
  openLabel: string;
  sameDay: boolean;
};

// The corporate site is rendered at /site/* but browsed at /* on its own host (src/proxy.ts): compare without the prefix
// so the server's and the browser's answers match.
const bare = (p: string) => p.replace(/^\/site(?=\/|$)/, "") || "/";
const isActive = (path: string, href: string) => {
  const [p, h] = [bare(path), bare(href)];
  return h === "/" ? p === "/" : p === h || p.startsWith(`${h}/`);
};

export function NavLinks({ items, className }: { items: NavItem[]; className?: string }) {
  const path = usePathname();
  return (
    <nav className={cn("items-center gap-1", className)} aria-label="Main">
      {items.map((i) => {
        const active = isActive(path, i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn("relative rounded-full px-3.5 py-2 text-[0.9rem] font-medium transition-colors", active ? "text-white" : "text-ink-300 hover:text-white")}
          >
            {i.label}
            {active && <span className="absolute inset-x-3.5 -bottom-[1px] h-0.5 rounded-full bg-brand-500" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileMenu({ items, footer }: { items: NavItem[]; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const path = usePathname();
  useEffect(() => ref.current?.close(), [path]);
  return (
    <>
      <button onClick={() => ref.current?.showModal()} className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-ink-200 hover:bg-ink-850 lg:hidden" aria-label="Open menu">
        <Menu className="h-6 w-6" strokeWidth={1.9} />
      </button>
      <dialog
        ref={ref}
        className="m-0 h-dvh max-h-none w-[min(22rem,88vw)] max-w-none bg-ink-950 p-0 text-ink-100 backdrop:bg-ink-950/70 backdrop:backdrop-blur-sm open:animate-rise"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className="flex h-full flex-col p-5">
          <div className="mb-6 flex items-center justify-between">
            <span className="eyebrow text-brand-500">Menu</span>
            <button onClick={() => ref.current?.close()} className="grid h-11 w-11 place-items-center rounded-full text-ink-300 hover:bg-ink-850" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-col" aria-label="Main">
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={cn("border-b border-ink-850 py-4 font-display text-2xl font-medium", isActive(path, i.href) ? "text-brand-400" : "text-white")}
              >
                {i.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto pt-6">{footer}</div>
        </div>
      </dialog>
    </>
  );
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Preferred-store selector: a searchable dialog of stores (nearest first with location). */
export function StorePicker({ current, variant = "pill", className }: { current: { code: string; name: string; openLabel: string; open: boolean } | null; variant?: "pill" | "bar"; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // The list is fetched on first hover/open rather than shipped with every page (the network can be 1,000 stores).
  const [stores, setStores] = useState<PickerStore[] | null>(null);
  const loading = useRef(false);
  const load = () => {
    if (stores || loading.current) return;
    loading.current = true;
    pickerStores()
      .then(setStores)
      .catch(() => setError("We couldn't load the stores — try again"))
      .finally(() => (loading.current = false));
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const rows = (stores ?? []).filter((x) => !s || `${x.name} ${x.suburb} ${x.city} ${x.province}`.toLowerCase().includes(s));
    return here
      ? rows.map((x) => ({ ...x, km: x.lat != null && x.lng != null ? km(here, { lat: x.lat, lng: x.lng }) : null })).sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9))
      : rows.map((x) => ({ ...x, km: null as number | null }));
  }, [stores, q, here]);

  const pick = (code: string) =>
    start(async () => {
      const r = await choosePreferredStore(code);
      if ("error" in r && r.error) return setError(r.error);
      ref.current?.close();
      router.refresh();
    });

  const locate = () => {
    if (!navigator.geolocation) return setError("Location isn't available on this device");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("We couldn't get your location — search by suburb or city instead");
        setLocating(false);
      },
      { timeout: 8000, maximumAge: 600_000 },
    );
  };

  return (
    <>
      <button
        onPointerEnter={load}
        onFocus={load}
        onClick={() => {
          setError(null);
          load();
          ref.current?.showModal();
        }}
        className={cn(
          variant === "pill"
            ? "flex h-10 max-w-[14rem] items-center gap-2 rounded-full border border-ink-800 pl-3 pr-2.5 text-sm text-ink-200 transition hover:border-ink-600 hover:text-white"
            : "flex w-full items-center gap-2 py-2 text-left text-[0.8rem] text-ink-300",
          className,
        )}
        aria-haspopup="dialog"
      >
        <MapPin className="h-4 w-4 shrink-0 text-brand-500" strokeWidth={1.9} />
        {current ? (
          <span className="min-w-0 truncate">
            <span className="font-semibold text-white">{current.name}</span>
            {variant === "bar" && <span className={cn("ml-2", current.open ? "text-leaf-100" : "text-ink-400")}>· {current.openLabel}</span>}
          </span>
        ) : (
          <span className="font-medium">Choose your store</span>
        )}
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-ink-400" />
      </button>
      <dialog
        ref={ref}
        aria-labelledby="store-picker-title"
        className="m-auto max-h-[min(40rem,90dvh)] w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-ink-800 bg-ink-950 p-0 text-ink-100 shadow-lift backdrop:bg-ink-950/75 backdrop:backdrop-blur-sm"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className="flex max-h-[min(40rem,90dvh)] flex-col">
          <div className="border-b border-ink-800 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="store-picker-title" className="font-display text-xl font-semibold text-white">Choose your store</h2>
                <p className="mt-1 text-sm text-ink-400">We&apos;ll show what&apos;s in stock there and use it for click &amp; collect.</p>
              </div>
              <button onClick={() => ref.current?.close()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-300 hover:bg-ink-850" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <label className="relative flex-1">
                <span className="sr-only">Search stores</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Suburb or city"
                  className="h-11 w-full rounded-full border border-ink-700 bg-ink-900 pl-10 pr-4 text-sm text-white placeholder:text-ink-500 focus:border-brand-500 focus:outline-none"
                />
              </label>
              <button onClick={locate} disabled={locating} className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-ink-700 px-4 text-sm font-medium text-ink-100 hover:border-brand-500 disabled:opacity-60">
                <LocateFixed className="h-4 w-4 text-brand-500" />
                <span className="hidden sm:inline">{locating ? "Locating…" : "Near me"}</span>
              </button>
            </div>
            {error && <p className="mt-2 text-xs font-medium text-rose-100" role="alert">{error}</p>}
          </div>
          <ul className="flex-1 overflow-y-auto p-2" aria-busy={pending}>
            {list.map((s) => {
              const soon = s.status !== "ACTIVE";
              const selected = current?.code === s.code;
              return (
                <li key={s.code}>
                  <button
                    disabled={soon || pending}
                    onClick={() => pick(s.code)}
                    className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition", selected ? "bg-brand-500/10" : "hover:bg-ink-900", soon && "cursor-not-allowed opacity-60")}
                  >
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", selected ? "bg-brand-500 text-ink-950" : "bg-ink-850 text-brand-500")}>
                      {selected ? <Check className="h-4 w-4" strokeWidth={2.4} /> : <MapPin className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-white">{s.name}</span>
                      <span className="block truncate text-xs text-ink-400">
                        {s.suburb}, {s.city}
                        {s.km != null && ` · ${s.km < 10 ? s.km.toFixed(1) : Math.round(s.km)} km`}
                      </span>
                    </span>
                    <span className={cn("shrink-0 text-right text-xs", soon ? "text-amber-100" : s.open ? "text-leaf-100" : "text-ink-400")}>{soon ? "Opening soon" : s.openLabel}</span>
                  </button>
                </li>
              );
            })}
            {!stores && <li className="px-4 py-10 text-center text-sm text-ink-400">Loading stores…</li>}
            {stores && !list.length && <li className="px-4 py-10 text-center text-sm text-ink-400">No stores match “{q}”.</li>}
          </ul>
        </div>
      </dialog>
    </>
  );
}
