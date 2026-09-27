// PNG icons for the installable Rewards app (Android needs 192 and 512; "maskable"
// keeps the Mark inside the safe zone when the launcher crops it to a circle).
import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/shop/mark-svg";

const SIZES: Record<string, { px: number; inset: number }> = {
  "192": { px: 192, inset: 0.12 },
  "512": { px: 512, inset: 0.12 },
  maskable: { px: 512, inset: 0.22 },
};

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const s = SIZES[(await params).size];
  if (!s) return new Response("Not found", { status: 404 });
  const mark = Math.round(s.px * (1 - s.inset * 2));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0c0a09" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markDataUri({ bg: null, size: mark, inset: 0 })} width={mark} height={mark} alt="" />
      </div>
    ),
    { width: s.px, height: s.px, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
