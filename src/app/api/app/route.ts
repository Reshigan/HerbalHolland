import { NextResponse, type NextRequest } from "next/server";
import { safePath } from "@/lib/safe-path";

/**
 * Marks this device as the installed app, then carries on to `next`. Set here rather than from script because iOS caps
 * script-set cookies at seven days. It isn't a credential: it keeps the shop out of ordinary browsers and search, and
 * every account, age and payment check still runs behind it.
 */
export function GET(request: NextRequest) {
  const next = safePath(request.nextUrl.searchParams.get("next"));
  // Relative Location: in the standalone server req.url names localhost, not the host the browser used.
  const response = new NextResponse(null, { status: 303, headers: { Location: !next || /^\/app([/?#]|$)/.test(next) ? "/club" : next } });
  response.cookies.set("hh_app", "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31_536_000 });
  return response;
}
