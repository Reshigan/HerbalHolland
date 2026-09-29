import type { Metadata } from "next";
import { requireStaff } from "@/server/auth";
import { accessibleStores, storeForUser } from "@/server/scope";
import { AdminShell } from "@/components/admin/shell";
import { storeNav } from "@/components/admin/nav-config";

// The back office installs as its own app (manifest at /staff): the same link on store and HQ pages.
export const metadata: Metadata = {
  manifest: "/staff/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HH Office", statusBarStyle: "black" },
};

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requireStaff();
  const [store, stores] = await Promise.all([storeForUser(user, code), accessibleStores(user)]);
  return (
    <AdminShell user={user} area="store" nav={storeNav(store.code, store.slug)} store={{ code: store.code, name: store.name }} stores={stores}>
      {children}
    </AdminShell>
  );
}
