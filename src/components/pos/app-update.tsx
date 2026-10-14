"use client";
// The Android till app (android/till) opens /pos?apk=<its version code>. The till remembers that number and checks
// /apps/hh-till.json, which CI rewrites with every new signed APK: when a newer one is out, a bar offers it. Sideloaded
// apps can't update themselves silently (that needs device management or Google Play), so it's one tap to download and
// one to install. Never shown in a browser or on an iPad, where there's no APK.
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const KEY = "hh-apk";

export function AppUpdate() {
  const [latest, setLatest] = useState<{ versionName: string; url: string } | null>(null);
  useEffect(() => {
    let installed = 0;
    try {
      const fromUrl = Number(new URLSearchParams(location.search).get("apk"));
      if (fromUrl > 0) localStorage.setItem(KEY, String(fromUrl));
      installed = Number(localStorage.getItem(KEY)) || 0;
    } catch {}
    if (!installed) return;
    fetch("/apps/hh-till.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { versionCode: number; versionName: string; url: string } | null) => {
        if (j && j.versionCode > installed) setLatest(j);
      })
      .catch(() => {});
  }, []);
  if (!latest) return null;
  return (
    <div role="status" className="flex items-center gap-3 bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950">
      <span className="min-w-0 flex-1 truncate">A new version of the till app is ready ({latest.versionName}).</span>
      <a href={latest.url} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink-950 px-4 text-brand-400">
        <Download className="h-4 w-4" /> Update
      </a>
      <button type="button" onClick={() => setLatest(null)} aria-label="Later" className="grid h-11 w-11 place-items-center rounded-full hover:bg-ink-950/10">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
