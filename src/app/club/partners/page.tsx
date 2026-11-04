import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { partnerOffers } from "@/server/partners";
import { shareWithPartner, stopSharing } from "../actions";
import { Container, Panel } from "@/components/shop/ui";
import { buttonClass } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Partner brands" };

export default async function ClubPartners() {
  const customer = await getCustomer();
  if (!customer) redirect("/club/join?next=/club/partners");
  const [offers, links] = await Promise.all([partnerOffers(), db.partnerLink.findMany({ where: { customerId: customer.id }, include: { partner: { select: { name: true } } }, orderBy: { createdAt: "asc" } })]);
  const arrivals = links.filter((l) => l.direction === "IN");
  const shared = new Map(links.filter((l) => l.direction === "OUT" && !l.revokedAt).map((l) => [l.partnerId, l]));

  return (
    <Container className="pt-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Partner brands</h1>
      <p className="mt-2 max-w-xl text-ink-400">Join a partner&apos;s programme without filling everything in again. Nothing is shared until you choose to.</p>

      <div className="mt-6 max-w-xl space-y-4">
        {arrivals.map((l) => (
          <Panel key={l.id} className="p-5 text-sm text-ink-300 sm:p-6">
            You joined through {l.partner.name} on {fmtDate(l.createdAt)}.
          </Panel>
        ))}

        {offers.map((o) => {
          const link = shared.get(o.id);
          return (
            <Panel key={o.id} className="p-5 sm:p-6">
              <h2 className="font-display text-lg font-semibold text-white">{o.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">{o.wording}</p>
              {link && <p className="mt-2 text-sm text-ink-300">You agreed on {fmtDate(link.createdAt)}.</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={shareWithPartner.bind(null, o.id)}>
                  <button type="submit" className={buttonClass("primary", "md")}>
                    Continue to {o.name}
                  </button>
                </form>
                {link && (
                  <form action={stopSharing.bind(null, o.id)}>
                    <button type="submit" className={buttonClass("outline-dark", "md")}>
                      Stop sharing
                    </button>
                  </form>
                )}
              </div>
              {link && <p className="mt-3 text-xs text-ink-400">Stopping ends sharing from now on. {o.name} keeps what you already shared, so ask them directly to delete it.</p>}
            </Panel>
          );
        })}

        {!offers.length && !arrivals.length && <Panel className="p-5 text-sm text-ink-400 sm:p-6">No partner brands yet.</Panel>}
      </div>
    </Container>
  );
}
