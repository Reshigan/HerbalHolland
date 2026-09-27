// Scheduler endpoint: releases campaigns held for a legal send window (CPA Reg 4).
// Call every 15 minutes with `Authorization: Bearer $CRON_SECRET`.
import { NextResponse } from "next/server";
import { runDueCampaigns } from "@/server/marketing";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const results = await runDueCampaigns();
  return NextResponse.json({ ran: results.length, results });
}
