"use client";
// Fingerprint / face sign-in (passkeys). PasskeyToggle adds one on this phone from the profile; PasskeySignIn signs
// in with it on the join screen. Both only show where the phone has a built-in biometric (platform authenticator).
// Passkeys need https on the shop's own domain, so they never appear on a local IP.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Fingerprint, ScanFace } from "lucide-react";
import { passkeyCreateOptions, passkeyGetOptions, passkeySignIn, removePasskeys, savePasskey } from "@/server/shop/passkeys";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const bytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

/** Whether this phone can make and use a passkey with its own fingerprint or face. */
function usePlatformPasskey() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!window.isSecureContext || !window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return;
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(setOk, () => setOk(false));
  }, []);
  return ok;
}

const cancelled = (e: unknown) => e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError");

export function PasskeyToggle({ count, prompt = false }: { count: number; prompt?: boolean }) {
  const router = useRouter();
  const available = usePlatformPasskey();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      setError(null);
      try {
        const o = await passkeyCreateOptions();
        if (!o) return setError("Sign in first");
        const cred = (await navigator.credentials.create({
          publicKey: {
            challenge: bytes(o.challenge),
            rp: o.rp,
            user: { id: bytes(o.user.id), name: o.user.name, displayName: o.user.displayName },
            pubKeyCredParams: o.algs.map((alg) => ({ type: "public-key" as const, alg })),
            authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
            excludeCredentials: o.exclude.map((id) => ({ type: "public-key" as const, id: bytes(id) })),
            attestation: "none",
            timeout: 60_000,
          },
        })) as PublicKeyCredential | null;
        const r = cred?.response as AuthenticatorAttestationResponse | undefined;
        const key = r?.getPublicKey?.();
        if (!cred || !r || !key) return setError("This phone can't make a passkey here. Keep using your number");
        const res = await savePasskey({ id: cred.id, publicKey: b64u(key), alg: r.getPublicKeyAlgorithm(), clientDataJSON: b64u(r.clientDataJSON), label: navigator.platform || undefined });
        if (!res.ok) return setError(res.error);
        setDone(true);
        router.refresh();
      } catch (e) {
        if (e instanceof DOMException && e.name === "InvalidStateError") return setError("Fingerprint sign-in is already on for this phone");
        if (!cancelled(e)) setError("We couldn't set that up just now. Please try again.");
      }
    });

  const remove = () =>
    start(async () => {
      setError(null);
      const res = await removePasskeys();
      if (!res.ok) return setError(res.error);
      setDone(false);
      router.refresh();
    });

  const on = count > 0;
  // As a prompt on club home it only shows where it can be turned on, and goes once it is.
  if (prompt && (!available || on || done)) return null;
  return (
    <div className={prompt ? "rounded-2xl border border-ink-800 bg-ink-900/70 p-4" : undefined}>
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors", on ? "bg-brand-500 text-ink-950" : "bg-ink-850 text-ink-300")}>
            <Fingerprint className="h-5 w-5" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <div className="font-medium text-white">{on ? "Fingerprint sign-in is on" : "Sign in with your fingerprint or face"}</div>
            <div className="text-xs text-ink-400" aria-live="polite">
              {done ? "Done. Next time, tap “Sign in with fingerprint”." : on ? `Set up on ${count} device${count === 1 ? "" : "s"}` : available ? "No code to wait for. Your fingerprint never leaves your phone." : "This phone or browser doesn't offer fingerprint sign-in"}
            </div>
          </div>
        </div>
        {available && (
          <button type="button" onClick={add} disabled={pending} className={buttonClass(on ? "outline-dark" : "primary", "md", "shrink-0")}>
            {pending ? "One moment…" : on ? "Add this phone" : "Turn on"}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm text-rose-100" role="alert">
          {error}
        </p>
      )}
      {on && (
        <button type="button" onClick={remove} disabled={pending} className="mt-2 text-xs font-medium text-ink-400 underline underline-offset-4 hover:text-white disabled:opacity-50">
          Turn off on all devices
        </button>
      )}
    </div>
  );
}

export function PasskeySignIn({ next }: { next?: string }) {
  const available = usePlatformPasskey();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!available) return null;

  const signIn = () =>
    start(async () => {
      setError(null);
      try {
        const o = await passkeyGetOptions();
        const cred = (await navigator.credentials.get({ publicKey: { challenge: bytes(o.challenge), rpId: o.rpId, userVerification: "required", timeout: 60_000 } })) as PublicKeyCredential | null;
        const r = cred?.response as AuthenticatorAssertionResponse | undefined;
        if (!cred || !r) return;
        const res = await passkeySignIn({ id: b64u(cred.rawId), authenticatorData: b64u(r.authenticatorData), clientDataJSON: b64u(r.clientDataJSON), signature: b64u(r.signature), next });
        if (!res.ok) return setError(res.error);
        window.location.href = res.next ?? "/club";
      } catch (e) {
        if (!cancelled(e)) setError("Fingerprint sign-in didn't work. Use your number instead.");
      }
    });

  return (
    <div className="space-y-2">
      <button type="button" onClick={signIn} disabled={pending} className={buttonClass("outline-dark", "xl", "w-full")}>
        <ScanFace className="h-5 w-5" strokeWidth={1.9} /> {pending ? "Checking it's you…" : "Sign in with fingerprint"}
      </button>
      {error && (
        <p className="text-center text-sm text-rose-100" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
