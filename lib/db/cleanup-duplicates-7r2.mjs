import pg from "pg";
const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, p=[]) => pool.query(sql, p).then(r => r.rows);

const COLS = `store_id, provider, store_name, store_address, city, district,
  latitude, longitude, store_phone, business_hours, source,
  source_updated_at, created_at, updated_at, is_active`;

async function main() {
  // === PHASE 1: pre-flight SELECT ===
  console.log("=== PHASE 1: 停用候選 + 保留對應組 ===\n");

  const candidates = ["294234","293264","293312","292951"];

  for (const sid of candidates) {
    // fetch the candidate row
    const [cand] = await q(`SELECT ${COLS} FROM cvs_stores WHERE store_id=$1 AND provider='seven'`, [sid]);
    if (!cand) { console.log(`[${sid}] 找不到\n`); continue; }

    // fetch all rows with same store_name + store_address
    const dupes = await q(
      `SELECT ${COLS} FROM cvs_stores
       WHERE provider='seven' AND store_name=$1 AND store_address=$2
       ORDER BY store_id`,
      [cand.store_name, cand.store_address]
    );

    console.log(`--- store_name: ${cand.store_name} ---`);
    for (const row of dupes) {
      const tag = candidates.includes(String(row.store_id)) ? "【停用】" : "【保留】";
      console.log(`  ${tag} store_id=${row.store_id}`);
      for (const [k, v] of Object.entries(row)) {
        console.log(`    ${k.padEnd(18)}: ${v}`);
      }
      console.log();
    }
  }

  // === PHASE 2: counts before ===
  const [{ before }] = await q(`SELECT COUNT(*) AS before FROM cvs_stores WHERE provider='seven' AND is_active=true`);
  const [{ before_inactive }] = await q(`SELECT COUNT(*) AS before_inactive FROM cvs_stores WHERE provider='seven' AND is_active=false`);
  console.log(`\n=== PHASE 2: UPDATE 前 ===`);
  console.log(`  active   : ${before}`);
  console.log(`  inactive : ${before_inactive}`);

  // === PHASE 3: EXECUTE UPDATE ===
  console.log(`\n=== PHASE 3: 執行 UPDATE ===`);
  const result = await pool.query(
    `UPDATE cvs_stores SET is_active=false, updated_at=now()
     WHERE provider='seven' AND store_id = ANY($1::text[])
     RETURNING store_id, store_name`,
    [candidates]
  );
  console.log(`  已停用 ${result.rowCount} 筆：`);
  for (const r of result.rows) console.log(`    store_id=${r.store_id}  ${r.store_name}`);

  // === PHASE 4: post-checks ===
  console.log(`\n=== PHASE 4: UPDATE 後驗證 ===`);

  const [{ after }] = await q(`SELECT COUNT(*) AS after FROM cvs_stores WHERE provider='seven' AND is_active=true`);
  const [{ after_inactive }] = await q(`SELECT COUNT(*) AS after_inactive FROM cvs_stores WHERE provider='seven' AND is_active=false`);
  console.log(`  active   : ${after}  (before=${before}, diff=${parseInt(before)-parseInt(after)})`);
  console.log(`  inactive : ${after_inactive}  (before=${before_inactive}, diff=${parseInt(after_inactive)-parseInt(before_inactive)})`);

  // store_id duplicate
  const idDupes = await q(`
    SELECT store_id, COUNT(*) AS cnt FROM cvs_stores
    WHERE provider='seven' AND is_active=true
    GROUP BY store_id HAVING COUNT(*)>1`);
  console.log(`  store_id 重複     : ${idDupes.length} 組`);

  // name+address duplicate
  const addrDupes = await q(`
    SELECT store_name, store_address, COUNT(*) AS cnt FROM cvs_stores
    WHERE provider='seven' AND is_active=true
    GROUP BY store_name, store_address HAVING COUNT(*)>1`);
  console.log(`  name+addr 重複    : ${addrDupes.length} 組`);
  if (addrDupes.length) addrDupes.forEach(r => console.log(`    ${r.store_name} / ${r.store_address}`));

  // city anomaly
  const cityAnomaly = await q(`
    SELECT city, COUNT(*) AS cnt FROM cvs_stores
    WHERE provider='seven' AND is_active=true
    AND city NOT IN (
      '台北市','新北市','基隆市','桃園市','新竹市','新竹縣',
      '苗栗縣','台中市','彰化縣','南投縣','雲林縣',
      '嘉義市','嘉義縣','台南市','高雄市','屏東縣',
      '宜蘭縣','花蓮縣','台東縣','澎湖縣','金門縣','連江縣'
    )
    GROUP BY city`);
  console.log(`  city 異常         : ${cityAnomaly.length} 筆`);
  if (cityAnomaly.length) cityAnomaly.forEach(r => console.log(`    ${r.city} (${r.cnt})`));

  // coordinate anomaly (excl. Kinmen ~118.x)
  const coordAnomaly = await q(`
    SELECT store_id, store_name, city, latitude, longitude FROM cvs_stores
    WHERE provider='seven' AND is_active=true
    AND latitude IS NOT NULL AND longitude IS NOT NULL
    AND NOT (
      latitude BETWEEN 21.5 AND 26.5
      AND (longitude BETWEEN 119.0 AND 122.5 OR longitude BETWEEN 118.0 AND 119.0)
    )`);
  console.log(`  座標異常          : ${coordAnomaly.length} 筆`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
