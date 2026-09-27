"use client";
// Find a member (phone, name, member no. or member QR) or sign one up in under 20 seconds.
import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, QrCode, Search, Smartphone, Stethoscope, UserPlus } from "lucide-react";
import { checkSaId, ageOn, normalisePhone } from "@/lib/sa";
import { fmtDate } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { api, errorText, OfflineError } from "../lib/api";
import { memberNoFrom } from "../lib/rules";
import { Alert, CheckRow, Chip, Field, PosButton, Segmented, Sheet, Spinner, TextInput, TIER_CHIP, tierName } from "../ui";
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
}) {
  return (
    <Sheet open={open} onClose={onClose} title={mode === "find" ? "Find a member" : "New Rewards member"} subtitle={mode === "find" ? "Phone, name, member number — or scan their member QR" : "Takes about 20 seconds"} size="lg">
      <Segmented
        label="Customer"
        value={mode}
        onChange={onMode}
        className="mb-5 w-fit"
        options={[
          { value: "find", label: "Find member" },
          { value: "new", label: "New member" },
        ]}
      />
      {!online ? (
        <Alert tone="warn">Offline — finding and signing up members needs a connection. You can still sell to a walk-in customer (cash only).</Alert>
      ) : mode === "find" ? (
        <FindMember onPick={onPick} initialQuery={initialQuery} />
      ) : (
        <NewMember onCreated={onPick} joinUrl={joinUrl} minAge={minAge} />
      )}
    </Sheet>
  );
}

function FindMember({ onPick, initialQuery }: { onPick: (c: CustomerDetail) => void; initialQuery?: string }) {
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
        // A scanned member QR or exact member number opens straight away.
        if (memberNoFrom(term) && r.customers.length === 1) void open(r.customers[0].id);
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
        <TextInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="082 555 1234 · Thandi Mokoena · HH0100002" aria-label="Search members" className="h-14 pl-12 text-lg" />
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
              </span>
              {opening === h.id ? <Spinner /> : <span className="text-sm font-semibold text-brand-400">Add</span>}
            </button>
          </li>
        ))}
      </ul>
      {hits && hits.length === 0 && !loading && <p className="mt-6 text-center text-sm text-ink-400">No members match “{q.trim()}”. Check the number, or sign them up.</p>}
    </div>
  );
}

function NewMember({ onCreated, joinUrl, minAge }: { onCreated: (c: CustomerDetail) => void; joinUrl: string; minAge: number }) {
  const [f, setF] = useState({ phone: "", firstName: "", lastName: "", email: "", idNumber: "" });
  const [passport, setPassport] = useState(false);
  const [consents, setConsents] = useState({ SMS: false, WHATSAPP: false, EMAIL: false });
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
  const valid = phoneOk && f.firstName.trim() && emailOk && ((id?.ok && !underage) || (!f.idNumber && passport));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ customer: CustomerDetail }>("/api/pos/customers", {
        body: { ...f, email: f.email.trim(), idNumber: f.idNumber.replace(/\s/g, "") || undefined, passportSighted: passport && !f.idNumber, consents },
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
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile number" htmlFor="nm-phone" error={touched && !phoneOk ? "Enter a South African mobile number" : undefined}>
            <TextInput id="nm-phone" autoFocus inputMode="tel" autoComplete="off" value={f.phone} onChange={set("phone")} placeholder="082 555 1234" aria-invalid={touched && !phoneOk} />
          </Field>
          <Field label="First name" htmlFor="nm-first" error={touched && !f.firstName.trim() ? "Enter their first name" : undefined}>
            <TextInput id="nm-first" autoComplete="off" value={f.firstName} onChange={set("firstName")} aria-invalid={touched && !f.firstName.trim()} />
          </Field>
          <Field label="Surname (optional)" htmlFor="nm-last">
            <TextInput id="nm-last" autoComplete="off" value={f.lastName} onChange={set("lastName")} />
          </Field>
          <Field label="Email for invoices (optional)" htmlFor="nm-email" error={!emailOk ? "That email doesn't look right" : undefined}>
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
        <fieldset className="rounded-2xl bg-ink-850 p-3 ring-1 ring-ink-800">
          <legend className="px-1 text-[0.8rem] font-semibold text-ink-300">Marketing (optional — ask the customer)</legend>
          <div className="grid gap-1 sm:grid-cols-3">
            <CheckRow checked={consents.SMS} onChange={(v) => setConsents((c) => ({ ...c, SMS: v }))} label="SMS" />
            <CheckRow checked={consents.WHATSAPP} onChange={(v) => setConsents((c) => ({ ...c, WHATSAPP: v }))} label="WhatsApp" />
            <CheckRow checked={consents.EMAIL} disabled={!f.email} onChange={(v) => setConsents((c) => ({ ...c, EMAIL: v }))} label="Email" />
          </div>
          <p className="px-1 text-xs leading-relaxed text-ink-400">Drops, offers and events on the channels ticked. They can opt out any time by replying STOP. Invoices are always emailed.</p>
        </fieldset>
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
          Customers scan with their camera to sign up to Herbal Holland Rewards themselves. Their home store is set to this one.
        </p>
        <div className="mt-2 inline-flex items-center gap-1 text-[0.7rem] text-ink-500">
          <QrCode className="h-3 w-3" /> {joinUrl.replace(/^https?:\/\//, "")}
        </div>
      </aside>
    </div>
  );
}
