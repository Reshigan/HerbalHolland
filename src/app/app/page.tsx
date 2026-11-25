import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Mark } from "@/components/brand/logo";
import { AppOnlyScreen } from "@/components/shop/app-only";
import { appOnly, detectPlatform } from "@/lib/install";
import { safePath } from "@/lib/safe-path";
import { AppHandshake } from "./handshake";

// Where the proxy sends anything closed to a browser. A browser gets the way to install; the installed app passes
// straight through. Per request, for the CSP nonce.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get the app", robots: { index: false, follow: false } };

export default async function AppPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!appOnly()) redirect("/club");
  // Android browsers go to the Google Play listing. The Play app itself never lands here without its cookie: it
  // launches through /api/app, which sets hh_app first.
  const play = process.env.PLAY_STORE_URL;
  if (play && !(await cookies()).has("hh_app") && detectPlatform((await headers()).get("user-agent") ?? "").platform === "android") redirect(play);
  const { next } = await searchParams;
  return (
    <div className="min-h-dvh bg-ink-950 text-ink-100">
      <div className="app:hidden">
        <AppOnlyScreen />
      </div>
      <div className="hidden min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center app:flex">
        <Mark className="h-14 w-14 text-brand-500" />
        <AppHandshake next={safePath(next) ?? "/club"} />
      </div>
    </div>
  );
}
