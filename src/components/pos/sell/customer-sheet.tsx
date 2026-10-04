"use client";
// Find a member (phone, name, member no. or member QR) or sign one up in under 20 seconds.
import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, QrCode, Search, Smartphone, Stethoscope, UserPlus } from "lucide-react";
import { checkSaId, ageOn, normalisePhone } from "@/lib/sa";
import { fmtDate } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { api, errorText, OfflineError } from "../lib/api";
import { memberNoFrom, offlineMember } from "../lib/rules";
import { DEALS_QUESTION, KEY_TERMS, TERMS_LABEL } from "@/lib/terms";
import { INTERESTS, type InterestKey } from "@/lib/rfm";
import { Alert, CheckRow, Chip, Field, PosButton, Segmented, Sheet, Spinner, TextInput, TIER_CHIP, tierName } from "../ui";
import { visitDate } from "./cart-panel";
import type { CustomerDetail, CustomerHit } from "@/server/pos/types";

export function CustomerSheet({
  open,
  mode,
  onMode,
  onClose,
  onPick,
  online,
  joinUrl,
  minAge,
  initialQuery,
  training = false,
}: {
  open: boolean;
  mode: "find" | "new";
  onMode: (m: "find" | "new") => void;
  onClose: () => void;
  onPick: (c: CustomerDetail) => void;
  online: boolean;
  joinUrl: string;
  minAge: number;
  initialQuery?: string;
  /** Training mode: sign-ups are simulated on the till (nothing is written). */
  training?: boolean;
}) {
  // "Sign up 082…" from a search with no match: the New member form starts with that number.
  const [prefill, setPrefill] = useState("");
  useEffect(() => {
    if (!open) setPrefill("");
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={mode === "find" ? "Find a member" : "New Rewards member"} subtitle={mode === "find" ? "Phone, name, member number — or scan their member QR" : "Takes about 20 seconds"} size="lg">
      <Segmented
        label="Member"
        value={mode}
        onChange={onMode}
        className="mb-5 w-fit"
        options={[
          { value: "find", label: "Find member" },
          { value: "new", label: "New member" },
        ]}
      />
      {!online ? (
        <OfflineMember onPick={onPick} />
      ) : mode === "find" ? (
        <FindMember onPick={onPick} initialQuery={initialQuery} onSignUp={(phone) => (setPrefill(phone), onMode("new"))} />
      ) : (
        <NewMember key={prefill} onCreated={onPick} joinUrl={joinUrl} minAge={minAge} training={training} phone={prefill} />
      )}
    </Sheet>
  );
}

function FindMember({ onPick, initialQuery, onSignUp }: { onPick: (c: CustomerDetail) => void; initialQuery?: string; onSignUp: (phone: string) => void }) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [hits, setHits] = useState<CustomerHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<{ customers: CustomerHit[] }>(`/api/pos/customers?q=${encodeURIComponent(term)}`);
        if (n !== seq.current) return;
        setHits(r.customers);
        setError(null);
        // A scanned member QR, an exact member number or a full mobile number with one match opens straight away.
        if ((memberNoFrom(term) || normalisePhone(term)) && r.customers.length === 1) void open(r.customers[0].id);
      } catch (e) {
        if (n === seq.current) setError(errorText(e));
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function open(id: string) {
    setOpening(id);
    try {
      const r = await api<{ customer: CustomerDetail }>(`/api/pos/customers/${id}`);
      onPick(r.customer);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setOpening(null);
    }
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500" />
        <TextInput
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            // Enter takes the first member found.
            if (e.key === "Enter" && hits?.length && !opening) {
              e.preventDefault();
              void open(hits[0].id);
            }
          }}
          enterKeyHint="go"
          placeholder="082 555 1234 · Thandi Mokoena · HH0100002"
          aria-label="Search members"
          className="h-14 pl-12 text-lg"
        />
        {loading && <Spinner className="absolute right-4 top-1/2 -translate-y-1/2" />}
      </div>
      {error && <Alert className="mt-3">{error}</Alert>}
      <ul className="mt-4 space-y-2" aria-label="Members found">
        {hits?.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => void open(h.id)}
              disabled={!!opening}
              className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-ink-850 px-4 py-3 text-left ring-1 ring-ink-800 transition hover:ring-brand-500/60 disabled:opacity-60"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-700 font-display text-sm font-bold text-white">{h.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-white">{h.name}</span>
                  <Chip tone={TIER_CHIP[h.tier] ?? "neutral"}>{tierName(h.tier)}</Chip>
                  {h.patient && (
                    <Chip tone="blue" icon={<Stethoscope className="h-3 w-3" />}>
                      Patient
                    </Chip>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-ink-400">
                  {h.memberNo} · {h.phone} · {fmtPoints(h.points)}
                </span>
                <span className="block text-xs text-ink-400">
                  Visits here {h.visitsHere}
                  {h.lastVisitHere ? ` · Last visit here ${visitDate(h.lastVisitHere)}` : ""}
                </span>
              </span>
              {opening === h.id ? <Spinner /> : <span className="text-sm font-semibold text-brand-400">Add</span>}
            </button>
          </li>
        ))}
      </ul>
      {hits && hits.length === 0 && !loading && (
        <div className="mt-6 text-center">
          <p className="text-sm text-ink-400">No members match “{q.trim()}”. Check the number, or sign them up.</p>
          <PosButton variant="primary" className="mt-3" onClick={() => onSignUp(normalisePhone(q) ? q.trim() : "")} data-testid="sign-up-from-search">
            <UserPlus className="h-4 w-4" /> {normalisePhone(q) ? `Sign up ${q.trim()}` : "Sign up a new member"}
          </PosButton>
        </div>
      )}
    </div>
  );
}

function NewMember({ onCreated, joinUrl, minAge, training, phone = "" }: { onCreated: (c: CustomerDetail) => void; joinUrl: string; minAge: number; training?: boolean; phone?: string }) {
  const [f, setF] = useState({ phone, firstName: "", lastName: "", email: "", idNumber: "" });
  const [passport, setPassport] = useState(false);
  const [deals, setDeals] = useState<boolean | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [dob, setDob] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const id = useMemo(() => {
    const raw = f.idNumber.replace(/\s/g, "");
    if (!raw) return null;
    const r = checkSaId(raw);
    return r.valid ? { ok: true as const, dob: r.dob, age: ageOn(r.dob) } : { ok: false as const, reason: r.reason };
  }, [f.idNumber]);
  const phoneOk = !!normalisePhone(f.phone);
  const emailOk = !f.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim());
  const underage = id?.ok && id.age < minAge;
  const valid = phoneOk && f.firstName.trim() && emailOk && ((id?.ok && !underage) || (!f.idNumber && passport && !!dob)) && deals !== null && terms;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setError(null);
    if (training) {
      // Practice sign-up: a member that exists on this till only, for this practice sale.
      const dobIso = id?.ok ? id.dob.toISOString() : dob ? new Date(`${dob}T00:00:00Z`).toISOString() : null;
      const age = dobIso ? ageOn(new Date(dobIso)) : null;
      onCreated({ ...offlineMember("HH9999999"), id: "", firstName: f.firstName.trim() || "Trainee", lastName: f.lastName.trim() || null, email: f.email.trim() || null, ageVerified: true, ageCheck: f.idNumber ? "ID_NUMBER" : "ID_SIGHTED", age, offline: false });
      setBusy(false);
      return;
    }
    try {
      const r = await api<{ customer: CustomerDetail }>("/api/pos/customers", {
        body: { ...f, email: f.email.trim(), idNumber: f.idNumber.replace(/\s/g, "") || undefined, passportSighted: passport && !f.idNumber, dob: passport && !f.idNumber ? dob : undefined, deals, interests, acceptTerms: terms },
      });
      onCreated(r.customer);
    } catch (e) {
      setError(e instanceof OfflineError ? "Offline — try again when the connection is back" : errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_15rem]">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {training && <Alert tone="warn">Training — this sign-up is practice only: no member is created and nothing is sent.</Alert>}
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile number" htmlFor="nm-phone" error={touched && !phoneOk ? "Enter a South African mobile number" : undefined}>
            <TextInput id="nm-phone" autoFocus={!phone} inputMode="tel" autoComplete="off" value={f.phone} onChange={set("phone")} placeholder="082 555 1234" aria-invalid={touched && !phoneOk} />
          </Field>
          <Field label="First name" htmlFor="nm-first" error={touched && !f.firstName.trim() ? "Enter their first name" : undefined}>
            <TextInput id="nm-first" autoFocus={!!phone} autoComplete="off" value={f.firstName} onChange={set("firstName")} aria-invalid={touched && !f.firstName.trim()} />
          </Field>
          <Field label="Surname (optional)" htmlFor="nm-last">
            <TextInput id="nm-last" autoComplete="off" value={f.lastName} onChange={set("lastName")} />
          </Field>
          <Field label="Email for deals and invoices (optional)" htmlFor="nm-email" error={!emailOk ? "That email doesn't look right" : undefined}>
            <TextInput id="nm-email" type="email" inputMode="email" autoComplete="off" value={f.email} onChange={set("email")} placeholder="name@example.co.za" aria-invalid={!emailOk} />
          </Field>
        </div>
        <Field
          label="SA ID number"
          htmlFor="nm-id"
          error={id && !id.ok ? id.reason : underage ? `Under ${minAge} — they can't join or buy age-restricted products` : touched && !f.idNumber && !passport ? "Enter an SA ID number, or tick passport sighted" : undefined}
          hint={id?.ok ? undefined : "Checked here — only a secure hash and the last 4 digits are stored"}
        >
          <TextInput id="nm-id" inputMode="numeric" autoComplete="off" value={f.idNumber} onChange={set("idNumber")} placeholder="13 digits" disabled={passport} aria-invalid={!!id && (!id.ok || !!underage)} />
        </Field>
        {id?.ok && !underage && (
          <div className="-mt-2 flex items-center gap-2 text-sm text-[#7fd49a]">
            <BadgeCheck className="h-4 w-4" /> Born {fmtDate(id.dob)} · {id.age} years old
          </div>
        )}
        <CheckRow checked={passport} onChange={(v) => (setPassport(v), v && setF((s) => ({ ...s, idNumber: "" })))} label="Passport sighted (not an SA citizen)" description={`I've checked their passport and they are ${minAge} or older.`} />
        {passport && (
          <Field label="Date of birth (from the passport)" htmlFor="nm-dob" error={touched && !dob ? "Enter their date of birth — it's also how they get birthday deals" : undefined}>
            <TextInput id="nm-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} aria-invalid={touched && !dob} />
          </Field>
        )}
        <fieldset className="rounded-2xl bg-ink-850 p-3 ring-1 ring-ink-800" data-testid="deals-question">
          <legend className="px-1 text-[0.8rem] font-semibold text-ink-300">Member deals &amp; news — ask them</legend>
          <p className="px-1 text-sm leading-relaxed text-ink-200">&ldquo;{DEALS_QUESTION}&rdquo;</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <PosButton type="button" variant={deals === true ? "primary" : "secondary"} aria-pressed={deals === true} onClick={() => setDeals(true)}>
              Yes, send deals
            </PosButton>
            <PosButton type="button" variant={deals === false ? "primary" : "secondary"} aria-pressed={deals === false} onClick={() => setDeals(false)}>
              No thanks
            </PosButton>
          </div>
          {touched && deals === null && <p className="px-1 pt-1.5 text-xs font-medium text-[#f29b9b]">Ask them — their answer is recorded</p>}
          <div className="mt-3 px-1 text-[0.8rem] font-semibold text-ink-300">What are they into? (optional)</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(Object.keys(INTERESTS) as InterestKey[]).map((k) => {
              const on = interests.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setInterests((x) => (on ? x.filter((i) => i !== k) : [...x, k]))}
                  className={`min-h-11 rounded-full px-3.5 text-sm ring-1 transition ${on ? "bg-brand-500/20 text-brand-100 ring-brand-500/50" : "bg-ink-900 text-ink-300 ring-ink-700 hover:ring-ink-500"}`}
                >
                  {INTERESTS[k]}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="rounded-2xl bg-ink-850 p-3 ring-1 ring-ink-800" data-testid="key-terms">
          <div className="px-1 text-[0.8rem] font-semibold text-ink-300">Key membership terms — turn the screen so they can read them</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-300">
            {KEY_TERMS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-[0.7rem] text-ink-500">Full terms: herbalholland.co.za/legal/terms · {TERMS_LABEL}</p>
          <CheckRow checked={terms} onChange={setTerms} label="They've read the key terms and accept the membership terms and privacy notice" />
          {touched && !terms && <p className="px-1 text-xs font-medium text-[#f29b9b]">They must accept the terms to become a member</p>}
        </div>
        <PosButton type="submit" variant="primary" size="lg" className="w-full" busy={busy} disabled={busy}>
          <UserPlus className="h-5 w-5" /> Create member &amp; add to sale
        </PosButton>
      </form>
      <aside className="rounded-3xl bg-ink-850 p-4 text-center ring-1 ring-ink-800">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-white">
          <Smartphone className="h-4 w-4 text-brand-400" /> Or join on their phone
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/pos/qr?text=${encodeURIComponent(joinUrl)}`} alt="QR code to join Herbal Holland Rewards" className="mx-auto mt-3 aspect-square w-full max-w-48 rounded-2xl bg-white p-2" />
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          New members scan with their camera to sign up to Herbal Holland Rewards themselves. Their home store is set to this one.
        </p>
        <div className="mt-2 inline-flex items-center gap-1 text-[0.7rem] text-ink-500">
          <QrCode className="h-3 w-3" /> {joinUrl.replace(/^https?:\/\//, "")}
        </div>
      </aside>
    </div>
  );
}

/** Offline: members can't be looked up, so take the number from their card or their mobile; it's checked when the till reconnects. */
function OfflineMember({ onPick }: { onPick: (c: CustomerDetail) => void }) {
  const [no, setNo] = useState("");
  const memberNo = memberNoFrom(no) ?? normalisePhone(no);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (memberNo) onPick(offlineMember(memberNo));
      }}
      className="space-y-3"
    >
      <Alert tone="warn">Offline — members can&apos;t be looked up or signed up. Scan their card QR, or type the member number from their card or their mobile number: it&apos;s checked when the till reconnects. New members sign up once you&apos;re back online.</Alert>
      <Field label="Member number or mobile" htmlFor="off-member" error={no.trim().length >= 9 && !memberNo ? "Member numbers look like HH0123456; mobiles like 082 555 1234" : undefined}>
        <TextInput id="off-member" autoFocus autoComplete="off" value={no} onChange={(e) => setNo(e.target.value)} placeholder="HH0123456 or 082 555 1234" />
      </Field>
      <PosButton type="submit" variant="primary" size="lg" className="w-full" disabled={!memberNo}>
        Add to sale
      </PosButton>
    </form>
  );
}
