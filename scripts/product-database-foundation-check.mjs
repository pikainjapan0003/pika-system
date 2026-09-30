import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const require = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Client } = require("pg");
const { getTableConfig } = require("drizzle-orm/pg-core");
export const FOUNDATION_TABLES = [
  "international_shipping_profiles",
  "pricing_templates",
  "store_pricing_settings",
  "catalog_products",
  "catalog_product_aliases",
  "product_cost_records",
  "shopee_price_observations",
  "product_relationships",
  "listing_pricing_snapshots",
  "listing_current_pricing_snapshots",
  "order_items",
  "order_completion_events",
  "sheet_import_batches",
  "sheet_import_rows"
];
const CONTAINER = "3ed1e52eb60654c2fea2fa81cf40f6a2ead16138037edba860abadebb4f5ea9d";
const migration = new URL("../lib/db/migrations/0041_product_database_foundation.sql", import.meta.url);
const rollback = new URL("../lib/db/migrations/rollback/0041_product_database_foundation.sql", import.meta.url);

export function validateTarget(url, marker) {
  assert.equal(marker, "DB-BUILD-01", "explicit disposable opt-in required");
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "postgresql:");
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.pathname, "/pika_phase0");
  assert.equal(parsed.username, "pika_phase0");
  assert.equal(parsed.search, "", "connection query overrides forbidden");
  assert.ok(parsed.port);
  const [container] = JSON.parse(execFileSync("docker", ["inspect", CONTAINER], { encoding: "utf8", timeout: 30000, windowsHide: true }));
  assert.equal(container.Id, CONTAINER);
  assert.equal(container.Config.Labels["pika.task"], "DB-BUILD-01");
  assert.equal(container.Config.Labels["pika.phase"], "phase0");
  assert.equal(container.State.Running, true);
  assert.ok(container.NetworkSettings.Ports["5432/tcp"].some(p => p.HostIp === "127.0.0.1" && p.HostPort === parsed.port));
  return parsed.toString();
}

export async function runFoundation({ url, marker, log = () => {} }) {
  const connectionString = validateTarget(url, marker);
  const db = new Client({ connectionString, ssl: false, connectionTimeoutMillis: 10000, statement_timeout: 20000 });
  const report = { passed: [], schemaColumns: 0, schemaForeignKeys: 0 };
  const pass = label => { report.passed.push(label); log("PASS " + label); };
  await db.connect();
  let fixtureId;
  async function q(sql, params) { return db.query(sql, params); }
  async function expectError(label, sql, code = "23514", params) {
    await q("SAVEPOINT negative_case");
    try {
      await assert.rejects(q(sql, params), error => error.code === code, label);
    } finally {
      await q("ROLLBACK TO SAVEPOINT negative_case");
      await q("RELEASE SAVEPOINT negative_case");
    }
    pass(label);
  }
  const beforeRows = async () => (await q(`
    SELECT 'products' entity, id, to_jsonb(p) - 'catalog_product_id' body FROM products p
    UNION ALL SELECT 'orders', id, to_jsonb(o) FROM orders o
    UNION ALL SELECT 'stores', id, to_jsonb(s) FROM stores s
    UNION ALL SELECT 'customers', id, to_jsonb(c) FROM customers c
    ORDER BY entity,id`)).rows;
  async function assertTables() {
    const found = (await q("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1) ORDER BY tablename", [FOUNDATION_TABLES])).rows.map(r => r.tablename);
    assert.deepEqual(found, [...FOUNDATION_TABLES].sort());
  }
  async function compareSchema() {
    const schema = await import("../lib/db/src/schema/index.ts");
    const configs = Object.values(schema).filter(v => v && typeof v === "object").flatMap(v => {
      try { const config = getTableConfig(v); return FOUNDATION_TABLES.includes(config.name) ? [config] : []; } catch { return []; }
    });
    assert.equal(configs.length, 14);
    for (const config of configs) {
      const actual = (await q("SELECT a.attname name, format_type(a.atttypid,a.atttypmod) type, a.attnotnull required FROM pg_attribute a WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum", [config.name])).rows;
      assert.equal(actual.length, config.columns.length, config.name);
      for (const col of config.columns) {
        const row = actual.find(r => r.name === col.name);
        assert.ok(row, config.name + "." + col.name);
        const normalize = s => s.toLowerCase().replaceAll(" ", "").replace(/^serial$/, "integer");
        assert.equal(normalize(row.type), normalize(col.getSQLType()), config.name + "." + col.name);
        assert.equal(row.required, col.notNull, config.name + "." + col.name);
        report.schemaColumns++;
      }
      const actualFks = (await q(`
        SELECT con.conname name, rel.relname target,
          ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(n,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.n ORDER BY k.ord) cols,
          ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(n,ord) JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.n ORDER BY k.ord) refs,
          con.confdeltype delete_action
        FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.confrelid
        WHERE con.conrelid=$1::regclass AND con.contype='f'`, [config.name])).rows;
      for (const fk of config.foreignKeys) {
        const ref = fk.reference(), actual = actualFks.find(r => r.name === fk.getName());
        assert.ok(actual, fk.getName());
        assert.deepEqual(actual.cols, ref.columns.map(c => c.name));
        assert.deepEqual(actual.refs, ref.foreignColumns.map(c => c.name));
        assert.equal(actual.target, getTableConfig(ref.foreignTable).name);
        assert.equal(actual.delete_action, { restrict: "r", "set null": "n", cascade: "c", "no action": "a" }[fk.onDelete]);
        report.schemaForeignKeys++;
      }
      const checks = (await q("SELECT conname FROM pg_constraint WHERE conrelid=$1::regclass AND contype='c'", [config.name])).rows.map(r=>r.conname);
      for (const check of config.checks) assert.ok(checks.includes(check.name), check.name);
    }
    const supplemental = (await q("SELECT conname, pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname=ANY($1)", [["pdb_catalog_category_tenant_fk","pdb_catalog_route_tenant_fk","pdb_categories_store_id_key","pdb_routes_store_id_key"]])).rows;
    assert.equal(supplemental.length, 4);
    assert.match(supplemental.find(r=>r.conname==="pdb_catalog_category_tenant_fk").definition, /ON DELETE SET NULL \(category_id\)/);
    assert.match(supplemental.find(r=>r.conname==="pdb_catalog_route_tenant_fk").definition, /ON DELETE SET NULL \(last_used_trip_route_id\)/);
    const triggers = (await q("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname=ANY($1)", [["pdb_listing_immutable","pdb_completion_immutable","pdb_cost_immutable"]])).rows;
    assert.equal(triggers.length, 3);
    pass("all 219 columns/types/nullability and declared FKs match SQL; SQL-only guards installed");
  }
  try {
    const identity = (await q("SELECT current_database() db,current_user usr")).rows[0];
    assert.deepEqual(identity, { db: "pika_phase0", usr: "pika_phase0" });
    const baseline = await beforeRows();
    assert.equal((await q("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1)", [FOUNDATION_TABLES])).rows[0].n, 0, "start from old schema only");
    const up = await readFile(migration, "utf8"), down = await readFile(rollback, "utf8");
    await q(up); await assertTables(); pass("up on retained legacy fixture");
    try { await assert.rejects(q(up), e => ["42P07","42710","42701"].includes(e.code)); } finally { await q("ROLLBACK"); }
    await assertTables(); pass("repeat up refuses atomically");
    await compareSchema();
    assert.deepEqual(await beforeRows(), baseline); pass("up preserves every legacy fixture column");

    await q("BEGIN");
    const sid = (await q("INSERT INTO stores(merchant_id,name,slug) VALUES('pdb-checker','synthetic checker', $1) RETURNING id", ["pdb-checker-"+Date.now()])).rows[0].id;
    const other = (await q("INSERT INTO stores(merchant_id,name,slug) VALUES('pdb-other','synthetic other', $1) RETURNING id", ["pdb-other-"+Date.now()])).rows[0].id;
    const cat = async (s, name="Synthetic", barcode="001234", status="REAL") => (await q("INSERT INTO catalog_products(store_id,name,normalized_name,barcode,barcode_status,weight_grams) VALUES($1,$2,$2,$3,$4,12.34) RETURNING id", [s,name,barcode,status])).rows[0].id;
    const a=await cat(sid), b=await cat(sid), foreign=await cat(other), none=await cat(sid,"No barcode","0","NONE");
    const cascadeStore=(await q("INSERT INTO stores(merchant_id,name,slug) VALUES('pdb-cascade','synthetic cascade only',$1) RETURNING id",["pdb-cascade-"+Date.now()])).rows[0].id;
    const cascadeCatalog=await cat(cascadeStore);
    await q("DELETE FROM stores WHERE id=$1",[cascadeStore]);
    assert.equal((await q("SELECT count(*)::int n FROM catalog_products WHERE id=$1",[cascadeCatalog])).rows[0].n,0);
    pass("store deletion cascades an unreferenced catalog per source section 8.1");
    assert.ok(a !== b && none); pass("duplicate real barcodes and NONE remain independent catalogs");
    await expectError("invalid NONE barcode","INSERT INTO catalog_products(store_id,name,normalized_name,barcode,barcode_status,weight_grams) VALUES($1,'x','x','123','NONE',1)","23514",[sid]);
    await expectError("invalid REAL barcode","INSERT INTO catalog_products(store_id,name,normalized_name,barcode,barcode_status,weight_grams) VALUES($1,'x','x','0','REAL',1)","23514",[sid]);
    for (const value of ["-1","NaN"]) await expectError("invalid weight "+value,"UPDATE catalog_products SET weight_grams=$1 WHERE id=$2","23514",[value,a]);
    await expectError("alias cross store","INSERT INTO catalog_product_aliases(store_id,catalog_product_id,alias,normalized_alias,source) VALUES($1,$2,'x','x','MANUAL')","23503",[other,a]);
    await q("INSERT INTO catalog_product_aliases(store_id,catalog_product_id,alias,normalized_alias,source) VALUES($1,$2,'x','x','MANUAL'),($1,$3,'x','x','MANUAL')",[sid,a,b]);
    await expectError("alias duplicate in same catalog","INSERT INTO catalog_product_aliases(store_id,catalog_product_id,alias,normalized_alias,source) VALUES($1,$2,'X','x','MANUAL')","23505",[sid,a]);
    await expectError("observation cross store","INSERT INTO shopee_price_observations(store_id,catalog_product_id,price_twd,source) VALUES($1,$2,1,'MANUAL')","23503",[other,a]);

    const shipping=(await q("INSERT INTO international_shipping_profiles(store_id,code,name,rate_twd,basis_weight_grams) VALUES($1,'AIR','Air',220,1000) RETURNING id",[sid])).rows[0].id;
    await expectError("template shipping cross store","INSERT INTO pricing_templates(store_id,code,name,cost_adjustment_mode,cost_adjustment_rate,department_store_fee_rate,default_shipping_profile_id) VALUES($1,'GENERAL','general','NONE',1,0,$2)","23503",[other,shipping]);
    const template=(await q("INSERT INTO pricing_templates(store_id,code,name,cost_adjustment_mode,cost_adjustment_rate,department_store_fee_rate,default_shipping_profile_id) VALUES($1,'PERFUME','perfume','RATE',.915,.0155,$2) RETURNING id",[sid,shipping])).rows[0].id;
    await expectError("catalog template cross store","UPDATE catalog_products SET default_pricing_template_id=$1 WHERE id=$2","23503",[template,foreign]);
    await expectError("catalog shipping cross store","UPDATE catalog_products SET default_shipping_profile_id=$1 WHERE id=$2","23503",[shipping,foreign]);
    for(const value of ["0","-1","NaN"])await expectError("shipping basis "+value,"UPDATE international_shipping_profiles SET basis_weight_grams=$1 WHERE id=$2","23514",[value,shipping]);
    await q("INSERT INTO store_pricing_settings(store_id) VALUES($1)",[sid]);
    const defaults=(await q("SELECT target_margin_rate::text,loss_protection_twd::text,purchase_payment_fee_rate::text,route_payment_fee_rate::text,stale_sale_days,profit_loss_max_twd::text,profit_low_max_twd::text,profit_medium_max_twd::text,settings_version FROM store_pricing_settings WHERE store_id=$1",[sid])).rows[0];
    assert.deepEqual(Object.values(defaults),["0.350000000000","5.000000000000","0.015000000000","0.015000000000",180,"25.000000000000","50.000000000000","100.000000000000","v1"]); pass("SQL settings defaults match approved fixed values");
    const { PRODUCT_DATABASE_SYSTEM_DEFAULTS } = await import("../lib/db/src/schema/productDatabasePricing.ts");
    assert.deepEqual(PRODUCT_DATABASE_SYSTEM_DEFAULTS.templates.map(t=>[t.code,t.costAdjustmentRate,t.departmentStoreFeeRate,t.shippingCode]),[["GENERAL","1","0","GENERAL_AIR"],["LIVE","1","0","GENERAL_AIR"],["PERFUME","0.915","0.0155","TIGERAIR_BAGGAGE"]]);
    assert.deepEqual(PRODUCT_DATABASE_SYSTEM_DEFAULTS.shipping.map(p=>[p.code,p.rateTwd,p.basisWeightGrams]),[["GENERAL_AIR","220","1000"],["TIGERAIR_BAGGAGE","1050","20000"]]); pass("system definitions preserve .915 and exact shipping bases");
    for(const value of ["1","NaN","-1"])await expectError("margin "+value,"UPDATE store_pricing_settings SET target_margin_rate=$1 WHERE store_id=$2","23514",[value,sid]);
    await expectError("threshold ordering","UPDATE store_pricing_settings SET profit_low_max_twd=101 WHERE store_id=$1","23514",[sid]);
    await q("INSERT INTO store_pricing_settings(store_id,profit_loss_max_twd,profit_low_max_twd,profit_medium_max_twd) VALUES($1,-10,0,50)",[other]);
    assert.deepEqual(Object.values((await q("SELECT profit_loss_max_twd::text,profit_low_max_twd::text,profit_medium_max_twd::text FROM store_pricing_settings WHERE store_id=$1",[other])).rows[0]),["-10.000000000000","0.000000000000","50.000000000000"]);
    pass("ordered signed profit thresholds preserve source section 8.7");
    await expectError("signed threshold ordering","UPDATE store_pricing_settings SET profit_medium_max_twd=-11 WHERE store_id=$1","23514",[other]);
    for(const column of ["profit_loss_max_twd","profit_low_max_twd","profit_medium_max_twd"]) {
      await expectError("threshold NaN "+column,"UPDATE store_pricing_settings SET "+column+"='NaN' WHERE store_id=$1","23514",[other]);
    }

    const category=(await q("INSERT INTO product_categories(store_id,name) VALUES($1,'synthetic category') RETURNING id",[sid])).rows[0].id;
    await expectError("category tenant guard","UPDATE catalog_products SET category_id=$1 WHERE id=$2","23503",[category,foreign]);
    await q("UPDATE catalog_products SET category_id=$1 WHERE id=$2",[category,a]);
    await q("DELETE FROM product_categories WHERE id=$1",[category]);
    assert.deepEqual((await q("SELECT store_id,category_id FROM catalog_products WHERE id=$1",[a])).rows[0],{store_id:sid,category_id:null});
    pass("category deletion clears only optional hint, retains tenant");
    const trip=(await q("INSERT INTO trips(store_id,name) VALUES($1,'synthetic trip') RETURNING id",[sid])).rows[0].id;
    const route=(await q("INSERT INTO trip_routes(store_id,trip_id,area_title,start_place,end_place,est_qty) VALUES($1,$2,'synthetic','a','b',1) RETURNING id",[sid,trip])).rows[0].id;
    const unknownRoute=(await q("INSERT INTO trip_routes(store_id,trip_id,area_title,start_place,end_place,est_qty) VALUES(NULL,$1,'unknown owner','a','b',1) RETURNING id",[trip])).rows[0].id;
    await expectError("Route tenant guard","UPDATE catalog_products SET last_used_trip_route_id=$1 WHERE id=$2","23503",[route,foreign]);
    await expectError("unknown Route owner rejected","UPDATE catalog_products SET last_used_trip_route_id=$1 WHERE id=$2","23503",[unknownRoute,a]);
    await q("UPDATE catalog_products SET last_used_trip_route_id=$1 WHERE id=$2",[route,a]);
    await q("DELETE FROM trip_routes WHERE id=$1",[route]);
    assert.deepEqual((await q("SELECT store_id,last_used_trip_route_id FROM catalog_products WHERE id=$1",[a])).rows[0],{store_id:sid,last_used_trip_route_id:null});
    pass("Route deletion clears only optional hint, retains tenant");

    const cost=(await q("INSERT INTO product_cost_records(store_id,catalog_product_id,original_price_jpy,effective_cost_jpy,adjustment_mode,adjustment_rate,source,is_current) VALUES($1,$2,100,91.5,'RATE',.915,'MANUAL',true) RETURNING id",[sid,a]).catch(async e=>{ throw e; })).rows[0].id;

    await expectError("cost cross store","INSERT INTO product_cost_records(store_id,catalog_product_id,original_price_jpy,effective_cost_jpy,adjustment_mode,source) VALUES($1,$2,1,1,'NONE','MANUAL')","23503",[other,a]);
    await expectError("second active current cost","INSERT INTO product_cost_records(store_id,catalog_product_id,original_price_jpy,effective_cost_jpy,adjustment_mode,source,is_current) VALUES($1,$2,1,1,'NONE','MANUAL',true)","23505",[sid,a]);
    await expectError("cost content immutable","UPDATE product_cost_records SET effective_cost_jpy=0 WHERE id=$1","23514",[cost]);
    await expectError("cost delete immutable","DELETE FROM product_cost_records WHERE id=$1","23514",[cost]);
    await expectError("cost void metadata required","UPDATE product_cost_records SET status='VOIDED',is_current=false WHERE id=$1","23514",[cost]);
    await expectError("cost NaN","INSERT INTO product_cost_records(store_id,catalog_product_id,original_price_jpy,effective_cost_jpy,adjustment_mode,source) VALUES($1,$2,'NaN',1,'NONE','MANUAL')","23514",[sid,a]);
    await expectError("cost supersedes wrong catalog","INSERT INTO product_cost_records(store_id,catalog_product_id,original_price_jpy,effective_cost_jpy,adjustment_mode,source,supersedes_cost_record_id) VALUES($1,$2,1,1,'NONE','MANUAL',$3)","23503",[sid,b,cost]);
    await expectError("cost self supersedes","INSERT INTO product_cost_records(id,store_id,catalog_product_id,original_price_jpy,effective_cost_jpy,adjustment_mode,source,supersedes_cost_record_id) VALUES(-901,$1,$2,1,1,'NONE','MANUAL',-901)","23514",[sid,a]);
    await q("UPDATE product_cost_records SET status='VOIDED',is_current=false,void_reason_code='OTHER',void_reason_text='synthetic correction',voided_by='checker',voided_at=now() WHERE id=$1",[cost]);
    await expectError("voided cost cannot revive","UPDATE product_cost_records SET status='ACTIVE',void_reason_code=NULL,void_reason_text=NULL,voided_by=NULL,voided_at=NULL WHERE id=$1","23514",[cost]);
    await expectError("void metadata immutable","UPDATE product_cost_records SET void_reason_text='changed' WHERE id=$1","23514",[cost]);
    await q("INSERT INTO product_cost_records(store_id,catalog_product_id,original_price_jpy,effective_cost_jpy,adjustment_mode,adjustment_rate,source,is_current,supersedes_cost_record_id) VALUES($1,$2,100,120,'RATE',1.2,'MANUAL',true,$3)",[sid,a,cost]);
    pass("void and replacement append history; surcharge multiplier accepted");

    await q("INSERT INTO product_relationships(store_id,source_catalog_product_id,target_catalog_product_id,relation_type) VALUES($1,$2,$3,'RELATED')",[sid,Math.min(a,b),Math.max(a,b)]);
    await expectError("duplicate unordered pair","INSERT INTO product_relationships(store_id,source_catalog_product_id,target_catalog_product_id,relation_type) VALUES($1,$2,$3,'POSSIBLE_DUPLICATE')","23505",[sid,Math.min(a,b),Math.max(a,b)]);
    await expectError("reverse pair","INSERT INTO product_relationships(store_id,source_catalog_product_id,target_catalog_product_id,relation_type) VALUES($1,$2,$3,'RELATED')","23514",[sid,Math.max(a,b),Math.min(a,b)]);
    await expectError("relationship target cross store","INSERT INTO product_relationships(store_id,source_catalog_product_id,target_catalog_product_id,relation_type) VALUES($1,$2,$3,'RELATED')","23503",[sid,a,foreign]);

    const product=async (s,token)=> (await q("INSERT INTO products(store_id,name,price,share_token) VALUES($1,'synthetic',10,$2) RETURNING id",[s,token])).rows[0].id;
    const p=await product(sid,"pdb-check-"+Date.now()), p2=await product(sid,"pdb-second-"+Date.now()), op=await product(other,"pdb-other-"+Date.now());
    await expectError("product catalog cross store","UPDATE products SET catalog_product_id=$1 WHERE id=$2","23503",[foreign,p]);
    await q("UPDATE products SET catalog_product_id=$1 WHERE id=$2",[a,p]);
    const snapshot=async (store, product)=> (await q("INSERT INTO listing_pricing_snapshots(store_id,product_id,catalog_product_id,general_net_profit_twd,formula_version,settings_version) VALUES($1,$2,$3,-1,'v2','v1') RETURNING id",[store,product,a])).rows[0].id;
    const snap=await snapshot(sid,p), snap2=await snapshot(sid,p2);
    await expectError("snapshot product cross store","INSERT INTO listing_pricing_snapshots(store_id,product_id,formula_version,settings_version) VALUES($1,$2,'v2','v1')","23503",[other,p]);
    await expectError("snapshot catalog cross store","INSERT INTO listing_pricing_snapshots(store_id,product_id,catalog_product_id,formula_version,settings_version) VALUES($1,$2,$3,'v2','v1')","23503",[sid,p,foreign]);
    await q("INSERT INTO listing_current_pricing_snapshots(store_id,product_id,snapshot_id) VALUES($1,$2,$3)",[sid,p,snap]);
    await expectError("current snapshot wrong listing","UPDATE listing_current_pricing_snapshots SET snapshot_id=$1 WHERE product_id=$2","23503",[snap2,p]);
    await expectError("current snapshot cross store","INSERT INTO listing_current_pricing_snapshots(store_id,product_id,snapshot_id) VALUES($1,$2,$3)","23503",[other,op,snap]);
    await expectError("snapshot update rejected","UPDATE listing_pricing_snapshots SET general_final_price_twd=12 WHERE id=$1","23514",[snap]);
    await expectError("snapshot delete rejected","DELETE FROM listing_pricing_snapshots WHERE id=$1","23514",[snap]);
    const fresh=await snapshot(sid,p);
    await q("UPDATE listing_current_pricing_snapshots SET snapshot_id=$1 WHERE product_id=$2",[fresh,p]);
    assert.equal((await q("SELECT general_net_profit_twd::text profit FROM listing_pricing_snapshots WHERE id=$1",[snap])).rows[0].profit,"-1.000000000000"); pass("current pointer changes without rewriting old signed profit");

    const order=(await q("INSERT INTO orders(store_id,product_id,public_token,buyer_name,buyer_phone,pickup_method,unit_price,total_price) VALUES($1,$2,$3,'synthetic','0900000000','other',10,10) RETURNING id",[sid,p,"pdb-order-"+Date.now()])).rows[0].id;
    await expectError("old order product remains required","INSERT INTO orders(store_id,public_token,buyer_name,buyer_phone,pickup_method,unit_price,total_price) VALUES($1,'pdb-null','synthetic','0900000000','other',10,10)","23502",[sid]);
    const itemSql="INSERT INTO order_items(store_id,order_id,catalog_product_id,listing_product_id,product_name_snapshot,quantity,unit_price_twd,subtotal_twd) VALUES($1,$2,$3,$4,'synthetic',2,10.25,20.50)";
    await q(itemSql,[sid,order,null,null]); pass("one-off item retains nullable catalog/listing and exact subtotal");
    await expectError("item order cross store",itemSql,"23503",[other,order,null,null]);
    await expectError("item catalog cross store",itemSql,"23503",[sid,order,foreign,null]);
    await expectError("item listing cross store",itemSql,"23503",[sid,order,null,op]);
    await expectError("item quantity positive","UPDATE order_items SET quantity=0 WHERE order_id=$1","23514",[order]);
    await expectError("item exact subtotal","UPDATE order_items SET subtotal_twd=20.49 WHERE order_id=$1","23514",[order]);
    const tier=(await q("SELECT customer_tier_snapshot,price_source_snapshot,profit_snapshot_status,total_cost_twd_snapshot FROM order_items WHERE order_id=$1",[order])).rows[0];
    assert.deepEqual(Object.values(tier),["UNKNOWN","UNKNOWN","PENDING",null]); pass("unknown historical tier/source and pending cost remain explicit");
    const event=(await q("INSERT INTO order_completion_events(store_id,order_id,event_key,from_status,to_status,occurred_at,completed_at,source) VALUES($1,$2,'event-1','shipped','completed','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','synthetic') RETURNING id",[sid,order])).rows[0].id;
    await expectError("event cross store","INSERT INTO order_completion_events(store_id,order_id,event_key,from_status,to_status,occurred_at,completed_at,source) VALUES($1,$2,'event-2','shipped','completed',now(),now(),'synthetic')","23503",[other,order]);
    await expectError("event idempotency","INSERT INTO order_completion_events(store_id,order_id,event_key,from_status,to_status,occurred_at,completed_at,source) VALUES($1,$2,'event-1','shipped','completed',now(),now(),'synthetic')","23505",[sid,order]);
    await expectError("completion update immutable","UPDATE order_completion_events SET source='edited' WHERE id=$1","23514",[event]);
    await expectError("completion delete immutable","DELETE FROM order_completion_events WHERE id=$1","23514",[event]);

    const batchSql="INSERT INTO sheet_import_batches(store_id,spreadsheet_id,spreadsheet_title,sheet_title,source_hash,requested_by) VALUES($1,'synthetic-sheet','synthetic','one','hash','checker') RETURNING id";
    const batch=(await q(batchSql,[sid])).rows[0].id;
    await expectError("batch idempotence scope",batchSql,"23505",[sid]);
    await q(batchSql,[other]); pass("same source may belong to separate stores");
    const rowSql="INSERT INTO sheet_import_rows(store_id,batch_id,source_row_number,raw_values,raw_formulas,row_hash,row_kind,match_status,matched_catalog_product_id,warnings) VALUES($1,$2,$3,'[]','[]','same-content','PRODUCT','NEW',$4,'[]')";
    await q(rowSql,[sid,batch,1,a]); await q(rowSql,[sid,batch,2,a]); pass("identical row content at different sheet rows is retained");
    await expectError("row number unique in batch",rowSql,"23505",[sid,batch,1,a]);
    await expectError("import batch cross store",rowSql,"23503",[other,batch,3,null]);
    await expectError("import matched catalog cross store",rowSql,"23503",[sid,batch,3,foreign]);
    await q("ROLLBACK");
    assert.deepEqual(await beforeRows(),baseline); pass("constraint transactions leave old fixtures untouched");

    // Durable guard fixture: failed down must preserve both DDL and this row.
    const oldStore=baseline.find(r=>r.entity==="stores").id;
    fixtureId=(await q("INSERT INTO catalog_products(store_id,name,normalized_name,barcode,barcode_status,weight_grams) VALUES($1,'rollback guard','rollback guard','0','NONE',1) RETURNING id",[oldStore])).rows[0].id;
    try { await assert.rejects(q(down),e=>e.code==="23514"); } finally { await q("ROLLBACK"); }
    await assertTables();
    assert.equal((await q("SELECT count(*)::int n FROM catalog_products WHERE id=$1",[fixtureId])).rows[0].n,1);
    pass("nonempty rollback atomically refuses without removing durable fixture");
    await q("DELETE FROM catalog_products WHERE id=$1",[fixtureId]); fixtureId=undefined;
    await q(down);
    assert.equal((await q("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1)",[FOUNDATION_TABLES])).rows[0].n,0);
    assert.deepEqual(await beforeRows(),baseline); pass("empty-new-table down preserves every legacy column");
    await q(up); await assertTables();
    assert.deepEqual(await beforeRows(),baseline); pass("second up preserves legacy fixtures");
    for(const name of FOUNDATION_TABLES)assert.equal((await q("SELECT count(*)::int n FROM "+name)).rows[0].n,0,name);
    pass("final schema up with all 14 new tables empty");
    return report;
  } finally {
    await db.query("ROLLBACK").catch(()=>{});
    // No trigger disabling or deletion of historical rows. Only our guard catalog
    // is eligible for cleanup after an interrupted refusal check.
    if(fixtureId) await db.query("DELETE FROM catalog_products WHERE id=$1",[fixtureId]).catch(()=>{});
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { url: { type: "string" }, "allow-disposable": { type: "string" } } });
  try {
    const result=await runFoundation({url:values.url,marker:values["allow-disposable"],log:console.log});
    console.log(JSON.stringify(result));
  } catch(error) {
    console.error(error.stack ?? error.message);
    process.exitCode=1;
  }
}
