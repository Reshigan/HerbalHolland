// Email addresses as the platform accepts them: at most 254 characters (the longest an address can be), a local part,
// and a domain of dot-separated labels ending in two letters or more. A label can't contain a dot, so the check runs in
// linear time on any input (the older pattern's overlapping repeats took minutes on a long crafted string).
export const EMAIL_MAX = 254;

export function isEmail(s: string): boolean {
  return s.length <= EMAIL_MAX && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(s);
}
