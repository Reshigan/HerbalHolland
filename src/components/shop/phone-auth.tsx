"use client";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, KeyRound, MessageSquareText, Smartphone } from "lucide-react";
import { authFlow, type AuthState } from "@/server/shop/actions";
import { buttonClass } from "@/components/ui/button";
import { CheckRow, FieldRow, SelectInput, TextInput } from "./ui";
import { checkSaId, displayPhone } from "@/lib/sa";
import { cn } from "@/lib/cn";

type StoreOpt = { id: string; name: string; city: string };

const CHANNELS = [
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "SMS", label: "SMS" },
  { key: "EMAIL", label: "Email" },
  { key: "PUSH", label: "App notifications" },
] as const;

export function PhoneAuth({
  next,
  stores,
  defaultStoreId,
  referral,
  consentWording,
  title = "Sign in or join",
  intro = "Use your mobile number — no passwords. New here? It takes one short step.",
}: {
  next?: string;
  stores: StoreOpt[];
  defaultStoreId?: string | null;
  referral?: { code: string; name: string } | null;
  consentWording: string;
  title?: string;
  intro?: string;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(authFlow, { step: "phone" });
  const hidden = (
    <>
      {next && <input type="hidden" name="next" value={next} />}
      {state.phone && <input type="hidden" name="phone" value={state.phone} />}
    </>
  );

  if (state.step === "done")
    return (
      <div className="rounded-2xl border border-leaf-500/35 bg-leaf-500/10 p-6 text-center" role="status">
        <CheckCircle2 className="mx-auto h-8 w-8 text-leaf-500" />
        <p className="mt-3 font-semibold text-white">You&apos;re signed in.</p>
        <Link href="/club" className={buttonClass("primary", "md", "mt-4")}>
          Go to your Rewards
        </Link>
      </div>
    );

  return (
    <div>
      <Steps step={state.step} />
      {state.error && (
        <p className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
          {state.error}
        </p>
      )}

      {state.step === "phone" && (
        <form action={action} className="space-y-4">
          {hidden}
          <input type="hidden" name="intent" value="send" />
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">{title}</h2>
            <p className="mt-1 text-sm text-ink-400">{intro}</p>
          </div>
          <FieldRow label="Mobile number" htmlFor="auth-phone" error={state.fields?.phone} hint="We'll send a 6-digit code by SMS.">
            <div className="relative">
              <Smartphone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <TextInput id="auth-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required placeholder="082 123 4567" defaultValue={state.values?.phone} className="pl-11 text-lg tracking-wide" aria-invalid={!!state.fields?.phone} autoFocus={!!state.error || !!state.fields?.phone} />
            </div>
          </FieldRow>
          <button disabled={pending} className={buttonClass("primary", "xl", "w-full")}>
            {pending ? "Sending…" : "Send my code"} <ArrowRight className="h-5 w-5" />
          </button>
          <p className="text-center text-xs text-ink-500">
            Adults 18+ only. By continuing you accept our <Link href="/legal/terms" className="underline hover:text-ink-300">terms</Link> and <Link href="/legal/privacy" className="underline hover:text-ink-300">privacy notice</Link>.
          </p>
        </form>
      )}

      {state.step === "code" && <CodeStep state={state} action={action} pending={pending} hidden={hidden} />}

      {state.step === "register" && (
        <RegisterStep state={state} action={action} pending={pending} hidden={hidden} stores={stores} defaultStoreId={defaultStoreId} referral={referral} consentWording={consentWording} />
      )}
    </div>
  );
}

function Steps({ step }: { step: AuthState["step"] }) {
  const i = step === "phone" ? 0 : step === "code" ? 1 : 2;
  return (
    <ol className="mb-6 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wider" aria-label="Progress">
      {["Number", "Code", "Details"].map((l, n) => (
        <li key={l} className="flex items-center gap-2">
          <span className={cn("grid h-6 w-6 place-items-center rounded-full text-[0.68rem]", n < i ? "bg-leaf-500 text-ink-950" : n === i ? "bg-oranje-500 text-ink-950" : "bg-ink-800 text-ink-400")} aria-current={n === i ? "step" : undefined}>
            {n + 1}
          </span>
          <span className={n === i ? "text-white" : "text-ink-500"}>{l}</span>
          {n < 2 && <span className="mx-1 h-px w-6 bg-ink-700" />}
        </li>
      ))}
    </ol>
  );
}

type StepProps = { state: AuthState; action: (f: FormData) => void; pending: boolean; hidden: React.ReactNode };

function CodeStep({ state, action, pending, hidden }: StepProps) {
  const [code, setCode] = useState("");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold text-white">Enter your code</h2>
        <p className="mt-1 text-sm text-ink-400">
          Sent to <strong className="text-ink-100">{state.phone ? displayPhone(state.phone) : "your phone"}</strong>. It expires in 10 minutes.
        </p>
      </div>
      {state.demoCode && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-50">
          <span className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4" /> Demo mode — your code is <strong className="tnum tracking-widest">{state.demoCode}</strong>
          </span>
          <button type="button" onClick={() => setCode(state.demoCode!)} className="shrink-0 font-semibold underline">
            Fill it in
          </button>
        </div>
      )}
      <form action={action} className="space-y-4">
        {hidden}
        <input type="hidden" name="intent" value="verify" />
        <FieldRow label="6-digit code" htmlFor="auth-code" error={state.fields?.code}>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <TextInput
              id="auth-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="tnum pl-11 text-xl tracking-[0.5em]"
              aria-invalid={!!state.fields?.code}
              autoFocus
            />
          </div>
        </FieldRow>
        <button disabled={pending || code.length !== 6} className={buttonClass("primary", "xl", "w-full")}>
          {pending ? "Checking…" : "Verify"}
        </button>
      </form>
      <div className="flex items-center justify-between text-sm">
        <form action={action}>
          <input type="hidden" name="intent" value="restart" />
          <button className="font-medium text-ink-400 hover:text-white">Use a different number</button>
        </form>
        <form action={action}>
          {hidden}
          <input type="hidden" name="intent" value="send" />
          <button className="font-semibold text-oranje-400 hover:underline">Send a new code</button>
        </form>
      </div>
    </div>
  );
}

function RegisterStep({ state, action, pending, hidden, stores, defaultStoreId, referral, consentWording }: StepProps & { stores: StoreOpt[]; defaultStoreId?: string | null; referral?: { code: string; name: string } | null; consentWording: string }) {
  const v = state.values ?? {};
  const [idType, setIdType] = useState<"sa" | "passport">(v.idType === "passport" ? "passport" : "sa");
  const [id, setId] = useState(v.idNumber ?? "");
  const idCheck = useMemo(() => (id.replace(/\s/g, "").length === 13 ? checkSaId(id) : null), [id]);
  const cities = useMemo(() => [...new Set(stores.map((s) => s.city))].sort(), [stores]);
  const maxDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().slice(0, 10);
  }, []);

  return (
    <form action={action} className="space-y-5">
      {hidden}
      <input type="hidden" name="intent" value="register" />
      {referral && <input type="hidden" name="ref" value={referral.code} />}
      <input type="hidden" name="idType" value={idType} />
      <div>
        <h2 className="font-display text-2xl font-semibold text-white">Welcome — one quick step</h2>
        <p className="mt-1 text-sm text-ink-400">
          Number confirmed: <strong className="text-ink-100">{state.phone ? displayPhone(state.phone) : ""}</strong>. Tell us a little about you to finish joining Herbal Holland Rewards.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldRow label="First name" htmlFor="reg-first" error={state.fields?.firstName}>
          <TextInput id="reg-first" name="firstName" autoComplete="given-name" required maxLength={60} defaultValue={v.firstName} aria-invalid={!!state.fields?.firstName} autoFocus />
        </FieldRow>
        <FieldRow label="Email for invoices (optional)" htmlFor="reg-email" error={state.fields?.email} hint="Tax invoices and receipts only, unless you opt in below.">
          <TextInput id="reg-email" name="email" type="email" autoComplete="email" defaultValue={v.email} aria-invalid={!!state.fields?.email} />
        </FieldRow>
      </div>

      <fieldset>
        <legend className="mb-2 text-[0.8rem] font-semibold text-ink-200">Confirm you&apos;re 18 or older</legend>
        <div className="mb-3 inline-flex rounded-full border border-ink-700 p-1" role="radiogroup">
          {[
            ["sa", "SA ID number"],
            ["passport", "Passport"],
          ].map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={idType === k}
              onClick={() => setIdType(k as "sa" | "passport")}
              className={cn("rounded-full px-4 py-1.5 text-sm font-semibold transition", idType === k ? "bg-oranje-500 text-ink-950" : "text-ink-300 hover:text-white")}
            >
              {l}
            </button>
          ))}
        </div>
        {idType === "sa" ? (
          <FieldRow
            label="SA ID number"
            htmlFor="reg-id"
            error={state.fields?.idNumber ?? (idCheck && !idCheck.valid ? idCheck.reason : undefined)}
            hint={idCheck?.valid ? "Looks good — we check the number instantly and store only a secure fingerprint of it." : "13 digits. We verify your age from it and never share it."}
          >
            <TextInput id="reg-id" name="idNumber" inputMode="numeric" autoComplete="off" maxLength={16} value={id} onChange={(e) => setId(e.target.value.replace(/[^\d\s]/g, ""))} aria-invalid={!!state.fields?.idNumber || (idCheck ? !idCheck.valid : false)} className="tnum tracking-wider" />
          </FieldRow>
        ) : (
          <FieldRow label="Date of birth" htmlFor="reg-dob" error={state.fields?.dob} hint="Using a passport? Show it at your first store visit or collection and our team will verify it — until then, online orders need a verified age.">
            <TextInput id="reg-dob" name="dob" type="date" max={maxDob} min="1900-01-01" defaultValue={v.dob} aria-invalid={!!state.fields?.dob} />
          </FieldRow>
        )}
      </fieldset>

      <FieldRow label="Home store" htmlFor="reg-store" error={state.fields?.homeStoreId} hint="Where you'll usually collect — you can change it any time.">
        <SelectInput id="reg-store" name="homeStoreId" defaultValue={v.homeStoreId || defaultStoreId || ""} required aria-invalid={!!state.fields?.homeStoreId}>
          <option value="" disabled>
            Choose a store
          </option>
          {cities.map((c) => (
            <optgroup key={c} label={c}>
              {stores
                .filter((s) => s.city === c)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </SelectInput>
      </FieldRow>

      <fieldset className="rounded-2xl border border-ink-800 bg-ink-900/60 p-4">
        <legend className="px-1 text-[0.8rem] font-semibold text-ink-200">News, drops &amp; offers (optional)</legend>
        <p className="mb-2 text-xs leading-relaxed text-ink-400">{consentWording}</p>
        <div className="grid grid-cols-2 gap-x-4">
          {CHANNELS.map((c) => (
            <CheckRow key={c.key} name={`consent_${c.key}`} label={c.label} defaultChecked={false} />
          ))}
        </div>
      </fieldset>

      <div>
        <CheckRow name="accept" required label={<>I&apos;m 18 or older and I accept the <Link href="/legal/terms" className="underline">terms</Link> and <Link href="/legal/privacy" className="underline">privacy notice</Link>.</>} />
        {state.fields?.accept && <p className="mt-1 text-xs font-medium text-rose-100" role="alert">{state.fields.accept}</p>}
      </div>

      {referral && <p className="rounded-xl bg-oranje-500/10 px-4 py-3 text-sm text-oranje-200">Invited by {referral.name} — you&apos;ll both get bonus points after your first purchase.</p>}

      <button disabled={pending} className={buttonClass("primary", "xl", "w-full")}>
        {pending ? "Creating your account…" : "Join and continue"} <ArrowRight className="h-5 w-5" />
      </button>
    </form>
  );
}
