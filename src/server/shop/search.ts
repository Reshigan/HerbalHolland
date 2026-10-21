// The database side of the shop search: products whose name, tagline or a variant's name contains what was typed, or
// one of its words (SQLite has no trigram similarity), bounded to the classes the shopper may see. The ranking itself
// is pure (@/lib/search) so it can be tested without a database.
import { db, Prisma } from "@/server/db";
import type { RegClass } from "@/lib/compliance";

// How alike a name is to the text typed, as the ranking counts it (0–1): the whole text at the start of the name, the
// whole text inside it, a word of it inside the name, then the same inside the tagline (× 0.8) or a variant's name (× 0.7).
const PREFIX = 1, WHOLE = 0.9, WORD = 0.7;

/**
 * Products similar to `q` by name, tagline or a variant's name, with their best similarity (0–1), at most 100:
 * the whole text first, then a word of it ("durban" finds Durban Poison), closest first then by name. A LIKE pattern is
 * at most 50 bytes, so the text and its words are cut to 40 characters.
 */
export async function similarProducts(q: string, classes: RegClass[]): Promise<Map<string, number>> {
  const needle = q.trim().slice(0, 40).replace(/[%_]/g, "").trim();
  if (needle.length < 2 || !classes.length) return new Map();
  const words = [...new Set(needle.split(/\s+/).filter((w) => w.length >= 3 && w !== needle))].slice(0, 6);
  const like = (col: string, w: string, prefix = false) => Prisma.sql`${Prisma.raw(col)} LIKE ${prefix ? `${w}%` : `%${w}%`}`;
  // The best similarity of a column: the whole text at its start, the whole text in it, else a word of it in it.
  const sim = (col: string) =>
    Prisma.sql`CASE WHEN ${like(col, needle, true)} THEN ${PREFIX} WHEN ${like(col, needle)} THEN ${WHOLE} ${
      words.length ? Prisma.sql`WHEN ${Prisma.join(words.map((w) => like(col, w)), " OR ")} THEN ${WORD}` : Prisma.empty
    } ELSE 0 END`;
  const any = (col: string) => Prisma.join([needle, ...words].map((w) => like(col, w)), " OR ");
  const rows = await db.$queryRaw<{ id: string; sim: number }[]>`
      SELECT p.id, MAX(MAX(${sim("p.name")}, ${sim("coalesce(p.tagline, '')")} * 0.8, coalesce(${sim("v.name")}, 0) * 0.7)) AS sim
      FROM "Product" p
      LEFT JOIN "Variant" v ON v."productId" = p.id AND v.active
      WHERE p.status = 'ACTIVE' AND p."regClass" IN (${Prisma.join(classes)})
        AND (${any("p.name")} OR ${any("coalesce(p.tagline, '')")} OR ${any("v.name")})
      GROUP BY p.id
      ORDER BY sim DESC, p.name
      LIMIT 100`;
  return new Map(rows.map((r) => [r.id, Number(r.sim)]));
}

/**
 * Does a search find anything in the dispensary (classes the public shop doesn't show)? Only a yes or no: the
 * public shop never names licensed products.
 */
export async function dispensaryHasMatch(q: string, classes: { public: RegClass[]; licensed: RegClass[] }) {
  const licensedOnly = classes.licensed.filter((c) => !classes.public.includes(c));
  return (await similarProducts(q, licensedOnly)).size > 0;
}

/** A trading store whose name, suburb or city matches a search ("melville"): one row, indexed lookups only. */
export async function storeMatching(q: string) {
  const needle = q.trim().slice(0, 60);
  if (needle.length < 3) return null;
  const like = { contains: needle };
  return db.store.findFirst({
    where: { kind: "RETAIL", status: "ACTIVE", OR: [{ name: like }, { suburb: like }, { city: like }] },
    select: { slug: true, name: true, suburb: true },
    orderBy: { name: "asc" },
  });
}
