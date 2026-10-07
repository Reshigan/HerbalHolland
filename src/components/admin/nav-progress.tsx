"use client";
// A thin progress bar across the top of the content while a page navigation is in flight: starts on a click on an
// in-app link (or a row link), ends when the URL changes. One consistent loading state for every list page.
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export const NAVIGATE_EVENT = "hh:navigate";

function Progress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, setPending] = useState(false);

  useEffect(() => setPending(false), [pathname, search]);

  useEffect(() => {
    const start = () => setPending(true);
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.getAttribute("href")?.startsWith("#")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.href === location.href) return;
      start();
    };
    document.addEventListener("click", onClick);
    window.addEventListener(NAVIGATE_EVENT, start);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener(NAVIGATE_EVENT, start);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(false), 12_000);
    return () => clearTimeout(t);
  }, [pending]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5" aria-hidden>
      <div className={`h-full origin-left bg-brand-500 transition-[transform,opacity] ease-out ${pending ? "scale-x-[0.85] opacity-100 duration-[6000ms]" : "scale-x-100 opacity-0 duration-300"}`} />
    </div>
  );
}

/** useSearchParams needs a Suspense boundary; the bar is invisible until a navigation starts anyway. */
export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Progress />
    </Suspense>
  );
}
