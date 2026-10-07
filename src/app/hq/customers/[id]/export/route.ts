// POPIA s23 access request: everything held about one member (@/server/popia), as a JSON download.
// HQ administrator (Information Officer) only; every export is audited.
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getStaff } from "@/server/auth";
import { audit } from "@/server/audit";
import { can, actorOf } from "@/server/hq/guard";
import { memberExport } from "@/server/popia";
import { legalNameOf } from "@/lib/contact";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getStaff();
  if (!user || !can(user, "admin")) return new NextResponse("Not allowed", { status: 403 });
  const [member, hq] = await Promise.all([memberExport(id), db.company.findFirst({ where: { kind: "FRANCHISOR" }, select: { legalName: true } })]);
  if (!member) return new NextResponse("Not found", { status: 404 });
  await audit(db, actorOf(user), "customer.export", { entity: "Customer", entityId: member.id, data: { memberNo: member.memberNo } });
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      exportedBy: user.name,
      controller: `${legalNameOf(hq)} (Herbal Holland, the franchisor) and the franchisee companies that sold to this member`,
      note:
        "Everything held about this member under POPIA s23: profile, sign-ins, consents, points, sales, orders, saved addresses, wishlist, reorder reminders, stock and drop alerts, app notification devices, event tickets, My Deals, Learn quests, reviews, returns, support requests, gift vouchers, messages, the photos they sent (listed by file name), the do-not-contact list and account activity. ID numbers are never stored: only a one-way hash and the last four digits.",
      member,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="herbal-holland-${member.memberNo}.json"`,
      "cache-control": "no-store",
    },
  });
}
