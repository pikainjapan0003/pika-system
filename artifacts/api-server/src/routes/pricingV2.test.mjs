import assert from "node:assert/strict";
import { before, after, mock, test } from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PreviewPricingV2Body, PreviewPricingV2Params } from "@workspace/api-zod";
const target = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
assert.equal(process.env.PIKA_PHASE0_DISPOSABLE,"DB-BUILD-01");
assert.equal(target.hostname,"127.0.0.1"); assert.equal(target.username,"pika_phase0"); assert.equal(target.pathname,"/pika_phase0");
const require = createRequire(import.meta.url);
mock.module(pathToFileURL(require.resolve("@clerk/express").replace(/index\.js$/, "index.mjs")),{namedExports:{getAuth:req=>({userId:req.headers["x-test-user-id"]??null}),clerkMiddleware:()=> (_req,_res,next)=>next()}});
const {default:express}=await import("express");
const {pool}=await import("@workspace/db");
const {default:router}=await import("./pricingV2.ts");
const app=express(); app.use(express.json());app.use("/api",router);
const q=(sql,values)=>pool.query(sql,values);
let server,base,store,other,shipping,template,manualTemplate,trip,area,route,beforeState;
async function state(){
 const tables=(await q("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 const result={};
 for(const {tablename} of tables){
  assert.match(tablename,/^[a-z_]+$/);
  result[tablename]=(await q(`SELECT count(*)::int n, md5(string_agg(j::text,E'\n' ORDER BY j::text)) hash FROM (SELECT to_jsonb(t) j FROM "${tablename}" t) s`)).rows[0];
 }
 return result;
}
before(async()=>{
 assert.deepEqual((await q("SELECT current_database() db,current_user usr")).rows[0],{db:"pika_phase0",usr:"pika_phase0"});
 store=(await q("INSERT INTO stores(merchant_id,name,slug,purchase_exchange_rate) VALUES('phase2-owner','synthetic preview',$1,.21) RETURNING id",["phase2-"+Date.now()])).rows[0].id;
 other=(await q("INSERT INTO stores(merchant_id,name,slug) VALUES('phase2-other','synthetic other',$1) RETURNING id",["phase2-other-"+Date.now()])).rows[0].id;
 shipping=(await q("INSERT INTO international_shipping_profiles(store_id,code,name,rate_twd,basis_weight_grams) VALUES($1,'GENERAL_AIR','Air',220,1000) RETURNING id",[store])).rows[0].id;
 template=(await q("INSERT INTO pricing_templates(store_id,code,name,cost_adjustment_mode,cost_adjustment_rate,department_store_fee_rate,default_shipping_profile_id) VALUES($1,'GENERAL','General','NONE',1,0,$2) RETURNING id",[store,shipping])).rows[0].id;
 manualTemplate=(await q("INSERT INTO pricing_templates(store_id,code,name,cost_adjustment_mode,cost_adjustment_rate,department_store_fee_rate,default_shipping_profile_id) VALUES($1,'CUSTOM','Manual','MANUAL',1,0,$2) RETURNING id",[store,shipping])).rows[0].id;
 await q("INSERT INTO store_pricing_settings(store_id) VALUES($1)",[store]);
 trip=(await q("INSERT INTO trips(store_id,name,exchange_rate,hep_total_jpy,total_item_quantity) VALUES($1,'synthetic trip',.2,500,100) RETURNING id",[store])).rows[0].id;
 area=(await q("INSERT INTO trip_areas(store_id,trip_id,name) VALUES($1,$2,'synthetic area') RETURNING id",[store,trip])).rows[0].id;
 await q("INSERT INTO trip_area_costs(trip_area_id,mode,cardboard_unit_jpy,shipping_unit_jpy,parcel_count,estimated_item_quantity) VALUES($1,'ESTIMATE',100,400,2,100)",[area]);
 route=(await q("INSERT INTO trip_routes(store_id,trip_id,trip_area_id,area_title,start_place,end_place,est_qty,etc_jpy,train_jpy,fuel_jpy,parking_jpy) VALUES($1,$2,$3,'synthetic','a','b',20,100,200,300,400) RETURNING id",[store,trip,area])).rows[0].id;
 beforeState=await state();
 server=await new Promise(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}/api`;
});
after(async()=>{
 try {
  if(server)await new Promise(resolve=>server.close(resolve));
  if(store){
   await q("DELETE FROM pricing_templates WHERE store_id=$1",[store]);
   await q("DELETE FROM international_shipping_profiles WHERE store_id=$1",[store]);
   await q("DELETE FROM store_pricing_settings WHERE store_id=$1",[store]);
  }
  if(trip)await q("DELETE FROM trips WHERE id=$1",[trip]);
  if(store)await q("DELETE FROM stores WHERE id=$1",[store]);
  if(other)await q("DELETE FROM stores WHERE id=$1",[other]);
 } finally {await pool.end();}
});
async function preview(body,owner="phase2-owner",id=store){
 const response=await fetch(`${base}/stores/${encodeURIComponent(String(id))}/pricing/preview`,{method:"POST",headers:{"Content-Type":"application/json",...(owner?{"x-test-user-id":owner}:{})},body:JSON.stringify(body)});
 return {status:response.status,data:await response.json()};
}
const input=()=>({templateId:template,tripRouteId:route,originalPriceJpy:"1000",weightGrams:"50",generalFinalPriceTwd:"300",vipFinalPriceTwd:"290"});
test("preview requires authentication and exact store ownership",async()=>{
 assert.equal((await preview(input(),null)).status,401);
 assert.equal((await preview(input(),"phase2-other")).status,403);
 assert.equal((await preview(input(),"phase2-owner",store+"junk")).status,400);
});
test("all referenced template, shipping and Route IDs remain same-store",async()=>{
 for(const body of [{templateId:template},{shippingProfileId:shipping},{tripRouteId:route}])assert.equal((await preview(body,"phase2-other",other)).status,404);
});
test("actual Route metadata, separate purchase FX and no double Route fee",async()=>{
 const r=await preview(input());assert.equal(r.status,200);assert.equal(r.data.status,"READY");
 assert.equal(r.data.amounts.routeCostTwd,"13.180000000000");assert.equal(r.data.amounts.effectiveProductCostTwd,"210.000000000000");
 // 210 + (13.18 + 5) + 11 + 3.15 = 242.33, profit 57.67.
 assert.equal(r.data.amounts.totalCostTwd,"242.330000000000");assert.equal(r.data.general.values.netProfitTwd,"57.670000000000");
 assert.equal(r.data.routeMetadata.tripExchangeRate,"0.2");assert.equal(r.data.settingsVersion,"v1");
 const override=await preview({...input(),routePaymentFeeRate:"0.02"});assert.equal(override.data.amounts.routeCostTwd,"13.240000000000");
});
test("pending price, missing shipping and explicit exemption preserve semantics",async()=>{
 const r=await preview({...input(),generalFinalPriceTwd:null});assert.equal(r.status,200);assert.equal(r.data.general.status,"PENDING_CONFIRMATION");assert.equal(r.data.general.values.finalPriceTwd,null);assert.equal(r.data.vip.status,"READY");
 const missing=await preview({originalPriceJpy:"100",isTransportCostExempt:true});assert.equal(missing.data.status,"PENDING_CONFIRMATION");assert.ok(missing.data.reasons.includes("missing_internationalShippingRateTwd"));
 const exempt=await preview({...input(),tripRouteId:undefined,isTransportCostExempt:true});assert.equal(exempt.data.amounts.routeCostTwd,"0.000000000000");
});
test("parameter boundary rejects numbers, NaN, negative fees, zero denominators and unknown keys",async()=>{
 for(const invalid of [{templateId:1.5},{tripRouteId:9007199254740992},{originalPriceJpy:100},{exchangeRate:"NaN"},{exchangeRate:"0"},{targetMarginRate:"1"},{routePaymentFeeRate:"-1"},{generalFinalPriceTwd:"0"},{generalFinalPriceTwd:"1.001"},{routeCostTwd:"0"},{thresholds:{loss:"0",low:"0",medium:"1"}}])assert.equal((await preview({...input(),...invalid})).status,400,JSON.stringify(invalid));
 assert.equal((await preview({...input(),thresholds:{loss:"-10",low:"0",medium:"50"}})).status,200);
});
test("manual template requires explicit effective cost rather than guessing from original",async()=>{
 const pending=await preview({...input(),templateId:manualTemplate});assert.equal(pending.data.general.status,"PENDING_CONFIRMATION");assert.equal(pending.data.amounts.effectiveCostJpy,null);
 const explicit=await preview({...input(),templateId:manualTemplate,effectiveCostJpy:"900"});assert.equal(explicit.data.general.status,"READY");assert.equal(explicit.data.amounts.effectiveProductCostTwd,"189.000000000000");
});
test("generated body IDs accept both PostgreSQL boundaries and reject every invalid input category",()=>{
 for(const key of ["templateId","shippingProfileId","tripRouteId"]){
  for(const value of [1,2147483647])assert.equal(PreviewPricingV2Body.safeParse({[key]:value}).success,true,`${key}=${value}`);
  for(const value of [0,-1,1.5,2147483647.5,2147483648,Number.MAX_SAFE_INTEGER,NaN,Infinity,-Infinity,"1","NaN",null,true,{},[]])assert.equal(PreviewPricingV2Body.safeParse({[key]:value}).success,false,`${key}=${String(value)}`);
 }
});
test("generated path IDs enforce the same numeric range and reject unknown parameters",()=>{
 for(const storeId of ["1","2147483647"])assert.equal(PreviewPricingV2Params.safeParse({storeId}).success,true);
 for(const storeId of ["0","-1","1.5","2147483647.5","2147483648","9007199254740991","NaN","Infinity","abc",""])assert.equal(PreviewPricingV2Params.safeParse({storeId}).success,false,storeId);
 assert.equal(PreviewPricingV2Params.safeParse({storeId:"1",typo:"unexpected"}).success,false);
});
test("generated and HTTP thresholds reject nested and top-level unknown fields",async()=>{
 const thresholds={loss:"25",low:"50",medium:"100"};
 assert.equal(PreviewPricingV2Body.safeParse({thresholds}).success,true);
 assert.equal((await preview({...input(),thresholds})).status,200);
 for(const invalid of [{thresholds:{...thresholds,typo:"unexpected"}},{thresholds:{loss:"25",low:"50"}},{thresholds:{...thresholds,medium:100}},{thresholds:{...thresholds,extra:{}}},{typo:"unexpected"}]){
  assert.equal(PreviewPricingV2Body.safeParse(invalid).success,false,JSON.stringify(invalid));
  assert.equal((await preview({...input(),...invalid})).status,400,JSON.stringify(invalid));
 }
});
test("HTTP rejects invalid IDs before looking up the referenced PostgreSQL row",async()=>{
 for(const key of ["templateId","shippingProfileId","tripRouteId"]){
  for(const value of [0,-1,1.5,2147483647.5,2147483648,Number.MAX_SAFE_INTEGER,"NaN","1",null,true,{},[]])assert.equal((await preview({...input(),[key]:value})).status,400,`${key}=${String(value)}`);
  for(const value of [1,2147483647])assert.equal((await preview({...input(),[key]:value})).status,404,`valid but absent ${key}=${value}`);
 }
 for(const id of ["0","-1","1.5","2147483647.5","2147483648","9007199254740991","NaN","Infinity","abc"])assert.equal((await preview(input(),"phase2-owner",id)).status,400,id);
 for(const id of ["1","2147483647"])assert.ok([403,404].includes((await preview(input(),"phase2-owner",id)).status),`valid unowned/absent storeId=${id}`);
});
test("generated Params reject noncanonical spelling and coercible non-number types",()=>{
 for(const storeId of [1,2147483647,"1","2147483647"])assert.equal(PreviewPricingV2Params.safeParse({storeId}).success,true);
 for(const storeId of [0,-1,1.5,2147483648,NaN,Infinity,-Infinity,"1e0","1.0","+1"," 1","1 ","01","0x1","1\n","1\r","\t1",null,true,false,[1],["1"],{},1n,Symbol("1")])assert.equal(PreviewPricingV2Params.safeParse({storeId}).success,false,String(storeId));
 for(const params of [null,true,[],[1],"1",1,{}])assert.equal(PreviewPricingV2Params.safeParse(params).success,false);
});
test("HTTP rejects equivalent noncanonical store spelling before ownership lookup",async()=>{
 const id=String(store);
 assert.equal((await preview(input(),"phase2-owner",id)).status,200);
 for(const spelling of [id+"e0",id+".0","+"+id," "+id,id+" ","0"+id,"0x"+store.toString(16),id+"\n",id+"\r","\t"+id]){
  assert.equal((await preview(input(),"phase2-owner",spelling)).status,400,spelling);
  // An authenticated non-owner would receive 403 if ownership lookup ran first.
  assert.equal((await preview(input(),"phase2-other",spelling)).status,400,spelling);
 }
});
test("every preview leaves all public database rows unchanged",async()=>{assert.deepEqual(await state(),beforeState);});
