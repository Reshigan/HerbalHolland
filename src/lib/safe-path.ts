// Where a sign-in may send someone afterwards: a path on this site only, never another host ("//host", "/\host",
// which browsers read as "//host", or "/.//host", which resolves to it), never a scheme. Returned resolved, as the
// browser would read it.
export const safePath = (raw: unknown): string | null => {
  const s = String(raw ?? "");
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\") || /[\u0000-\u001F\u007F]/.test(s)) return null;
  const u = new URL(s, "http://local");
  return u.host === "local" && !u.pathname.startsWith("//") ? `${u.pathname}${u.search}${u.hash}` : null;
};
