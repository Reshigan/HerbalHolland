// The first HQ administrator on a new database (RUNBOOK → First deploy, step 5): a temporary password they replace at
// first sign-in, as HQ → Team does. Creates the franchisor company when there is none yet (--company sets its legal
// name; the rest is filled in on a store it owns, the distribution centre: HQ → Stores → the DC → Owner). Everyone
// after that is added from HQ → Team.
//   DATABASE_URL=file:… npx tsx scripts/create-admin.ts --email you@herbalholland.com --name "Your Name"
// Against the live D1: set CLOUDFLARE_D1_TOKEN, CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_DATABASE_ID instead (scripts/_d1.ts).
import "dotenv/config";
import { parseArgs } from "node:util";
import { scriptDb } from "./_d1";
import { audit, SYSTEM } from "@/server/audit";
import { hashSecret } from "@/server/crypto";
import { temporaryPassword, tempPasswordUntil, TEMP_PASSWORD_HOURS } from "@/server/passwords";
import { FALLBACK_LEGAL_NAME } from "@/lib/contact";

const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" }, company: { type: "string", default: FALLBACK_LEGAL_NAME } } });
const email = values.email?.trim().toLowerCase() ?? "";
const name = values.name?.trim().replace(/\s+/g, " ") ?? "";

async function main() {
  const db = await scriptDb();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2) throw new Error('Usage: scripts/create-admin.ts --email you@herbalholland.com --name "Your Name"');
  if (await db.user.count({ where: { email } })) throw new Error(`${email} already has an account. Reset its password from HQ → Team instead.`);
  const legalName = values.company!.trim();
  const hq =
    (await db.company.findFirst({ where: { kind: "FRANCHISOR" } })) ??
    (await db.company.create({ data: { kind: "FRANCHISOR", name: legalName.replace(/\s*\((pty|proprietary)\)\s*ltd\.?$/i, ""), legalName } }));
  const password = temporaryPassword();
  const u = await db.user.create({
    data: { name, email, role: "HQ_ADMIN", companyId: hq.id, passwordHash: await hashSecret(password), mustChangePassword: true, tempPasswordUntil: tempPasswordUntil() },
  });
  await audit(db, SYSTEM, "user.create", { entity: "User", entityId: u.id, data: { email, role: "HQ_ADMIN", via: "scripts/create-admin.ts" } });
  console.log(`HQ administrator ${name} <${email}> created.\nTemporary password (shown once, works for ${TEMP_PASSWORD_HOURS} hours): ${password}\nSign in at /login and choose a new password.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => (await scriptDb()).$disconnect());
