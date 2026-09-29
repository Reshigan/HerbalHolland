"use client";
import { useState } from "react";
import { Building2, MapPin, Percent, Boxes } from "lucide-react";
import { Field, Input } from "@/components/ui/form";
import { Select } from "@/components/hq/select";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import { PROVINCES } from "@/lib/sa";
import { cn } from "@/lib/cn";
import { createStore } from "../actions";

type Opt = { id: string; name: string; hint?: string };

export function NewStoreForm({ companies, regions, dcs, templates }: { companies: Opt[]; regions: Opt[]; dcs: Opt[]; templates: Opt[] }) {
  const [mode, setMode] = useState<"existing" | "new">(companies.length ? "existing" : "new");
  const heading = (icon: React.ReactNode, title: string, description: string) => (
    <CardHeader
      title={
        <span className="inline-flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-700">{icon}</span>
          {title}
        </span>
      }
      description={description}
    />
  );
  return (
    <ActionForm action={createStore} className="grid grid-cols-1 gap-6 xl:grid-cols-3" noticeClassName="xl:col-span-3">
      <div className="space-y-6 xl:col-span-2">
        <Card>
          {heading(<MapPin className="h-4 w-4" />, "Store", "Identity, territory and trading address")}
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Store code" htmlFor="code" hint="Three letters + number, e.g. PTA06 — used on receipts and reports">
              <Input id="code" name="code" required maxLength={6} className="font-mono uppercase" placeholder="PTA06" />
              <FieldError name="code" />
            </Field>
            <Field label="Store name" htmlFor="name" hint="Usually the suburb, e.g. Lynnwood">
              <Input id="name" name="name" required />
              <FieldError name="name" />
            </Field>
            <Field label="Region" htmlFor="regionId">
              <Select id="regionId" name="regionId" required defaultValue="">
                <option value="" disabled>Choose a region</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
              <FieldError name="regionId" />
            </Field>
            <Field label="Serving distribution centre" htmlFor="dcId">
              <Select id="dcId" name="dcId" defaultValue="">
                <option value="">None yet</option>
                {dcs.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
              <FieldError name="dcId" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Format" htmlFor="format">
                <Select id="format" name="format" defaultValue="STANDARD">
                  <option value="FLAGSHIP">Flagship</option>
                  <option value="STANDARD">Standard</option>
                  <option value="EXPRESS">Express</option>
                </Select>
              </Field>
              <Field label="Status" htmlFor="status">
                <Select id="status" name="status" defaultValue="OPENING_SOON">
                  <option value="OPENING_SOON">Opening soon</option>
                  <option value="ACTIVE">Active</option>
                </Select>
              </Field>
            </div>
            <Field label="Opening date" htmlFor="openedAt" hint="Optional">
              <Input id="openedAt" name="openedAt" type="date" />
            </Field>
            <Field label="Street address" htmlFor="addressLine" className="sm:col-span-2">
              <Input id="addressLine" name="addressLine" required placeholder="Shop 12, Lynnwood Bridge, 4 Daventry Rd" />
              <FieldError name="addressLine" />
            </Field>
            <Field label="Suburb" htmlFor="suburb">
              <Input id="suburb" name="suburb" required />
              <FieldError name="suburb" />
            </Field>
            <Field label="City" htmlFor="city">
              <Input id="city" name="city" required />
              <FieldError name="city" />
            </Field>
            <Field label="Province" htmlFor="province">
              <Select id="province" name="province" defaultValue="GP">
                {Object.entries(PROVINCES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
              <FieldError name="province" />
            </Field>
            <Field label="Postal code" htmlFor="postalCode">
              <Input id="postalCode" name="postalCode" inputMode="numeric" maxLength={4} required />
              <FieldError name="postalCode" />
            </Field>
            <Field label="Store phone" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" />
            </Field>
            <Field label="Store email" htmlFor="email">
              <Input id="email" name="email" type="email" placeholder="lynnwood@herbalholland.co.za" />
              <FieldError name="email" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          {heading(<Building2 className="h-4 w-4" />, "Owner", "Each store is owned by a franchisee company — the merchant of record")}
          <CardBody>
            <input type="hidden" name="companyMode" value={mode} />
            <div className="mb-4 inline-flex rounded-full border border-ink-150 bg-ink-50 p-1" role="radiogroup" aria-label="Owner">
              {(["existing", "new"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn("rounded-full px-4 py-1.5 text-sm font-semibold transition", mode === m ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-900")}
                >
                  {m === "existing" ? "Existing franchisee" : "New franchisee"}
                </button>
              ))}
            </div>
            {mode === "existing" ? (
              <Field label="Company" htmlFor="companyId">
                <Select id="companyId" name="companyId" defaultValue="">
                  <option value="" disabled>Choose the owning company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.hint ? ` — ${c.hint}` : ""}
                    </option>
                  ))}
                </Select>
                <FieldError name="companyId" />
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Registered name" htmlFor="coLegalName">
                  <Input id="coLegalName" name="coLegalName" placeholder="Lynnwood Leaf (Pty) Ltd" />
                  <FieldError name="coLegalName" />
                </Field>
                <Field label="Trading name" htmlFor="coName" hint="Defaults to the registered name">
                  <Input id="coName" name="coName" />
                </Field>
                <Field label="Company reg. number" htmlFor="coRegNumber">
                  <Input id="coRegNumber" name="coRegNumber" placeholder="2026/123456/07" />
                </Field>
                <Field label="VAT number" htmlFor="coVatNumber" hint="Leave blank if not VAT registered (under R2.3m)">
                  <Input id="coVatNumber" name="coVatNumber" inputMode="numeric" />
                  <FieldError name="coVatNumber" />
                </Field>
                <Field label="Contact person" htmlFor="coContactName">
                  <Input id="coContactName" name="coContactName" />
                </Field>
                <Field label="Email for statements & invoices" htmlFor="coEmail">
                  <Input id="coEmail" name="coEmail" type="email" />
                  <FieldError name="coEmail" />
                </Field>
                <Field label="Phone" htmlFor="coPhone">
                  <Input id="coPhone" name="coPhone" type="tel" />
                </Field>
                <Field label="Registered address" htmlFor="coAddress">
                  <Input id="coAddress" name="coAddress" />
                </Field>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          {heading(<Percent className="h-4 w-4" />, "Franchise fees", "Percent of net sales ex VAT")}
          <CardBody className="grid grid-cols-3 gap-3">
            {(
              [
                ["royalty", "Royalty", "6"],
                ["levy", "Levy", "2"],
                ["ecom", "E-com", "10"],
              ] as const
            ).map(([n, label, v]) => (
              <Field key={n} label={label} htmlFor={n}>
                <div className="relative">
                  <Input id={n} name={n} defaultValue={v} inputMode="decimal" className="tnum pr-7" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-500">%</span>
                </div>
                <FieldError name={n} />
              </Field>
            ))}
          </CardBody>
        </Card>
        <Card>
          {heading(<Boxes className="h-4 w-4" />, "Ranging", "Start from a similar store's range")}
          <CardBody className="space-y-3">
            <Field label="Copy range from" htmlFor="templateId" hint="Copies which products are ranged plus reorder points and par levels. Shelf prices are never copied — each franchisee sets its own.">
              <Select id="templateId" name="templateId" defaultValue={templates[0]?.id ?? ""}>
                <option value="">Don&apos;t copy — range later</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.hint ? ` · ${t.hint}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="rounded-xl bg-ink-50 p-3 text-xs text-ink-600">New stores start without licences. Licensed products stay blocked until HQ records the store&apos;s licence under Compliance.</p>
          </CardBody>
        </Card>
        <div className="flex justify-end gap-2">
          <SubmitButton size="lg" pendingLabel="Creating store…">Create store</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
