// Status-bar badge for Rewards push notifications: the Mark in white on transparent (Android uses only the alpha).
import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/shop/mark-svg";

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markDataUri({ fg: "#ffffff", bg: null, size: 96, inset: 0.04 })} width={96} height={96} alt="" />
      </div>
    ),
    { width: 96, height: 96, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
