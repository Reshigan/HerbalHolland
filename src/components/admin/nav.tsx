"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeftRight, BadgePercent, Banknote, Bell, Boxes, CalendarDays, ChartColumn, Circle, ClipboardCheck, Crown, FlaskConical, History, Landmark,
  HandCoins, Handshake, LayoutDashboard, LifeBuoy, Megaphone, Menu, MessageSquare, Nfc, Package, PiggyBank, Receipt, Rocket, Scale, Settings, ShieldAlert, ShieldCheck, ShoppingBag, Sparkles,
  Star, Stethoscope, Store, Tag, Tags,
  Truck, Tv, Undo2, Users, UsersRound, Wallet, Warehouse, X, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { NavGroup } from "./nav-config";

// Explicit map (not `import *`) so the client bundle carries only the icons the nav uses.
const ICONS: Record<string, LucideIcon> = {
  ArrowLeftRight, BadgePercent, Banknote, Bell, Boxes, CalendarDays, ChartColumn, ClipboardCheck, Crown, FlaskConical, History, Landmark,
  HandCoins, Handshake, LayoutDashboard, LifeBuoy, Megaphone, MessageSquare, Nfc, Package, PiggyBank, Receipt, Rocket, Scale, Settings, ShieldAlert, ShieldCheck, ShoppingBag, Sparkles,
  Star, Stethoscope, Store, Tag, Tags,
  Truck, Tv, Undo2, Users, UsersRound, Wallet, Warehouse,
};

function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Circle;
  return <C className={className} strokeWidth={1.9} />;
}

export function SideNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  return (
    <nav className="space-y-5" aria-label="Sections">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && <div className="eyebrow mb-1.5 px-3 text-[0.62rem] text-ink-450">{g.title}</div>}
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const active = i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    {...(i.external && { target: "_blank", rel: "noopener" })}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2 text-[0.84rem] font-medium transition-colors",
                      active ? "bg-brand-500 text-ink-950" : "text-ink-300 hover:bg-ink-850 hover:text-white",
                    )}
                  >
                    <Icon name={i.icon} className={cn("h-[18px] w-[18px]", active ? "text-ink-950" : "text-ink-400 group-hover:text-brand-400")} />
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Jumps between stores while keeping the current section (e.g. /store/PTA01/inventory → /store/PTA02/inventory). */
export function StoreSwitcher({ current, stores }: { current: string; stores: { code: string; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  if (stores.length < 2) return null;
  return (
    <select
      aria-label="Switch store"
      value={current}
      onChange={(e) => router.push(path.replace(`/store/${current}`, `/store/${e.target.value}`))}
      className="h-9 w-full cursor-pointer rounded-xl border border-ink-700 bg-ink-900 px-3 text-sm font-medium text-ink-100 focus:border-brand-500 focus:outline-none"
    >
      {stores.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name} · {s.code}
        </option>
      ))}
    </select>
  );
}

/** Mobile drawer toggle for the sidebar. */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl text-ink-200 hover:bg-ink-800 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-ink-950 p-4 shadow-lift">
            <button onClick={() => setOpen(false)} className="mb-3 ml-auto grid h-9 w-9 place-items-center rounded-xl text-ink-300 hover:bg-ink-800" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
