// Customer-facing display: a second screen (or a second window on the till) that mirrors the current sale.
// Same device: fed by the till over a BroadcastChannel: no cookies, no server. Separate screen: opened from the
// link under Shift → This till → Customer display (?d=<device>&k=<pairing key>) and polls /api/pos/display.
import type { Metadata } from "next";
import { DisplayScreen } from "@/components/pos/display-screen";

export const metadata: Metadata = { title: "Customer display", robots: { index: false, follow: false } };

export default async function DisplayPage({ searchParams }: { searchParams: Promise<{ d?: string; k?: string }> }) {
  const sp = await searchParams;
  const d = typeof sp.d === "string" && /^[a-z0-9]{10,40}$/i.test(sp.d) ? sp.d : null;
  const k = typeof sp.k === "string" && /^[a-z0-9]{12,32}$/.test(sp.k) ? sp.k : null;
  return <DisplayScreen deviceId={d && k ? d : null} feedKey={d && k ? k : null} />;
}
