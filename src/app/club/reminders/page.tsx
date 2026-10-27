import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, X } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { listReminders } from "@/server/shop/reminders";
import { cancelReminderForm } from "@/server/shop/feature-actions";
import { ProductArt } from "@/components/product/art";
import { Callout, Container } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { isHiddenCategory } from "@/lib/range";

export const metadata = { title: "Reorder reminders" };
const CHANNEL: Record<string, string> = { SMS: "SMS", EMAIL: "email", PUSH: "app notification" };

export default async function ClubReminders() {
  const customer = await getCustomer();
  if (!customer) redirect("/club/join?next=/club/reminders");
  const rows = await listReminders(customer.id);
  return (
    <Container className="pt-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Reorder reminders</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-400">
        For the things you use every day: coffee, collagen, oils. On the day, we send one message with a one-tap link that puts the item in your bag. Nothing is charged, and you can stop a reminder any time.
      </p>
      {rows.length ? (
        <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-4 rounded-2xl border border-ink-800 bg-ink-900/60 p-4">
              <Link href={isHiddenCategory(r.variant.product.category.slug) ? "/shop" : `/p/${r.variant.product.slug}?v=${r.variantId}`} className="shrink-0">
                <ProductArt slug={r.variant.product.slug} strain={r.variant.product.strain} regClass={r.variant.product.regClass} label={r.variant.product.name} className="h-20 w-20 rounded-xl" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={isHiddenCategory(r.variant.product.category.slug) ? "/shop" : `/p/${r.variant.product.slug}?v=${r.variantId}`} className="block truncate font-semibold text-white hover:text-brand-300">
                  {r.variant.product.name}
                </Link>
                <p className="text-sm text-ink-400">{r.variant.name}</p>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-200">
                  <BellRing className="h-4 w-4 text-brand-500" /> Every {r.everyDays} days by {CHANNEL[r.channel]} · next {fmtDate(r.nextAt)}
                </p>
                {r.lastSentAt && <p className="mt-0.5 text-xs text-ink-450">Last reminder {fmtDate(r.lastSentAt)}</p>}
              </div>
              <form action={cancelReminderForm} className="shrink-0">
                <input type="hidden" name="id" value={r.id} />
                <button className="grid h-11 w-11 place-items-center rounded-full text-ink-400 hover:bg-ink-850 hover:text-white" aria-label={`Stop the reminder for ${r.variant.product.name}`}>
                  <X className="h-4 w-4" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-ink-800 px-6 py-16 text-center">
          <BellRing className="mx-auto h-9 w-9 text-ink-600" />
          <h2 className="mt-4 font-display text-xl font-semibold text-white">No reminders yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-400">Choose &ldquo;Remind me to reorder&rdquo; on a product page, or on an order you&apos;d like to repeat.</p>
          <ButtonLink href="/shop?category=coffee-drinks" className="mt-6">
            Coffee &amp; drinks
          </ButtonLink>
        </div>
      )}
      <Callout tone="info" className="mt-8 max-w-2xl">
        Reminders are messages you asked for, not marketing: they go out on the channel you chose, whatever your marketing preferences. Your card is never charged, because there&apos;s no card on file.
      </Callout>
    </Container>
  );
}
