// Where a sign-in may send someone afterwards: a path on this site only — never another host ("//host", "/\host",
// which browsers read as "//host"), never a scheme.
export const safePath = (raw: unknown): string | null => {
  const s = String(raw ?? "");
  return s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") && !/[\u0000-\u001F\u007F]/.test(s) ? s : null;
};
