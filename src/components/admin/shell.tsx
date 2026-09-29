import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/misc";
import { InstallPrompt } from "@/components/ui/install-prompt";
import { SideNav, StoreSwitcher, MobileNav } from "./nav";
import { AdminShortcuts, PaletteButton } from "./shortcuts";
import { NavProgress } from "./nav-progress";
import type { NavGroup } from "./nav-config";
import type { Staff } from "@/server/auth";

const ROLE: Record<string, string> = {
  HQ_ADMIN: "HQ administrator",
  HQ_STAFF: "HQ team",
  AREA_MANAGER: "Area manager",
  OWNER: "Owner",
  MANAGER: "Store manager",
  BUDTENDER: "Budtender",
};

export function AdminShell({
  user,
  area,
  nav,
  store,
  stores = [],
  children,
}: {
  user: Staff;
  area: "store" | "hq";
  nav: NavGroup[];
  store?: { code: string; name: string };
  stores?: { code: string; name: string }[];
  children: React.ReactNode;
}) {
  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href={area === "hq" ? "/hq" : `/store/${store?.code}`} className="mb-4 flex items-center justify-between px-2">
        <Logo />
        <span className="rounded-full border border-brand-500/40 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-brand-400">{area === "hq" ? "HQ" : "Store"}</span>
      </Link>
      <PaletteButton className="mb-5" />
      {store && (
        <div className="mb-5 space-y-2 px-1">
          <div className="px-2">
            <div className="eyebrow text-[0.6rem] text-ink-450">Store</div>
            <div className="font-display text-lg font-semibold leading-tight text-white">{store.name}</div>
          </div>
          <StoreSwitcher current={store.code} stores={stores} />
        </div>
      )}
      <div className="flex-1">
        <SideNav groups={nav} />
      </div>
      <div className="mt-6 flex items-center gap-3 rounded-2xl bg-ink-900 p-3">
        <Avatar name={user.name} className="bg-brand-500 text-ink-950" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{user.name}</div>
          <div className="truncate text-xs text-ink-400">{ROLE[user.role]}</div>
        </div>
        <Link href="/account/password" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-800 hover:text-white" aria-label="Change password" title="Change password">
          <KeyRound className="h-4 w-4" />
        </Link>
        <form action="/logout" method="post">
          <button className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-800 hover:text-white" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
      {/* Only where the browser can install the back office and it isn't installed yet. */}
      <InstallPrompt app="staff" variant="menu" className="mt-1" />
      {area === "store" && (user.role === "HQ_ADMIN" || user.role === "HQ_STAFF" || user.role === "AREA_MANAGER") && (
        <Link href="/hq" className="mt-2 rounded-xl px-3 py-2 text-center text-xs font-medium text-ink-400 hover:bg-ink-900 hover:text-white">
          ← Back to HQ console
        </Link>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-50 lg:grid lg:grid-cols-[17rem_1fr] lg:bg-[linear-gradient(to_right,var(--color-ink-950)_17rem,var(--color-ink-50)_17rem)]">
      <a href="#main" className="sr-only z-[70] rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <NavProgress />
      <AdminShortcuts groups={nav} area={area} storeCode={store?.code} userKey={user.id} />
      <aside className="sticky top-0 hidden h-screen overflow-y-auto bg-ink-950 p-4 lg:block" aria-label="Sidebar">
        {sidebar}
      </aside>
      <header className="sticky top-0 z-40 bg-ink-950 lg:hidden">
        <div className="flex items-center justify-between px-4 py-2">
          <MobileNav>{sidebar}</MobileNav>
          <Logo />
          <span className="w-10" />
        </div>
        <InstallPrompt app="staff" variant="bar" />
      </header>
      {/* --hh-sticky-top: where table headers stick — under the mobile header bar, at the top of the page on desktop. */}
      <main id="main" className="min-w-0 [--hh-sticky-top:3.5rem] lg:[--hh-sticky-top:0px]" tabIndex={-1}>
        <div className="mx-auto max-w-[88rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
