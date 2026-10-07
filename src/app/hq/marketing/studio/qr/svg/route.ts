// The QR maker's code as an SVG file, to drop into a poster, flyer or window wrap at any size.
import QRCode from "qrcode";
import { getStaff, HQ_ROLES } from "@/server/auth";
import { qrFor } from "../link";

export async function GET(req: Request) {
  const user = await getStaff();
  if (!user || !HQ_ROLES.includes(user.role)) return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const { link, kind, code, tag } = await qrFor({ kind: q.get("kind") ?? undefined, code: q.get("code") ?? undefined, tag: q.get("tag") ?? undefined });
  if (!link) return new Response("Nothing to draw", { status: 404 });
  const svg = await QRCode.toString(link, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#0c0a09", light: "#ffffff" } });
  const name = ["herbal-holland", kind, code.toLowerCase(), tag].filter(Boolean).join("-");
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Content-Disposition": `attachment; filename="${name}.svg"`, "Cache-Control": "private, no-store" } });
}
