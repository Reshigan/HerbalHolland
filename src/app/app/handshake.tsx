"use client";
import { useEffect, useState } from "react";

const TRIED = "hh_app_tried";

/** In the installed app, collects the `hh_app` cookie and carries on. If the cookie didn't stick (cookies blocked), says so rather than looping. */
export function AppHandshake({ next }: { next: string }) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!window.matchMedia("(display-mode: standalone)").matches && !(navigator as { standalone?: boolean }).standalone) return;
    let recent = false;
    try {
      recent = Date.now() - Number(sessionStorage.getItem(TRIED) ?? 0) < 30_000;
      sessionStorage.setItem(TRIED, String(Date.now()));
    } catch {
      // Private storage: the cookie is what counts.
    }
    if (recent) setStuck(true);
    else location.replace(`/api/app?next=${encodeURIComponent(next)}`);
  }, [next]);
  return stuck ? <p className="max-w-xs text-ink-300">We couldn&apos;t open the app. Allow cookies for Herbal Holland, then close the app and open it again.</p> : null;
}
