// Starter staff for the retail stores, so a till can be paired and members signed up from day one: per store a
// manager (back-office login with a temporary password, to pair tills and run the store) and a member advisor, each
// with a random 4-digit PIN that passes the back office's rules. Placeholders: the owner renames them, or adds the real
// team in the back office (Team) and switches these off. Safe to run again: a store that has them is left as is.
// The PINs and passwords are printed once, never stored in clear; share them in person.
//   CLOUDFLARE_D1_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_DATABASE_ID=… npx tsx scripts/store-staff.ts
import "dotenv/config";
import { randomInt } from "node:crypto";
import { scriptDb, describeDb } from "./_d1";
import { audit, SYSTEM } from "@/server/audit";
import { hashSecret } from "@/server/crypto";
import { temporaryPassword, tempPasswordUntil } from "@/server/passwords";
import { weakPin } from "@/server/store/rules";

const STORES = ["DBN01", "PMB01", "HIL01", "HLT01"];

function pin(taken: Set<string>) {
  for (;;) {
    const p = String(randomInt(10_000)).padStart(4, "0");
    if (!weakPin(p) && !taken.has(p)) return taken.add(p), p;
  }
}

async function main() {
  const db = await scriptDb();
  console.log(`Database: ${describeDb()}\n`);
  const out: string[] = [];
  for (const code of STORES) {
    const store = await db.store.findUnique({ where: { code }, select: { id: true, name: true, slug: true, companyId: true } });
    if (!store) { console.log(`${code}: not found`); continue; }
    const email = `${store.slug}.manager@herbalholland.com`;
    if (await db.user.findFirst({ where: { OR: [{ email }, { storeId: store.id, name: `${store.name} Advisor` }] } })) {
      console.log(`${code}: starter staff already there, left as is`);
      continue;
    }
    const pins = new Set<string>();
    const password = temporaryPassword();
    const people = [
      { name: `${store.name} Manager`, role: "MANAGER" as const, email, password, pin: pin(pins) },
      { name: `${store.name} Advisor`, role: "BUDTENDER" as const, email: null, password: null, pin: pin(pins) },
    ];
    for (const p of people) {
      const u = await db.user.create({
        data: {
          name: p.name,
          role: p.role,
          storeId: store.id,
          companyId: store.companyId,
          pinHash: await hashSecret(p.pin),
          email: p.email,
          passwordHash: p.password ? await hashSecret(p.password) : null,
          mustChangePassword: !!p.password,
          tempPasswordUntil: p.password ? tempPasswordUntil() : null,
        },
      });
      await audit(db, SYSTEM, "staff.create", { storeId: store.id, entity: "User", entityId: u.id, data: { name: p.name, role: p.role, backOffice: !!p.email, via: "scripts/store-staff.ts" } });
      out.push(`${code}  ${p.name.padEnd(28)} PIN ${p.pin}${p.email ? `   back office: ${p.email} / ${p.password}` : ""}`);
    }
  }
  console.log(out.length ? out.join("\n") : "Nothing created.");
}

main().catch((e) => { console.error(e); process.exit(1); });
