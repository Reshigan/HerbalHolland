// A QR code as an SVG string (error correction M, 4-module quiet zone): `ink` modules on a rounded `ground` tile.
import QRCode from "qrcode";

export const JOIN_QR = "https://herbalholland.com/join";

export function qrSvg(url: string, ink: string, ground: string) {
  const q = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = q.modules.size, w = n + 8;
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; ) {
      if (!q.modules.get(r, c)) { c++; continue; }
      let e = c;
      while (e < n && q.modules.get(r, e)) e++;
      d += `M${c + 4} ${r + 4}h${e - c}v1h${c - e}z`;
      c = e;
    }
  }
  return `<svg viewBox="0 0 ${w} ${w}" width="100%" height="100%" shape-rendering="crispEdges"><rect width="${w}" height="${w}" rx="${w * 0.06}" fill="${ground}"/><path d="${d}" fill="${ink}"/></svg>`;
}
