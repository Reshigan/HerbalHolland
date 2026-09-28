"use server";
import { revalidatePath } from "next/cache";
import { db, tx } from "@/server/db";
import { audit } from "@/server/audit";
import { guard, DENIED, done, fail, flashTo, type ActionState } from "@/server/hq/guard";
import { str, opt, slugify } from "@/server/hq/form";
import { screenCopy } from "@/lib/compliance";
import { isCategoryIcon } from "@/components/product/category-icons";

const PATH = "/hq/catalogue/categories";

function refresh() {
  revalidatePath(PATH);
  revalidatePath("/hq/catalogue");
  revalidatePath("/shop");
  revalidatePath("/");
}

/** Add a category (categoryId null) or change one: name, URL slug, blurb and icon. */
export async function saveCategory(categoryId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const before = categoryId ? await db.category.findUnique({ where: { id: categoryId } }) : null;
  if (categoryId && !before) return fail("That category no longer exists.");

  const fields: Record<string, string> = {};
  const name = str(fd, "name");
  if (name.length < 2 || name.length > 40) fields.name = "A short name, 2–40 characters";
  else if (await db.category.count({ where: { name: { equals: name, mode: "insensitive" }, ...(categoryId && { id: { not: categoryId } }) } })) fields.name = "Another category is already called that";
  const slug = slugify(str(fd, "slug") || name);
  if (!slug) fields.slug = "Letters or numbers, e.g. coffee-and-drinks";
  else if (await db.category.count({ where: { slug, ...(categoryId && { id: { not: categoryId } }) } })) fields.slug = "Another category already uses this URL";
  const blurb = opt(fd, "blurb");
  if (blurb && blurb.length > 140) fields.blurb = "Keep it to one line (140 characters)";
  const icon = str(fd, "icon");
  if (!isCategoryIcon(icon)) fields.icon = "Choose an icon";
  // Category names and blurbs are consumer-facing copy: the same screen as campaigns and product claims.
  const flag = screenCopy(`${name} ${blurb ?? ""}`)[0];
  if (flag && !fields.name && !fields.blurb) fields[screenCopy(name).length ? "name" : "blurb"] = `“${flag.term}” — ${flag.reason}`;
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);

  if (!before) {
    const last = await db.category.aggregate({ _max: { sortOrder: true } });
    const c = await db.category.create({ data: { name, slug, blurb, icon, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    await audit(db, g.actor, "category.create", { entity: "Category", entityId: c.id, data: { name, slug, icon } });
    refresh();
    flashTo(PATH, `“${name}” added. It shows in the shop and on the tills once it has an active product.`);
  }
  const next = { name, slug, blurb, icon };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => (before[k] ?? null) !== (next[k] ?? null));
  if (!changed.length) return done("No changes to save.");
  await db.category.update({ where: { id: before.id }, data: next });
  await audit(db, g.actor, "category.update", {
    entity: "Category",
    entityId: before.id,
    data: { changed, before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])) },
  });
  refresh();
  flashTo(PATH, changed.includes("slug") ? `“${name}” saved. Its shop address is now /shop?category=${slug}.` : `“${name}” saved.`);
}

/** Move a category one place up (-1) or down (+1) in the shop's order; renumbers the list so the order has no ties. */
export async function moveCategory(categoryId: string, delta: -1 | 1) {
  const g = await guard("network");
  if (!g) return;
  await tx(async (t) => {
    const all = await t.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, sortOrder: true } });
    const from = all.findIndex((c) => c.id === categoryId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= all.length) return;
    [all[from], all[to]] = [all[to], all[from]];
    for (const [i, c] of all.entries()) if (c.sortOrder !== i) await t.category.update({ where: { id: c.id }, data: { sortOrder: i } });
    await audit(t, g.actor, "category.reorder", { entity: "Category", entityId: categoryId, data: { name: all[to].name, from: from + 1, to: to + 1 } });
  });
  refresh();
}

/** Delete a category — only once no product (active, draft or archived) is in it. */
export async function deleteCategory(categoryId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  const g = await guard("network");
  if (!g) return DENIED;
  const c = await db.category.findUnique({ where: { id: categoryId }, include: { _count: { select: { products: true } } } });
  if (!c) return fail("That category no longer exists.");
  if (c._count.products) return fail(`“${c.name}” still holds ${c._count.products} product${c._count.products === 1 ? "" : "s"} (including drafts and archived ones). Move them to another category first.`);
  await db.category.delete({ where: { id: c.id } });
  await audit(db, g.actor, "category.delete", { entity: "Category", entityId: c.id, data: { name: c.name, slug: c.slug, icon: c.icon } });
  refresh();
  flashTo(PATH, `“${c.name}” deleted.`);
}
