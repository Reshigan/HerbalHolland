"use client";
// Keeps installed apps on the latest deploy with no action from anyone. Each app asks /api/version every five minutes,
// when it comes back into view and when it reconnects; if a newer build is live it reloads at a safe moment, and the
// browser picks up any new service worker on that load. Members and staff: on their next tap to another page, so a
// half-filled form is never lost. Unattended screens: straight away. The till: see useAutoUpdate in pos-app.tsx.
import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isUnattended, needsReload } from "@/lib/app-update";

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const CHECK_EVERY_MS = 5 * 60_000;
const TRIED = "hh-update-tried";

function reloadFor(server: string | null) {
  try {
    if (!needsReload(BUILD, server, sessionStorage.getItem(TRIED))) return;
    sessionStorage.setItem(TRIED, server!);
    location.reload();
  } catch {} // storage blocked: without the loop guard, stay on this build until the next launch
}

/** Watches for a new build and reloads as soon as `safe()` says so. Returns a function that reloads now if one is known. */
export function useAutoUpdate(safe: () => boolean, enabled = true) {
  const live = useRef<string | null>(null);
  const isSafe = useRef(safe);
  isSafe.current = safe;

  useEffect(() => {
    if (!enabled) return;
    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (res.ok) live.current = ((await res.json()) as { build?: string }).build ?? null;
      } catch {
        return; // offline: nothing to update to
      }
      if (isSafe.current()) reloadFor(live.current);
    };
    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, [enabled]);

  return useCallback(() => reloadFor(live.current), []);
}

/** Every app but the till, which runs useAutoUpdate itself with its own idea of safe. */
export function AutoUpdate() {
  const pathname = usePathname();
  const applyUpdate = useAutoUpdate(() => isUnattended(pathname), pathname !== "/pos");
  useEffect(() => applyUpdate(), [pathname, applyUpdate]);
  return null;
}
