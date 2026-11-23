"use client";
import { useEffect, useState } from "react";

const TRIED = "hh_app_tried";

/**
 * In the installed app, collects the `hh_app` cookie and carries on. If the cookie didn't stick (cookies blocked), says
 * so rather than looping. Desktop Chrome installs by moving the open tab into the app window without reloading it, so
 * the page can become standalone after it loaded: it listens for that too, or the window sits on the logo.
 */
export function AppHandshake({ next }: { next: string }) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const go = () => {
      if (!standalone.matches && !(navigator as { standalone?: boolean }).standalone) return;
      standalone.removeEventListener("change", go);
      let recent = false;
      try {
        recent = Date.now() - Number(sessionStorage.getItem(TRIED) ?? 0) < 30_000;
        sessionStorage.setItem(TRIED, String(Date.now()));
      } catch {
        // Private storage: the cookie is what counts.
      }
      if (recent) setStuck(true);
      else location.replace(`/api/app?next=${encodeURIComponent(next)}`);
    };
    standalone.addEventListener("change", go);
    go();
    return () => standalone.removeEventListener("change", go);
  }, [next]);
  return stuck ? <p className="max-w-xs text-ink-300">We couldn&apos;t open the app. Allow cookies for Herbal Holland, then close the app and open it again.</p> : null;
}
