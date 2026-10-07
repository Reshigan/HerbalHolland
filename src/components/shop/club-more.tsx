// The Rewards features that don't fit the six tabs: wishlist, reorder reminders, gift vouchers and saved addresses.
import Link from "next/link";
import { BellRing, Gift, Heart, MapPin } from "lucide-react";
import { db } from "@/server/db";
import { wishlistCount } from "@/server/shop/wishlist";
import { cn } from "@/lib/cn";

export async function ClubMore({ customerId, className }: { customerId: string; className?: string }) {
  const [wishes, restocked, reminders, vouchers, addresses] = await Promise.all([
    wishlistCount(customerId),
    db.wishlist.count({ where: { customerId, restockedAt: { gte: new Date(Date.now() - 14 * 86_400_000) } } }),
    db.reorderReminder.count({ where: { customerId, active: true } }),
    db.giftVoucher.count({ where: { purchasedByCustomerId: customerId, status: "ACTIVE" } }),
    db.address.count({ where: { customerId } }),
  ]);
  const items = [
    { href: "/club/wishlist", icon: Heart, label: "Wishlist", count: wishes, flag: restocked ? `${restocked} back in stock` : null },
    { href: "/club/reminders", icon: BellRing, label: "Reorder reminders", count: reminders, flag: null },
    { href: "/club/vouchers", icon: Gift, label: "Gift vouchers", count: vouchers, flag: null },
    { href: "/club/addresses", icon: MapPin, label: "Addresses", count: addresses, flag: null },
  ];
  return (
    <nav aria-label="More in Rewards" className={cn("scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0", className)}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-ink-800 bg-ink-900/60 px-4 text-sm font-medium text-ink-100 transition hover:border-brand-500/60 hover:text-white">
          <i.icon className="h-4 w-4 text-brand-500" strokeWidth={1.9} />
          {i.label}
          {i.count > 0 && <span className="tnum rounded-full bg-ink-800 px-1.5 text-xs text-ink-300">{i.count}</span>}
          {i.flag && <span className="rounded-full bg-leaf-500/15 px-2 text-[0.68rem] font-semibold text-leaf-100">{i.flag}</span>}
        </Link>
      ))}
    </nav>
  );
}
