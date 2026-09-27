// Server-rendered QR code as crisp inline SVG (qrcode's matrix, drawn as one path).
import QRCode from "qrcode";
import { cn } from "@/lib/cn";

export function QrCode({ value, className, fg = "#0c0a09", bg = "#ffffff", label, margin = 2 }: { value: string; className?: string; fg?: string; bg?: string; label: string; margin?: number }) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const n = modules.size;
  let d = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (modules.data[y * n + x]) d += `M${x + margin} ${y + margin}h1v1h-1z`;
  const size = n + margin * 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={cn("block", className)} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill={bg} rx={margin * 0.6} />
      <path d={d} fill={fg} />
    </svg>
  );
}
