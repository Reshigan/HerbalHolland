import type { Metadata } from "next";
import { HQ_ROLES, requireStaff } from "@/server/auth";
import { accessibleStores } from "@/server/scope";
import { AdminShell } from "@/components/admin/shell";
import { hqNav } from "@/components/admin/nav-config";

// The back office installs as its own app (manifest at /staff): the same link on store and HQ pages.
export const metadata: Metadata = {
  manifest: "/staff/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HH Office", statusBarStyle: "black" },
};

export default async function HqLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff(HQ_ROLES);
  const stores = await accessibleStores(user);
  return (
    <AdminShell user={user} area="hq" nav={hqNav.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(user.role)) }))} stores={stores}>
      {children}
    </AdminShell>
  );
}
