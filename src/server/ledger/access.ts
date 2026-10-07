// Who may open which company's books, and what they may do there. Never trust a company id from the client: every
// books page and action goes through requireBooks.
//   Owner        — their company's books: read, post, approve, close months.
//   Accountant   — their company's books: read and post; drafts wait for the owner (or HQ admin, for HQ's books).
//   HQ admin     — HQ's own books in full; any franchisee's books to read.
//   Area manager — read the books of franchisees with a store in their region.
// Everyone else (store managers, budtenders, HQ team) has no books.
import { notFound } from "next/navigation";
import { db } from "../db";
import { requireStaff, type Staff } from "../auth";

export type BooksRole = { read: boolean; write: boolean; approve: boolean };
export type BooksCompany = { id: string; name: string; legalName: string; kind: "FRANCHISOR" | "FRANCHISEE"; vatNumber: string | null; booksLockedThrough: string | null; vatCategory: string | null; yearEndMonth: number };

const NONE: BooksRole = { read: false, write: false, approve: false };

export async function booksRole(u: Pick<Staff, "role" | "companyId" | "regionId">, company: { id: string; kind: string }): Promise<BooksRole> {
  const own = u.companyId === company.id;
  switch (u.role) {
    case "OWNER": // a franchisee's owner; HQ's books are kept by its admins
      return own && company.kind === "FRANCHISEE" ? { read: true, write: true, approve: true } : NONE;
    case "ACCOUNTANT":
      return own ? { read: true, write: true, approve: false } : NONE;
    case "HQ_ADMIN":
      return company.kind === "FRANCHISOR" ? { read: true, write: true, approve: true } : { read: true, write: false, approve: false };
    case "AREA_MANAGER":
      return company.kind === "FRANCHISEE" && u.regionId && (await db.store.count({ where: { companyId: company.id, regionId: u.regionId } })) ? { read: true, write: false, approve: false } : NONE;
    default:
      return NONE;
  }
}

const COMPANY_SELECT = { id: true, name: true, legalName: true, kind: true, vatNumber: true, booksLockedThrough: true, vatCategory: true, yearEndMonth: true } as const;

/** The signed-in person's access to a company's books; not-found when they have none (ids can't be probed). */
export async function requireBooks(companyId: string, need: keyof BooksRole = "read") {
  const user = await requireStaff();
  const company = await db.company.findUnique({ where: { id: companyId }, select: COMPANY_SELECT });
  if (!company) notFound();
  const role = await booksRole(user, company);
  if (!role[need]) notFound();
  return { user, company: company as BooksCompany, role };
}

/** For actions: the same check, as a result instead of a not-found page. */
export async function booksAccess(companyId: string, need: keyof BooksRole) {
  const user = await requireStaff();
  const company = await db.company.findUnique({ where: { id: companyId }, select: COMPANY_SELECT });
  if (!company) return null;
  const role = await booksRole(user, company);
  return role[need] ? { user, company: company as BooksCompany, role } : null;
}

/** The companies whose books someone can open (an area manager's: those with a store in their region). */
export async function booksList(u: Staff) {
  const where =
    u.role === "OWNER" || u.role === "ACCOUNTANT"
      ? { id: u.companyId ?? "" }
      : u.role === "HQ_ADMIN"
        ? {}
        : u.role === "AREA_MANAGER"
          ? { kind: "FRANCHISEE" as const, stores: { some: { regionId: u.regionId ?? "" } } }
          : { id: "" };
  return db.company.findMany({ where, select: { id: true, name: true, legalName: true, kind: true, _count: { select: { stores: true } } }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
}
