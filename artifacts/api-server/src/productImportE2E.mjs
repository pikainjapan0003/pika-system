// Test-only executable. Never imported by the production server.
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';
import {assertPhase78Database} from '../../../e2e/product-import-harness.mjs';
assert.equal(process.env.PIKA_PHASE78_E2E,'DB-BUILD-07-08');
assertPhase78Database(process.env.DATABASE_URL,process.env.PIKA_PHASE78_CONTAINER,process.env.PIKA_PHASE78_E2E);
const require=createRequire(import.meta.url),owner='phase78-owner-'+Date.now();
mock.module(pathToFileURL(require.resolve('@clerk/express').replace(/index\.js$/,'index.mjs')),{namedExports:{getAuth:req=>({userId:req.headers.authorization==='Bearer e2e-owner-token'?owner:req.headers.authorization==='Bearer e2e-other-token'?owner+'-other':null}),clerkMiddleware:()=> (_req,_res,next)=>next()}});
const [{default:express},{pool},{catalogExecute}]=await Promise.all([import('express'),import('@workspace/db'),import('./lib/catalogService.ts')]);
const q=(sql,args)=>pool.query(sql,args);const store=(await q('INSERT INTO stores(merchant_id,name,slug,purchase_exchange_rate) VALUES($1,$2,$3,.21) RETURNING id',[owner,'商品資料庫測試店',owner])).rows[0].id;
const other=(await q('INSERT INTO stores(merchant_id,name,slug) VALUES($1,$2,$3) RETURNING id',[owner+'-other','另一家測試店',owner+'-other'])).rows[0].id;
const category=(await q("INSERT INTO product_categories(store_id,name) VALUES($1,'保養分類') RETURNING id",[store])).rows[0].id;
const app=express();app.use(express.json({limit:'100kb'}));app.use((req,_res,next)=>{req.log={error:()=>{},info:()=>{},warn:()=>{}};next();});
const names=['stores','categories','catalogProducts','catalogPricingSettings','pricingV2','products','trips','catalogListings','catalogOrders','orders','public','customers','reviewedImports'];
const loaded=await Promise.all(names.map(name=>import(`./routes/${name}.ts`)));
for(const route of loaded)app.use('/api',route.default);
app.use((error,_req,res,_next)=>{console.error(error);res.status(500).json({error:'測試伺服器錯誤'});});
// Non-UI fixture setup uses the actual domain path. Representative mutations are performed by browser clicks.
for(let i=0;i<14;i++)await catalogExecute('catalogCreate',{storeId:store},{name:`分頁商品 ${String(i).padStart(2,'0')}`,barcode:'8800000'+i,barcodeStatus:'REAL',weightGrams:'15.25',originalPriceJpy:'100',categoryId:category},{},owner);
await catalogExecute('catalogCreate',{storeId:other},{name:'外店專用商品',barcode:'9900000',barcodeStatus:'REAL',weightGrams:'15.25',originalPriceJpy:'999'},{},owner+'-other');
for(let i=0;i<26;i++)await catalogExecute('catalogCreate',{storeId:store},{name:'相似樣本',barcode:'0',barcodeStatus:'NONE',weightGrams:'20.25',originalPriceJpy:'123'},{},owner);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const catalogId=(await q('SELECT id FROM catalog_products WHERE store_id=$1 ORDER BY id LIMIT 1',[store])).rows[0].id;
for(const width of [390,1440])await q("INSERT INTO products(store_id,name,price,share_token,cost_jpy,weight_kg,sku_code) VALUES($1,$2,100,$3,915,.015,'0012345')",[store,'合成舊上架 '+width,owner+'-'+width]);
export const fixture={port:server.address().port,pid:process.pid,store,other,category,owner,catalogId};export {pool};
console.log('PHASE78_READY='+JSON.stringify(fixture));
let closing=false;export async function stop(){if(closing)return;closing=true;await new Promise(r=>server.close(r));await pool.end();input.close();console.log('PHASE78_STOPPED='+process.pid);}
const input=createInterface({input:process.stdin});input.on('line',line=>{if(line==='stop')void stop();});process.on('SIGTERM',stop);process.on('SIGINT',stop);
