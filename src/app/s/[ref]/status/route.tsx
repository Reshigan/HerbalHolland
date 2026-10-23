// WhatsApp Status card (1080×1920) carrying the member's join link as a QR. Only the referral code goes in;
// nothing about the member is looked up, so any code just draws its own invite.
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { markDataUri } from "@/components/shop/mark-svg";
import { APP_URL } from "@/server/invoices";

export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!/^[A-Za-z0-9-]{3,32}$/.test(ref)) return new Response("Not found", { status: 404 });
  const founding = new URL(req.url).searchParams.get("v") === "founding";
  const link = `${APP_URL()}/club/join?ref=${ref}`;
  const qr = await QRCode.toString(link, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#0c0a09", light: "#ffffff" } });
  const line = { fontSize: 120, fontWeight: 800, lineHeight: 1, letterSpacing: -4 } as const;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c0a09", padding: 40 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", border: "22px solid #f5913c", borderRadius: 64, padding: "110px 70px 90px", color: "#fbf7f3" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markDataUri({ bg: null, size: 220, inset: 0 })} width={220} height={220} alt="" />
          <div style={{ marginTop: 50, fontSize: 34, letterSpacing: 10, fontWeight: 700, color: "#f5913c" }}>HERBAL HOLLAND REWARDS</div>
          <div style={{ marginTop: 70, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={line}>{founding ? "Founding" : "Pay less."}</div>
            <div style={{ ...line, color: "#f5913c" }}>{founding ? "Members." : "Earn more."}</div>
          </div>
          <div style={{ marginTop: 44, fontSize: 44, color: "#bdb3a9", textAlign: "center" }}>
            {founding ? "The list is open. Join free with my code." : "Member prices from day one. Join free with my code."}
          </div>
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", background: "#ffffff", borderRadius: 36, padding: 26 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/svg+xml;base64,${btoa(qr)}`} width={360} height={360} alt="" />
            </div>
            <div style={{ marginTop: 34, fontSize: 52, fontWeight: 800, letterSpacing: 6 }}>{ref.toUpperCase()}</div>
            <div style={{ marginTop: 16, fontSize: 30, color: "#968a80" }}>shop.herbalholland.com · adults 18+</div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
