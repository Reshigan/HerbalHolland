import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Till",
  manifest: "/pos/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HH Till", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0c0a09",
  colorScheme: "dark",
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-ink-950 text-ink-100 antialiased [color-scheme:dark] print:bg-white print:text-black">
      <style>{`body{background:#0c0a09;overscroll-behavior:none}@media print{body{background:#fff}}`}</style>
      {children}
    </div>
  );
}
