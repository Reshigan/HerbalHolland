import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/shop/mark-svg";
import { BRAND } from "@/components/site/content";

export const alt = BRAND.og.alt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// herbalholland.com share card, in the shop card's window-poster style: orange frame, Mark, lock-up and the line — with
// the corporate site's sections instead of the shop's promise.
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
            <div style={{ marginTop: 36, fontSize: 40, color: "#fbf7f3", fontWeight: 600 }}>{BRAND.line}</div>
            <div style={{ marginTop: 14, fontSize: 24, color: "#bdb3a9" }}>{BRAND.og.sub}</div>
            <div style={{ marginTop: 22, display: "flex" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 20, color: "#bdb3a9" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 22, border: "3px solid #f5913c", color: "#f5913c", fontSize: 15, fontWeight: 800 }}>18+</div>
                {BRAND.og.age}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
