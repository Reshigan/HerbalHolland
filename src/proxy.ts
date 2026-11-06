// The request proxy: the start-up checks on the first request (src/server/startup.ts: a Worker has no boot hook), then
// a per-request Content-Security-Policy with a nonce (production only; development needs eval and the HMR socket).
// See src/lib/csp.ts. Static files, API routes, prefetches and the build-time /brand page are left alone.
import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { HEAD_SNIPPET, nonceCsp } from "@/lib/csp";
import { appOnly, appOnlyOpen } from "@/lib/install";
import { ensureStartupChecks } from "@/server/startup";

const SNIPPET_HASH = `sha256-${createHash("sha256").update(HEAD_SNIPPET).digest("base64")}`;

export function proxy(request: NextRequest) {
  const notServing = ensureStartupChecks(); // the reason is in the log (console.error), never in the response
  if (notServing) return new NextResponse("The shop is not configured to serve: see the log", { status: 500 });
  // App only, enforced here so a browser or a crawler never receives the shop: no HTML, no prices, no working cart.
  // The installed app gets its `hh_app` cookie from /app on first launch. Prefetches count too, or they would fetch
  // the pages this closes.
  const { pathname, search } = request.nextUrl;
  if (appOnly() && !request.cookies.has("hh_app") && !appOnlyOpen(pathname)) {
    const to = request.nextUrl.clone();
    to.pathname = "/app";
    to.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(to);
  }
  const prefetch = request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch";
  if (process.env.NODE_ENV !== "production" || prefetch) return NextResponse.next();
  const nonce = randomBytes(16).toString("base64");
  const csp = nonceCsp(nonce, SNIPPET_HASH);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp); // Next reads the nonce from here and stamps its scripts with it
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = { matcher: ["/((?!api/|_next/static|_next/image|brand$|.*\\.[a-zA-Z0-9]+$).*)"] };
