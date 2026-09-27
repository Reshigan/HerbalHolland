// QR codes for the till, rendered server-side as SVG: the Windmill Club self-sign-up
// link and PayShap payment requests.
import QRCode from "qrcode";
import { withStaff, PosError } from "@/server/pos/http";

export const GET = withStaff(async (req) => {
  const text = new URL(req.url).searchParams.get("text") ?? "";
  if (!text || text.length > 600) throw new PosError("Nothing to encode", 400);
  const svg = await QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0c0a09", light: "#ffffff" } });
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "private, max-age=3600" } });
});
