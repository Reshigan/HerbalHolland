// POPIA s23 access request: everything held about one member, as a JSON download.
// HQ administrator (Information Officer) only; every export is audited.
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getStaff } from "@/server/auth";
import { audit } from "@/server/audit";
import { can, actorOf } from "@/server/hq/guard";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getStaff();
  if (!user || !can(user, "admin")) return new NextResponse("Not allowed", { status: 403 });
  const c = await db.customer.findUnique({
    where: { id },
    include: {
      homeStore: { select: { code: true, name: true } },
      consentEvents: { orderBy: { createdAt: "asc" }, select: { channel: true, granted: true, source: true, wording: true, createdAt: true } },
      loyalty: { orderBy: { createdAt: "asc" }, select: { points: true, kind: true, note: true, createdAt: true, store: { select: { code: true } } } },
      sales: {
        orderBy: { createdAt: "asc" },
        select: {
          number: true, kind: true, channel: true, createdAt: true, totalCents: true, vatCents: true, discountCents: true, pointsEarned: true,
          store: { select: { code: true, name: true } },
          lines: { select: { qty: true, unitPriceCents: true, totalCents: true, variant: { select: { sku: true, name: true, product: { select: { name: true } } } } } },
          payments: { select: { method: true, amountCents: true, cardLast4: true } },
        },
      },
      orders: {
        orderBy: { createdAt: "asc" },
        select: { code: true, status: true, fulfilment: true, createdAt: true, totalCents: true, addressLine: true, suburb: true, city: true, postalCode: true, lines: { select: { qty: true, totalCents: true, variant: { select: { sku: true } } } } },
      },
      patientAuths: { select: { authNumber: true, prescriber: true, prescriberRegNo: true, scope: true, monthlyLimitGrams: true, validFrom: true, validTo: true, status: true } },
      reviews: { select: { rating: true, title: true, body: true, createdAt: true, product: { select: { name: true } } } },
      messages: { orderBy: { createdAt: "asc" }, select: { channel: true, kind: true, to: true, body: true, status: true, createdAt: true } },
      alerts: { select: { createdAt: true, variant: { select: { sku: true } } } },
    },
  });
  if (!c) return new NextResponse("Not found", { status: 404 });
  const { idHash: _hash, ...profile } = c;
  void _hash;
  await audit(db, actorOf(user), "customer.export", { entity: "Customer", entityId: c.id, data: { memberNo: c.memberNo } });
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      exportedBy: user.name,
      controller: "Herbal Holland (franchisor) and the franchisee companies that sold to this member",
      note: "Personal information held about this member under POPIA s23. ID numbers are never stored — only a one-way hash and the last four digits.",
      member: profile,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="herbal-holland-${c.memberNo}.json"`,
      "cache-control": "no-store",
    },
  });
}
