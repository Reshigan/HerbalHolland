import type { Metadata, Viewport } from "next";

// Each page checks the sign-in itself (see insightsContext): a layout doesn't run again on every navigation.
export const metadata: Metadata = {
  title: "Insights",
  manifest: "/staff/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HH Office", statusBarStyle: "black" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0f0c0b" };

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return <div className="hh-insights min-h-dvh bg-ink-50 text-ink-850">{children}</div>;
}
