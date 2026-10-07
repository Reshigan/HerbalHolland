"use client";
// Uploading a licence (or its renewal) from the portal's account page: which licence, its number and expiry as
// printed, and the document. It waits for the trade team's check; errors come back on the field they belong to.
import { useActionState, useState } from "react";
import { Upload } from "lucide-react";
import { uploadLicenceAction, type LicenceState } from "@/app/trade/account/actions";
import { buttonClass } from "@/components/ui/button";
import { FieldRow, SelectInput, TextInput } from "@/components/shop/ui";
import { LICENCE_FILE_ACCEPT, TRADE_LICENCES, type TradeLicenceKind } from "@/lib/trade-licences";

/** `regNumber`: the account's company registration number — a company certificate is for it (typed when there's none yet). */
export function LicenceUploadForm({ kinds, initial, regNumber }: { kinds: TradeLicenceKind[]; initial: TradeLicenceKind; regNumber: string | null }) {
  const [state, action, pending] = useActionState<LicenceState, FormData>(uploadLicenceAction, {});
  const v = state.values ?? {};
  const [kind, setKind] = useState<TradeLicenceKind>((v.kind as TradeLicenceKind) || initial);
  const info = TRADE_LICENCES[kind];
  const err = (field: LicenceState["field"]) => (state.field === field ? state.error : undefined);
  return (
    <form action={action} className="space-y-4" data-testid="licence-upload" key={state.ok ? `done-${state.at}` : "form"}>
      {state.ok && (
        <p className="rounded-xl border border-leaf-500/35 bg-leaf-500/10 px-4 py-3 text-sm text-leaf-100" role="status">
          Thanks. The trade team checks it with the issuer, usually within a working day. We&apos;ll email you if anything is wrong.
        </p>
      )}
      {state.error && !state.field && (
        <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-50" role="alert">
          {state.error}
        </p>
      )}
      <FieldRow label="Licence" htmlFor="l-kind" error={err("kind")}>
        <SelectInput id="l-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as TradeLicenceKind)}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {TRADE_LICENCES[k].name}
            </option>
          ))}
        </SelectInput>
      </FieldRow>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {kind === "CIPC_REGISTRATION" && regNumber ? (
          <p className="text-sm text-ink-300 sm:col-span-2">
            The number is the account&apos;s company registration number, <span className="tnum">{regNumber}</span>.
          </p>
        ) : (
          <FieldRow label={info.numberLabel} htmlFor="l-number" error={err("number")} hint={kind === "CIPC_REGISTRATION" ? "The company's registration number, like 2015/123456/07. Add it to the business details once we've checked the certificate." : info.hint}>
            <TextInput id="l-number" name="number" maxLength={40} required defaultValue={v.number} aria-invalid={!!err("number")} className="tnum" />
          </FieldRow>
        )}
        {info.expires && (
          <FieldRow label="Expires on" htmlFor="l-expires" error={err("expiresAt")} hint={`As printed on the ${info.docLabel.charAt(0).toLowerCase()}${info.docLabel.slice(1)}.`}>
            <TextInput id="l-expires" name="expiresAt" type="date" required defaultValue={v.expiresAt} aria-invalid={!!err("expiresAt")} />
          </FieldRow>
        )}
      </div>
      <FieldRow label="The document" htmlFor="l-file" error={err("file")} hint={`Your ${info.docLabel}: a PDF, or a clear photo (JPG or PNG) of the whole document. Up to 5 MB.`}>
        <input
          id="l-file"
          name="file"
          type="file"
          accept={LICENCE_FILE_ACCEPT}
          required
          aria-invalid={!!err("file")}
          className="block w-full rounded-xl border border-ink-700 bg-ink-900 text-sm text-ink-200 file:mr-4 file:h-11 file:rounded-l-xl file:border-0 file:bg-ink-800 file:px-4 file:font-semibold file:text-white hover:file:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        />
      </FieldRow>
      <button disabled={pending} className={buttonClass("primary", "md")}>
        <Upload className="h-4 w-4" aria-hidden /> {pending ? "Uploading…" : "Upload for checking"}
      </button>
    </form>
  );
}
