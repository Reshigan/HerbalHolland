"use client";
// Registers a service worker once the page has loaded and the browser is idle, so the app becomes installable
// (Chrome's install criteria) without slowing the first paint. Registering the same script and scope again is a
// no-op, so other components (the Rewards push toggle, the till) can register it too.
import { useEffect } from "react";

export function ServiceWorker({ src, scope }: { src: string; scope: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const register = () => {
      if (!cancelled) navigator.serviceWorker.register(src, { scope }).catch(() => undefined);
    };
    const whenIdle = () => {
      if ("requestIdleCallback" in window) idle = window.requestIdleCallback(register, { timeout: 4000 });
      else timer = setTimeout(register, 1500);
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", whenIdle);
      if (idle !== undefined && "cancelIdleCallback" in window) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [src, scope]);
  return null;
}
