"use client";
// The trade application form: the business, its addresses, the ranges it wants, the licences that kind of business
// needs for them (with the documents), who orders, and the two confirmations. The same validator the server uses
// (src/lib/trade.ts) runs in the browser first, so a typing mistake never costs the attached documents; anything only
// the server can tell (a buyer email in use, a document's contents) comes back by field. Success is shown in place.
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, FileCheck2 } from "lucide-react";
import { applyAction, type ApplyState } from "@/app/trade/apply/actions";
import { buttonClass } from "@/components/ui/button";
import { CheckRow, FieldRow, SelectInput, TextInput, inputClass } from "@/components/shop/ui";
import { CLASS_BLURB, CLASS_NAME } from "./format";
import { APPLY } from "./copy";
import { applicationFromForm, licenceInputName, TRADE_CLASSES, TRADE_KINDS, validateTradeApplication, type TradeErrors } from "@/lib/trade";
import { LICENCE_FILE_ACCEPT, requiredLicences, TRADE_LICENCES, TRADE_LICENCE_KINDS, type TradeLicenceKind } from "@/lib/trade-licences";
import { PROVINCES } from "@/lib/sa";
import { cn } from "@/lib/cn";

const FIELD_LABEL: Partial<Record<keyof TradeErrors, string>> = {
  legalName: "Registered business name", name: "Trading name", kind: "Kind of business", regNumber: "Company registration number", vatNumber: "VAT number", email: "Billing email", phone: "Business phone",
  addressLine: "Street address", suburb: "Suburb", city: "City or town", province: "Province", postalCode: "Postal code",
  deliveryLine: "Delivery street address", deliverySuburb: "Delivery suburb", deliveryCity: "Delivery city or town", deliveryProvince: "Delivery province", deliveryPostalCode: "Delivery postal code",
  classes: "Ranges", buyerName: "Buyer's name", buyerEmail: "Buyer's email", buyerPhone: "Buyer's mobile", notes: "Notes", adult: "Adults only", terms: "Trade terms",
  ...Object.fromEntries(
    TRADE_LICENCE_KINDS.flatMap((k) => [
      [licenceInputName(k, "number"), `${TRADE_LICENCES[k].name}: number`],
      [licenceInputName(k, "expiresAt"), `${TRADE_LICENCES[k].name}: expiry date`],
      [licenceInputName(k, "file"), `${TRADE_LICENCES[k].name}: document`],
    ]),
  ),
};
/** An input's id from its field key (licence keys carry dots). */
const fieldId = (k: string) => `f-${k.replace(/\./g, "-")}`;

export function ApplyForm({ termsVersion }: { termsVersion: string }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyAction, {});
  const v = state.values ?? {};
  // The browser's own check (the server's validator, run before sending) wins until the next send.
  const [checked, setChecked] = useState<TradeErrors | null>(null);
  const f: TradeErrors = checked ?? state.fields ?? {};
  const [otherDelivery, setOtherDelivery] = useState(v.otherDelivery === "on");
  const problems = Object.entries(f) as [keyof TradeErrors, string][];
  const ticked = (c: string) => (v.classes ?? "").split(" ").includes(c);
  // The kind of business, the ranges and whether there's a registration number (a company, or a sole proprietor) decide
  // which licences the form asks for; they follow what's typed, and the server's echo after a refused send (React
  // resets the form then).
  const fromState = () => ({ at: state.at, kind: v.kind ?? "", classes: (v.classes ?? "").split(" ").filter(Boolean), company: !!v.regNumber?.trim() });
  const [sel, setSel] = useState(fromState);
  if (sel.at !== state.at) setSel(fromState());
  const needed = sel.kind ? requiredLicences(sel.kind, sel.classes, sel.company) : [];
  // What a sole proprietor (no registration number) of this kind would need: the company certificate means it must be a company.
  const asSole = sel.kind ? requiredLicences(sel.kind, sel.classes, false) : [];
  const companyOnly = asSole.some((r) => r.kind === "CIPC_REGISTRATION");
  const soleProprietorOk = asSole.some((r) => r.kind === "SARS_REGISTRATION");
  const summary = useRef<HTMLDivElement>(null);
  const refusedByServer = !!(state.fields || state.error) && !checked;

  const preCheck = (e: React.FormEvent<HTMLFormElement>) => {
    const check = validateTradeApplication(applicationFromForm(new FormData(e.currentTarget)));
    if (check.ok) return setChecked(null);
    e.preventDefault();
    setChecked(check.fields);
    requestAnimationFrame(() => summary.current?.focus());
  };
  const toggleClass = (c: string, on: boolean) => setSel((x) => ({ ...x, classes: on ? [...new Set([...x.classes, c])] : x.classes.filter((y) => y !== c) }));

  if (state.ok)
    return (
      <div className="rounded-2xl border border-leaf-500/35 bg-leaf-500/10 p-6 sm:p-8" role="status" data-testid="apply-done">
        <CheckCircle2 className="h-9 w-9 text-leaf-500" aria-hidden />
        <h2 className="mt-4 font-display text-2xl font-semibold text-white sm:text-3xl">{APPLY.done}</h2>
        <p className="mt-3 text-ink-200">
          Application <strong className="tnum text-white">{state.number}</strong> is in. {APPLY.doneText}
        </p>
        <p className="mt-2 text-sm text-ink-300">
          The buyer&apos;s address is <strong className="text-white">{state.buyerEmail}</strong>; a confirmation is on its way there now.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/trade" className={buttonClass("outline-dark", "md")}>
            Back to Herbal Holland Trade
          </Link>
          <Link href="/trade/login" className={buttonClass("ghost-dark", "md")}>
            Sign in to follow your application
          </Link>
        </div>
      </div>
    );

  return (
    <form action={action} onSubmit={preCheck} className="space-y-10" noValidate>
      {(problems.length > 0 || state.error) && (
        <div ref={summary} tabIndex={-1} className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-4 text-sm text-rose-50 outline-none" role="alert">
          <p className="font-semibold text-white">{state.error ?? `Please check ${problems.length === 1 ? "one thing" : `${problems.length} things`} below.`}</p>
          {problems.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {problems.map(([k, msg]) => (
                <li key={k}>
                  <a href={`#${fieldId(k)}`} className="underline hover:text-white">
                    {FIELD_LABEL[k] ?? k}
                  </a>
                  : {msg}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Section n="1" title="The business" lead="As registered with CIPC, or as the sole proprietor trades.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow label="Registered (legal) name" htmlFor="f-legalName" error={f.legalName}>
            <TextInput id="f-legalName" name="legalName" autoComplete="organization" required maxLength={120} defaultValue={v.legalName} aria-invalid={!!f.legalName} />
          </FieldRow>
          <FieldRow label="Trading name (optional)" htmlFor="f-name" error={f.name} hint="If it differs from the registered name.">
            <TextInput id="f-name" name="name" maxLength={120} defaultValue={v.name} aria-invalid={!!f.name} />
          </FieldRow>
          <FieldRow label="Kind of business" htmlFor="f-kind" error={f.kind}>
            <SelectInput key={v.kind} id="f-kind" name="kind" defaultValue={v.kind || ""} required aria-invalid={!!f.kind} onChange={(e) => setSel((x) => ({ ...x, kind: e.target.value }))}>
              <option value="" disabled>
                Choose one
              </option>
              {Object.entries(TRADE_KINDS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </FieldRow>
          <FieldRow
            label={companyOnly ? "Company registration number" : "Company registration number (optional)"}
            htmlFor="f-regNumber"
            error={f.regNumber}
            hint={
              companyOnly
                ? "Like 2015/123456/07. This kind of business needs it — attach the certificate under Licences."
                : soleProprietorOk
                  ? "Like 2015/123456/07. A sole proprietor leaves it blank and attaches the SARS tax registration under Licences instead."
                  : "Like 2015/123456/07. Leave blank if the business isn't registered."
            }
          >
            <TextInput id="f-regNumber" name="regNumber" inputMode="numeric" maxLength={20} defaultValue={v.regNumber} aria-invalid={!!f.regNumber} className="tnum" onChange={(e) => setSel((x) => ({ ...x, company: !!e.target.value.trim() }))} />
          </FieldRow>
          <FieldRow label="VAT number (optional)" htmlFor="f-vatNumber" error={f.vatNumber} hint="Ten digits starting with 4, for a VAT vendor.">
            <TextInput id="f-vatNumber" name="vatNumber" inputMode="numeric" maxLength={14} defaultValue={v.vatNumber} aria-invalid={!!f.vatNumber} className="tnum" />
          </FieldRow>
          <FieldRow label="Billing email" htmlFor="f-email" error={f.email} hint="Pro formas, tax invoices and statements go here.">
            <TextInput id="f-email" name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={v.email} aria-invalid={!!f.email} />
          </FieldRow>
          <FieldRow label="Business phone" htmlFor="f-phone" error={f.phone}>
            <TextInput id="f-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required maxLength={20} defaultValue={v.phone} aria-invalid={!!f.phone} placeholder="012 345 6789" />
          </FieldRow>
        </div>
      </Section>

      <Section n="2" title="Addresses" lead="The billing address goes on your tax invoices. Courier orders go to the delivery address, or to the billing address when there isn't one.">
        <Address prefix="" v={v} f={f} />
        <div className="mt-5">
          {/* Re-keyed after a refused submit: React's form reset unticks the box without telling the state. */}
          <CheckRow key={`od-${state.at ?? 0}`} label="Deliver somewhere else" description="Tick to add a separate delivery address." defaultChecked={otherDelivery} onChange={(e) => setOtherDelivery(e.target.checked)} />
        </div>
        {otherDelivery && (
          <div className="mt-4">
            <Address prefix="delivery" v={v} f={f} />
          </div>
        )}
      </Section>

      <Section n="3" title="What you'd like to stock" lead="Tick every range you're interested in. Licensed medicines are never traded.">
        <fieldset id="f-classes" aria-describedby={f.classes ? "f-classes-error" : undefined}>
          <legend className="sr-only">Ranges</legend>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {TRADE_CLASSES.map((c) => (
              <CheckRow key={`${c}-${ticked(c)}`} name="classes" value={c} label={CLASS_NAME[c]} description={CLASS_BLURB[c]} defaultChecked={ticked(c)} onChange={(e) => toggleClass(c, e.target.checked)} />
            ))}
          </div>
          {f.classes && (
            <p id="f-classes-error" className="mt-2 text-xs font-medium text-rose-100" role="alert">
              {f.classes}
            </p>
          )}
        </fieldset>
      </Section>

      <Section n="4" title="Licences" lead="Every trade account holds the licences its kind of business needs for the ranges it buys. Attach each one — we check it with the issuer before approving the account.">
        <Licences needed={needed} v={v} f={f} attachAgain={refusedByServer} />
      </Section>

      <Section n="5" title="Who will order" lead="The buyer signs in with a 6-digit code sent to their email. The account's owner can add more buyers later.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow label="Buyer's name" htmlFor="f-buyerName" error={f.buyerName}>
            <TextInput id="f-buyerName" name="buyerName" autoComplete="name" required maxLength={120} defaultValue={v.buyerName} aria-invalid={!!f.buyerName} />
          </FieldRow>
          <FieldRow label="Buyer's email" htmlFor="f-buyerEmail" error={f.buyerEmail} hint="Leave blank to use the billing email.">
            <TextInput id="f-buyerEmail" name="buyerEmail" type="email" maxLength={254} defaultValue={v.buyerEmail} aria-invalid={!!f.buyerEmail} />
          </FieldRow>
          <FieldRow label="Buyer's mobile (optional)" htmlFor="f-buyerPhone" error={f.buyerPhone} hint="For a text when a collection is ready.">
            <TextInput id="f-buyerPhone" name="buyerPhone" type="tel" inputMode="tel" maxLength={20} defaultValue={v.buyerPhone} aria-invalid={!!f.buyerPhone} placeholder="082 123 4567" />
          </FieldRow>
          <FieldRow label="Anything we should know? (optional)" htmlFor="f-notes" error={f.notes} className="sm:col-span-2">
            <textarea id="f-notes" name="notes" maxLength={1000} defaultValue={v.notes} className={cn(inputClass, "min-h-24 py-3")} aria-invalid={!!f.notes} />
          </FieldRow>
        </div>
      </Section>

      <Section n="6" title="Confirm">
        <div className="space-y-1">
          <CheckRow key={`adult-${v.adult}`} name="adult" id="f-adult" label="Every buyer who orders for this business is 18 or older." defaultChecked={v.adult === "on"} aria-invalid={!!f.adult} />
          {f.adult && (
            <p className="text-xs font-medium text-rose-100" role="alert">
              {f.adult}
            </p>
          )}
          <CheckRow
            key={`terms-${v.terms}`}
            name="terms"
            id="f-terms"
            label={
              <>
                I accept the{" "}
                <Link href="/trade/terms" target="_blank" className="underline">
                  Herbal Holland trade terms
                </Link>{" "}
                ({termsVersion}) on behalf of the business.
              </>
            }
            defaultChecked={v.terms === "on"}
            aria-invalid={!!f.terms}
          />
          {f.terms && (
            <p className="text-xs font-medium text-rose-100" role="alert">
              {f.terms}
            </p>
          )}
        </div>
        <p className="mt-5 text-xs leading-relaxed text-ink-400">
          We use these details to assess the application and to run the account (POPIA). Only the trade team sees them. Read the{" "}
          <Link href="/legal/privacy" className="underline hover:text-ink-200">
            privacy notice
          </Link>
          .
        </p>
        <button disabled={pending} className={buttonClass("primary", "xl", "mt-6 w-full sm:w-auto")}>
          {pending ? "Sending…" : "Send the application"} <ArrowRight className="h-5 w-5" aria-hidden />
        </button>
      </Section>
    </form>
  );
}

function Section({ n, title, lead, children }: { n: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5 sm:p-7" aria-labelledby={`s-${n}`}>
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 font-display text-sm font-bold text-ink-950" aria-hidden>
          {n}
        </span>
        <div>
          <h2 id={`s-${n}`} className="font-display text-xl font-semibold text-white">
            {title}
          </h2>
          {lead && <p className="mt-1 text-sm text-ink-400">{lead}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Address({ prefix, v, f }: { prefix: "" | "delivery"; v: Record<string, string>; f: Partial<Record<string, string>> }) {
  const k = (name: string) => (prefix ? `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}` : name);
  const id = (name: string) => `f-${k(name)}`;
  const label = (s: string) => (prefix ? `Delivery ${s.toLowerCase()}` : s);
  const line = prefix ? "deliveryLine" : "addressLine";
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FieldRow label={label("Street address")} htmlFor={`f-${line}`} error={f[line]} className="sm:col-span-2">
        <TextInput id={`f-${line}`} name={line} autoComplete={prefix ? "shipping street-address" : "billing street-address"} maxLength={160} defaultValue={v[line]} aria-invalid={!!f[line]} required={!prefix} />
      </FieldRow>
      <FieldRow label={label("Suburb (optional)")} htmlFor={id("suburb")} error={f[k("suburb")]}>
        <TextInput id={id("suburb")} name={k("suburb")} maxLength={160} defaultValue={v[k("suburb")]} aria-invalid={!!f[k("suburb")]} />
      </FieldRow>
      <FieldRow label={label("City or town")} htmlFor={id("city")} error={f[k("city")]}>
        <TextInput id={id("city")} name={k("city")} autoComplete={prefix ? "shipping address-level2" : "billing address-level2"} maxLength={160} defaultValue={v[k("city")]} aria-invalid={!!f[k("city")]} required={!prefix} />
      </FieldRow>
      <FieldRow label={label("Province")} htmlFor={id("province")} error={f[k("province")]}>
        <SelectInput key={v[k("province")]} id={id("province")} name={k("province")} defaultValue={v[k("province")] || ""} aria-invalid={!!f[k("province")]} required={!prefix}>
          <option value="" disabled>
            Choose a province
          </option>
          {Object.entries(PROVINCES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </SelectInput>
      </FieldRow>
      <FieldRow label={label("Postal code")} htmlFor={id("postalCode")} error={f[k("postalCode")]}>
        <TextInput id={id("postalCode")} name={k("postalCode")} inputMode="numeric" autoComplete={prefix ? "shipping postal-code" : "billing postal-code"} maxLength={4} defaultValue={v[k("postalCode")]} aria-invalid={!!f[k("postalCode")]} className="tnum" required={!prefix} />
      </FieldRow>
    </div>
  );
}

function Licences({ needed, v, f, attachAgain }: { needed: { kind: TradeLicenceKind; why: string }[]; v: Record<string, string>; f: TradeErrors; attachAgain: boolean }) {
  if (!needed.length)
    return <p className="text-sm text-ink-300">Choose the kind of business and tick the ranges above — the licences it needs appear here.</p>;
  return (
    <div className="space-y-4">
      {attachAgain && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-50" role="status">
          Attach the documents again — for your security a browser doesn&apos;t keep files from a form that came back.
        </p>
      )}
      {needed.map(({ kind, why }) => {
        const info = TRADE_LICENCES[kind];
        const key = (part: "number" | "expiresAt" | "file") => licenceInputName(kind, part);
        return (
          <fieldset key={kind} className="rounded-2xl border border-ink-800 bg-ink-950/40 p-4 sm:p-5" data-testid={`licence-${kind}`}>
            <legend className="sr-only">{info.name}</legend>
            <div className="flex items-start gap-3">
              <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
              <div>
                <p className="font-semibold text-white">{info.name}</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {why}. Issued by {info.issuer} ({info.law}).
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {kind === "CIPC_REGISTRATION" ? (
                <p className="text-sm text-ink-300 sm:col-span-2">The number is the company registration number you entered above.</p>
              ) : (
                <FieldRow label="Licence number" htmlFor={fieldId(key("number"))} error={f[key("number")]} hint={info.hint}>
                  <TextInput id={fieldId(key("number"))} name={key("number")} required maxLength={40} defaultValue={v[key("number")]} aria-invalid={!!f[key("number")]} className="tnum" />
                </FieldRow>
              )}
              {info.expires && (
                <FieldRow label="Expires on" htmlFor={fieldId(key("expiresAt"))} error={f[key("expiresAt")]} hint="As printed on the licence.">
                  <TextInput id={fieldId(key("expiresAt"))} name={key("expiresAt")} type="date" required defaultValue={v[key("expiresAt")]} aria-invalid={!!f[key("expiresAt")]} />
                </FieldRow>
              )}
              <FieldRow label="The document" htmlFor={fieldId(key("file"))} error={f[key("file")]} hint="A PDF, or a clear photo (JPG or PNG) of the whole licence. Up to 5 MB." className="sm:col-span-2">
                <input
                  id={fieldId(key("file"))}
                  name={key("file")}
                  type="file"
                  accept={LICENCE_FILE_ACCEPT}
                  required
                  aria-invalid={!!f[key("file")]}
                  className="block w-full rounded-xl border border-ink-700 bg-ink-900 text-sm text-ink-200 file:mr-4 file:h-11 file:rounded-l-xl file:border-0 file:bg-ink-800 file:px-4 file:font-semibold file:text-white hover:file:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                />
              </FieldRow>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
