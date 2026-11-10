"use client";
// The Turnstile widget (src/server/turnstile.ts checks its token). Rendered inside a form, it adds the hidden
// cf-turnstile-response field. It stays invisible unless Cloudflare wants an interaction. A token works once, so a
// new `reset` value (the form's action state after each submit) asks for a fresh one.
import { useEffect, useRef } from "react";

type Api = {
  render(el: HTMLElement, o: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};
declare global {
  interface Window {
    turnstile?: Api;
  }
}

let loading: Promise<Api> | null = null;
function load(): Promise<Api> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return (loading ??= new Promise<Api>((ok, fail) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? ok(window.turnstile) : fail(new Error("turnstile")));
    s.onerror = () => ((loading = null), fail(new Error("turnstile")));
    document.head.appendChild(s);
  }));
}

export function Turnstile({ siteKey, action, reset, onReady }: { siteKey: string; action: string; reset?: unknown; onReady?: (ready: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    let gone = false;
    load()
      .then((t) => {
        if (gone || !box.current) return;
        id.current = t.render(box.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only",
          callback: () => ready.current?.(true),
          "expired-callback": () => ready.current?.(false),
          "error-callback": () => ready.current?.(false),
        });
      })
      .catch(() => ready.current?.(false));
    return () => {
      gone = true;
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (!id.current) return;
    window.turnstile?.reset(id.current);
    ready.current?.(false);
  }, [reset]);

  return <div ref={box} className="empty:hidden" />;
}
