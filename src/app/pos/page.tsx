// The till. Unpaired devices go to /pos/pair; everything else is a client app over
// /api/pos/* that keeps working offline (see public/sw.js and components/pos).
import { redirect } from "next/navigation";
import { getDevice } from "@/server/auth";
import { PosApp } from "@/components/pos/pos-app";

export default async function PosPage() {
  const device = await getDevice();
  if (!device) redirect("/pos/pair");
  return <PosApp deviceId={device.id} />;
}
