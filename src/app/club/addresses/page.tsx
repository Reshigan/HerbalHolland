import { redirect } from "next/navigation";
import { MapPin, Star, Trash2 } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { ADDRESS_MAX, listAddresses } from "@/server/shop/addresses";
import { defaultAddressForm, deleteAddressForm } from "./actions";
import { AddressForm } from "@/components/shop/address-form";
import { Container, Panel, Tag } from "@/components/shop/ui";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";

export const metadata = { title: "Addresses" };

export default async function ClubAddresses() {
  const customer = await getCustomer();
  if (!customer) redirect("/club/join?next=/club/addresses");
  const rows = await listAddresses(customer.id);
  const provinces = Object.entries(PROVINCES) as [string, string][];
  return (
    <Container className="pt-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Your addresses</h1>
      <p className="mt-1 text-sm text-ink-400">
        Up to {ADDRESS_MAX} delivery addresses, offered at checkout. The one you order to is saved automatically.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {rows.length ? (
            rows.map((a) => (
              <Panel key={a.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{a.label}</span>
                        {a.isDefault && <Tag tone="orange">Default</Tag>}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-ink-300">
                        {a.line}
                        <br />
                        {a.suburb}, {a.city}
                        <br />
                        {PROVINCES[a.province as ProvinceCode]} {a.postalCode}
                      </p>
                      {a.notes && <p className="mt-1 text-xs text-ink-450">{a.notes}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!a.isDefault && (
                      <form action={defaultAddressForm}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="grid h-11 w-11 place-items-center rounded-full text-ink-400 hover:bg-ink-850 hover:text-white" aria-label={`Make ${a.label} the default address`} title="Make default">
                          <Star className="h-4 w-4" />
                        </button>
                      </form>
                    )}
                    <form action={deleteAddressForm}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="grid h-11 w-11 place-items-center rounded-full text-ink-400 hover:bg-ink-850 hover:text-white" aria-label={`Remove ${a.label} address`} title="Remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-brand-400 hover:underline">Edit</summary>
                  <div className="mt-3">
                    <AddressForm compact provinces={provinces} initial={{ id: a.id, label: a.label, line: a.line, suburb: a.suburb, city: a.city, province: a.province, postalCode: a.postalCode, notes: a.notes ?? "", isDefault: a.isDefault }} />
                  </div>
                </details>
              </Panel>
            ))
          ) : (
            <Panel className="border-dashed p-8 text-center text-sm text-ink-400">No saved addresses yet. Add one here, or place a delivery order and we&apos;ll keep the address.</Panel>
          )}
        </div>
        {rows.length < ADDRESS_MAX && (
          <Panel className="h-fit p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold text-white">Add an address</h2>
            <div className="mt-4">
              <AddressForm provinces={provinces} />
            </div>
          </Panel>
        )}
      </div>
    </Container>
  );
}
