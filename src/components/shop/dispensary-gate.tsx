// What everyone without dispensary access sees instead of licensed products: how the
// SAHPRA patient pathway works, and how to get help in store. No products, no prices.
import Link from "next/link";
import { FileCheck2, IdCard, LogIn, Pill, ShieldCheck, Stethoscope, Store } from "lucide-react";
import type { DispensaryAccess } from "@/server/shop/access";
import { ButtonLink } from "@/components/ui/button";
import { Callout, Container, Panel } from "./ui";

const STEPS = [
  { icon: <Stethoscope className="h-5 w-5" />, title: "Talk to your doctor", body: "A registered medical practitioner decides whether a cannabis medicine is appropriate for you." },
  { icon: <FileCheck2 className="h-5 w-5" />, title: "Your doctor applies to SAHPRA", body: "Under Section 21 of the Medicines Act, your doctor applies for an authorisation naming you, the product and the quantity." },
  { icon: <IdCard className="h-5 w-5" />, title: "Register it with us, once", body: "Bring the authorisation and your ID to any store. Our authorised dispenser verifies it and links it to your Rewards profile." },
  { icon: <Pill className="h-5 w-5" />, title: "Order and collect", body: "Sign in to see the dispensary, order within your monthly authorised quantity, and collect in store after an ID check." },
];

export function DispensaryGate({ access, next = "/dispensary" }: { access: Extract<DispensaryAccess, { allowed: false }>; next?: string }) {
  const medical = access.mode === "MEDICAL";
  return (
    <Container className="pt-10 sm:pt-14">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
        <div>
          <div className="eyebrow text-oranje-500">Dispensary</div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">{medical ? "For registered patients" : "For verified adults"}</h1>
          <p className="mt-4 max-w-xl text-[1.02rem] leading-relaxed text-ink-300">
            {medical
              ? "Licensed cannabis products are medicines in South Africa. We supply them only to patients with a valid SAHPRA authorisation, handed over in store by an authorised dispenser — so we don't list them publicly, and they never carry promotions or points."
              : "Licensed products are available to signed-in adults whose age we've verified. Sign in and add your SA ID number to continue."}
          </p>
          <div className="mt-8">
            {access.reason === "SIGN_IN" && (
              <Callout tone="brand" icon={<LogIn className="h-5 w-5" />} title={medical ? "Registered patient? Sign in to view the dispensary." : "Sign in to continue."}>
                <div className="mt-3 flex flex-wrap gap-3">
                  <ButtonLink href={`/club/join?next=${encodeURIComponent(next)}`} size="md">
                    Sign in with your mobile number
                  </ButtonLink>
                </div>
              </Callout>
            )}
            {access.reason === "NO_AUTHORISATION" && (
              <Callout tone="warn" icon={<ShieldCheck className="h-5 w-5" />} title="We don't have an active authorisation on file for you">
                If your doctor has obtained a Section 21 authorisation for you, bring it and your ID to any store and our dispenser will register it. If it has expired, ask your doctor about renewing it.
              </Callout>
            )}
            {access.reason === "VERIFY_AGE" && (
              <Callout tone="warn" icon={<IdCard className="h-5 w-5" />} title="Verify your age first">
                Add your SA ID number in <Link href="/club/settings" className="font-semibold text-white underline">your Rewards settings</Link>, or show your ID or passport in any store.
              </Callout>
            )}
          </div>
          {medical && (
            <ol className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-oranje-500/10 text-oranje-400">{s.icon}</span>
                    <span className="tnum font-display text-sm font-semibold text-ink-500">Step {i + 1}</span>
                  </div>
                  <h2 className="mt-4 font-display text-lg font-semibold text-white">{s.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{s.body}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
        <aside className="space-y-4 lg:pt-10">
          <Panel className="p-6">
            <Store className="h-7 w-7 text-oranje-500" strokeWidth={1.6} />
            <h2 className="mt-4 font-display text-xl font-semibold text-white">Ask our pharmacist in store</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-400">
              Every store has an authorised dispenser on the team. They can explain the process, check your paperwork and answer questions in private.
            </p>
            <ButtonLink href="/stores" variant="outline-dark" className="mt-5">
              Find a store
            </ButtonLink>
          </Panel>
          <Panel className="p-6">
            <h2 className="font-display text-lg font-semibold text-white">Good to know</h2>
            <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-400">
              <li>• We never store your diagnosis — only the authorisation number, prescriber, scope, validity and monthly quantity.</li>
              <li>• Medicines are collect-only and handed over after an ID check.</li>
              <li>• Nothing here is medical advice. Please speak to your doctor.</li>
            </ul>
            <Link href="/learn/section-21" className="mt-4 inline-block text-sm font-semibold text-oranje-400 hover:underline">
              Read: Registered patients &amp; Section 21 →
            </Link>
          </Panel>
        </aside>
      </div>
    </Container>
  );
}
