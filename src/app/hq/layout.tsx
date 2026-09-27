import { HQ_ROLES, requireStaff } from "@/server/auth";
import { accessibleStores } from "@/server/scope";
import { AdminShell } from "@/components/admin/shell";
import { hqNav } from "@/components/admin/nav-config";

export default async function HqLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff(HQ_ROLES);
  const stores = await accessibleStores(user);
  return (
    <AdminShell user={user} area="hq" nav={hqNav} stores={stores}>
      {children}
    </AdminShell>
  );
}
