// iOS startup image for the installed Rewards app: the Mark centred on warm black with the wordmark under it, at the
// device's exact pixel size (iOS shows nothing otherwise). Sizes come from @/lib/pwa-splash; anything else is a 404.
import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/shop/mark-svg";
import { splashFor } from "@/lib/pwa-splash";

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const s = splashFor((await params).size);
  if (!s) return new Response("Not found", { status: 404 });
  const width = s.w * s.dpr;
  const height = s.h * s.dpr;
  const u = width / 1170; // everything scales with the width (1170 = iPhone 14 at 3×)
  const mark = Math.round(300 * u);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0c0a09", color: "#f5913c" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markDataUri({ bg: null, size: mark, inset: 0 })} width={mark} height={mark} alt="" />
        <div style={{ marginTop: 52 * u, fontSize: 46 * u, letterSpacing: 16 * u, fontWeight: 300 }}>HERBAL</div>
        <div style={{ marginTop: -6 * u, fontSize: 82 * u, letterSpacing: 7 * u, fontWeight: 800 }}>HOLLAND</div>
      </div>
    ),
    { width, height, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
