// The database side of the shop search: trigram similarity (pg_trgm, GIN-indexed on Product.name, Product.tagline and
// Variant.name) finds products whose names are close to what was typed, bounded to the classes the shopper may see.
// The ranking itself is pure (@/lib/search) so it can be tested without a database.
import { db, Prisma } from "@/server/db";
import { SIMILARITY_THRESHOLD, WORD_SIMILARITY_THRESHOLD } from "@/lib/search";
import type { RegClass } from "@/lib/compliance";

/**
 * Products similar to `q` by name, tagline or a variant's name, with their best similarity (0–1), at most 100.
 * The thresholds are set for this transaction only, so the `%` and `<%` operators (which use the GIN indexes) match
 * what the ranking counts.
 */
export async function similarProducts(q: string, classes: RegClass[]): Promise<Map<string, number>> {
  const needle = q.trim().slice(0, 60);
  if (needle.length < 2 || !classes.length) return new Map();
  const rows = await db.$transaction(async (t) => {
    await t.$executeRawUnsafe(`SET LOCAL pg_trgm.similarity_threshold = ${SIMILARITY_THRESHOLD}`);
    await t.$executeRawUnsafe(`SET LOCAL pg_trgm.word_similarity_threshold = ${WORD_SIMILARITY_THRESHOLD}`);
    return t.$queryRaw<{ id: string; sim: number }[]>`
      SELECT p.id,
        GREATEST(similarity(p.name, ${needle}), word_similarity(${needle}, p.name), similarity(coalesce(p.tagline, ''), ${needle}) * 0.8, coalesce(max(similarity(v.name, ${needle})), 0) * 0.7)::float AS sim
      FROM "Product" p
      LEFT JOIN "Variant" v ON v."productId" = p.id AND v.active
      WHERE p.status = 'ACTIVE' AND p."regClass"::text IN (${Prisma.join(classes)})
        AND (p.name % ${needle} OR ${needle} <% p.name OR coalesce(p.tagline, '') % ${needle} OR v.name % ${needle})
      GROUP BY p.id
      ORDER BY sim DESC
      LIMIT 100`;
  });
  return new Map(rows.map((r) => [r.id, Number(r.sim)]));
}
