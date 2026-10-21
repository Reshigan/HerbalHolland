// The launch network on a live database (RUNBOOK → First deploy, step 7): the KwaZulu-Natal region, the Durban
// distribution centre and the first four stores, owned by the franchisor until each franchisee's company is set up in
// HQ → Stores → the store → Owner. Pietermaritzburg and the Bluff trade; Hillcrest and Hilton open on 1 December 2026.
// Idempotent: a store that already exists (by code) is left exactly as HQ has it. Fill in street addresses, phones,
// hours and licences in HQ → Stores afterwards.
//   DATABASE_URL=file:… npx tsx scripts/launch-network.ts
// Against the live D1: set CLOUDFLARE_D1_TOKEN, CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_DATABASE_ID instead (scripts/_d1.ts).
import "dotenv/config";
import { scriptDb } from "./_d1";
import { audit, SYSTEM } from "@/server/audit";

const OPENS = new Date("2026-12-01T07:00:00+02:00");
const STORES = [
  { code: "PMB01", slug: "pietermaritzburg", name: "Pietermaritzburg", suburb: "Central", city: "Pietermaritzburg", postalCode: "3201", lat: -29.6, lng: 30.3789, open: true },
  { code: "DBN01", slug: "bluff", name: "Bluff", suburb: "Bluff", city: "Durban", postalCode: "4052", lat: -29.9303, lng: 31.0145, open: true },
  { code: "HIL01", slug: "hillcrest", name: "Hillcrest", suburb: "", city: "Hillcrest", postalCode: "3610", lat: -29.781, lng: 30.7596, open: false },
  { code: "HLT01", slug: "hilton", name: "Hilton", suburb: "", city: "Hilton", postalCode: "3245", lat: -29.5522, lng: 30.3017, open: false },
];

async function main() {
  const db = await scriptDb();
  const hq = await db.company.findFirst({ where: { kind: "FRANCHISOR" } });
  if (!hq) throw new Error("No franchisor company yet: run scripts/create-admin.ts first.");
  const region = await db.region.upsert({ where: { code: "KZN" }, update: {}, create: { code: "KZN", name: "KwaZulu-Natal" } });
  const dc = await db.store.upsert({
    where: { code: "DC-KZN" }, update: {},
    create: { code: "DC-KZN", slug: "dc-durban", name: "Durban Distribution Centre", kind: "WAREHOUSE", companyId: hq.id, regionId: region.id, addressLine: "", suburb: "Pinetown", city: "Durban", province: "KZN", postalCode: "3610", clickCollect: false, openedAt: new Date() },
  });
  for (const s of STORES) {
    if (await db.store.findUnique({ where: { code: s.code } })) { console.log(`${s.name}: already there, left as is`); continue; }
    const { open, ...rest } = s;
    const st = await db.store.create({
      data: { ...rest, kind: "RETAIL", status: open ? "ACTIVE" : "OPENING_SOON", format: "STANDARD", companyId: hq.id, regionId: region.id, dcId: dc.id, addressLine: "", province: "KZN", clickCollect: open, openedAt: open ? new Date() : OPENS },
    });
    await audit(db, SYSTEM, "store.create", { entity: "Store", entityId: st.id, storeId: st.id, data: { code: s.code, status: st.status, via: "scripts/launch-network.ts" } });
    console.log(`${s.name}: ${open ? "trading" : "opening 1 December 2026"}`);
  }
  console.log("Next: HQ → Stores: each store's street address, phone, WhatsApp, hours, licences and owner.");
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(async () => (await scriptDb()).$disconnect());
