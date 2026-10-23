// The request proxy: the start-up checks on the first request (src/server/startup.ts: a Worker has no boot hook), then
// a per-request Content-Security-Policy with a nonce (production only; development needs eval and the HMR socket).
// See src/lib/csp.ts. Static files, API routes, prefetches and the build-time /brand page are left alone.
import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { HEAD_SNIPPET, nonceCsp } from "@/lib/csp";
import { ensureStartupChecks } from "@/server/startup";

const SNIPPET_HASH = `sha256-${createHash("sha256").update(HEAD_SNIPPET).digest("base64")}`;

export function proxy(request: NextRequest) {
  const notServing = ensureStartupChecks(); // the reason is in the log (console.error), never in the response
  if (notServing) return new NextResponse("The shop is not configured to serve: see the log", { status: 500 });
  if (process.env.NODE_ENV !== "production") return NextResponse.next();
  const nonce = randomBytes(16).toString("base64");
  const csp = nonceCsp(nonce, SNIPPET_HASH);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp); // Next reads the nonce from here and stamps its scripts with it
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not /api, Next's assets, files with an extension (icons, manifests, service workers) or /brand.
      source: "/((?!api/|_next/static|_next/image|brand$|.*\\.[a-zA-Z0-9]+$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
