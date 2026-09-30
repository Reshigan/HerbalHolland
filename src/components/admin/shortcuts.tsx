"use client";
// Keyboard shortcuts and the command palette for the back office and HQ console. No dependency: one keydown
// listener, two small dialogs. Recent pages live in localStorage (per person; wrapped in try/catch because private
// windows and cleared site data can throw).
//   /        focus the page's search (or open the palette when the page has none)
//   ?        the cheat sheet
//   g o/i/r  go to orders / inventory / reports (also g h overview, g m members)
//   ⌘K ⌃K   the command palette: every section plus recent pages
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Clock, Command, CornerDownLeft, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { CHORD_MS, JUMPS, chord, inTextField, pageTitle, pushRecent, recentKey, searchPalette, type Chord, type PaletteItem, type Recent } from "@/lib/admin-ui";
import { Kbd } from "@/components/ui/misc";
import type { NavGroup } from "./nav-config";

export const PALETTE_EVENT = "hh:palette";

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window or storage off: recents are a convenience only */
  }
};

/** Sidebar button that opens the palette (also the only way in on a touch screen). */
export function PaletteButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(PALETTE_EVENT))}
      className={cn("flex h-10 w-full items-center gap-2.5 rounded-xl border border-ink-800 bg-ink-900 px-3 text-left text-[0.84rem] text-ink-300 transition-colors hover:border-ink-700 hover:text-white", className)}
      aria-keyshortcuts="Control+K Meta+K"
    >
      <Search className="h-4 w-4 text-ink-450" strokeWidth={1.9} aria-hidden />
      <span className="flex-1">Jump to…</span>
      <span className="hidden items-center gap-0.5 text-[0.65rem] font-semibold text-ink-450 lg:inline-flex" aria-hidden>
        <Command className="h-3 w-3" strokeWidth={2.2} />K
      </span>
    </button>
  );
}

export function AdminShortcuts({ groups, area, storeCode, userKey }: { groups: NavGroup[]; area: "store" | "hq"; storeCode?: string; userKey: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const pending = useRef<Chord>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  // Remember where the person has been (title settles after the new page commits).
  useEffect(() => {
    const t = setTimeout(() => {
      const list = pushRecent(read<Recent[]>(recentKey(userKey), []), { href: pathname, title: pageTitle(document.title), at: Date.now() });
      write(recentKey(userKey), list);
      setRecent(list);
    }, 150);
    return () => clearTimeout(t);
  }, [pathname, userKey]);

  const open = useCallback((which: "palette" | "help") => {
    returnTo.current = document.activeElement as HTMLElement | null;
    setHelp(which === "help");
    setPalette(which === "palette");
  }, []);
  const close = useCallback(() => {
    setPalette(false);
    setHelp(false);
    returnTo.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && k.toLowerCase() === "k") {
        e.preventDefault();
        return palette ? close() : open("palette");
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (palette || help) return; // the dialogs handle their own keys
      if (inTextField(e.target as HTMLElement)) return;
      if (k === "/") {
        e.preventDefault();
        const search = document.querySelector<HTMLInputElement>("main input[type=search], main input[name=q], main #report-search");
        if (search) {
          search.focus();
          search.select();
        } else open("palette");
        return;
      }
      if (k === "?") {
        e.preventDefault();
        return open("help");
      }
      const r = chord(pending.current, k.toLowerCase(), Date.now(), area, storeCode);
      pending.current = r.next;
      if (r.href) {
        e.preventDefault();
        window.dispatchEvent(new Event("hh:navigate"));
        router.push(r.href);
      }
    };
    const onOpen = () => open("palette");
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_EVENT, onOpen);
    };
  }, [palette, help, area, storeCode, router, open, close]);

  // Recent pages first (everywhere but the page you're on), then every section of the sidebar.
  const items = useMemo<PaletteItem[]>(() => {
    const nav = groups.flatMap((g) => g.items.filter((i) => !i.external).map((i) => ({ href: i.href, label: i.label, group: g.title, kind: "nav" as const })));
    const rec = recent.filter((r) => r.href !== pathname).slice(0, 6).map((r) => ({ href: r.href, label: r.title, group: "Recent", kind: "recent" as const }));
    return [...rec, ...nav];
  }, [groups, recent, pathname]);

  return (
    <>
      {palette && <Palette items={items} onClose={close} onGo={(href) => (close(), window.dispatchEvent(new Event("hh:navigate")), router.push(href))} />}
      {help && <CheatSheet area={area} onClose={close} />}
    </>
  );
}

/** Keeps Tab inside the dialog and closes it on Escape. */
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("input, button, [href]");
    first?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      return onClose();
    }
    if (e.key !== "Tab" || !ref.current) return;
    const focusable = [...ref.current.querySelectorAll<HTMLElement>("input, button, [href], [tabindex]:not([tabindex='-1'])")].filter((x) => !x.hasAttribute("disabled"));
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
    else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
  };
  return { ref, onKeyDown };
}

function Backdrop({ children, onClose, label, labelledBy, onKeyDown, dialogRef, className }: { children: React.ReactNode; onClose: () => void; label?: string; labelledBy?: string; onKeyDown: (e: React.KeyboardEvent) => void; dialogRef: React.RefObject<HTMLDivElement | null>; className?: string }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} aria-labelledby={labelledBy} className={cn("relative w-full max-w-xl overflow-hidden rounded-2xl border border-ink-150 bg-white shadow-lift", className)}>
        {children}
      </div>
    </div>
  );
}

function Palette({ items, onClose, onGo }: { items: PaletteItem[]; onClose: () => void; onGo: (href: string) => void }) {
  const { ref, onKeyDown } = useDialog(onClose);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  // No query: the whole list (recents, then the sidebar); a query: the best dozen matches.
  const results = useMemo(() => searchPalette(items, q, q.trim() ? 12 : 80), [items, q]);
  const current = Math.min(active, Math.max(0, results.length - 1));

  return (
    <Backdrop
      onClose={onClose}
      label="Jump to a page"
      dialogRef={ref}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(results.length - 1, a + 1)));
        else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
        else if (e.key === "Enter" && results[current]) (e.preventDefault(), onGo(results[current].href));
        else onKeyDown(e);
      }}
    >
      <div className="flex items-center gap-3 border-b border-ink-150 px-4">
        <Search className="h-4 w-4 shrink-0 text-ink-500" aria-hidden />
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[current] ? `${listId}-${current}` : undefined}
          aria-autocomplete="list"
          aria-label="Jump to a page"
          placeholder="Where to? Type a section or a recent page"
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => (setQ(e.target.value), setActive(0))}
          className="h-14 min-w-0 flex-1 bg-transparent text-[0.95rem] text-ink-900 placeholder:text-ink-500 focus:outline-none"
        />
        <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Close">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ul id={listId} role="listbox" aria-label="Pages" className="max-h-[50vh] overflow-y-auto p-2">
        {results.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-ink-500" role="option" aria-selected="false">
            Nothing matches “{q}”.
          </li>
        )}
        {results.map((r, i) => (
          <li key={`${r.kind}-${r.href}`} id={`${listId}-${i}`} role="option" aria-selected={i === current}>
            <Link
              href={r.href}
              tabIndex={-1}
              onMouseEnter={() => setActive(i)}
              onClick={(e) => {
                e.preventDefault();
                onGo(r.href);
              }}
              className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm", i === current ? "bg-brand-50 text-ink-950" : "text-ink-800")}
            >
              {r.kind === "recent" ? <Clock className="h-4 w-4 shrink-0 text-ink-500" aria-hidden /> : <ArrowRight className="h-4 w-4 shrink-0 text-ink-500" aria-hidden />}
              <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
              {r.group && <span className="shrink-0 text-xs text-ink-500">{r.group}</span>}
              {i === current && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-500" aria-hidden />}
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-150 bg-ink-50 px-4 py-2 text-[0.7rem] text-ink-500">
        <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> move</span>
        <span><Kbd>Enter</Kbd> open</span>
        <span><Kbd>Esc</Kbd> close</span>
        <span className="ml-auto"><Kbd>?</Kbd> all shortcuts</span>
      </div>
    </Backdrop>
  );
}

function CheatSheet({ area, onClose }: { area: "store" | "hq"; onClose: () => void }) {
  const { ref, onKeyDown } = useDialog(onClose);
  const id = useId();
  const rows: [React.ReactNode, string][] = [
    [<><Kbd>⌘</Kbd> / <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd></>, "Jump to any section or a recent page"],
    [<Kbd key="s">/</Kbd>, "Focus the search on this page"],
    ...JUMPS.map((j): [React.ReactNode, string] => [<><Kbd>g</Kbd> then <Kbd>{j.key}</Kbd></>, `Go to ${area === "hq" && j.key === "i" ? "the catalogue" : j.label.toLowerCase()}`]),
    [<Kbd key="q">?</Kbd>, "This cheat sheet"],
    [<Kbd key="e">Esc</Kbd>, "Close a dialog or drawer"],
  ];
  return (
    <Backdrop onClose={onClose} labelledBy={id} dialogRef={ref} onKeyDown={onKeyDown} className="max-w-md">
      <div className="flex items-start justify-between gap-4 border-b border-ink-150 px-5 py-4">
        <div>
          <h2 id={id} className="font-display text-lg font-semibold text-ink-950">Keyboard shortcuts</h2>
          <p className="mt-0.5 text-sm text-ink-500">Press the second key of a chord within {(CHORD_MS / 1000).toFixed(1)} seconds; shortcuts pause while you type.</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Close">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <dl className="divide-y divide-ink-100 px-5">
        {rows.map(([keys, what], i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <dt className="text-ink-700">{what}</dt>
            <dd className="shrink-0 whitespace-nowrap text-ink-600">{keys}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-ink-150 bg-ink-50 px-5 py-2 text-[0.7rem] text-ink-500">Also in the runbook under “Keyboard shortcuts”.</div>
    </Backdrop>
  );
}
