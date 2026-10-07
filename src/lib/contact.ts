// Who "we" are and where people write to, when the franchisor's company record (HQ → Stores → its DC → Owner) leaves
// it blank: the company that owns the online business, as herbalholland.com names it, and the public mailbox routed
// to the team (RUNBOOK → email routing: hello@, franchise@, press@ and careers@ on herbalholland.com). Pages read the
// record first; these are the only fallbacks.
export const FALLBACK_LEGAL_NAME = "Vantax (Pty) Ltd";
export const FALLBACK_EMAIL = "hello@herbalholland.com";

type CompanyLike = { legalName?: string | null; email?: string | null } | null | undefined;

/** The franchisor's registered name. */
export const legalNameOf = (c: CompanyLike) => c?.legalName?.trim() || FALLBACK_LEGAL_NAME;
/** Where members and the public write to us: the franchisor's email. */
export const contactEmailOf = (c: CompanyLike) => c?.email?.trim() || FALLBACK_EMAIL;
