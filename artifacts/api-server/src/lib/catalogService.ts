import {pool, PRODUCT_DATABASE_SYSTEM_DEFAULTS} from '@workspace/db';
import {CatalogError,catalogName,normalizeCatalog,catalogBarcode,catalogDecimal,catalogDate,catalogCost,catalogReason,literalLike} from '@workspace/db/catalog';
import {ExactDecimal} from '@workspace/db/transport-cost';
import {randomUUID} from 'node:crypto';
function connect(){return pool.connect();}
type Client=Awaited<ReturnType<typeof connect>>;
type Input=Record<string,any>;
function cmp(left:string,right:string){const a=ExactDecimal.from(left),b=ExactDecimal.from(right);const n=a.numerator*b.denominator-b.numerator*a.denominator;return n<0n?-1:n>0n?1:0;}
export function catalogDto(value:any):any {
 if(value instanceof Date)return value.toISOString();
 if(Array.isArray(value))return value.map(catalogDto);
 if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),catalogDto(v)]));
 return value;
}
async function rows(c:Client,sql:string,args:any[]=[]){return (await c.query(sql,args)).rows;}
async function one(c:Client,sql:string,args:any[]=[]){return (await rows(c,sql,args))[0];}
async function audit(c:Client,s:number,id:number|null,actor:string,action:string,details:any){
 const payload=JSON.stringify(details);if(Buffer.byteLength(payload)>30000)throw new CatalogError(400,'變更內容過長');
 await c.query('INSERT INTO catalog_audit_events(store_id,catalog_product_id,actor,action,details) VALUES($1,$2,$3,$4,$5)',[s,id,actor,action,payload]);
}
async function product(c:Client,s:number,id:number,lock=false){const p=await one(c,'SELECT * FROM catalog_products WHERE store_id=$1 AND id=$2'+(lock?' FOR UPDATE':''),[s,id]);if(!p)throw new CatalogError(404,'找不到此店鋪商品');return p;}
async function productView(c:Client,s:number,id:number){
 const p=await product(c,s,id);
 p.current_cost=await one(c,"SELECT *,observed_at::text AS observed_at FROM product_cost_records WHERE store_id=$1 AND catalog_product_id=$2 AND status='ACTIVE' AND is_current",[s,id])??null;
 return catalogDto(p);
}
async function references(c:Client,s:number,b:Input){
 for(const [field,table,active] of [['categoryId','product_categories',false],['lastUsedTripRouteId','trip_routes',false],['defaultPricingTemplateId','pricing_templates',true],['defaultShippingProfileId','international_shipping_profiles',true]] as const){
  if(b[field]!=null && !await one(c,`SELECT id FROM ${table} WHERE store_id=$1 AND id=$2${active?' AND is_active':''}`,[s,b[field]]))throw new CatalogError(404,`${field} 不屬於此店鋪或已停用`);
 }
 for(const field of ['imageUrl','sourceUrl'])if(b[field]!=null){let u:URL;try{u=new URL(b[field]);}catch{throw new CatalogError(400,'網址格式錯誤');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new CatalogError(400,'只接受一般 http(s) 網址');}
}
const catalogColumns:Record<string,string>={name:'name',weightGrams:'weight_grams',categoryId:'category_id',status:'status',imageUrl:'image_url',internalNote:'internal_note',preferredRouteLabel:'preferred_route_label',lastUsedTripRouteId:'last_used_trip_route_id',defaultPricingTemplateId:'default_pricing_template_id',defaultShippingProfileId:'default_shipping_profile_id',defaultDepartmentStoreFeeRate:'default_department_store_fee_rate'};
async function updateFields(c:Client,table:string,s:number,id:number,b:Input,columns:Record<string,string>){
 const args:any[]=[s,id],sets:string[]=[];
 for(const [field,column] of Object.entries(columns))if(b[field]!==undefined){args.push(b[field]);sets.push(`${column}=$${args.length}`);}
 if(!sets.length)throw new CatalogError(400,'沒有可修改欄位');
 return one(c,`UPDATE ${table} SET ${sets.join(',')},updated_at=now() WHERE store_id=$1 AND id=$2 RETURNING *`,args);
}
async function duplicateCandidates(c:Client,s:number,b:Input,exclude=0){
 if(b.barcodeStatus==='REAL')return rows(c,'SELECT * FROM catalog_products WHERE store_id=$1 AND barcode_status=\'REAL\' AND barcode=$2 AND id<>$3 ORDER BY id LIMIT 100',[s,b.barcode,exclude]);
 return rows(c,"SELECT c.* FROM catalog_products c JOIN product_cost_records p ON p.store_id=c.store_id AND p.catalog_product_id=c.id AND p.is_current AND p.status='ACTIVE' WHERE c.store_id=$1 AND c.barcode_status='NONE' AND c.normalized_name=$2 AND c.weight_grams=$3 AND p.original_price_jpy=$4 AND c.id<>$5 ORDER BY c.id LIMIT 100",[s,normalizeCatalog(b.name),b.weightGrams,b.originalPriceJpy,exclude]);
}
async function appendCost(c:Client,s:number,id:number,b:Input,actor:string,initial=false){
 await product(c,s,id,true);const v=catalogCost(b as any);const why=catalogReason(initial?{reasonCode:'INITIAL_CREATE'}:b);
 if(b.supersedesCostRecordId!=null && !await one(c,'SELECT id FROM product_cost_records WHERE store_id=$1 AND catalog_product_id=$2 AND id=$3 AND status=\'ACTIVE\'',[s,id,b.supersedesCostRecordId]))throw new CatalogError(404,'取代的成本紀錄不屬於此商品或已作廢');
 const old=await one(c,"SELECT id FROM product_cost_records WHERE store_id=$1 AND catalog_product_id=$2 AND status='ACTIVE' AND is_current",[s,id]);
 await c.query("UPDATE product_cost_records SET is_current=false WHERE store_id=$1 AND catalog_product_id=$2 AND status='ACTIVE' AND is_current",[s,id]);
 const record=await one(c,"INSERT INTO product_cost_records(store_id,catalog_product_id,original_price_jpy,effective_cost_jpy,adjustment_mode,adjustment_rate,adjustment_reason,observed_at,source,is_current,supersedes_cost_record_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'MANUAL',true,$9) RETURNING *,observed_at::text AS observed_at",[s,id,v.original,v.effective,v.mode,v.rate,b.adjustmentReason??null,catalogDate(b.observedAt),b.supersedesCostRecordId??old?.id??null]);
 await audit(c,s,id,actor,'COST_APPENDED',{recordId:record.id,reason:why,previousCurrentId:old?.id??null,originalPriceJpy:v.original,effectiveCostJpy:v.effective});
 return catalogDto(record);
}
async function create(c:Client,s:number,b:Input,actor:string,sourceId?:number){
 const name=catalogName(b.name),barcode=catalogBarcode(b.barcode,b.barcodeStatus),weight=catalogDecimal(b.weightGrams,2);
 await references(c,s,b);catalogCost(b as any);
 const candidates=await duplicateCandidates(c,s,{...b,name,barcode,weightGrams:weight});
 if(b.barcodeStatus==='REAL' && candidates.length && b.forceCreate!==true)throw new CatalogError(409,'此條碼已有商品；請確認是否仍要新增',{candidates:catalogDto(candidates),requiresForceCreate:true});
 const p=await one(c,'INSERT INTO catalog_products(store_id,name,normalized_name,barcode,barcode_status,weight_grams,category_id,status,image_url,internal_note,preferred_route_label,last_used_trip_route_id,default_pricing_template_id,default_shipping_profile_id,default_department_store_fee_rate,archived_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CASE WHEN $8=\'ARCHIVED\' THEN now() ELSE NULL END) RETURNING *',[s,name,normalizeCatalog(name),barcode,b.barcodeStatus,weight,b.categoryId??null,b.status??'NORMAL',b.imageUrl??null,b.internalNote??null,b.preferredRouteLabel??null,b.lastUsedTripRouteId??null,b.defaultPricingTemplateId??null,b.defaultShippingProfileId??null,b.defaultDepartmentStoreFeeRate==null?null:catalogDecimal(b.defaultDepartmentStoreFeeRate)]);
 await appendCost(c,s,p.id,b,actor,true);
 await audit(c,s,p.id,actor,'CATALOG_CREATED',{sourceCatalogProductId:sourceId??null,barcode,barcodeStatus:b.barcodeStatus,forceCreate:b.forceCreate===true});
 if(sourceId)await audit(c,s,sourceId,actor,'CATALOG_CLONED',{newCatalogProductId:p.id,reason:catalogReason(b)});
 return {product:await productView(c,s,p.id),candidates:catalogDto(candidates)};
}
async function search(c:Client,s:number,q:Input){
 const page=Number(q.page??1),pageSize=Number(q.pageSize??25),include=q.includeArchived==='true';
 if(q.categoryId && Number(q.categoryId)>2147483647)throw new CatalogError(400,'分類 ID 超出範圍');
 if(q.status==='ARCHIVED'&&!include)throw new CatalogError(400,'搜尋封存商品須 includeArchived=true');
 if(q.exactBarcode!==undefined&&q.q!==undefined)throw new CatalogError(400,'條碼與關鍵字請擇一查詢，避免混用');
 const exact=q.exactBarcode===undefined?undefined:catalogBarcode(typeof q.exactBarcode==='string'?q.exactBarcode:'','REAL');
 const norm=normalizeCatalog(q.q??'');if(q.q?.length && !norm)return {items:[],total:0,page,pageSize};
 const args:any[]=[s],where=['c.store_id=$1'];const bind=(v:any)=>{args.push(v);return '$'+args.length;};
 if(!include)where.push("c.status<>'ARCHIVED'");
 if(q.status)where.push('c.status='+bind(q.status));if(q.categoryId)where.push('c.category_id='+bind(Number(q.categoryId)));if(q.barcodeStatus)where.push('c.barcode_status='+bind(q.barcodeStatus));
 if(exact!==undefined)where.push("c.barcode_status='REAL'",'c.barcode='+bind(exact));
 const costExists="EXISTS(SELECT 1 FROM product_cost_records pc WHERE pc.store_id=c.store_id AND pc.catalog_product_id=c.id AND pc.status='ACTIVE' AND pc.is_current";
 const similarity=[q.similarName,q.similarWeightGrams,q.similarOriginalPriceJpy];
 if(similarity.some(v=>v!==undefined)){
  if(similarity.some(v=>v===undefined))throw new CatalogError(400,'相似商品須提供名稱、重量及原價');
  where.push("c.barcode_status='NONE'",'c.normalized_name='+bind(normalizeCatalog(catalogName(q.similarName))),'c.weight_grams='+bind(catalogDecimal(q.similarWeightGrams,2)),costExists+' AND pc.original_price_jpy='+bind(catalogDecimal(q.similarOriginalPriceJpy))+')');
 }
 if(q.filter==='MISSING_DATA')where.push('NOT '+costExists+')');
 if(q.filter==='COST_UPDATED')where.push(costExists+' AND pc.supersedes_cost_record_id IS NOT NULL)');
 if(q.filter==='POSSIBLE_DUPLICATE')where.push("(EXISTS(SELECT 1 FROM product_relationships r WHERE r.store_id=c.store_id AND (r.source_catalog_product_id=c.id OR r.target_catalog_product_id=c.id) AND r.relation_type='POSSIBLE_DUPLICATE') OR (c.barcode_status='REAL' AND EXISTS(SELECT 1 FROM catalog_products other WHERE other.store_id=c.store_id AND other.barcode_status='REAL' AND other.barcode=c.barcode AND other.id<>c.id)))");
 let rank='(0+0)';
 if(norm){const n=bind(norm),sub=bind('%'+literalLike(norm)+'%'),pre=bind(literalLike(norm)+'%'),bar=bind((q.q as string).normalize('NFKC').trim()),barSub=bind('%'+literalLike((q.q as string).normalize('NFKC').trim())+'%');
  const alias=(condition:string)=>`EXISTS(SELECT 1 FROM catalog_product_aliases a WHERE a.store_id=c.store_id AND a.catalog_product_id=c.id AND ${condition})`;
  const exactAlias=alias('a.normalized_alias='+n),prefixAlias=alias('a.normalized_alias LIKE '+pre),substringAlias=alias('a.normalized_alias LIKE '+sub);
  where.push(`(c.normalized_name LIKE ${sub} OR ${substringAlias} OR (c.barcode_status='REAL' AND c.barcode LIKE ${barSub}) OR lower(cat.name) LIKE ${sub} OR similarity(c.normalized_name,${n})>=0.3 OR ${alias('similarity(a.normalized_alias,'+n+')>=0.3')})`);
  rank=`CASE WHEN c.barcode_status='REAL' AND c.barcode=${bar} THEN 0 WHEN c.normalized_name=${n} THEN 1 WHEN ${exactAlias} THEN 2 WHEN c.normalized_name LIKE ${pre} THEN 3 WHEN ${prefixAlias} THEN 4 WHEN c.normalized_name LIKE ${sub} OR ${substringAlias} THEN 5 WHEN lower(cat.name) LIKE ${sub} THEN 6 ELSE 7 END`;
 }
 const from=' FROM catalog_products c LEFT JOIN product_categories cat ON cat.store_id=c.store_id AND cat.id=c.category_id WHERE '+where.join(' AND ');
 const total=Number((await one(c,'SELECT count(*) n FROM (SELECT '+rank+' AS priority'+from+') matched',args)).n);
 const limit=bind(pageSize),offset=bind((page-1)*pageSize);
 const items=await rows(c,`SELECT c.*, (SELECT to_jsonb(pc)||jsonb_build_object('original_price_jpy',pc.original_price_jpy::text,'effective_cost_jpy',pc.effective_cost_jpy::text,'adjustment_rate',pc.adjustment_rate::text) FROM product_cost_records pc WHERE pc.store_id=c.store_id AND pc.catalog_product_id=c.id AND pc.status='ACTIVE' AND pc.is_current) AS current_cost`+from+` ORDER BY ${rank},c.id LIMIT ${limit} OFFSET ${offset}`,args);
 return {items:catalogDto(items),total,page,pageSize};
}
const settingDefaults={targetMarginRate:'0.35',lossProtectionTwd:'5',purchasePaymentFeeRate:'0.015',routePaymentFeeRate:'0.015',staleSaleDays:180,profitLossMaxTwd:'25',profitLowMaxTwd:'50',profitMediumMaxTwd:'100',settingsVersion:'v1'};
async function bumpSettings(c:Client,s:number){await c.query('INSERT INTO store_pricing_settings(store_id) VALUES($1) ON CONFLICT DO NOTHING',[s]);await c.query('UPDATE store_pricing_settings SET settings_version=$2,updated_at=now() WHERE store_id=$1',[s,randomUUID()]);}
async function settings(c:Client,s:number){return {settings:catalogDto(await one(c,'SELECT * FROM store_pricing_settings WHERE store_id=$1',[s]))??settingDefaults,templates:catalogDto(await rows(c,'SELECT * FROM pricing_templates WHERE store_id=$1 ORDER BY id',[s])),shippingProfiles:catalogDto(await rows(c,'SELECT * FROM international_shipping_profiles WHERE store_id=$1 ORDER BY id',[s]))};}
async function initialize(c:Client,s:number,actor:string){
 await c.query('INSERT INTO store_pricing_settings(store_id) VALUES($1) ON CONFLICT DO NOTHING',[s]);
 for(const ship of PRODUCT_DATABASE_SYSTEM_DEFAULTS.shipping)await c.query('INSERT INTO international_shipping_profiles(store_id,code,name,rate_twd,basis_weight_grams) VALUES($1,$2,$2,$3,$4) ON CONFLICT(store_id,code) DO NOTHING',[s,ship.code,ship.rateTwd,ship.basisWeightGrams]);
 for(const t of PRODUCT_DATABASE_SYSTEM_DEFAULTS.templates){const ship=await one(c,'SELECT id FROM international_shipping_profiles WHERE store_id=$1 AND code=$2',[s,t.shippingCode]);await c.query('INSERT INTO pricing_templates(store_id,code,name,cost_adjustment_mode,cost_adjustment_rate,department_store_fee_rate,default_shipping_profile_id,is_system_default) SELECT $1,$2,$2,$3,$4,$5,$6,true WHERE NOT EXISTS(SELECT 1 FROM pricing_templates WHERE store_id=$1 AND code=$2 AND is_system_default)',[s,t.code,t.costAdjustmentMode,t.costAdjustmentRate,t.departmentStoreFeeRate,ship.id]);}
 await bumpSettings(c,s);await audit(c,s,null,actor,'SETTINGS_INITIALIZED',{});return {...await settings(c,s),initialized:true};
}
export async function catalogExecute(operation:string,params:Input,body:Input,query:Input,actor:string){
 const c=await pool.connect();
 try {
  await c.query('BEGIN');
  const result=await catalogExecuteInTransaction(c,operation,params,body,query,actor);
  await c.query('COMMIT');return result;
 } catch(error:any){await c.query('ROLLBACK');if(error instanceof CatalogError)throw error;if(['23503','23505','23514','22003','22007','22008','22001'].includes(error.code))throw new CatalogError(error.code==='23505'||error.code==='23503'?409:400,'資料有衝突或不符合欄位限制');throw error;}finally{c.release();}
}
/** Uses the caller's transaction. Store lock precedes every related row lock. */
export async function catalogExecuteInTransaction(c:Client,operation:string,params:Input,body:Input,query:Input,actor:string){
 const s=params.storeId,id=params.catalogProductId;const reading=['catalogList','catalogGet','catalogAliases','catalogCosts','catalogShopee','catalogRelationships','catalogAudit','catalogSettingsGet','catalogTemplates','catalogShippingProfiles'].includes(operation);
  if(!reading){const owner=await one(c,'SELECT merchant_id FROM stores WHERE id=$1 FOR UPDATE',[s]);if(!owner)throw new CatalogError(404,'店鋪不存在');if(owner.merchant_id!==actor)throw new CatalogError(403,'不是店鋪擁有者');}
  let p:any;if(id)p=await product(c,s,id,!reading);
  let result:any;
  switch(operation){
   case 'catalogList':result=await search(c,s,query);break;
   case 'catalogGet':result={product:await productView(c,s,id)};break;
   case 'catalogCreate':result=await create(c,s,body,actor);break;
   case 'catalogPatch':{
    const b={...body};await references(c,s,b);if(b.name!==undefined)b.name=catalogName(b.name);if(b.weightGrams!==undefined)b.weightGrams=catalogDecimal(b.weightGrams,2);if(b.defaultDepartmentStoreFeeRate!=null)b.defaultDepartmentStoreFeeRate=catalogDecimal(b.defaultDepartmentStoreFeeRate);
    if(b.name!==undefined && b.name!==p.name){await c.query("INSERT INTO catalog_product_aliases(store_id,catalog_product_id,alias,normalized_alias,source) VALUES($1,$2,$3,$4,'RENAMED') ON CONFLICT(catalog_product_id,normalized_alias) DO NOTHING",[s,id,p.name,p.normalized_name]);}
    await updateFields(c,'catalog_products',s,id,b,catalogColumns);
    await c.query("UPDATE catalog_products SET normalized_name=$3,archived_at=CASE WHEN status='ARCHIVED' THEN coalesce(archived_at,now()) ELSE NULL END WHERE store_id=$1 AND id=$2",[s,id,normalizeCatalog(b.name??p.name)]);
    await audit(c,s,id,actor,'CATALOG_PATCHED',{before:catalogDto(p),changes:b});result={product:await productView(c,s,id)};break;
   }
   case 'catalogDelete':{
    const relations=await one(c,"SELECT EXISTS(SELECT 1 FROM catalog_product_aliases WHERE store_id=$1 AND catalog_product_id=$2 UNION ALL SELECT 1 FROM product_cost_records WHERE store_id=$1 AND catalog_product_id=$2 UNION ALL SELECT 1 FROM shopee_price_observations WHERE store_id=$1 AND catalog_product_id=$2 UNION ALL SELECT 1 FROM product_relationships WHERE store_id=$1 AND (source_catalog_product_id=$2 OR target_catalog_product_id=$2) UNION ALL SELECT 1 FROM products WHERE store_id=$1 AND catalog_product_id=$2 UNION ALL SELECT 1 FROM listing_pricing_snapshots WHERE store_id=$1 AND catalog_product_id=$2 UNION ALL SELECT 1 FROM order_items WHERE store_id=$1 AND catalog_product_id=$2 UNION ALL SELECT 1 FROM sheet_import_rows WHERE store_id=$1 AND matched_catalog_product_id=$2 UNION ALL SELECT 1 FROM catalog_audit_events WHERE store_id=$1 AND catalog_product_id=$2) linked",[s,id]);
    if(relations.linked)throw new CatalogError(409,'此商品已有歷史或關聯，請改為封存');await c.query('DELETE FROM catalog_products WHERE store_id=$1 AND id=$2',[s,id]);await audit(c,s,null,actor,'CATALOG_DELETED',{catalogProductId:id,name:p.name});result={deleted:true};break;
   }
   case 'catalogCorrectBarcode':{const why=catalogReason(body),barcode=catalogBarcode(body.barcode,body.barcodeStatus);const candidates=await duplicateCandidates(c,s,{...body,barcode,name:p.name,weightGrams:p.weight_grams,originalPriceJpy:'0'},id);if(body.barcodeStatus==='REAL'&&candidates.length&&!body.forceCreate)throw new CatalogError(409,'此條碼已有商品，請確認更正',{candidates:catalogDto(candidates),requiresForceCreate:true});await c.query('UPDATE catalog_products SET barcode=$3,barcode_status=$4,updated_at=now() WHERE store_id=$1 AND id=$2',[s,id,barcode,body.barcodeStatus]);await audit(c,s,id,actor,'BARCODE_CORRECTED',{before:p.barcode,after:barcode,reason:why});result={product:await productView(c,s,id),candidates:catalogDto(candidates)};break;}
   case 'catalogClone':{catalogReason(body);if(body.barcodeStatus!=='REAL'||catalogBarcode(body.barcode,body.barcodeStatus)===p.barcode)throw new CatalogError(400,'複製須使用不同的真實條碼');result=await create(c,s,{...catalogDto(p),...body},actor,id);break;}
   case 'catalogAliases':result={items:catalogDto(await rows(c,'SELECT * FROM catalog_product_aliases WHERE store_id=$1 AND catalog_product_id=$2 ORDER BY id',[s,id]))};break;
   case 'catalogAliasCreate':{const alias=catalogName(body.alias),normal=normalizeCatalog(alias);if(normal===p.normalized_name)throw new CatalogError(409,'別名與正式名稱相同');const r=await one(c,"INSERT INTO catalog_product_aliases(store_id,catalog_product_id,alias,normalized_alias,source) VALUES($1,$2,$3,$4,'MANUAL') ON CONFLICT(catalog_product_id,normalized_alias) DO NOTHING RETURNING *",[s,id,alias,normal]);if(!r)throw new CatalogError(409,'此別名已存在');await audit(c,s,id,actor,'ALIAS_ADDED',{aliasId:r.id,alias});result={record:catalogDto(r)};break;}
   case 'catalogAliasDelete':{const r=await one(c,'DELETE FROM catalog_product_aliases WHERE store_id=$1 AND catalog_product_id=$2 AND id=$3 RETURNING *',[s,id,params.aliasId]);if(!r)throw new CatalogError(404,'找不到此別名');await audit(c,s,id,actor,'ALIAS_DELETED',r);result={deleted:true};break;}
   case 'catalogCosts':result={items:catalogDto(await rows(c,'SELECT *,observed_at::text AS observed_at FROM product_cost_records WHERE store_id=$1 AND catalog_product_id=$2 ORDER BY created_at DESC,id DESC',[s,id]))};break;
   case 'catalogCostCreate':result={record:await appendCost(c,s,id,body,actor)};break;
   case 'catalogCostVoid':{const why=catalogReason(body);const r=await one(c,'SELECT * FROM product_cost_records WHERE store_id=$1 AND catalog_product_id=$2 AND id=$3 FOR UPDATE',[s,id,params.recordId]);if(!r)throw new CatalogError(404,'找不到此成本');if(r.status==='VOIDED')throw new CatalogError(409,'成本已作廢');await c.query("UPDATE product_cost_records SET status='VOIDED',is_current=false,void_reason_code=$4,void_reason_text=$5,voided_at=now(),voided_by=$6 WHERE store_id=$1 AND catalog_product_id=$2 AND id=$3",[s,id,r.id,why.code,why.text,actor]);let next=null;if(r.is_current){next=await one(c,"SELECT id FROM product_cost_records WHERE store_id=$1 AND catalog_product_id=$2 AND status='ACTIVE' ORDER BY created_at DESC,id DESC LIMIT 1",[s,id]);if(next)await c.query('UPDATE product_cost_records SET is_current=true WHERE store_id=$1 AND catalog_product_id=$2 AND id=$3',[s,id,next.id]);}await audit(c,s,id,actor,'COST_VOIDED',{recordId:r.id,reason:why,replacementCurrentId:next?.id??null});result={product:await productView(c,s,id)};break;}
   case 'catalogShopee':result={items:catalogDto(await rows(c,'SELECT o.id,o.store_id,o.catalog_product_id,o.price_twd,o.observed_at::text AS observed_at,o.source_url,o.note,o.source,o.status,o.created_at FROM shopee_price_observations o WHERE o.store_id=$1 AND o.catalog_product_id=$2 ORDER BY o.observed_at DESC NULLS LAST,o.id DESC',[s,id]))};break;
   case 'catalogShopeeCreate':{await references(c,s,body);const why=catalogReason(body);const r=await one(c,"INSERT INTO shopee_price_observations(store_id,catalog_product_id,price_twd,observed_at,source_url,note,source) VALUES($1,$2,$3,$4,$5,$6,'MANUAL') RETURNING *,observed_at::text AS observed_at",[s,id,catalogDecimal(body.priceTwd),catalogDate(body.observedAt),body.sourceUrl??null,body.note??null]);await audit(c,s,id,actor,'SHOPEE_RECORDED',{recordId:r.id,reason:why});result={record:catalogDto(r)};break;}
   case 'catalogShopeeVoid':{const why=catalogReason(body);const r=await one(c,"UPDATE shopee_price_observations SET status='VOIDED' WHERE store_id=$1 AND catalog_product_id=$2 AND id=$3 AND status='ACTIVE' RETURNING id",[s,id,params.recordId]);if(!r){if(await one(c,'SELECT id FROM shopee_price_observations WHERE store_id=$1 AND catalog_product_id=$2 AND id=$3',[s,id,params.recordId]))throw new CatalogError(409,'參考價已作廢');throw new CatalogError(404,'找不到此參考價');}await audit(c,s,id,actor,'SHOPEE_VOIDED',{recordId:r.id,reason:why});result={record:catalogDto(r)};break;}
   case 'catalogRelationships':result={items:catalogDto(await rows(c,'SELECT * FROM product_relationships WHERE store_id=$1 AND (source_catalog_product_id=$2 OR target_catalog_product_id=$2) ORDER BY id',[s,id]))};break;
   case 'catalogRelationshipCreate':{const target=await product(c,s,body.targetCatalogProductId);if(target.id===id)throw new CatalogError(400,'不能建立自身關係');const r=await one(c,'INSERT INTO product_relationships(store_id,source_catalog_product_id,target_catalog_product_id,relation_type,note) VALUES($1,$2,$3,$4,$5) ON CONFLICT(store_id,source_catalog_product_id,target_catalog_product_id) DO NOTHING RETURNING *',[s,Math.min(id,target.id),Math.max(id,target.id),body.relationType,body.note??null]);if(!r)throw new CatalogError(409,'關係已存在');await audit(c,s,id,actor,'RELATIONSHIP_ADDED',r);result={record:catalogDto(r)};break;}
   case 'catalogRelationshipDelete':{const r=await one(c,'DELETE FROM product_relationships WHERE store_id=$1 AND id=$3 AND (source_catalog_product_id=$2 OR target_catalog_product_id=$2) RETURNING *',[s,id,params.relationshipId]);if(!r)throw new CatalogError(404,'找不到此關係');await audit(c,s,id,actor,'RELATIONSHIP_DELETED',r);result={deleted:true};break;}
   case 'catalogAudit':result={items:catalogDto(await rows(c,'SELECT * FROM catalog_audit_events WHERE store_id=$1 AND catalog_product_id=$2 ORDER BY id',[s,id]))};break;
   case 'catalogSettingsGet':result=await settings(c,s);break;
   case 'catalogInitialize':result=await initialize(c,s,actor);break;
   case 'catalogSettingsPatch':{
    if(!Object.keys(body).length)throw new CatalogError(400,'沒有可修改欄位');
    const old={...settingDefaults,...catalogDto(await one(c,'SELECT * FROM store_pricing_settings WHERE store_id=$1',[s]))},merged={...old,...body};
    const cols:Record<string,string>={targetMarginRate:'target_margin_rate',lossProtectionTwd:'loss_protection_twd',purchasePaymentFeeRate:'purchase_payment_fee_rate',routePaymentFeeRate:'route_payment_fee_rate',profitLossMaxTwd:'profit_loss_max_twd',profitLowMaxTwd:'profit_low_max_twd',profitMediumMaxTwd:'profit_medium_max_twd',staleSaleDays:'stale_sale_days'};
    for(const k of Object.keys(cols))if(k!=='staleSaleDays')merged[k]=catalogDecimal(merged[k],12,k.startsWith('profit'));
    if(cmp(merged.targetMarginRate,'1')>=0)throw new CatalogError(400,'目標利率須小於 1');
    if(cmp(merged.profitLossMaxTwd,merged.profitLowMaxTwd)>=0||cmp(merged.profitLowMaxTwd,merged.profitMediumMaxTwd)>=0)throw new CatalogError(400,'利潤門檻必須遞增');
    await c.query('INSERT INTO store_pricing_settings(store_id) VALUES($1) ON CONFLICT DO NOTHING',[s]);const vals=Object.keys(cols).map(k=>merged[k]);await c.query(`UPDATE store_pricing_settings SET ${Object.values(cols).map((k,i)=>k+'=$'+(i+2)).join(',')},settings_version=$10,updated_at=now() WHERE store_id=$1`,[s,...vals,randomUUID()]);await audit(c,s,null,actor,'SETTINGS_CHANGED',{before:old,changes:body});result=await settings(c,s);break;
   }
   case 'catalogTemplates':result={items:catalogDto(await rows(c,'SELECT * FROM pricing_templates WHERE store_id=$1 ORDER BY id',[s]))};break;
   case 'catalogShippingProfiles':result={items:catalogDto(await rows(c,'SELECT * FROM international_shipping_profiles WHERE store_id=$1 ORDER BY id',[s]))};break;
   case 'catalogTemplateCreate':case 'catalogTemplatePatch':case 'catalogTemplateDelete':case 'catalogShippingCreate':case 'catalogShippingPatch':case 'catalogShippingDelete':{
    const template=operation.includes('Template'),table=template?'pricing_templates':'international_shipping_profiles',rid=template?params.templateId:params.shippingProfileId;
    const old=rid?await one(c,`SELECT * FROM ${table} WHERE store_id=$1 AND id=$2 FOR UPDATE`,[s,rid]):null;if(rid&&!old)throw new CatalogError(404,'找不到此設定');
    if(operation.endsWith('Delete')){try{await c.query(`DELETE FROM ${table} WHERE store_id=$1 AND id=$2`,[s,rid]);}catch(e:any){if(e.code==='23503')throw new CatalogError(409,'已使用的設定請改為停用');throw e;}await bumpSettings(c,s);await audit(c,s,null,actor,'PROFILE_DELETED',{table,id:rid});result={deleted:true};break;}
    const merged={...catalogDto(old),...body};if(!merged.name?.trim())throw new CatalogError(400,'名稱不可空白');
    if(template){await references(c,s,merged);catalogDecimal(merged.costAdjustmentRate);catalogDecimal(merged.departmentStoreFeeRate);}else{catalogDecimal(merged.rateTwd);if(cmp(catalogDecimal(merged.basisWeightGrams),'0')<=0)throw new CatalogError(400,'運費基準重量必須大於 0');}
    let r:any;if(rid){const cols:Record<string,string>=template?{name:'name',costAdjustmentMode:'cost_adjustment_mode',costAdjustmentRate:'cost_adjustment_rate',departmentStoreFeeRate:'department_store_fee_rate',defaultShippingProfileId:'default_shipping_profile_id',isActive:'is_active'}:{name:'name',rateTwd:'rate_twd',basisWeightGrams:'basis_weight_grams',isActive:'is_active'};r=await updateFields(c,table,s,rid,body,cols);}
    else if(template)r=await one(c,'INSERT INTO pricing_templates(store_id,code,name,cost_adjustment_mode,cost_adjustment_rate,department_store_fee_rate,default_shipping_profile_id,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[s,body.code,body.name,body.costAdjustmentMode,body.costAdjustmentRate,body.departmentStoreFeeRate,body.defaultShippingProfileId??null,body.isActive??true]);
    else r=await one(c,'INSERT INTO international_shipping_profiles(store_id,code,name,rate_twd,basis_weight_grams,is_active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[s,body.code,body.name,body.rateTwd,body.basisWeightGrams,body.isActive??true]);
    await audit(c,s,null,actor,'PROFILE_CHANGED',{table,id:r.id,before:old,changes:body});await bumpSettings(c,s);result={record:catalogDto(r)};break;
   }
   default:throw new Error('Unimplemented catalog operation '+operation);
  }
  return result;
}
