// Pair this device as a till: a manager, owner or HQ user signs in (or is already signed
// in to the back office); DEMO_MODE adds a one-click store list.
import { getDevice, getStaff } from "@/server/auth";
import { demoStores, pairableStores } from "@/server/pos/session";
import { PairScreen } from "@/components/pos/pair-screen";

export const metadata = { title: "Pair this till" };

export default async function PairPage() {
  const [device, staff] = await Promise.all([getDevice(), getStaff()]);
  const demo = process.env.DEMO_MODE === "true";
  const [mine, demoList] = await Promise.all([staff ? pairableStores(staff) : Promise.resolve([]), demo ? demoStores() : Promise.resolve([])]);
  return (
    <PairScreen
      paired={device ? { name: device.name, prefix: device.prefix, store: { code: device.store.code, name: device.store.name } } : null}
      staff={staff && mine.length ? { name: staff.name, stores: mine } : null}
      demoStores={demoList}
    />
  );
}
