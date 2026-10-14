import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/shop/mark-svg";
import { foundingTaken, launchState } from "@/server/launch";
import { foundingPlaces } from "@/server/shop/launch-rules";
import { fmtDate } from "@/lib/format";
import { tierInfo } from "@/lib/loyalty-rules";

export const alt = "Join Herbal Holland Rewards";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The card a shared join link shows on WhatsApp, Facebook and Instagram: while the Founding Members list runs it
// carries the live count of cards left (or the First Year line once they're gone); otherwise the plain invitation.
export default async function OpenGraphImage() {
  const [launch, taken] = await Promise.all([launchState(), foundingTaken()]);
  const places = launch.preLaunch && launch.at ? foundingPlaces({ cap: launch.foundingCap, taken, firstYearMonths: launch.firstYearMonths, tierName: tierInfo(launch.foundingTier).name, closes: fmtDate(launch.at) }) : null;
  const headline = places ? (places.full ? "Become a First Year Member." : "Become a Founding Member.") : "Join Herbal Holland Rewards.";
  const line = places ? places.strip : "Free · points in every store and online";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c0a09", padding: 28 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", border: "18px solid #f5913c", borderRadius: 44, padding: "0 72px", gap: 64 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markDataUri({ bg: null, size: 260, inset: 0 })} width={260} height={260} alt="" />
          <div style={{ display: "flex", flexDirection: "column", color: "#f5913c" }}>
            <div style={{ fontSize: 30, letterSpacing: 10, fontWeight: 700 }}>HERBAL HOLLAND REWARDS</div>
            <div style={{ marginTop: 22, fontSize: 64, lineHeight: 1.05, color: "#fbf7f3", fontWeight: 800 }}>{headline}</div>
            <div style={{ marginTop: 22, fontSize: 34, color: "#f5913c", fontWeight: 700 }}>{line}</div>
            <div style={{ marginTop: 14, fontSize: 24, color: "#bdb3a9" }}>{places && launch.at ? `Closes ${fmtDate(launch.at)} · join free in 20 seconds · adults 18+` : "Join free in 20 seconds · adults 18+"}</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
