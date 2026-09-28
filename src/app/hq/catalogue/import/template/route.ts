// The catalogue import template: every column, with example rows (the import refuses them until they're replaced).
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { importTemplate } from "@/lib/catalogue-import";

export async function GET() {
  await requireStaff(HQ_ROLES);
  return new Response(importTemplate(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="herbal-holland_catalogue-import-template.csv"',
      "cache-control": "no-store",
    },
  });
}
