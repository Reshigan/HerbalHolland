import type { Metadata } from "next";
import Link from "next/link";
import { homeFor, isHq, requireStaff } from "@/server/auth";
import { buttonClass } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { accessibleStores } from "@/server/scope";
import { AdminShell } from "@/components/admin/shell";
import { hqNav } from "@/components/admin/nav-config";

// The back office installs as its own app (manifest at /staff): the same link on store and HQ pages.
export const metadata: Metadata = {
  manifest: "/staff/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HH Office", statusBarStyle: "black" },
  robots: { index: false, follow: false },
};

export default async function HqLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  // Signed-in store staff who follow an HQ link: say so plainly and send them home (signing in again wouldn't help).
  if (!isHq(user)) {
    const home = await homeFor(user);
    return (
      <main className="grid min-h-dvh place-items-center bg-ink-950 px-6 py-16 text-center">
        <div className="max-w-md">
          <Logo />
          <h1 className="mt-10 font-display text-3xl font-semibold text-white">This page is for the HQ team</h1>
          <p className="mt-3 text-ink-300">The HQ console sits outside what you look after. Everything for your store is a tap away.</p>
          <Link href={home} className={buttonClass("primary", "lg", "mt-8")}>
            Back to my store
          </Link>
        </div>
      </main>
    );
  }
  const stores = await accessibleStores(user);
  return (
    <AdminShell user={user} area="hq" nav={hqNav.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(user.role)) }))} stores={stores}>
      {children}
    </AdminShell>
  );
}
