"use client";
// The menu board runs unattended on a TV: if a refresh fails (a deploy, a dropped connection), it says so calmly and
// reloads itself every minute until the menu is back, so nobody has to find a keyboard.
import { useEffect } from "react";
import { Mark } from "@/components/brand/logo";

export default function MenuError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
    const t = setInterval(() => location.reload(), 60_000);
    return () => clearInterval(t);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ink-950 px-6 text-center">
      <Mark className="h-24 w-24 text-brand-500" />
      <h1 className="mt-10 font-display text-5xl font-semibold tracking-tight text-white">The menu will be back in a moment</h1>
      <p className="mt-4 text-xl text-ink-300">Our team can show you everything we have today.</p>
      {error.digest && <p className="tnum mt-12 font-mono text-sm text-ink-450">Ref {error.digest}</p>}
    </main>
  );
}
