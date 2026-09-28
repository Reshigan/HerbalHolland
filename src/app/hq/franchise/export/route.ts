// Franchise leads as CSV (HQ admin and the HQ team): the list's current status filter and search. Personal information
// leaving the platform, so every export is audited (lead.export: how many rows and which view — never the search text).
import { requireStaff } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/hq/guard";
import { LEAD_ROLES, leadSearch, leadView, viewWhere } from "@/server/leads";
import { CAPITAL_LABEL, LEAD_STATUS, capitalLabel, earliestSigning } from "@/lib/leads";
import { PROVINCES, displayPhone, type ProvinceCode } from "@/lib/sa";
import { csvFilename, toCsv } from "@/lib/csv";
import { dayKey } from "@/lib/format";

const MAX_ROWS = 5_000;

export async function GET(req: Request) {
  const user = await requireStaff(LEAD_ROLES);
  const u = new URL(req.url).searchParams;
  const view = leadView(u.get("status"));
  const q = (u.get("q") ?? "").trim();
  const leads = await db.franchiseLead.findMany({ where: { AND: [viewWhere(view), leadSearch(q)] }, orderBy: { createdAt: "desc" }, take: MAX_ROWS });
  const ownerIds = [...new Set(leads.flatMap((l) => (l.ownerId ? [l.ownerId] : [])))];
  const owners = new Map((ownerIds.length ? await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }) : []).map((o) => [o.id, o.name]));

  const csv = toCsv({
    columns: [
      { key: "number", label: "Number" },
      { key: "createdAt", label: "Received", format: "datetime" },
      { key: "status", label: "Status" },
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Mobile" },
      { key: "area", label: "Area" },
      { key: "province", label: "Province" },
      { key: "capital", label: CAPITAL_LABEL },
      { key: "pharmacist", label: "Pharmacist partner" },
      { key: "experience", label: "Retail or business experience" },
      { key: "message", label: "Anything else" },
      { key: "source", label: "Came from" },
      { key: "owner", label: "Owner" },
      { key: "disclosureSentAt", label: "Disclosure sent", format: "day" },
      { key: "earliestSigning", label: "Earliest signing", format: "day" },
      { key: "updatedAt", label: "Last change", format: "datetime" },
      { key: "notes", label: "Notes" },
    ],
    rows: leads.map((l) => ({
      ...l,
      status: LEAD_STATUS[l.status].label,
      phone: displayPhone(l.phone),
      province: l.province && Object.hasOwn(PROVINCES, l.province) ? PROVINCES[l.province as ProvinceCode] : l.province,
      capital: capitalLabel(l.capital),
      owner: l.ownerId ? (owners.get(l.ownerId) ?? "Former staff member") : "",
      earliestSigning: l.disclosureSentAt ? earliestSigning(l.disclosureSentAt) : null,
    })),
  });
  await audit(db, actorOf(user), "lead.export", { entity: "FranchiseLead", data: { rows: leads.length, view, searched: !!q } });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename("herbal-holland", "franchise-leads", view === "open" ? null : view.toLowerCase(), dayKey(new Date()))}"`,
      "cache-control": "no-store",
    },
  });
}
