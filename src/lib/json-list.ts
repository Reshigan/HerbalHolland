// D1 (SQLite) has no list columns: what was `String[]` is a Json column holding an array. `asList` reads one safely
// (an old or odd value reads as empty) so pages and rules keep working with plain arrays.
export function asList<T = string>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** `ids` in pieces of `size`: D1 allows 100 bound parameters per statement, so raw SQL with an id list goes in rounds. */
export function chunk<T>(xs: readonly T[], size = 90): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** `fn` over `ids` in pieces of `size`, results flattened: for a Prisma `in:` list that may exceed D1's parameter limit. */
export async function inBatches<T>(ids: readonly string[], fn: (part: string[]) => Promise<T[]>, size = 90): Promise<T[]> {
  return (await Promise.all(chunk(ids, size).map(fn))).flat();
}
