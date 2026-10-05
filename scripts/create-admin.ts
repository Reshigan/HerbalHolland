// The first HQ administrator on a new database (RUNBOOK → First deploy, step 5): a temporary password they replace at
// first sign-in, as HQ → Team does. Creates the franchisor company when there is none yet (HQ → Settings → Company
// fills in its details). Everyone after that is added from HQ → Team.
//   DATABASE_URL=postgresql://… npx tsx scripts/create-admin.ts --email you@herbalholland.co.za --name "Your Name"
import "dotenv/config";
import { parseArgs } from "node:util";
import { db } from "@/server/db";
import { audit, SYSTEM } from "@/server/audit";
import { hashSecret } from "@/server/crypto";
import { temporaryPassword, tempPasswordUntil, TEMP_PASSWORD_HOURS } from "@/server/passwords";

const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" }, company: { type: "string", default: "Herbal Holland (Pty) Ltd" } } });
const email = values.email?.trim().toLowerCase() ?? "";
const name = values.name?.trim().replace(/\s+/g, " ") ?? "";

async function main() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2) throw new Error('Usage: scripts/create-admin.ts --email you@herbalholland.co.za --name "Your Name"');
  if (await db.user.count({ where: { email } })) throw new Error(`${email} already has an account — reset its password from HQ → Team instead`);
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
  .finally(() => db.$disconnect());
