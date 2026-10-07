"use client";
// Pairing: sign in as a manager/owner/HQ → choose the store → name the till.
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, MonitorSmartphone, Store as StoreIcon } from "lucide-react";
import { Mark, Wordmark } from "@/components/brand/logo";
import { InstallPrompt } from "@/components/ui/install-prompt";
import { ServiceWorker } from "@/components/ui/service-worker";
import { cn } from "@/lib/cn";
import { api, errorText } from "./lib/api";
import { loadOutbox } from "./lib/storage";
import { Alert, Field, PosButton, TextInput } from "./ui";
import type { PairableStore } from "@/server/pos/session";

export function PairScreen({
  paired,
  staff,
  demoStores,
}: {
  paired: { name: string; prefix: string; store: { code: string; name: string } } | null;
  staff: { name: string; stores: PairableStore[] } | null;
  demoStores: PairableStore[];
}) {
  const [creds, setCreds] = useState({ email: "", password: "" });
  const [signedIn, setSignedIn] = useState<{ name: string; stores: PairableStore[]; via: "password" | "session" } | null>(staff ? { ...staff, via: "session" } : null);
  const [storeId, setStoreId] = useState<string | null>(staff?.stores.length === 1 ? staff.stores[0].id : null);
  const [name, setName] = useState("Counter 1");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  const [repair, setRepair] = useState(!paired);

  useEffect(() => setQueued(loadOutbox().length), []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy("signin");
    setError(null);
    try {
      const r = await api<{ user: { name: string }; stores: PairableStore[] }>("/api/pos/pair", { body: { action: "stores", ...creds } });
      if (!r.stores.length) throw new Error("There are no trading stores you can pair a till to");
      setSignedIn({ name: r.user.name, stores: r.stores, via: "password" });
      setStoreId(r.stores.length === 1 ? r.stores[0].id : null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function pair(via: "password" | "session" | "demo", id: string) {
    setBusy(id);
    setError(null);
    try {
      await api("/api/pos/pair", { body: { action: "pair", via, storeId: id, name, ...(via === "password" ? creds : {}) } });
      window.location.assign("/pos");
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
    }
  }

  return (
    <main className="min-h-dvh bg-ink-950 px-5 py-8 text-ink-100 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3 text-brand-500">
          <Mark className="h-12 w-12" />
          <Wordmark className="text-lg" />
        </div>
        <h1 className="mt-8 font-display text-3xl font-semibold text-white sm:text-4xl">Pair this till</h1>
        <p className="mt-2 max-w-xl text-ink-400">Link this tablet or phone to a store once. Staff then sign in with their PIN, and the till keeps selling (cash) even when the connection drops.</p>

        {queued > 0 && (
          <Alert tone="warn" className="mt-6">
            This device still has <b>{queued}</b> offline sale{queued === 1 ? "" : "s"} waiting to sync. Open the till and let them sync before pairing it to another store.
          </Alert>
        )}
        {error && <Alert className="mt-6">{error}</Alert>}

        {/* Optional first step: the till on the home screen, full-screen, with its shell cached for offline. Pairing works either way. */}
        <InstallPrompt app="till" className="mt-6" />
        <ServiceWorker src="/sw.js" scope="/pos" />

        {paired && !repair ? (
          <section className="mt-8 rounded-3xl bg-ink-900 p-6 ring-1 ring-ink-800">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-7 w-7 text-[#7fd49a]" />
              <div>
                <div className="font-semibold text-white">
                  Paired to {paired.store.name} ({paired.store.code})
                </div>
                <div className="text-sm text-ink-400">
                  {paired.name} · receipts {paired.store.code}-{paired.prefix}#####
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <a href="/pos" className="inline-flex h-14 items-center gap-2 rounded-full bg-brand-500 px-6 font-semibold text-ink-950 hover:bg-brand-400">
                Open the till <ArrowRight className="h-5 w-5" />
              </a>
              <PosButton variant="outline" size="lg" onClick={() => setRepair(true)}>
                Pair to a different store
              </PosButton>
            </div>
          </section>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section className="rounded-3xl bg-ink-900 p-6 ring-1 ring-ink-800" aria-labelledby="pair-signin">
              <h2 id="pair-signin" className="font-display text-xl font-semibold text-white">
                {signedIn ? `Signed in as ${signedIn.name}` : "Manager sign-in"}
              </h2>
              <p className="mt-1 text-sm text-ink-400">{signedIn ? "Choose the store and name this till." : "A store manager, owner or HQ user pairs tills."}</p>
              {!signedIn ? (
                <form onSubmit={signIn} className="mt-5 space-y-4">
                  <Field label="Work email" htmlFor="pair-email">
                    <TextInput id="pair-email" type="email" autoComplete="username" required value={creds.email} onChange={(e) => setCreds({ ...creds, email: e.target.value })} placeholder="you@herbalholland.com" />
                  </Field>
                  <Field label="Password" htmlFor="pair-password">
                    <TextInput id="pair-password" type="password" autoComplete="current-password" required value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} />
                  </Field>
                  <PosButton type="submit" variant="primary" size="lg" className="w-full" busy={busy === "signin"}>
                    Continue
                  </PosButton>
                </form>
              ) : (
                <div className="mt-5 space-y-4">
                  <fieldset>
                    <legend className="mb-2 text-[0.8rem] font-semibold text-ink-300">Store</legend>
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {signedIn.stores.map((s) => (
                        <label key={s.id} className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-4 py-2 ring-1 transition", storeId === s.id ? "bg-brand-500/10 ring-brand-500" : "bg-ink-850 ring-ink-800 hover:ring-ink-600")}>
                          <input type="radio" name="store" className="h-5 w-5 accent-brand-500" checked={storeId === s.id} onChange={() => setStoreId(s.id)} />
                          <span>
                            <span className="block font-semibold text-white">
                              {s.name} <span className="font-mono text-xs text-ink-400">{s.code}</span>
                            </span>
                            <span className="text-xs text-ink-400">
                              {s.suburb}, {s.city}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Field label="Till name" htmlFor="till-name" hint="Shown on receipts and Z-reports, e.g. Counter 2 or Pop-up tablet">
                    <TextInput id="till-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <PosButton variant="primary" size="lg" className="w-full" disabled={!storeId || !name.trim()} busy={!!busy && busy === storeId} onClick={() => storeId && void pair(signedIn.via, storeId)} data-testid="pair-submit">
                    <MonitorSmartphone className="h-5 w-5" /> Pair this till
                  </PosButton>
                  {signedIn.via === "password" && (
                    <button type="button" onClick={() => (setSignedIn(null), setStoreId(null))} className="h-12 text-sm font-semibold text-ink-400 hover:text-white">
                      Use a different account
                    </button>
                  )}
                </div>
              )}
            </section>

            {demoStores.length > 0 && (
              <section className="rounded-3xl border border-dashed border-ink-700 p-6" aria-labelledby="pair-demo">
                <div className="eyebrow text-[0.62rem] text-brand-500">Demo mode</div>
                <h2 id="pair-demo" className="mt-1 font-display text-xl font-semibold text-white">
                  One-click pairing
                </h2>
                <p className="mt-1 text-sm text-ink-400">Staff PINs: 1111 (manager, dispenser), 2222 (dispenser), 3333, 4444.</p>
                <ul className="mt-4 grid max-h-[26rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1">
                  {demoStores.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => void pair("demo", s.id)}
                        disabled={!!busy}
                        className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-ink-900 px-4 py-2 text-left ring-1 ring-ink-800 transition hover:ring-brand-500/60 disabled:opacity-50"
                        data-testid={`demo-pair-${s.code}`}
                      >
                        <StoreIcon className="h-5 w-5 shrink-0 text-brand-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-white">{s.name}</span>
                          <span className="text-xs text-ink-400">
                            {s.code} · {s.city}
                          </span>
                        </span>
                        {busy === s.id ? <span className="text-xs text-ink-400">Pairing…</span> : <ArrowRight className="h-4 w-4 text-ink-500" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
