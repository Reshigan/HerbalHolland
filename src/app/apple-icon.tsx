import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/shop/mark-svg";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon: the orange Mark on warm black (iOS applies its own corner mask).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0c0a09" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markDataUri({ bg: null, size: 150, inset: 0.1 })} width={150} height={150} alt="" />
      </div>
    ),
    size,
  );
}
