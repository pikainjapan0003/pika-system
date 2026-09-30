import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assertPocDatabase } from './database-guard.mjs';

const marker = 'SITES-PRODUCT-DATABASE-20260930';
const backupSchema = 'pika_catalog_backup_20260930';
const action = process.argv[2];
assert.ok(['apply', 'verify'].includes(action));
assert.equal(process.argv[3], marker);
const local = process.env.PIKA_CATALOG_TEST === marker;
if (local) {
  const u = new URL(process.env.DATABASE_URL);
  assert.equal(u.hostname, '127.0.0.1');
  assert.equal(u.username, 'pika_test');
  assert.equal(u.pathname, '/pika_sites_catalog_test');
} else {
  assertPocDatabase();
  assert.equal(process.env.RAILWAY_PROJECT_ID, 'de13e86c-9d70-4396-85be-79cd73cd412f');
  assert.equal(process.env.RAILWAY_SERVICE_ID, '1068b8cf-3623-4b85-a702-d7bb7b70080e');
  assert.equal(process.env.RAILWAY_ENVIRONMENT_ID, '143266a9-b10c-4dec-9b8f-f4eec9bec86a');
}
const files = ['0045_product_database_foundation.sql','0046_catalog_search_audit.sql',
  '0047_catalog_listing_pricing.sql','0048_order_items_capture.sql','0049_reviewed_sheet_imports.sql'];
const migrations = await Promise.all(files.map(async file => {
  const sql = await readFile(new URL('../../../../lib/db/migrations/' + file, import.meta.url), 'utf8');
  return { file, sql, sha256:createHash('sha256').update(sql).digest('hex') };
}));
const migrationHashes = migrations.map(({file,sha256}) => ({file,sha256}));
const quote = name => { assert.match(name, /^[a-z_][a-z0-9_]*$/); return '"' + name + '"'; };
const { pool } = await import('@workspace/db');
const c = await pool.connect();
async function digest(table, columns) {
  return (await c.query(`SELECT count(*)::int n,md5(coalesce(string_agg(j::text,E'\n' ORDER BY j::text),'')) hash
    FROM (SELECT to_jsonb(t) j FROM (SELECT ${columns.map(quote).join(',')} FROM public.${quote(table)}) t) s`)).rows[0];
}
try {
  const { rows:[identity] } = await c.query('SELECT current_database() db,current_user usr');
  assert.equal(identity.db, local ? 'pika_sites_catalog_test' : 'pika_sites_poc');
  assert.equal(identity.usr, local ? 'pika_test' : 'pika_poc');
  const exists = (await c.query('SELECT to_regclass($1) present', [backupSchema + '.receipt'])).rows[0].present;
  if (exists) {
    const receipt = (await c.query(`SELECT content FROM ${backupSchema}.receipt`)).rows[0].content;
    assert.deepEqual(receipt.migrations, migrationHashes, 'Applied migration source drift');
    assert.ok((await c.query("SELECT to_regclass('public.order_items') present")).rows[0].present);
    console.log(JSON.stringify({marker,status:'ALREADY_APPLIED',migrations:migrationHashes,backup:receipt.backup}));
  } else {
    assert.equal(action, 'apply', 'Migration has not been applied');
    assert.equal((await c.query("SELECT to_regclass('public.catalog_products') present")).rows[0].present, null, 'Unknown catalog schema; refuse drift');
    await c.query('BEGIN');
    await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
    assert.equal((await c.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) locked",[marker])).rows[0].locked, true);
    const tables = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(x=>x.tablename);
    assert.ok(tables.includes('orders') && tables.includes('products') && tables.includes('invoice_ocr_runs'));
    for (const table of tables) await c.query(`LOCK TABLE public.${quote(table)} IN SHARE ROW EXCLUSIVE MODE`);
    const snapshot = { marker, identity, sourceBaseline:'97e71ed93e74063c3ee3457e0a9da8f1c919edd5', migrations:migrationHashes, tables:[], sequences:[] };
    for (const table of tables) {
      const columns = (await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table])).rows.map(x=>x.column_name);
      // Keep JSON as text so 30-digit numeric values never pass through JS Number.
      const rows = (await c.query(`SELECT to_jsonb(t)::text record FROM public.${quote(table)} t`)).rows.map(x=>x.record);
      snapshot.tables.push({table,columns,rows,digest:await digest(table,columns)});
    }
    snapshot.sequences = (await c.query("SELECT sequencename,last_value::text FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows;
    snapshot.constraints = (await c.query("SELECT conrelid::regclass::text AS relation,conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conrelid,conname")).rows;
    snapshot.indexes = (await c.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
    snapshot.triggers = (await c.query("SELECT tgrelid::regclass::text relation,tgname,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgrelid,tgname")).rows;
    snapshot.functions = (await c.query("SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f' ORDER BY proname,oid")).rows;
    const bytes = Buffer.from(JSON.stringify(snapshot));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    let backup;
    if (local) {
      const target = new URL(`../../../../.poc/checks/catalog-before-test-${sha256}.json`, import.meta.url);
      try { await writeFile(target, bytes, {flag:'wx',mode:0o600}); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      assert.equal(createHash('sha256').update(await readFile(target)).digest('hex'),sha256);
      backup = {kind:'local-test',sha256,bytes:bytes.length};
    } else {
      const {getR2Config} = await import('../lib/r2.ts');
      const {PutObjectCommand,GetObjectCommand} = await import('@aws-sdk/client-s3');
      const config = getR2Config(); assert.equal(config.bucket, 'pika-sites-poc');
      const key = `database-backups/${marker}/${sha256}.json`;
      await config.client.send(new PutObjectCommand({Bucket:config.bucket,Key:key,Body:bytes,ContentType:'application/json'}),{abortSignal:AbortSignal.timeout(20000)});
      const saved = await config.client.send(new GetObjectCommand({Bucket:config.bucket,Key:key}),{abortSignal:AbortSignal.timeout(20000)});
      assert.equal(createHash('sha256').update(Buffer.from(await saved.Body.transformToByteArray())).digest('hex'), sha256);
      backup = {kind:'private-r2',bucket:config.bucket,key,sha256,bytes:bytes.length};
    }
    await c.query(`CREATE SCHEMA ${backupSchema}; REVOKE ALL ON SCHEMA ${backupSchema} FROM PUBLIC`);
    for (const table of tables) await c.query(`CREATE TABLE ${backupSchema}.${quote(table)} AS TABLE public.${quote(table)}`);
    for (const migration of migrations) await c.query(migration.sql.replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,''));
    for (const entry of snapshot.tables) assert.deepEqual(await digest(entry.table,entry.columns),entry.digest,'Legacy row drift: '+entry.table);
    for (const sequence of snapshot.sequences) {
      const current = (await c.query("SELECT last_value::text FROM pg_sequences WHERE schemaname='public' AND sequencename=$1",[sequence.sequencename])).rows[0];
      assert.equal(current.last_value, sequence.last_value, 'Legacy sequence drift');
    }
    const receipt = {marker,migrations:migrationHashes,backup,legacy:snapshot.tables.map(({table,columns,digest})=>({table,columns,...digest})),appliedAt:new Date().toISOString()};
    await c.query(`CREATE TABLE ${backupSchema}.receipt(content jsonb NOT NULL)`);
    await c.query(`INSERT INTO ${backupSchema}.receipt VALUES($1)`,[receipt]);
    await c.query('COMMIT');
    console.log(JSON.stringify({marker,status:'APPLIED',migrations:migrationHashes,backup,legacy:receipt.legacy.map(({columns,...entry})=>entry)}));
  }
} catch(error) { await c.query('ROLLBACK'); throw error; }
finally { c.release(); await pool.end(); }
