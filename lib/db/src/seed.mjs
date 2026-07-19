// Plain ESM seed script — runs directly with node (no tsx needed)
// Usage: node src/seed.mjs
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const SEED_STORES = [
  {
    provider: "seven",
    store_id: "284754",
    store_name: "懷民門市",
    store_address: "新北市板橋區民治街111號",
    store_phone: null,
    city: "新北市",
    district: "板橋區",
    business_hours: "00:00~23:59",
    delivery_status: "正常配送",
    is_active: true,
    source: "manual_seed",
    source_updated_at: new Date(),
  },
  {
    provider: "seven",
    store_id: "190456",
    store_name: "台北車站門市",
    store_address: "台北市中正區忠孝西路一段49號",
    store_phone: null,
    city: "台北市",
    district: "中正區",
    business_hours: "00:00~23:59",
    delivery_status: "正常配送",
    is_active: true,
    source: "manual_seed",
    source_updated_at: new Date(),
  },
  {
    provider: "seven",
    store_id: "256123",
    store_name: "信義微風門市",
    store_address: "台北市信義區松仁路100號",
    store_phone: null,
    city: "台北市",
    district: "信義區",
    business_hours: "07:00~23:00",
    delivery_status: "正常配送",
    is_active: true,
    source: "manual_seed",
    source_updated_at: new Date(),
  },
];

async function seed() {
  console.log("Seeding cvs_stores...");
  for (const store of SEED_STORES) {
    await pool.query(
      `INSERT INTO cvs_stores
        (provider, store_id, store_name, store_address, store_phone, city, district, business_hours, delivery_status, is_active, source, source_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (provider, store_id) DO UPDATE SET
         store_name = EXCLUDED.store_name,
         store_address = EXCLUDED.store_address,
         store_phone = EXCLUDED.store_phone,
         city = EXCLUDED.city,
         district = EXCLUDED.district,
         business_hours = EXCLUDED.business_hours,
         delivery_status = EXCLUDED.delivery_status,
         source = EXCLUDED.source,
         source_updated_at = EXCLUDED.source_updated_at,
         updated_at = now()`,
      [
        store.provider,
        store.store_id,
        store.store_name,
        store.store_address,
        store.store_phone,
        store.city,
        store.district,
        store.business_hours,
        store.delivery_status,
        store.is_active,
        store.source,
        store.source_updated_at,
      ],
    );
    console.log(`  Upserted: ${store.store_name} (${store.store_id})`);
  }
  console.log("Done.");
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
