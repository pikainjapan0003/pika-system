import pg from "pg";
const { Pool } = pg;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

const duplicateNames = ["英順門市", "利興門市", "正鎰門市", "樂湖門市"];

async function main() {
  console.log("=== Step 7R 重複門市詳細查詢 ===\n");

  for (const name of duplicateNames) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`門市名稱：${name}`);
    console.log("=".repeat(60));

    const rows = await query(
      `SELECT 
        store_id,
        provider,
        store_name,
        store_address,
        city,
        district,
        latitude,
        longitude,
        store_phone,
        business_hours,
        source,
        source_updated_at,
        created_at,
        updated_at,
        is_active
      FROM cvs_stores
      WHERE provider='seven' AND store_name=$1
      ORDER BY store_id`,
      [name]
    );

    console.log(`筆數：${rows.length}`);
    for (const [i, row] of rows.entries()) {
      console.log(`\n  [${i + 1}]`);
      for (const [k, v] of Object.entries(row)) {
        console.log(`    ${k.padEnd(20)}: ${v}`);
      }
    }
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
