// Serves herbalholland.com (SITE_URL) from this app — see siteRoute in @/lib/site. Read at runtime, so one image
// serves staging and production.
import { NextResponse, type NextRequest } from "next/server";
import { siteRoute } from "@/lib/site";

export function proxy(req: NextRequest) {
  const r = siteRoute({
    host: req.headers.get("x-forwarded-host") ?? req.headers.get("host"),
    path: req.nextUrl.pathname,
    search: req.nextUrl.search,
    siteUrl: process.env.SITE_URL,
    appUrl: process.env.APP_URL,
  });
  if (r.kind === "redirect") return NextResponse.redirect(r.url, 308);
  if (r.kind === "rewrite") {
    const url = req.nextUrl.clone();
    url.pathname = r.path;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|api/).*)"] };
