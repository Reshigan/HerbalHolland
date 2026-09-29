import Link from "next/link";
import { Clock, MessageCircleQuestion, PackageOpen, Undo2 } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { getFranchisor } from "@/server/shop/context";
import { supportEmail } from "@/server/support";
import { TicketForm } from "@/components/support/ticket-form";
import { Container, Panel } from "@/components/shop/ui";
import { isSupportCategory, orderCodeOf } from "@/lib/support";

export const metadata = { title: "Ask for help" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ order?: string; category?: string }> }) {
  const [sp, customer, company] = await Promise.all([searchParams, getCustomer(), getFranchisor()]);
  const email = company?.email ?? supportEmail();
  const prefill = {
    name: customer ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") : "",
    email: customer?.email ?? "",
    phone: "",
    orderCode: orderCodeOf(sp.order ?? "") ?? "",
    category: isSupportCategory((sp.category ?? "").toUpperCase()) ? (sp.category ?? "").toUpperCase() : sp.order ? "ORDER" : "",
    subject: "",
    body: "",
  };
  return (
    <Container className="max-w-5xl pt-10 sm:pt-14">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <div className="eyebrow text-brand-500">Support</div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">How can we help?</h1>
          <p className="mt-3 max-w-xl text-lg text-ink-300">
            {customer ? `Hi ${customer.firstName} — tell us what's up and we'll reply within one business day.` : "Tell us what's up and we'll reply by email within one business day. You don't need to be a member to ask."}
          </p>
          <Panel className="mt-8 p-5 sm:p-7">
            <TicketForm member={customer ? { firstName: customer.firstName, hasEmail: !!customer.email } : null} prefill={prefill} />
          </Panel>
        </div>
        <aside className="space-y-4 lg:pt-24">
          <Panel className="p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
              <Clock className="h-4 w-4 text-brand-500" aria-hidden /> When we reply
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">A first reply within one business day (Monday to Friday, South African time) and most requests sorted within five.</p>
          </Panel>
          <Panel className="p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
              <Undo2 className="h-4 w-4 text-brand-500" aria-hidden /> Sending something back?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">
              Start a return from the order itself: Rewards → Orders → the order → “Return or report a problem”. Faulty items within 6 months, a change of mind within 7 days of delivery.{" "}
              <Link href="/legal/returns" className="font-semibold text-brand-300 underline">
                Returns policy
              </Link>
            </p>
          </Panel>
          <Panel className="p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
              <PackageOpen className="h-4 w-4 text-brand-500" aria-hidden /> Where&apos;s my order?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">
              Every step is under{" "}
              <Link href="/club/orders" className="font-semibold text-brand-300 underline">
                Rewards → Orders
              </Link>
              , with the courier&apos;s tracking number once it&apos;s on its way.
            </p>
          </Panel>
          <Panel className="p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
              <MessageCircleQuestion className="h-4 w-4 text-brand-500" aria-hidden /> Rather email?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">
              <a href={`mailto:${email}`} className="font-semibold text-brand-300 underline">
                {email}
              </a>{" "}
              reaches the same team.
            </p>
          </Panel>
        </aside>
      </div>
    </Container>
  );
}
