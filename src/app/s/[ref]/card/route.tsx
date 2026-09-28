// Social preview for a shared Rewards card (1200×630), referenced from the /s/[ref] page's Open Graph tags.
// Metadata image files only receive route params, so the signed snapshot (query string) is read here instead.
import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/shop/mark-svg";
import { shareCard } from "../share-card";

const CHIP = ["#ddd5cc", "#2f9e4f", "#4a3aa7", "#f5913c"]; // Seed, Sprout, Bloom, Harvest (as on the member card)

export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const q = new URL(req.url).searchParams;
  const card = shareCard(ref, { n: q.get("n") ?? undefined, s: q.get("s") ?? undefined, t: q.get("t") ?? undefined, k: q.get("k") ?? undefined });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c0a09", padding: 28 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", border: "18px solid #f5913c", borderRadius: 44, padding: "0 64px", gap: 48 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", color: "#fbf7f3" }}>
            <div style={{ fontSize: 26, letterSpacing: 8, fontWeight: 700, color: "#f5913c" }}>HERBAL HOLLAND REWARDS</div>
            {card ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ marginTop: 26, fontSize: card.saved ? 92 : 80, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>{card.headline}</div>
                <div style={{ marginTop: 14, fontSize: 36, color: "#bdb3a9" }}>{card.saved ? "with Herbal Holland Rewards" : "of Herbal Holland Rewards"}</div>
                <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 18 }}>
                  <div style={{ display: "flex", borderRadius: 999, padding: "8px 22px", fontSize: 24, fontWeight: 800, letterSpacing: 3, background: CHIP[card.tierIndex], color: card.tierIndex === 2 ? "#ffffff" : "#0c0a09" }}>
                    {card.tierName.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 28, color: "#fbf7f3" }}>{`Join free with ${card.firstName}'s link`}</div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ marginTop: 26, fontSize: 92, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>Pay less.</div>
                <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2, color: "#f5913c" }}>Earn more.</div>
                <div style={{ marginTop: 26, fontSize: 32, color: "#bdb3a9" }}>Instant member prices in every store and online</div>
              </div>
            )}
            <div style={{ marginTop: 30, fontSize: 22, color: "#968a80" }}>Free to join · adults 18+</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markDataUri({ bg: null, size: 300, inset: 0 })} width={300} height={300} alt="" />
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
