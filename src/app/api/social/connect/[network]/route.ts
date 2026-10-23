// Connecting a social account (TikTok, YouTube, LinkedIn, X, Pinterest): HQ → Marketing → Social → Connect comes here
// first and is sent to the network's sign-in; the network sends the person back here with a code, which becomes the
// account (src/server/social/oauth.ts). Only HQ marketing may do it; the state travels in a short-lived cookie.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStaff } from "@/server/auth";
import { can } from "@/server/hq/guard";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { checkState, connectable, finishConnect, OAUTH_NETWORKS, PROVIDERS, startConnect, type OAuthNetwork } from "@/server/social/oauth";

const COOKIE = "hh_social_connect";
const back = (req: Request, q: string) => NextResponse.redirect(new URL(`/hq/marketing/social?${q}`, req.url), 303);

export async function GET(req: Request, { params }: { params: Promise<{ network: string }> }) {
  const { network } = await params;
  const staff = await getStaff();
  if (!staff || !can(staff, "network")) return new Response("Not found", { status: 404 });
  if (!(OAUTH_NETWORKS as string[]).includes(network)) return new Response("Not found", { status: 404 });
  const n = network as OAuthNetwork;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const jar = await cookies();
  if (!code) {
    if (!connectable().includes(n)) return back(req, `problem=${encodeURIComponent(`${PROVIDERS[n].label}'s app keys aren't set on the Worker`)}`);
    const s = startConnect(n);
    jar.set(COOKIE, s.cookie, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/social/connect", maxAge: 600 });
    return NextResponse.redirect(s.url, 303);
  }
  const verifier = checkState(n, url.searchParams.get("state"), jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
  if (!verifier) return back(req, `problem=${encodeURIComponent("That sign-in didn't match: try Connect again")}`);
  try {
    const a = await finishConnect(n, code, verifier, staff.name);
    await audit(db, { type: "USER", id: staff.id, name: staff.name }, "social.connect", { entity: "SocialAccount", entityId: n, data: { name: a.name } });
    return back(req, `connected=${encodeURIComponent(`${PROVIDERS[n].label} connected as ${a.name}`)}`);
  } catch (e) {
    return back(req, `problem=${encodeURIComponent(`${PROVIDERS[n].label} didn't connect: ${e instanceof Error ? e.message : e}`.slice(0, 300))}`);
  }
}
