"use client";
// First-party analytics for the shop and the Rewards app: a beacon to /api/a on every page (and when the app is
// installed). No cookies and no personal details: a random visitor id in localStorage, the path, whether it opened as
// the installed app, and on the first page only the ?src= tag and the referring site. Renders nothing.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { detectPlatform } from "@/lib/install";

const KEY = "hh-visitor";
// The last path sent. Module state outlives a move between the shop and Rewards layouts, so a remount (or React's dev
// double effect) doesn't count a page twice, and src and referrer go with the first view only.
let last: string | null = null;
let installHooked = false;

function visitorId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) localStorage.setItem(KEY, (id = crypto.randomUUID()));
    return id;
  } catch {
    return null; // storage blocked: not counted
  }
}

function standalone() {
  try {
    return matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || !!(navigator as { standalone?: boolean }).standalone;
  } catch {
    return false;
  }
}

function send(body: Record<string, unknown>) {
  const visitor = visitorId();
  if (!visitor) return;
  try {
    const data = JSON.stringify({ ...body, visitor, app: standalone(), platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints).platform });
    navigator.sendBeacon?.("/api/a", new Blob([data], { type: "application/json" }));
  } catch {
    // analytics never gets in the way
  }
}

export function AnalyticsBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname === last) return;
    const first = last === null;
    last = pathname;
    if (!first) return send({ kind: "view", path: pathname });
    send({ kind: "view", path: pathname, entry: true, src: new URLSearchParams(location.search).get("src"), referrer: document.referrer || null });
  }, [pathname]);

  useEffect(() => {
    if (installHooked) return;
    installHooked = true;
    addEventListener("appinstalled", () => send({ kind: "install", path: location.pathname }));
  }, []);

  return null;
}
