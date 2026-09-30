import assert from 'node:assert/strict';
import {test,before,after,mock} from 'node:test';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {assertPhase5Database} from './product-listing-harness.mjs';

assertPhase5Database(process.env.DATABASE_URL,process.env.PIKA_PHASE5_CONTAINER,'DB-BUILD-05');
const require=createRequire(new URL('../artifacts/api-server/package.json',import.meta.url));
const schemas=await import(pathToFileURL(require.resolve('@workspace/api-zod')).href);
mock.module(pathToFileURL(require.resolve('@clerk/express').replace(/index\.js$/,'index.mjs')),{namedExports:{getAuth:req=>({userId:req.headers['x-test-user-id']??null}),clerkMiddleware:()=> (_req,_res,next)=>next()}});
const {default:express}=await import(pathToFileURL(require.resolve('express')).href);const {pool}=await import(pathToFileURL(require.resolve('@workspace/db')).href);
const {default:catalog}=await import('../artifacts/api-server/src/routes/catalogProducts.ts');const {default:settings}=await import('../artifacts/api-server/src/routes/catalogPricingSettings.ts');
const app=express();app.use(express.json());app.use('/api',catalog,settings);
let server,base,a,b,foreign,foreignCost,foreignAlias,ship,template,category,foreignCategory,p,none,clone,baseline,legacySql;
const q=(sql,args)=>pool.query(sql,args);
const ops=[["get","/stores/{storeId}/catalog-products","catalogList"],["post","/stores/{storeId}/catalog-products","catalogCreate","CatalogCreateInput"],["get","/stores/{storeId}/catalog-products/{catalogProductId}","catalogGet"],["patch","/stores/{storeId}/catalog-products/{catalogProductId}","catalogPatch","CatalogPatchInput"],["delete","/stores/{storeId}/catalog-products/{catalogProductId}","catalogDelete"],["post","/stores/{storeId}/catalog-products/{catalogProductId}/correct-barcode","catalogCorrectBarcode","CatalogBarcodeInput"],["post","/stores/{storeId}/catalog-products/{catalogProductId}/clone-with-new-barcode","catalogClone","CatalogCloneInput"],["get","/stores/{storeId}/catalog-products/{catalogProductId}/aliases","catalogAliases"],["post","/stores/{storeId}/catalog-products/{catalogProductId}/aliases","catalogAliasCreate","CatalogAliasInput"],["delete","/stores/{storeId}/catalog-products/{catalogProductId}/aliases/{aliasId}","catalogAliasDelete"],["get","/stores/{storeId}/catalog-products/{catalogProductId}/cost-records","catalogCosts"],["post","/stores/{storeId}/catalog-products/{catalogProductId}/cost-records","catalogCostCreate","CatalogCostInput"],["post","/stores/{storeId}/catalog-products/{catalogProductId}/cost-records/{recordId}/void","catalogCostVoid","CatalogVoidInput"],["get","/stores/{storeId}/catalog-products/{catalogProductId}/shopee-prices","catalogShopee"],["post","/stores/{storeId}/catalog-products/{catalogProductId}/shopee-prices","catalogShopeeCreate","CatalogShopeeInput"],["post","/stores/{storeId}/catalog-products/{catalogProductId}/shopee-prices/{recordId}/void","catalogShopeeVoid","CatalogVoidInput"],["get","/stores/{storeId}/catalog-products/{catalogProductId}/relationships","catalogRelationships"],["post","/stores/{storeId}/catalog-products/{catalogProductId}/relationships","catalogRelationshipCreate","CatalogRelationshipInput"],["delete","/stores/{storeId}/catalog-products/{catalogProductId}/relationships/{relationshipId}","catalogRelationshipDelete"],["get","/stores/{storeId}/catalog-products/{catalogProductId}/audit","catalogAudit"],["get","/stores/{storeId}/pricing-settings","catalogSettingsGet"],["patch","/stores/{storeId}/pricing-settings","catalogSettingsPatch","CatalogSettingsInput"],["post","/stores/{storeId}/pricing-settings/initialize","catalogInitialize","CatalogEmptyInput"],["get","/stores/{storeId}/pricing-templates","catalogTemplates"],["post","/stores/{storeId}/pricing-templates","catalogTemplateCreate","CatalogTemplateInput"],["patch","/stores/{storeId}/pricing-templates/{templateId}","catalogTemplatePatch","CatalogTemplatePatchInput"],["delete","/stores/{storeId}/pricing-templates/{templateId}","catalogTemplateDelete"],["get","/stores/{storeId}/shipping-profiles","catalogShippingProfiles"],["post","/stores/{storeId}/shipping-profiles","catalogShippingCreate","CatalogShippingInput"],["patch","/stores/{storeId}/shipping-profiles/{shippingProfileId}","catalogShippingPatch","CatalogShippingPatchInput"],["delete","/stores/{storeId}/shipping-profiles/{shippingProfileId}","catalogShippingDelete"]];
const make=(name='Original 商品',barcode='00123456789012345678901234')=>({name,barcode,barcodeStatus:'REAL',weightGrams:'15.25',originalPriceJpy:'100'});
async function api(method,path,body,owner='phase3-owner-a'){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(owner?{'x-test-user-id':owner}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data={raw};}return {status:r.status,data};
}
const path=(id=p,s=a)=>`/stores/${s}/catalog-products/${id}`;
async function good(method,url,body,owner){const r=await api(method,url,body,owner);assert.equal(r.status,200,JSON.stringify(r));return r.data;}
const samples={CatalogCreateInput:make(),CatalogPatchInput:{name:'new'},CatalogBarcodeInput:{barcode:'222',barcodeStatus:'REAL',reasonCode:'CORRECTION'},CatalogCloneInput:{barcode:'223',barcodeStatus:'REAL',originalPriceJpy:'100',reasonCode:'NEW_VARIANT'},CatalogAliasInput:{alias:'old'},CatalogCostInput:{originalPriceJpy:'100',reasonCode:'UPDATED'},CatalogVoidInput:{reasonCode:'ERROR'},CatalogShopeeInput:{priceTwd:'99',observedAt:'2024-02-29',reasonCode:'OBSERVED'},CatalogRelationshipInput:{targetCatalogProductId:1,relationType:'RELATED'},CatalogSettingsInput:{targetMarginRate:'0.3'},CatalogEmptyInput:{},CatalogTemplateInput:{name:'custom',code:'CUSTOM',costAdjustmentMode:'NONE',costAdjustmentRate:'1',departmentStoreFeeRate:'0'},CatalogTemplatePatchInput:{name:'new'},CatalogShippingInput:{name:'test',code:'TEST',rateTwd:'100',basisWeightGrams:'1000'},CatalogShippingPatchInput:{name:'new'}};
before(async()=>{
 const initial=(await q('SELECT id FROM stores ORDER BY id')).rows.map(x=>x.id);assert.ok(initial.length);
 legacySql=readFileSync('C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase0-runtime/legacy-checksums.sql','utf8').replace('FROM stores\n','FROM stores WHERE id IN ('+initial.join(',')+')\n');
 baseline=(await q(legacySql)).rows;
 a=(await q("INSERT INTO stores(merchant_id,name,slug) VALUES('phase3-owner-a','synthetic A',$1) RETURNING id",['phase3-a-'+Date.now()])).rows[0].id;
 b=(await q("INSERT INTO stores(merchant_id,name,slug) VALUES('phase3-owner-b','synthetic B',$1) RETURNING id",['phase3-b-'+Date.now()])).rows[0].id;
 category=(await q("INSERT INTO product_categories(store_id,name) VALUES($1,'Travel') RETURNING id",[a])).rows[0].id;
 foreignCategory=(await q("INSERT INTO product_categories(store_id,name) VALUES($1,'Foreign') RETURNING id",[b])).rows[0].id;
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}/api`;
 await good('POST',`/stores/${b}/pricing-settings/initialize`,{},'phase3-owner-b');
 foreign=(await good('POST',`/stores/${b}/catalog-products`,make('Foreign','999'),'phase3-owner-b')).product.id;
 foreignCost=(await good('GET',path(foreign,b)+'/cost-records',undefined,'phase3-owner-b')).items[0].id;
 foreignAlias=(await good('POST',path(foreign,b)+'/aliases',{alias:'Foreign alias'},'phase3-owner-b')).record.id;
});
after(async()=>{try{if(server)await new Promise(resolve=>server.close(resolve));if(baseline){assert.deepEqual((await q(legacySql)).rows,baseline);console.log('LEGACY_BASELINE_UNCHANGED',JSON.stringify(baseline));}console.log('RETAINED_SYNTHETIC_STORES',JSON.stringify({a,b}));}finally{await pool.end();}});
test('generated path/body/query/date contracts are strict for every Catalog operation',()=>{
 for(const [method,url,operation,bodyName] of ops){const prefix=operation[0].toUpperCase()+operation.slice(1),params=Object.fromEntries([...url.matchAll(/\{(\w+)\}/g)].map(m=>[m[1],'1'])),schema=schemas[prefix+'PathParams'];assert.ok(schema,operation);assert.equal(schema.safeParse(params).success,true,operation);for(const key of Object.keys(params))for(const value of ['01','1e0','0x1',' 1',true,null,[],2147483648])assert.equal(schema.safeParse({...params,[key]:value}).success,false,operation+key);if(bodyName){assert.equal(schemas[prefix+'Body'].safeParse(samples[bodyName]).success,true,operation);assert.equal(schemas[prefix+'Body'].safeParse({...samples[bodyName],actor:'spoof'}).success,false,operation);}}
 assert.equal(schemas.CatalogListQueryParams.safeParse({includeArchived:'false'}).data.includeArchived,'false');assert.equal(schemas.CatalogListQueryParams.safeParse({includeArchived:'yes'}).success,false);assert.equal(schemas.CatalogListQueryParams.safeParse({pageSize:'101'}).success,false);
 for(const d of ['2023-02-29','2024-02-31','1900-02-29','0000-01-01'])assert.equal(schemas.CatalogShopeeCreateBody.safeParse({...samples.CatalogShopeeInput,observedAt:d}).success,false,d);
});
test('every route requires authentication and owning merchant',async()=>{
 for(const [method,url,operation,bodyName] of ops){const u=url.replace('{storeId}',String(a)).replace(/\{\w+\}/g,'1'),body=bodyName?samples[bodyName]:undefined;assert.equal((await api(method.toUpperCase(),u,body,null)).status,401,operation);assert.equal((await api(method.toUpperCase(),u,body,'phase3-owner-b')).status,403,operation);}
});
test('GET fallback has no writes and concurrent explicit initialization is idempotent',async()=>{
 const fallback=await good('GET',`/stores/${a}/pricing-settings`);assert.equal(fallback.settings.targetMarginRate,'0.35');assert.equal((await q('SELECT count(*)::int n FROM store_pricing_settings WHERE store_id=$1',[a])).rows[0].n,0);
 await Promise.all([good('POST',`/stores/${a}/pricing-settings/initialize`,{}),good('POST',`/stores/${a}/pricing-settings/initialize`,{})]);const value=await good('GET',`/stores/${a}/pricing-settings`);assert.equal(value.templates.length,3);assert.equal(value.shippingProfiles.length,2);ship=value.shippingProfiles.find(x=>x.code==='GENERAL_AIR').id;template=value.templates.find(x=>x.code==='GENERAL').id;
});
test('create preserves barcode/weight, initializes cost, warns duplicates and allows explicit force',async()=>{
 const created=await good('POST',`/stores/${a}/catalog-products`,{...make(),categoryId:category,defaultPricingTemplateId:template,defaultShippingProfileId:ship});p=created.product.id;assert.equal(created.product.barcode,'00123456789012345678901234');assert.equal(created.product.weightGrams,'15.25');assert.equal(created.product.currentCost.effectiveCostJpy,'100.000000000000');
 const duplicate=await api('POST',`/stores/${a}/catalog-products`,make());assert.equal(duplicate.status,409);assert.equal(duplicate.data.details.candidates[0].id,p);assert.notEqual((await good('POST',`/stores/${a}/catalog-products`,{...make(),forceCreate:true})).product.id,p);
 none=(await good('POST',`/stores/${a}/catalog-products`,{...make('No barcode','0'),barcodeStatus:'NONE'})).product.id;const second=await good('POST',`/stores/${a}/catalog-products`,{...make('No barcode','0'),barcodeStatus:'NONE'});assert.equal(second.candidates[0].id,none);
 for(const body of [{...make(),weightGrams:'1.001'},{...make(),categoryId:foreignCategory},{...make(),storeId:b}])assert.ok([400,404].includes((await api('POST',`/stores/${a}/catalog-products`,body)).status));
});
test('rename retains searchable RENAMED alias; manual aliases deduplicate and stay scoped',async()=>{
 await good('PATCH',path(),{name:'Renamed 商品'});const aliases=(await good('GET',path()+'/aliases')).items;assert.equal(aliases[0].alias,'Original 商品');assert.equal(aliases[0].source,'RENAMED');assert.ok((await good('GET',`/stores/${a}/catalog-products?q=Original`)).items.some(x=>x.id===p));
 const alias=(await good('POST',path()+'/aliases',{alias:'ＭＹ Alias'})).record;assert.equal((await api('POST',path()+'/aliases',{alias:'my  alias'})).status,409);assert.equal((await api('DELETE',path()+'/aliases/'+foreignAlias)).status,404);await good('DELETE',path()+'/aliases/'+alias.id);
});
test('search ranks barcode/name/alias/prefix and includes categories with literal wildcard handling',async()=>{
 const barcode=(await good('POST',`/stores/${a}/catalog-products`,make('z barcode','1234'))).product.id;
 const name=(await good('POST',`/stores/${a}/catalog-products`,{...make('1234','0'),barcodeStatus:'NONE'})).product.id;
 const alias=(await good('POST',`/stores/${a}/catalog-products`,{...make('z alias','0'),barcodeStatus:'NONE'})).product.id;await good('POST',path(alias)+'/aliases',{alias:'1234'});
 const prefix=(await good('POST',`/stores/${a}/catalog-products`,{...make('1234 variant','0'),barcodeStatus:'NONE'})).product.id;
 assert.deepEqual((await good('GET',`/stores/${a}/catalog-products?q=1234`)).items.slice(0,4).map(x=>x.id),[barcode,name,alias,prefix]);
 assert.ok((await good('GET',`/stores/${a}/catalog-products?q=Travel`)).items.some(x=>x.id===p));
 for(const [n,query] of [['Percent % cream','%'],['Under_score','_']]){await good('POST',`/stores/${a}/catalog-products`,{...make(n,'0'),barcodeStatus:'NONE'});assert.equal((await good('GET',`/stores/${a}/catalog-products?q=${encodeURIComponent(query)}`)).total,1);}
 assert.equal((await good('GET',`/stores/${a}/catalog-products?q=${encodeURIComponent('!?')}`)).total,0);assert.ok(!(await good('GET',`/stores/${a}/catalog-products?q=0`)).items.some(x=>x.id===none));
 const first=await good('GET',`/stores/${a}/catalog-products?page=1&pageSize=2`),second=await good('GET',`/stores/${a}/catalog-products?page=2&pageSize=2`);assert.equal(first.total,second.total);assert.ok(first.items.every(x=>!second.items.some(y=>y.id===x.id)));
 assert.equal((await api('GET',`/stores/${a}/catalog-products?status=ARCHIVED&includeArchived=false`)).status,400);assert.equal((await api('GET',`/stores/${a}/catalog-products?unknown=true`)).status,400);
});
test('cost append serializes current, validates supersedes and never trusts conflicting derived input',async()=>{
 assert.equal((await api('POST',path()+'/cost-records',{originalPriceJpy:'200',effectiveCostJpy:'1',reasonCode:'UPDATED'})).status,400);assert.equal((await api('POST',path()+'/cost-records',{originalPriceJpy:'200',supersedesCostRecordId:foreignCost,reasonCode:'UPDATED'})).status,404);
 const added=await Promise.all([good('POST',path()+'/cost-records',{originalPriceJpy:'200',reasonCode:'UPDATED'}),good('POST',path()+'/cost-records',{originalPriceJpy:'300',adjustmentMode:'RATE',adjustmentRate:'0.915',reasonCode:'UPDATED'})]);
 let history=(await good('GET',path()+'/cost-records')).items;assert.equal(history.filter(x=>x.isCurrent).length,1);assert.equal(history.find(x=>x.isCurrent).id,Math.max(...added.map(x=>x.record.id)));
 const current=history.find(x=>x.isCurrent);assert.equal((await api('POST',path()+'/cost-records/'+current.id+'/void',{reasonCode:'OTHER'})).status,400);await good('POST',path()+'/cost-records/'+current.id+'/void',{reasonCode:'OTHER',reasonText:'synthetic correction'});assert.equal((await api('POST',path()+'/cost-records/'+current.id+'/void',{reasonCode:'ERROR'})).status,409);
 history=(await good('GET',path()+'/cost-records')).items;assert.equal(history.filter(x=>x.isCurrent).length,1);assert.notEqual(history.find(x=>x.isCurrent).id,current.id);
 await assert.rejects(q('DELETE FROM product_cost_records WHERE store_id=$1 AND id=$2',[a,current.id]),e=>e.code==='23514');
});
test('all active costs can be voided to pending without reviving voided records',async()=>{
 const manual=await good('POST',path(none)+'/cost-records',{originalPriceJpy:'100',adjustmentMode:'MANUAL',effectiveCostJpy:'82',reasonCode:'UPDATED'});assert.equal(manual.record.effectiveCostJpy,'82.000000000000');
 for(const r of (await good('GET',path(none)+'/cost-records')).items)if(r.status==='ACTIVE')await good('POST',path(none)+'/cost-records/'+r.id+'/void',{reasonCode:'ERROR'});
 assert.equal((await good('GET',path(none))).product.currentCost,null);assert.ok((await good('GET',`/stores/${a}/catalog-products?filter=MISSING_DATA`)).items.some(x=>x.id===none));
});
test('Shopee dates are calendar strings and void metadata is auditable and immutable',async()=>{
 for(const bdy of [{priceTwd:'99',observedAt:'2024-02-31',reasonCode:'OBSERVED'},{priceTwd:'99',observedAt:'2024-02-29',reasonCode:'OBSERVED',sourceUrl:'javascript:alert(1)'}])assert.equal((await api('POST',path()+'/shopee-prices',bdy)).status,400);
 const r=(await good('POST',path()+'/shopee-prices',{priceTwd:'99',observedAt:'2024-02-29',sourceUrl:'https://example.com/item',note:'synthetic',reasonCode:'OBSERVED'})).record;assert.equal(r.observedAt,'2024-02-29');await good('POST',path()+'/shopee-prices/'+r.id+'/void',{reasonCode:'OTHER',reasonText:'wrong item'});assert.equal((await api('POST',path()+'/shopee-prices/'+r.id+'/void',{reasonCode:'ERROR'})).status,409);
 const audit=(await good('GET',path()+'/audit')).items.find(x=>x.action==='SHOPEE_VOIDED');assert.equal(audit.actor,'phase3-owner-a');assert.equal(audit.details.reason.text,'wrong item');assert.ok(audit.createdAt);await assert.rejects(q('DELETE FROM shopee_price_observations WHERE id=$1',[r.id]),e=>e.code==='23514');
});
test('Shopee GET returns complete ordered date-only history without cross-store leakage',async(t)=>{
 const item=(await good('POST',`/stores/${a}/catalog-products`,make('Shopee GET regression','876540001'))).product.id;
 const endpoint=path(item)+'/shopee-prices';
 await t.test('empty history succeeds',async()=>{assert.deepEqual((await good('GET',endpoint)).items,[]);});
 const entries=[];
 for(const observedAt of ['2024-02-29','0001-01-01','9999-12-31','0099-12-31','2000-02-29','2024-02-29']){
  const record=(await good('POST',endpoint,{priceTwd:'123.123456789012',observedAt,reasonCode:'OBSERVED'})).record;
  assert.equal(record.observedAt,observedAt);entries.push(record);
 }
 await good('POST',endpoint+'/'+entries[5].id+'/void',{reasonCode:'ERROR'});
 // Existing schema allows imported/legacy observations with no date; do not change its DDL.
 const undated=(await q("INSERT INTO shopee_price_observations(store_id,catalog_product_id,price_twd,observed_at,source) VALUES($1,$2,50,NULL,'SHEET_IMPORT') RETURNING id",[a,item])).rows[0];
 const foreignRecord=(await good('POST',path(foreign,b)+'/shopee-prices',{priceTwd:'999',observedAt:'9999-12-31',reasonCode:'OBSERVED'},'phase3-owner-b')).record;
 await t.test('dates descend, same dates use descending ID, VOIDED stays and NULL is last',async()=>{
  const history=(await good('GET',endpoint)).items;
  assert.deepEqual(history.map(x=>x.id),[entries[2].id,entries[5].id,entries[0].id,entries[4].id,entries[3].id,entries[1].id,undated.id]);
  assert.deepEqual(history.map(x=>x.observedAt),['9999-12-31','2024-02-29','2024-02-29','2000-02-29','0099-12-31','0001-01-01',null]);
  assert.deepEqual(history.map(x=>x.status),['ACTIVE','VOIDED','ACTIVE','ACTIVE','ACTIVE','ACTIVE','ACTIVE']);
  for(const row of history){assert.equal(row.storeId,a);assert.equal(row.catalogProductId,item);assert.notEqual(row.id,foreignRecord.id);if(row.observedAt!==null){assert.match(row.observedAt,/^\d{4}-\d{2}-\d{2}$/);assert.equal(row.priceTwd,'123.123456789012');}}
 });
 await t.test('foreign parent returns 404 and each owner sees only its history',async()=>{
  assert.equal((await api('GET',path(foreign)+'/shopee-prices')).status,404);
  const theirs=(await good('GET',path(foreign,b)+'/shopee-prices',undefined,'phase3-owner-b')).items;
  assert.ok(theirs.some(x=>x.id===foreignRecord.id));assert.ok(theirs.every(x=>x.storeId===b&&x.catalogProductId===foreign));
 });
});
test('Catalog list preserves exact cost strings matching detail and history',async(t)=>{
 const precisionCategory=(await q("INSERT INTO product_categories(store_id,name) VALUES($1,'Precision Regression') RETURNING id",[a])).rows[0].id;
 const cases=[
  {label:'maximum numeric',original:'999999999999999999.999999999999',effective:'999999999999999999.999999999999',mode:'NONE',rate:null,date:null},
  {label:'beyond safe integer',original:'9007199254740993.123456789012',effective:'9007199254740994.987654321098',mode:'MANUAL',rate:null,date:null},
  {label:'twelve decimal rate',original:'1000.000000000000',effective:'123.456789012000',mode:'RATE',rate:'0.123456789012',date:'2024-02-29'},
 ];
 const fixtures=[];
 for(const [i,entry] of cases.entries()){
  const item=(await good('POST',`/stores/${a}/catalog-products`,{...make('Precision Regression '+entry.label,'87654100'+i),categoryId:precisionCategory})).product.id;
  await good('POST',path(item)+'/cost-records',{originalPriceJpy:entry.original,adjustmentMode:entry.mode,...(entry.mode==='MANUAL'?{effectiveCostJpy:entry.effective}:{}),...(entry.rate===null?{}:{adjustmentRate:entry.rate}),...(entry.date===null?{}:{observedAt:entry.date}),reasonCode:'UPDATED'});
  fixtures.push({entry,item});
 }
 const listed=[];
 for(const page of [1,2]){const result=await good('GET',`/stores/${a}/catalog-products?categoryId=${precisionCategory}&pageSize=2&page=${page}`);assert.equal(result.total,3);assert.ok(result.items.length<=2);listed.push(...result.items);}
 for(const {entry,item} of fixtures)await t.test(entry.label,async()=>{
  const detail=(await good('GET',path(item))).product.currentCost;
  const history=(await good('GET',path(item)+'/cost-records')).items.find(x=>x.isCurrent);
  const listCost=listed.find(x=>x.id===item).currentCost;
  const expected={originalPriceJpy:entry.original,effectiveCostJpy:entry.effective,adjustmentRate:entry.rate,observedAt:entry.date};
  for(const [source,cost] of [['detail',detail],['history',history],['list',listCost]]){
   assert.deepEqual(Object.fromEntries(Object.keys(expected).map(key=>[key,cost[key]])),expected,source);
   assert.equal(typeof cost.originalPriceJpy,'string',source);assert.equal(typeof cost.effectiveCostJpy,'string',source);
   assert.equal(cost.adjustmentRate===null?null:typeof cost.adjustmentRate,entry.rate===null?null:'string',source);
   assert.equal(cost.id,detail.id,source);assert.equal(typeof cost.id,'number',source);assert.equal(cost.storeId,a,source);assert.equal(cost.catalogProductId,item,source);assert.equal(cost.isCurrent,true,source);
  }
 });
});
test('barcode correction and clone preserve independent histories and source audit',async()=>{
 const before=(await good('GET',path()+'/cost-records')).items.length;await good('POST',path()+'/correct-barcode',{barcode:'00777',barcodeStatus:'REAL',reasonCode:'CORRECTION'});assert.equal((await good('GET',path())).product.barcode,'00777');
 clone=(await good('POST',path()+'/clone-with-new-barcode',{barcode:'00888',barcodeStatus:'REAL',originalPriceJpy:'150',reasonCode:'NEW_VARIANT'})).product.id;assert.notEqual(clone,p);const costs=(await good('GET',path(clone)+'/cost-records')).items;assert.equal(costs.length,1);assert.equal(costs[0].supersedesCostRecordId,null);assert.equal((await good('GET',path()+'/cost-records')).items.length,before);
 assert.ok((await good('GET',path()+'/audit')).items.some(x=>x.action==='CATALOG_CLONED'&&x.details.newCatalogProductId===clone));
});
test('relationships are ordered, scoped and reverse duplicates rejected',async()=>{
 const r=(await good('POST',path()+'/relationships',{targetCatalogProductId:clone,relationType:'POSSIBLE_DUPLICATE'})).record;assert.ok(r.sourceCatalogProductId<r.targetCatalogProductId);assert.equal((await api('POST',path(clone)+'/relationships',{targetCatalogProductId:p,relationType:'RELATED'})).status,409);assert.equal((await api('POST',path()+'/relationships',{targetCatalogProductId:foreign,relationType:'RELATED'})).status,404);assert.equal((await api('POST',path()+'/relationships',{targetCatalogProductId:p,relationType:'RELATED'})).status,400);await good('DELETE',path()+'/relationships/'+r.id);
});
test('archive status is consistent; historical delete is 409 and truly empty delete succeeds',async()=>{
 await good('PATCH',path(),{status:'ARCHIVED'});assert.ok((await good('GET',path())).product.archivedAt);assert.ok(!(await good('GET',`/stores/${a}/catalog-products`)).items.some(x=>x.id===p));assert.ok((await good('GET',`/stores/${a}/catalog-products?status=ARCHIVED&includeArchived=true`)).items.some(x=>x.id===p));await good('PATCH',path(),{status:'NORMAL'});assert.equal((await good('GET',path())).product.archivedAt,null);assert.equal((await api('DELETE',path())).status,409);
 const empty=(await q("INSERT INTO catalog_products(store_id,name,normalized_name,barcode,barcode_status,weight_grams) VALUES($1,'empty','empty','0','NONE',1) RETURNING id",[a])).rows[0].id;assert.equal((await good('DELETE',path(empty))).deleted,true);
});
test('settings edits bump version, keep user changes on initialize and validate costs',async()=>{
 const before=(await good('GET',`/stores/${a}/pricing-settings`)).settings.settingsVersion;const edited=await good('PATCH',`/stores/${a}/pricing-settings`,{profitLossMaxTwd:'-10',profitLowMaxTwd:'0',profitMediumMaxTwd:'50'});assert.notEqual(edited.settings.settingsVersion,before);
 for(const body of [{targetMarginRate:'1'},{profitLossMaxTwd:'1000'},{routePaymentFeeRate:'-1'}])assert.equal((await api('PATCH',`/stores/${a}/pricing-settings`,body)).status,400);
 await good('PATCH',`/stores/${a}/shipping-profiles/${ship}`,{rateTwd:'221'});await good('POST',`/stores/${a}/pricing-settings/initialize`,{});assert.equal((await good('GET',`/stores/${a}/shipping-profiles`)).items.find(x=>x.id===ship).rateTwd,'221.000000000000');assert.equal((await api('DELETE',`/stores/${a}/shipping-profiles/${ship}`)).status,409);
 const shipping=(await good('POST',`/stores/${a}/shipping-profiles`,{code:'CUSTOM_FREE',name:'free',rateTwd:'0',basisWeightGrams:'1'})).record;await good('PATCH',`/stores/${a}/shipping-profiles/${shipping.id}`,{isActive:false});assert.equal((await api('POST',`/stores/${a}/catalog-products`,{...make('invalid shipping','555'),defaultShippingProfileId:shipping.id})).status,404);await good('DELETE',`/stores/${a}/shipping-profiles/${shipping.id}`);
});
test('same-store resource and canonical path checks precede data access',async()=>{
 for(const suffix of ['', '/aliases','/cost-records','/shopee-prices','/relationships','/audit'])assert.equal((await api('GET',path(foreign)+suffix)).status,404);
 for(const spelling of ['0'+a,a+'e0','+'+a,' '+a,'2147483648'])assert.equal((await api('GET',`/stores/${encodeURIComponent(spelling)}/catalog-products`)).status,400);
 assert.equal((await api('POST',path()+'/cost-records/'+foreignCost+'/void',{reasonCode:'ERROR'})).status,404);
});
test('every optional Catalog FK and child mutation rejects cross-store resources',async()=>{
 const otherSettings=await good('GET',`/stores/${b}/pricing-settings`,undefined,'phase3-owner-b');
 const otherTrip=(await q("INSERT INTO trips(store_id,name,exchange_rate) VALUES($1,'foreign trip',.2) RETURNING id",[b])).rows[0].id;
 const otherRoute=(await q("INSERT INTO trip_routes(store_id,trip_id,area_title,start_place,end_place,est_qty) VALUES($1,$2,'foreign','a','b',10) RETURNING id",[b,otherTrip])).rows[0].id;
 for(const fields of [{categoryId:foreignCategory},{lastUsedTripRouteId:otherRoute},{defaultPricingTemplateId:otherSettings.templates[0].id},{defaultShippingProfileId:otherSettings.shippingProfiles[0].id}]){
  assert.equal((await api('POST',`/stores/${a}/catalog-products`,{...make('bad FK','887766'),...fields})).status,404);
  assert.equal((await api('PATCH',path(),fields)).status,404);
 }
 const observation=(await good('POST',path(foreign,b)+'/shopee-prices',samples.CatalogShopeeInput,'phase3-owner-b')).record;
 assert.equal((await api('POST',path()+'/shopee-prices/'+observation.id+'/void',{reasonCode:'ERROR'})).status,404);
 const otherTarget=(await good('POST',`/stores/${b}/catalog-products`,make('foreign target','9998'),'phase3-owner-b')).product.id;
 const relation=(await good('POST',path(foreign,b)+'/relationships',{targetCatalogProductId:otherTarget,relationType:'RELATED'},'phase3-owner-b')).record;
 assert.equal((await api('DELETE',path()+'/relationships/'+relation.id)).status,404);
 assert.equal((await api('PATCH',`/stores/${a}/pricing-templates/${otherSettings.templates[0].id}`,{name:'spoof'})).status,404);
 assert.equal((await api('DELETE',`/stores/${a}/shipping-profiles/${otherSettings.shippingProfiles[0].id}`)).status,404);
 for(const value of ['0','01','2147483648','9999999999'])assert.equal(schemas.CatalogListQueryParams.safeParse({categoryId:value}).success,false,value);
 assert.equal(schemas.CatalogListQueryParams.safeParse({categoryId:'2147483647'}).success,true);
});
test('custom template CRUD and deactivation preserve references without silent overwrite',async()=>{
 const row=(await good('POST',`/stores/${a}/pricing-templates`,{...samples.CatalogTemplateInput,defaultShippingProfileId:ship})).record;
 await good('PATCH',`/stores/${a}/pricing-templates/${row.id}`,{name:'edited custom',costAdjustmentMode:'RATE',costAdjustmentRate:'0.8'});
 const prod=(await good('POST',`/stores/${a}/catalog-products`,{...make('custom template item','445566'),defaultPricingTemplateId:row.id})).product;
 assert.equal((await api('DELETE',`/stores/${a}/pricing-templates/${row.id}`)).status,409);
 await good('PATCH',`/stores/${a}/pricing-templates/${row.id}`,{isActive:false});
 assert.equal((await api('POST',`/stores/${a}/catalog-products`,{...make('disabled template','445567'),defaultPricingTemplateId:row.id})).status,404);
 assert.equal((await good('GET',path(prod.id))).product.defaultPricingTemplateId,row.id);
 const unused=(await good('POST',`/stores/${a}/pricing-templates`,samples.CatalogTemplateInput)).record;
 assert.equal((await good('DELETE',`/stores/${a}/pricing-templates/${unused.id}`)).deleted,true);
});
test('nonempty audit rollback refuses atomically and keeps immutable history',async()=>{
 const c=await pool.connect();try{
  const down=readFileSync(new URL('../lib/db/migrations/rollback/0042_catalog_search_audit.sql',import.meta.url),'utf8');
  await assert.rejects(c.query(down),e=>e.code==='23514');
 }finally{await c.query('ROLLBACK');c.release();}
 assert.ok(Number((await q('SELECT count(*) n FROM catalog_audit_events')).rows[0].n)>0);
});
