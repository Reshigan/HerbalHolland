"use client";
// "Save this view": keeps the current filters (the query string) under a name in localStorage, per person and page,
// and lists the saved views as chips. No server model: a view is just a link. Storage is wrapped in try/catch and
// the chips render after hydration, so a private window or cleared site data simply shows none.
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bookmark, BookmarkPlus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { normaliseQuery, parseViews, saveView, viewsKey, type SavedView } from "@/lib/admin-ui";
import { Button } from "@/components/ui/button";

function Views({ pageKey, userKey, className }: { pageKey: string; userKey: string; className?: string }) {
  const path = usePathname();
  const search = useSearchParams();
  const key = viewsKey(userKey, pageKey);
  const [views, setViews] = useState<SavedView[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    try {
      setViews(parseViews(localStorage.getItem(key)));
    } catch {
      setViews([]);
    }
  }, [key]);

  const current = normaliseQuery(search.toString());
  const persist = (next: SavedView[]) => {
    setViews(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      setNote("Couldn't save on this device — the browser is blocking site storage.");
    }
  };
  const save = () => {
    if (!name.trim() || !views) return;
    persist(saveView(views, { name, query: current, at: Date.now() }));
    setNaming(false);
    setName("");
    setNote(`Saved “${name.trim()}” on this device.`);
  };
  const remove = (v: SavedView) => views && (persist(views.filter((x) => x !== v)), setNote(`Removed “${v.name}”.`));

  if (!views) return <div className={cn("min-h-8", className)} aria-hidden />;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {views.length > 0 && (
        <nav aria-label="Saved views" className="flex flex-wrap items-center gap-2">
          {views.map((v) => {
            const active = v.query === current;
            return (
              <span key={v.name} className={cn("inline-flex h-8 items-center rounded-full border pl-1 pr-1 text-xs font-semibold transition-colors", active ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300")}>
                <Link href={v.query ? `${path}?${v.query}` : path} aria-current={active ? "page" : undefined} className="inline-flex h-full items-center gap-1.5 rounded-full pl-2 pr-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
                  <Bookmark className={cn("h-3.5 w-3.5", active ? "text-brand-400" : "text-brand-700")} strokeWidth={2} aria-hidden />
                  {v.name}
                </Link>
                <button type="button" onClick={() => remove(v)} className={cn("grid h-6 w-6 place-items-center rounded-full", active ? "text-ink-300 hover:bg-ink-800 hover:text-white" : "text-ink-500 hover:bg-ink-100 hover:text-ink-900")} aria-label={`Remove saved view ${v.name}`}>
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            );
          })}
        </nav>
      )}
      {current && !views.some((v) => v.query === current) && !naming && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setNaming(true)} className="text-ink-700">
          <BookmarkPlus className="h-4 w-4" strokeWidth={1.9} aria-hidden /> Save this view
        </Button>
      )}
      {naming && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="inline-flex items-center gap-1.5"
        >
          <label htmlFor={`view-name-${pageKey}`} className="sr-only">Name for this view</label>
          <input
            id={`view-name-${pageKey}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setNaming(false), setName(""))}
            maxLength={60}
            autoFocus
            placeholder="Name this view"
            className="h-8 w-44 rounded-full border border-ink-200 bg-white px-3 text-xs text-ink-900 placeholder:text-ink-500 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
          />
          <Button type="submit" size="sm" disabled={!name.trim()}>Save</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => (setNaming(false), setName(""))}>Cancel</Button>
        </form>
      )}
      <span className="sr-only" role="status">{note}</span>
    </div>
  );
}

/** useSearchParams needs a Suspense boundary; the chips only render once the browser has loaded them anyway. */
export function SavedViews(props: { pageKey: string; userKey: string; className?: string }) {
  return (
    <Suspense fallback={<div className={cn("min-h-8", props.className)} aria-hidden />}>
      <Views {...props} />
    </Suspense>
  );
}
