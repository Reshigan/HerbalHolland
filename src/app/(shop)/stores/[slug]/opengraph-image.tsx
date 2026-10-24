import { ImageResponse } from "next/og";
import { db } from "@/server/db";
import { markDataUri } from "@/components/shop/mark-svg";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";

export const alt = "Herbal Holland store";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Reads the store, so it renders per request rather than at build time (where there is no database).
export const dynamic = "force-dynamic";

// The card a shared store link shows: the window-poster frame with the store's name, where it is and whether it's open.
export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const s = await db.store.findFirst({
    where: { slug: (await params).slug, kind: "RETAIL", status: { in: ["ACTIVE", "OPENING_SOON"] } },
    select: { name: true, suburb: true, city: true, province: true, status: true },
  });
  const name = s?.name ?? "Herbal Holland";
  const place = s ? [s.suburb, s.city, PROVINCES[s.province as ProvinceCode]].filter((p, i, a) => p && p !== s.name && a.indexOf(p) === i).join(", ") : "Store finder";
  const open = s ? s.status === "ACTIVE" : true;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c0a09", padding: 28 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", border: "18px solid #f5913c", borderRadius: 44, padding: "0 72px", gap: 64 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markDataUri({ bg: null, size: 260, inset: 0 })} width={260} height={260} alt="" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", color: "#f5913c" }}>
            <div style={{ fontSize: 30, letterSpacing: 10, fontWeight: 700 }}>HERBAL HOLLAND</div>
            <div style={{ marginTop: 18, fontSize: name.length > 18 ? 56 : 72, lineHeight: 1.05, color: "#fbf7f3", fontWeight: 800 }}>{name}</div>
            <div style={{ marginTop: 16, fontSize: 34, color: "#bdb3a9" }}>{place}</div>
            <div style={{ marginTop: 30, display: "flex" }}>
              <div style={{ display: "flex", borderRadius: 999, padding: "8px 24px", fontSize: 26, fontWeight: 800, letterSpacing: 3, background: open ? "#f5913c" : "transparent", border: "3px solid #f5913c", color: open ? "#0c0a09" : "#f5913c" }}>
                {open ? "OPEN" : "OPENING SOON"}
              </div>
            </div>
            <div style={{ marginTop: 22, fontSize: 24, color: "#968a80" }}>CBD wellness · accessories · adults 18+</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
