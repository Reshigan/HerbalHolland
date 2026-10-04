import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth";
import { accessibleStores, shellStoreFor } from "@/server/scope";
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
  // A store outside the person's scope (or no such store) keeps their own shell around it: the page's storeForUser then
  // answers 404 with ./not-found.tsx inside it. Every page loads its store through storeForUser, so nothing leaks.
  const [store, stores] = await Promise.all([shellStoreFor(user, code), accessibleStores(user)]);
  if (!store) notFound();
  return (
    <AdminShell user={user} area="store" nav={storeNav(store.code, store.slug)} store={{ code: store.code, name: store.name }} stores={stores}>
      {children}
    </AdminShell>
  );
}
