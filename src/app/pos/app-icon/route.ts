// Till app icon: the windmill-flower mark in Holland orange on warm black (SVG).
import { PETAL } from "@/components/brand/logo";

export function GET(req: Request) {
  const maskable = new URL(req.url).searchParams.has("maskable");
  const s = maskable ? 0.62 : 0.8; // maskable icons keep the mark inside the safe zone
  const t = (512 - 512 * s) / 2;
  const petals = [45, 135, 225, 315].map((r) => `<path d="${PETAL}" transform="rotate(${r - 90})" stroke-width="3.6"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="#0c0a09"/>
<g transform="translate(${t} ${t}) scale(${(512 * s) / 100})" fill="none" stroke="#f5913c" stroke-linecap="round" stroke-linejoin="round">
<path d="M 36.2 82.6 A 40 40 0 1 1 63.8 82.6" stroke-width="5.5"/>
<path d="M 33 91 L 50 44.5 L 67 91" stroke-width="5.5"/>
<path d="M 42.5 91 L 50 69 L 57.5 91" stroke-width="3.2"/>
<g transform="translate(50 40)">${petals}<circle r="3.4" stroke-width="2.4"/><circle r="0.9" fill="#f5913c" stroke="none"/></g>
</g></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
