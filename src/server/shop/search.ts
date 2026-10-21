// The database side of the shop search: trigram similarity (the pg_trgm rules, computed in @/lib/search) finds
// products whose names are close to what was typed, bounded to the classes the shopper may see. SQLite has no
// trigram index, so the database prefilters candidates with cheap LIKE patterns (`likePatterns`), at most
// SIMILARITY_CANDIDATES of them by name, and the similarity is measured in code. The ranking itself is pure
// (@/lib/search) so it can be tested without a database.
import { db, Prisma } from "@/server/db";
import { SIMILARITY_CANDIDATES, SHORT_SIMILARITY_THRESHOLD, SIMILARITY_THRESHOLD, WORD_SIMILARITY_THRESHOLD, likePatterns, similarityFloor, trigramSimilarity, wordSimilarity } from "@/lib/search";
import type { RegClass } from "@/lib/compliance";

/** `col` satisfies any of the patterns. */
const likeAny = (col: string, patterns: string[]) => Prisma.join(patterns.map((p) => Prisma.sql`${Prisma.raw(col)} LIKE ${p}`), " OR ");

/**
 * Products similar to `q` by name, tagline or a variant's name, with their best similarity (0–1), at most 100,
 * closest first: `similarity` of the name (≥ SIMILARITY_THRESHOLD), `word_similarity` of the text against the
 * name (≥ WORD_SIMILARITY_THRESHOLD, or SHORT_SIMILARITY_THRESHOLD for short queries, which sit close to too many
 * words: "tea" and "tee"), the tagline's similarity × 0.8, an active variant's name × 0.7.
 */
export async function similarProducts(q: string, classes: RegClass[]): Promise<Map<string, number>> {
  const needle = q.trim().slice(0, 60);
  if (needle.length < 2 || !classes.length) return new Map();
  const patterns = likePatterns(needle);
  if (!patterns.length) return new Map();
  const word = similarityFloor(needle) === SIMILARITY_THRESHOLD ? WORD_SIMILARITY_THRESHOLD : SHORT_SIMILARITY_THRESHOLD;
  const rows = await db.$queryRaw<{ id: string; name: string; tagline: string | null; variants: string }[]>`
      SELECT p.id, p.name, p.tagline, json_group_array(v.name) AS variants
      FROM "Product" p
      LEFT JOIN "Variant" v ON v."productId" = p.id AND v.active
      WHERE p.status = 'ACTIVE' AND p."regClass" IN (${Prisma.join(classes)})
        AND (${likeAny("p.name", patterns)} OR ${likeAny("coalesce(p.tagline, '')", patterns)} OR ${likeAny("v.name", patterns)})
      GROUP BY p.id
      ORDER BY p.name
      LIMIT ${SIMILARITY_CANDIDATES}`;
  const scored: { id: string; name: string; sim: number }[] = [];
  for (const r of rows) {
    const name = trigramSimilarity(r.name, needle);
    const inName = wordSimilarity(needle, r.name);
    const tagline = trigramSimilarity(r.tagline ?? "", needle);
    const variants = (JSON.parse(String(r.variants)) as (string | null)[]).filter((v): v is string => !!v);
    const variant = Math.max(0, ...variants.map((v) => trigramSimilarity(v, needle)));
    if (name < SIMILARITY_THRESHOLD && inName < word && tagline < SIMILARITY_THRESHOLD && variant < SIMILARITY_THRESHOLD) continue;
    scored.push({ id: r.id, name: r.name, sim: Math.max(name, inName, tagline * 0.8, variant * 0.7) });
  }
  scored.sort((a, b) => b.sim - a.sim || a.name.localeCompare(b.name));
  return new Map(scored.slice(0, 100).map((r) => [r.id, r.sim]));
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
