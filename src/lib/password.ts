// Staff password rules, for every password someone chooses or sets (their own, or a temporary one for a colleague):
// 10 to 200 characters, not one of the most common passwords, and nothing from the person's email or name.

/** The seeded demo accounts' password. Seven characters, so no password the app accepts can ever be it. */
export const DEMO_PASSWORD = "holland";
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

// Common passwords long enough to pass the length rule (breach lists, keyboard runs, our own names), lowercased.
const COMMON = new Set([
  "0123456789", "1234567890", "0987654321", "12345678910", "1234567891", "123456789a", "a123456789", "1111111111",
  "0000000000", "1q2w3e4r5t", "1qaz2wsx3edc", "123qweasdzxc", "qwertyuiop", "qwerty1234", "qwerty12345", "qwerty123456",
  "asdfghjkl1", "zxcvbnm123", "abcdefghij", "abc1234567", "abcd123456", "password12", "password123", "password1234",
  "password12345", "password!1", "passw0rd123", "p@ssw0rd123", "p@ssword123", "iloveyou12", "iloveyou123", "princess123",
  "sunshine123", "football123", "baseball123", "letmein123", "welcome123", "welcome1234", "changeme123", "administrator",
  "admin12345", "monkey12345", "dragon12345", "superman123", "trustno1234", "herbalholland", "herbalholland1",
  "herbalholland123", "holland123", "holland1234", "cannabis420", "southafrica", "johannesburg", "capetown123",
]);

/** Why a password can't be used, or null when it's fine. */
export function passwordProblem(pw: string, who: { email?: string | null; name?: string | null } = {}): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) return "That's one of the most common passwords — choose something harder to guess.";
  const local = who.email?.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && lower.includes(local)) return "Leave the email address out of the password.";
  const names = (who.name ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
  if (names.some((w) => lower.includes(w))) return "Leave names out of the password.";
  return null;
}
