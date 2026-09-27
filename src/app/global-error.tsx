"use client";
// Last-resort boundary: replaces the root layout, so it brings its own document and styles.
import "./globals.css";
import { Mark } from "@/components/brand/logo";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en-ZA">
      <body className="bg-ink-950">
        <title>Something went wrong · Herbal Holland</title>
        <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center text-ink-100">
          <Mark className="h-20 w-20 text-brand-500" />
          <h1 className="mt-10 max-w-lg font-display text-4xl font-semibold tracking-tight text-white">We&apos;ll be right back</h1>
          <p className="mt-4 max-w-md leading-relaxed text-ink-300">Herbal Holland is having a moment. Please try again in a few seconds.</p>
          <div className="mt-8 flex gap-3">
            <button onClick={() => retry()} className="inline-flex h-12 items-center rounded-full bg-brand-500 px-6 font-semibold text-ink-950 hover:bg-brand-400">
              Try again
            </button>
            <a href="/" className="inline-flex h-12 items-center rounded-full border border-ink-700 px-6 font-semibold text-ink-100 hover:border-ink-500">
              Go home
            </a>
          </div>
          {error.digest && <p className="mt-10 font-mono text-xs text-ink-500">Reference {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
