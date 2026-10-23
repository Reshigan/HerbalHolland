// The premises each new store signed for, from its lease (Part A: the shop, the centre, the street address and the
// centre's trading hours). Fills only what's still empty, so whatever HQ → Stores has typed since stays.
//   DATABASE_URL=file:… npx tsx scripts/store-premises.ts
//   CLOUDFLARE_D1_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_DATABASE_ID=… npx tsx scripts/store-premises.ts
import "dotenv/config";
import { scriptDb, describeDb } from "./_d1";
import { audit, SYSTEM } from "@/server/audit";
import type { Hours } from "@/server/shop/hours";

const week = (weekday: [string, string], sat: [string, string], sun: [string, string]): Hours => ({ mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat, sun });

// `seed`: what the launch scaffold put there (a stand-in suburb, the town-centre point from the site's facts). Those exact
// values are replaced; anything HQ has typed or geocoded since is not. The town-centre point is cleared rather than kept,
// because "Directions" prefers coordinates and would send people to the town centre instead of searching the street address.
type Seed = { suburb?: string; pin?: [number, number] };
const PREMISES: { code: string; addressLine: string; suburb: string; city: string; postalCode: string; hours: Hours | null; seed?: Seed }[] = [
  // Lease: Shop 14, The Hilton Village Centre, Lot 1066 Hilton, Hilton Avenue. The centre lists Mon–Fri 08h00–10h00 (a slip in
  // the lease; weekday closing time taken as 17:00 until HQ confirms), Sat 08h00–13h00, Sun 09h00–13h00.
  { code: "HLT01", addressLine: "Shop 14, Hilton Village Centre, Hilton Avenue", suburb: "Hilton", city: "Hilton", postalCode: "3245", hours: week(["08:00", "17:00"], ["08:00", "13:00"], ["09:00", "13:00"]) },
  // Lease: Shop 10B, Christians Village Shopping Centre, cnr Old Main Road and Inanda Road, Hillcrest. Centre hours Mon–Fri
  // 09h00–21h00, Sat/Sun/public holidays 09h00–22h00.
  { code: "HIL01", addressLine: "Shop 10B, Christians Village Shopping Centre, cnr Old Main Road and Inanda Road", suburb: "Hillcrest", city: "Hillcrest", postalCode: "3610", hours: week(["09:00", "21:00"], ["09:00", "22:00"], ["09:00", "22:00"]) },
  // The Bluff store (owner's address, 23 Oct 2026); hours still to come from the store.
  { code: "DBN01", addressLine: "208 Tara Road", suburb: "Bluff", city: "Durban", postalCode: "4052", hours: null, seed: { pin: [-29.9303, 31.0145] } },
  // The Pietermaritzburg store (owner's address, 23 Oct 2026); hours still to come from the store.
  { code: "PMB01", addressLine: "575 Chota Motala Road", suburb: "Raisethorpe", city: "Pietermaritzburg", postalCode: "3201", hours: null, seed: { suburb: "Central", pin: [-29.6, 30.3789] } },
];

async function main() {
  const db = await scriptDb();
  console.log(`Store premises on ${describeDb()}`);
  for (const p of PREMISES) {
    const st = await db.store.findUnique({ where: { code: p.code }, select: { id: true, addressLine: true, suburb: true, city: true, postalCode: true, hours: true, lat: true, lng: true } });
    if (!st) { console.log(`${p.code}: not there yet (scripts/launch-network.ts first)`); continue; }
    // Each field on its own: only what's still blank is filled, so a correction HQ made to any one of them stays.
    const data: Record<string, unknown> = {};
    for (const k of ["addressLine", "suburb", "city", "postalCode"] as const) if (!st[k] || (k === "suburb" && st[k] === p.seed?.suburb)) data[k] = p[k];
    if (st.hours == null && p.hours) data.hours = p.hours;
    if (p.seed?.pin && st.lat === p.seed.pin[0] && st.lng === p.seed.pin[1]) Object.assign(data, { lat: null, lng: null });
    if (!Object.keys(data).length) { console.log(`${p.code}: already filled in, left as is`); continue; }
    await db.store.update({ where: { id: st.id }, data });
    await audit(db, SYSTEM, "store.update", { entity: "Store", entityId: st.id, storeId: st.id, data: { fields: Object.keys(data), via: "scripts/store-premises.ts" } });
    console.log(`${p.code}: ${Object.keys(data).join(", ")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
