import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,createWriteStream} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {assertPhase5Database} from "./product-listing-harness.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),[identityPath,out]=process.argv.slice(2);
const identity=JSON.parse(readFileSync(identityPath,"utf8"));assertPhase5Database(identity.url,identity.id,"DB-BUILD-05");
const env={...process.env,DATABASE_URL:identity.url,DATABASE_SSLMODE:"disable",PIKA_PHASE5_E2E:"DB-BUILD-05",PIKA_PHASE5_CONTAINER:identity.id};
const api=spawn(process.execPath,["--experimental-test-module-mocks","--import","tsx/esm","src/productListingE2E.mjs"],{cwd:path.join(root,"artifacts/api-server"),env,windowsHide:true,stdio:["pipe","pipe","pipe"]});
const log=createWriteStream(out+"/api-integration-server.log");api.stderr.pipe(log,{end:false});const started=new Date().toISOString(),results=[];let base,fixture,failed;
const sql=(query)=>execFileSync("docker",["exec","-i",identity.id,"psql","-U","pika_phase5","-d","pika_phase5","-X","-At","-v","ON_ERROR_STOP=1"],{input:query,encoding:"utf8",windowsHide:true}).trim();
try{
 fixture=await new Promise((resolve,reject)=>{let buffer="";const timer=setTimeout(()=>reject(Error("API startup timeout")),120000);api.once("exit",code=>{clearTimeout(timer);reject(Error("API exited "+code));});api.stdout.on("data",chunk=>{log.write(chunk);buffer+=chunk;const m=buffer.match(/PHASE5_READY=(\{[^\n]+\})/);if(m){clearTimeout(timer);resolve(JSON.parse(m[1]));}});});
 base="http://127.0.0.1:"+fixture.port+"/api";const s=fixture.store;
 const call=async(method,url,body,status=200,token="e2e-owner-token")=>{const response=await fetch(base+url,{method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=response.status===204?null:await response.json();assert.equal(response.status,status,JSON.stringify({url,body,value,actual:response.status}));return value;};
 const run=async(name,fn)=>{try{await fn();results.push({name,status:"PASS"});console.log("PASS "+name);}catch(e){results.push({name,status:"FAIL",error:e.stack});throw e;}};
 const config=await call("POST",`/stores/${s}/pricing-settings/initialize`,{});
 const perfume=config.templates.find(t=>t.code==="PERFUME"),general=config.templates.find(t=>t.code==="GENERAL");
 const ship=config.shippingProfiles.find(t=>t.code==="TIGERAIR_BAGGAGE");
 let catalog=(await call("POST",`/stores/${s}/catalog-products`,{name:"API 上架香水",barcode:"12345678",barcodeStatus:"REAL",weightGrams:"12.34",originalPriceJpy:"1000",adjustmentMode:"RATE",adjustmentRate:"0.915",defaultPricingTemplateId:perfume.id,defaultShippingProfileId:ship.id})).product;
 const create=`/stores/${s}/catalog-products/${catalog.id}/create-listing`;
 const body={generalFinalPriceTwd:"500.25",vipFinalPriceTwd:"450.10",isTransportCostExempt:true};
 let preview,pid,initial,historyUrl,recalc;
 await run("preview exact perfume hand calculation and no writes",async()=>{
  preview=await call("POST",create,{...body,mode:"PREVIEW"});
  assert.equal(preview.preview.amounts.effectiveCostJpy,"915.000000000000");
  assert.equal(preview.preview.amounts.totalCostTwd,"203.935100000000"); // 192.15 + 2.88225 + 3.255 + 5 + 12.34*1050/20000
  assert.equal(preview.preview.general.values.netProfitTwd,"296.314900000000");
  assert.equal(sql(`SELECT count(*) FROM products WHERE store_id=${s} AND catalog_product_id=${catalog.id}`),"0");
 });
 await run("create atomic product exact dualwrite and immutable snapshot",async()=>{
  const r=await call("POST",create,{...body,mode:"SAVE",expectedContext:preview.reference.context,orderDeadlineAt:"2026-10-01T12:00:00.000Z",skuCode:"SKU-KEEP",storageTempClass:"frozen",wholesalePrice:"400.10",partnerPrice:"390.20",specs:[{name:"容量",values:["15ml"]}],inventory:12},201);pid=r.product.id;
  assert.equal(r.product.weightGrams,"12.34");assert.equal(r.product.weightKg,"0.012");assert.equal(r.product.costJpy,"915.000000000000");assert.equal(r.product.originalPriceJpy,"1000.000000000000");
  historyUrl=`/stores/${s}/products/${pid}/pricing-history`;recalc=`/stores/${s}/products/${pid}/recalculate-pricing`;
  initial=await call("GET",historyUrl);assert.equal(initial.items.length,1);assert.equal(initial.current.sourceCostRecordId,catalog.currentCost.id);assert.equal(initial.current.createdBy,fixture.owner);
  assert.equal(initial.product.orderDeadlineAt,"2026-10-01T12:00:00.000Z");assert.equal(initial.product.skuCode,"SKU-KEEP");assert.equal(initial.product.wholesalePrice,"400.10");assert.equal(initial.current.pricingContext.configuration.template.code,"PERFUME");assert.equal(initial.current.pricingContext.configuration.thresholds.loss,"25.000000000000");
 });
 await run("catalog append preserves listing and snapshot bytes; current void fallback",async()=>{
  const before=sql(`SELECT row_to_json(p)::text FROM products p WHERE id=${pid}; SELECT row_to_json(p)::text FROM listing_pricing_snapshots p WHERE product_id=${pid};`);
  const c=(await call("POST",`/stores/${s}/catalog-products/${catalog.id}/cost-records`,{originalPriceJpy:"2000",reasonCode:"OTHER",reasonText:"新成本"})).record;
  assert.equal((await call("GET",historyUrl)).costUpdated,true);
  assert.equal(sql(`SELECT row_to_json(p)::text FROM products p WHERE id=${pid}; SELECT row_to_json(p)::text FROM listing_pricing_snapshots p WHERE product_id=${pid};`),before);
  const q=await call("POST",recalc,{...body,useLatestCost:true,mode:"PREVIEW"});assert.equal(q.preview.amounts.originalPriceJpy,"2000.000000000000");
  assert.equal((await call("GET",historyUrl)).items.length,1);
  await call("POST",`/stores/${s}/catalog-products/${catalog.id}/cost-records/${c.id}/void`,{reasonCode:"OTHER",reasonText:"回退測試"});
  assert.equal((await call("GET",historyUrl)).costUpdated,false);
 });
 await run("stale cost context rejected atomically then explicit repricing retains old history",async()=>{
  const q=await call("POST",recalc,{...body,mode:"PREVIEW"});
  await call("POST",`/stores/${s}/catalog-products/${catalog.id}/cost-records`,{originalPriceJpy:"1200",reasonCode:"OTHER",reasonText:"更新"});
  const conflict=await call("POST",recalc,{...body,mode:"SAVE",expectedContext:q.reference.context},409);assert.equal(conflict.details.code,"STALE_PRICING_CONTEXT");assert.equal((await call("GET",historyUrl)).items.length,1);
  const b={...body,useLatestCost:true,generalFinalPriceTwd:"600.50",vipFinalPriceTwd:"550.50"};
  const fresh=await call("POST",recalc,{...b,mode:"PREVIEW"});
  await call("POST",recalc,{...b,mode:"SAVE",expectedContext:fresh.reference.context});
  const h=await call("GET",historyUrl);assert.equal(h.items.length,2);assert.deepEqual(h.items[1],initial.current);assert.equal(h.product.price,"600.50");
 });
 await run("same baseline concurrent saves serialize without lost pointer",async()=>{
  const b={...body,generalFinalPriceTwd:"650.00"},q=await call("POST",recalc,{...b,mode:"PREVIEW"});
  const responses=await Promise.all([1,2].map(()=>fetch(base+recalc,{method:"POST",headers:{Authorization:"Bearer e2e-owner-token","Content-Type":"application/json"},body:JSON.stringify({...b,mode:"SAVE",expectedContext:q.reference.context})})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);const h=await call("GET",historyUrl);assert.equal(h.items.length,3);assert.equal(h.current.id,h.items[0].id);
 });
 await run("selective name sync plus independent local barcode and cost retention",async()=>{
  const before=(await call("GET",`/stores/${s}/catalog-products/${catalog.id}`)).product.currentCost.id;
  const b={...body,name:"上架同步名稱",listingBarcode:"99887766",originalPriceJpy:"777",effectiveCostJpy:"666",syncFields:["name"]};
  const q=await call("POST",recalc,{...b,mode:"PREVIEW"});await call("POST",recalc,{...b,mode:"SAVE",expectedContext:q.reference.context});
  const c=(await call("GET",`/stores/${s}/catalog-products/${catalog.id}`)).product;assert.equal(c.name,b.name);assert.equal(c.barcode,"12345678");assert.equal(c.currentCost.id,before);
  assert.equal((await call("GET",historyUrl)).current.listingBarcode,"99887766");
 });
 await run("barcode correction failure rolls back prior selected name sync and snapshot",async()=>{
  const before=await call("GET",historyUrl),b={...body,name:"不應寫入名稱",listingBarcode:"66778899",syncFields:["name","barcode"],reasonCode:"OTHER"};
  const q=await call("POST",recalc,{...b,mode:"PREVIEW"});await call("POST",recalc,{...b,mode:"SAVE",expectedContext:q.reference.context},400);
  assert.deepEqual(await call("GET",historyUrl),before);assert.equal((await call("GET",`/stores/${s}/catalog-products/${catalog.id}`)).product.name,"上架同步名稱");
 });
 await run("cost sync appends audit and snapshots, no historical rewrite",async()=>{
  const b={...body,originalPriceJpy:"1000",effectiveCostJpy:"915",syncFields:["cost"],reasonCode:"OTHER",reasonText:"同步成本"};
  const q=await call("POST",recalc,{...b,mode:"PREVIEW"});await call("POST",recalc,{...b,mode:"SAVE",expectedContext:q.reference.context});
  const h=await call("GET",historyUrl),c=(await call("GET",`/stores/${s}/catalog-products/${catalog.id}`)).product;assert.equal(h.current.sourceCostRecordId,c.currentCost.id);assert.equal(h.costUpdated,false);assert.deepEqual(h.items.at(-1),initial.current);
 });
 await run("tiny and unrepresentable legacy weights remain exact",async()=>{
  for(const weight of ["0.01","9999999999.99"]){const b={...body,weightGrams:weight,generalFinalPriceTwd:"99999999.99",vipFinalPriceTwd:"99999999.99"},q=await call("POST",create,{...b,mode:"PREVIEW"});const r=await call("POST",create,{...b,mode:"SAVE",expectedContext:q.reference.context,confirmLowProfit:true},201);assert.equal(r.product.weightGrams,weight);assert.equal(r.product.weightKg,weight==="0.01"?"0.000":null);}
  const b={...body,listingBarcode:"１".repeat(128)},q=await call("POST",create,{...b,mode:"PREVIEW"}),r=await call("POST",create,{...b,mode:"SAVE",expectedContext:q.reference.context},201);assert.equal(r.snapshot.listingBarcode,"1".repeat(128));
 });
 await run("loss confirmation cannot be bypassed and negative sale input rejected",async()=>{
  const b={...body,generalFinalPriceTwd:"1.01",vipFinalPriceTwd:"1.00"},q=await call("POST",create,{...b,mode:"PREVIEW"});assert.ok(q.preview.general.values.netProfitTwd.startsWith("-"));
  await call("POST",create,{...b,mode:"SAVE",expectedContext:q.reference.context},409);
  await call("POST",create,{...b,mode:"SAVE",expectedContext:q.reference.context,confirmLowProfit:true},201);
  await call("POST",create,{...body,generalFinalPriceTwd:"-1"},400);await call("POST",create,{...body,weightGrams:"12.345"},400);
  await call("POST",create,{...body,orderDeadlineAt:42},400);
 });
 await run("fee and exchange changes invalidate context; inactive and cross-store references",async()=>{
  let q=await call("POST",recalc,{...body,mode:"PREVIEW"});
  await call("PATCH",`/stores/${s}/pricing-templates/${perfume.id}`,{departmentStoreFeeRate:"0.02"});
  await call("POST",recalc,{...body,mode:"SAVE",expectedContext:q.reference.context},409);
  q=await call("POST",recalc,{...body,mode:"PREVIEW"});sql(`UPDATE stores SET purchase_exchange_rate=.22 WHERE id=${s}`);
  await call("POST",recalc,{...body,mode:"SAVE",expectedContext:q.reference.context},409);
  await call("POST",create,{...body,templateId:2147483647},404);await call("POST",create,{...body,shippingProfileId:2147483647},404);await call("POST",create,{...body,tripRouteId:2147483647},404);
  await call("GET",historyUrl,undefined,403,"e2e-other-token");await call("POST",create,{...body,templateId:2147483648},400);await call("POST",create,{...body,derivedProfit:"999"},400);
 });
 await run("route/trip context changes, cross-store and inactive profile rejection",async()=>{
  const trip=Number(sql(`WITH x AS (INSERT INTO trips(store_id,name,exchange_rate,hep_total_jpy,total_item_quantity) VALUES(${s},'route context',.2,500,100) RETURNING id) SELECT id FROM x`));
  const area=Number(sql(`WITH x AS (INSERT INTO trip_areas(store_id,trip_id,name) VALUES(${s},${trip},'area') RETURNING id) SELECT id FROM x`));
  sql(`INSERT INTO trip_area_costs(trip_area_id,mode,cardboard_unit_jpy,shipping_unit_jpy,parcel_count,estimated_item_quantity) VALUES(${area},'ESTIMATE',100,400,2,100)`);
  const route=Number(sql(`WITH x AS (INSERT INTO trip_routes(store_id,trip_id,trip_area_id,area_title,start_place,end_place,est_qty,etc_jpy,train_jpy,fuel_jpy,parking_jpy) VALUES(${s},${trip},${area},'same label','a','b',20,100,200,300,400) RETURNING id) SELECT id FROM x`));
  const b={...body,tripRouteId:route,isTransportCostExempt:false};let q=await call("POST",recalc,{...b,mode:"PREVIEW"});assert.equal(q.preview.routeMetadata.tripId,trip);
  sql(`UPDATE trip_routes SET train_jpy=300 WHERE id=${route}`);await call("POST",recalc,{...b,mode:"SAVE",expectedContext:q.reference.context},409);
  q=await call("POST",recalc,{...b,mode:"PREVIEW"});sql(`UPDATE trips SET exchange_rate=.25 WHERE id=${trip}`);await call("POST",recalc,{...b,mode:"SAVE",expectedContext:q.reference.context},409);
  sql(`UPDATE trips SET store_id=NULL WHERE id=${trip}`);await call("POST",recalc,{...b,mode:"PREVIEW"},404);
  const other=await call("POST",`/stores/${fixture.other}/pricing-settings/initialize`,{},200,"e2e-other-token");
  await call("POST",create,{...body,templateId:other.templates[0].id},404);await call("POST",create,{...body,shippingProfileId:other.shippingProfiles[0].id},404);
  await call("PATCH",`/stores/${s}/pricing-templates/${general.id}`,{isActive:false});await call("POST",create,{...body,templateId:general.id},404);
  await call("PATCH",`/stores/${s}/pricing-templates/${general.id}`,{isActive:true});
  await call("PATCH",`/stores/${s}/shipping-profiles/${ship.id}`,{isActive:false});await call("POST",create,body,404);await call("PATCH",`/stores/${s}/shipping-profiles/${ship.id}`,{isActive:true});
 });
 await run("history deletion produces recoverable 409 and linked legacy edit refuses stale snapshot",async()=>{
  assert.throws(()=>sql(readFileSync(path.join(root,"lib/db/migrations/rollback/0043_catalog_listing_pricing.sql"),"utf8")));
  assert.equal((await call("GET",historyUrl)).items.at(-1).id,initial.current.id);
  await call("DELETE",`/stores/${s}/products/${pid}`,undefined,409);
  await call("PATCH",`/stores/${s}/products/${pid}`,{price:800},409);
  await call("PATCH",`/stores/${s}/products/${pid}`,{isActive:false});
 });
 await run("legacy unlinked create/edit and all-cost-void pending refusal",async()=>{
  const p=await call("POST",`/stores/${s}/products`,{name:"手動相容",price:100,costJpy:200,weightKg:0.123},201);
  const changed=await call("PATCH",`/stores/${s}/products/${p.id}`,{price:110});assert.equal(changed.price,110);assert.equal(changed.catalogProductId,null);assert.equal(changed.weightGrams,null);
  const costs=await call("GET",`/stores/${s}/catalog-products/${catalog.id}/cost-records`);
  for(const c of costs.items.filter(c=>c.status==="ACTIVE"))await call("POST",`/stores/${s}/catalog-products/${catalog.id}/cost-records/${c.id}/void`,{reasonCode:"OTHER",reasonText:"全部作廢"});
  await call("POST",recalc,{...body,useLatestCost:true,mode:"PREVIEW"},409);
 });
}catch(e){failed=e;console.error(e);}finally{
 if(api.exitCode===null){api.stdin.write("stop\n");await Promise.race([new Promise(r=>api.once("exit",r)),new Promise((_,j)=>setTimeout(()=>j(Error("API stop timeout")),15000))]);}
 log.end();writeFileSync(out+"/api-integration-results.json",JSON.stringify({started,ended:new Date().toISOString(),apiPid:api.pid,apiExit:api.exitCode,results,error:failed?.stack},null,2));
}
if(failed)process.exitCode=1;
