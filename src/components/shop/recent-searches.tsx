"use client";
// A signed-in member's recent searches, kept in this browser only (localStorage; nothing goes to the server). Every
// read and write is wrapped, so a private window or blocked storage just means no chips.
import Link from "next/link";
import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { RECENT_SEARCHES_KEY, withRecentSearch } from "@/lib/search";

const read = (): string[] => {
  try {
    return withRecentSearch(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]"), "");
  } catch {
    return [];
  }
};
const write = (list: string[]) => {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked: the chips simply don't persist */
  }
};

export function RecentSearches({ current, className }: { current: string; className?: string }) {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    const next = current ? withRecentSearch(read(), current) : read();
    if (current) write(next);
    setList(next);
  }, [current]);
  const shown = list.filter((s) => s.toLowerCase() !== current.toLowerCase());
  if (!shown.length) return null;
  return (
    <div className={className} data-testid="recent-searches">
      <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-ink-450">
        <History className="h-3.5 w-3.5" aria-hidden /> Recent
      </span>
      {shown.map((s) => (
        <span key={s} className="inline-flex items-center rounded-full border border-ink-700 pl-3 text-sm text-ink-200">
          <Link href={`/shop?q=${encodeURIComponent(s)}`} className="py-1.5 hover:text-white">
            {s}
          </Link>
          <button
            type="button"
            aria-label={`Forget “${s}”`}
            onClick={() => {
              const next = list.filter((x) => x !== s);
              write(next);
              setList(next);
            }}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-450 hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
