// The herbalholland.com first-access list, as the site's D1 export gives it (docs/RUNBOOK.md): the `--json` output of
// `wrangler d1 execute` ([{ results: [...] }]), a plain JSON array, or a CSV with a header row. Columns: first_name,
// email, mobile, province, source, created_at. Emails are kept lower-case, mobiles as +27…; a row with neither is left out.
import { normalisePhone } from "./sa";

export type EarlyAccessRow = { firstName: string | null; email: string | null; mobile: string | null; province: string | null; source: string | null; signedUpAt: Date };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);

function csv(raw: string): Record<string, string>[] {
  const [head, ...lines] = raw.trim().split(/\r?\n/).map((l) => l.split(",").map((c) => c.trim().replace(/^"(.*)"$/, "$1")));
  return lines.map((cells) => Object.fromEntries(head.map((h, i) => [h.toLowerCase(), cells[i] ?? ""])));
}

export function parseEarlyAccess(raw: string): { rows: EarlyAccessRow[]; skipped: number } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = csv(raw);
  }
  const list: unknown[] = Array.isArray(data) ? data.flatMap((d) => (d && typeof d === "object" && Array.isArray((d as { results?: unknown[] }).results) ? (d as { results: unknown[] }).results : [d])) : [];
  const rows: EarlyAccessRow[] = [];
  let skipped = 0;
  for (const r of list) {
    const o = (r ?? {}) as Record<string, unknown>;
    const email = text(o.email)?.toLowerCase() ?? null;
    const mobile = text(o.mobile) ? normalisePhone(String(o.mobile)) : null;
    const ok = { email: email && EMAIL.test(email) ? email : null, mobile };
    if (!ok.email && !ok.mobile) {
      skipped++;
      continue;
    }
    const at = new Date(String(o.created_at ?? ""));
    rows.push({ firstName: text(o.first_name), ...ok, province: text(o.province), source: text(o.source), signedUpAt: Number.isNaN(at.getTime()) ? new Date(0) : at });
  }
  return { rows, skipped };
}
