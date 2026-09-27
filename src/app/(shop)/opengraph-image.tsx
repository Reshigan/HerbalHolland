import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/shop/mark-svg";

export const alt = "Herbal Holland — Dutch heritage. African soil.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Social card in the window-poster style: orange frame, Mark, wordmark and the line.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c0a09", padding: 28 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", border: "18px solid #f5913c", borderRadius: 44, padding: "0 72px", gap: 64 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markDataUri({ bg: null, size: 300, inset: 0 })} width={300} height={300} alt="" />
          <div style={{ display: "flex", flexDirection: "column", color: "#f5913c" }}>
            <div style={{ fontSize: 44, letterSpacing: 14, fontWeight: 300 }}>HERBAL</div>
            <div style={{ fontSize: 76, letterSpacing: 6, fontWeight: 800, marginTop: -8 }}>HOLLAND</div>
            <div style={{ marginTop: 36, fontSize: 40, color: "#fbf7f3", fontWeight: 600 }}>Dutch heritage. African soil.</div>
            <div style={{ marginTop: 14, fontSize: 24, color: "#bdb3a9" }}>Lab-tested · batch-traceable · adults 18+</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
