import {pool} from '@workspace/db';
import {CatalogError,catalogBarcode,catalogDecimal,catalogName,normalizeCatalog} from '@workspace/db/catalog';
import {ExactDecimal} from '@workspace/db/transport-cost';
import {catalogExecuteInTransaction,catalogDto} from './catalogService.ts';
import {canonical,sha,sourceRows,validateCells,readWorkbook} from './sheetSource.ts';
function connect(){return pool.connect();}
type Client=Awaited<ReturnType<typeof connect>>;
const all=async(c:Client,text:string,args:any[]=[]) => (await c.query(text,args)).rows;
const one=async(c:Client,text:string,args:any[]=[]) => (await all(c,text,args))[0];
async function transaction<T>(s:number,actor:string,work:(c:Client)=>Promise<T>):Promise<T>{
 const c=await pool.connect();try{await c.query('BEGIN');const store=await one(c,'SELECT merchant_id FROM stores WHERE id=$1 FOR UPDATE',[s]);if(!store)throw new CatalogError(404,'店鋪不存在');if(store.merchant_id!==actor)throw new CatalogError(403,'不是店鋪擁有者');const result=await work(c);await c.query('COMMIT');return result;}catch(e:any){await c.query('ROLLBACK');if(e instanceof CatalogError)throw e;if(['23503','23505','23514','22003','22001'].includes(e.code))throw new CatalogError(409,'資料衝突或歷史保護拒絕此變更');throw e;}finally{c.release();}
}
async function candidates(c:Client,s:number,v:any){
 const found=catalogDto(await all(c,`SELECT c.id,c.name,c.barcode,c.barcode_status,c.weight_grams,pc.original_price_jpy::text
 FROM catalog_products c LEFT JOIN product_cost_records pc ON pc.store_id=c.store_id AND pc.catalog_product_id=c.id AND pc.is_current AND pc.status='ACTIVE'
 WHERE c.store_id=$1 AND c.status<>'ARCHIVED' AND ((c.barcode_status='REAL' AND c.barcode=$2 AND $2<>'0') OR c.normalized_name=$3)
 ORDER BY c.id LIMIT 50`,[s,v.barcode??'',normalizeCatalog(v.name??'')]));
 return found.map((p:any)=>{const name=normalizeCatalog(p.name)===normalizeCatalog(v.name??''),real=v.barcode&&v.barcode!=='0',same=p.barcode===v.barcode;return {...p,matchType:real?(same&&name?'SAFE_CANDIDATE':same||name?'CONFLICT':'CANDIDATE'):p.barcodeStatus==='NONE'&&name&&v.weightGrams!=null&&v.originalPriceJpy!=null&&ExactDecimal.from(p.weightGrams).equals(ExactDecimal.from(v.weightGrams))&&p.originalPriceJpy!=null&&ExactDecimal.from(p.originalPriceJpy).equals(ExactDecimal.from(v.originalPriceJpy))?'NONE_THREE_FACTOR_HINT':'NAME_CANDIDATE'};});
}
export function confirmedValues(v:any){
 if(!v||v.confirmed!==true)throw new CatalogError(400,'必須人工確認商品原價、重量及條碼語意');
 return {confirmed:true,name:catalogName(v.name),barcode:catalogBarcode(v.barcode,v.barcodeStatus),barcodeStatus:v.barcodeStatus,weightGrams:catalogDecimal(v.weightGrams,2),originalPriceJpy:catalogDecimal(v.originalPriceJpy),effectiveCostJpy:catalogDecimal(v.effectiveCostJpy),status:v.status==='DISCONTINUED'?'DISCONTINUED':'NORMAL',preferredRouteLabel:v.preferredRouteLabel?.trim()||null,shopeePriceTwd:v.shopeePriceTwd==null||v.shopeePriceTwd===''?null:catalogDecimal(v.shopeePriceTwd),forceCreate:v.forceCreate===true,adjustmentMode:'MANUAL'};
}
export async function listingPreview(s:number,actor:string,page=1){return transaction(s,actor,async c=>{
 const listings=await all(c,`SELECT p.id,p.name,p.price,p.vip_price,p.cost_jpy,p.sku_code,p.catalog_product_id,p.trip_route_id,
 coalesce(sp.original_price_jpy,p.original_price_jpy)::text AS original_price_jpy,
 coalesce(sp.effective_cost_jpy,p.effective_cost_jpy,p.cost_jpy)::text AS effective_cost_jpy,
 coalesce(sp.weight_grams,p.weight_grams,p.weight_kg*1000)::text AS weight_grams,
 CASE WHEN sp.weight_grams IS NOT NULL THEN 'CURRENT_PRICING_SNAPSHOT_G' WHEN p.weight_grams IS NOT NULL THEN 'LISTING_G' ELSE 'LEGACY_KG_X_1000_STORED_PRECISION_ONLY' END AS weight_source,
 p.weight_kg::text AS legacy_weight_kg,sp.listing_barcode,sp.id AS pricing_snapshot_id,
 (SELECT count(*)::int FROM orders o WHERE o.store_id=p.store_id AND
 CASE WHEN EXISTS(SELECT 1 FROM order_items i WHERE i.store_id=o.store_id AND i.order_id=o.id) THEN EXISTS(SELECT 1 FROM order_items i WHERE i.store_id=o.store_id AND i.order_id=o.id AND i.listing_product_id=p.id)
 WHEN jsonb_typeof(o.items)='array' AND jsonb_array_length(o.items)>0 THEN EXISTS(SELECT 1 FROM jsonb_array_elements(o.items) j WHERE j->>'productId'=p.id::text)
 ELSE o.product_id=p.id END) AS related_order_count
 FROM products p LEFT JOIN listing_current_pricing_snapshots cp ON cp.store_id=p.store_id AND cp.product_id=p.id
 LEFT JOIN listing_pricing_snapshots sp ON sp.store_id=cp.store_id AND sp.product_id=cp.product_id AND sp.id=cp.snapshot_id
 WHERE p.store_id=$1 ORDER BY p.id LIMIT 25 OFFSET $2`,[s,(page-1)*25]);
 const result=[];for(const p of listings){const missing=['original_price_jpy','weight_grams','listing_barcode'].filter(k=>p[k]==null),suspected=/test|測試|樣本/i.test(p.name);result.push({...catalogDto(p),selected:false,missing,suspectedTest:suspected,testReason:suspected?'名稱含測試／樣本字樣；僅提示，不會自選或刪除':null,orderCountLabel:'含歷史／取消的相異訂單引用數；不是正式銷量',candidates:await candidates(c,s,{name:p.name,barcode:p.listing_barcode,weightGrams:p.weight_grams,originalPriceJpy:p.original_price_jpy})});}
 return {items:result,page,total:Number((await one(c,'SELECT count(*) n FROM products WHERE store_id=$1',[s])).n)};
});}
export async function applyListingMatches(s:number,actor:string,body:any){return transaction(s,actor,async c=>{
 const inputHash=sha(canonical(body)),old=await one(c,'SELECT * FROM listing_match_actions WHERE store_id=$1 AND request_key=$2',[s,body.requestKey]);if(old){if(old.input_hash!==inputHash)throw new CatalogError(409,'同一 requestKey 的內容不同');return old.result;}
 const ids=body.rows.map((r:any)=>r.productId);if(new Set(ids).size!==ids.length)throw new CatalogError(400,'重複上架商品');
 const result=[];for(const row of [...body.rows].sort((a,b)=>a.productId-b.productId)){
  const p=await one(c,'SELECT * FROM products WHERE store_id=$1 AND id=$2 FOR UPDATE',[s,row.productId]);if(!p)throw new CatalogError(404,'上架商品不屬於此店鋪');
  if(row.action==='IGNORE'){result.push({productId:p.id,action:'IGNORE'});continue;}
  if(p.catalog_product_id!=null){if(row.action==='LINK'&&p.catalog_product_id===row.catalogProductId){result.push({productId:p.id,catalogProductId:p.catalog_product_id,alreadyLinked:true});continue;}throw new CatalogError(409,'已連結商品不重建或改連');}
  let id=row.catalogProductId;if(row.action==='CREATE'){const v=confirmedValues(row.values);id=(await catalogExecuteInTransaction(c,'catalogCreate',{storeId:s},v,{},actor)).product.id;}
  else if(row.action!=='LINK')throw new CatalogError(400,'請人工選擇操作');
  const target=await one(c,"SELECT id FROM catalog_products WHERE store_id=$1 AND id=$2 AND status<>'ARCHIVED' FOR UPDATE",[s,id]);if(!target)throw new CatalogError(404,'目標商品不屬於此店鋪或已封存');
  await c.query('UPDATE products SET catalog_product_id=$3 WHERE store_id=$1 AND id=$2',[s,p.id,id]);
  await c.query("INSERT INTO catalog_audit_events(store_id,catalog_product_id,actor,action,details) VALUES($1,$2,$3,'LISTING_LINKED',$4)",[s,id,actor,JSON.stringify({listingId:p.id,requestKey:body.requestKey,previousCatalogProductId:null,retroactiveOrderUpdate:false})]);result.push({productId:p.id,catalogProductId:id});
 }
 const response={items:result};await c.query('INSERT INTO listing_match_actions(store_id,request_key,input_hash,actor,result) VALUES($1,$2,$3,$4,$5)',[s,body.requestKey,inputHash,actor,JSON.stringify(response)]);return response;
});}
async function batch(c:Client,s:number,id:number){const b=await one(c,'SELECT * FROM sheet_import_batches WHERE store_id=$1 AND id=$2 FOR UPDATE',[s,id]);if(!b)throw new CatalogError(404,'找不到此店鋪匯入批次');return b;}
async function audit(c:Client,s:number,id:number,actor:string,action:string,details:any){await c.query('INSERT INTO sheet_import_audit(store_id,batch_id,actor,action,details) VALUES($1,$2,$3,$4,$5)',[s,id,actor,action,JSON.stringify(details)]);}
async function batchRows(c:Client,s:number,id:number){return all(c,'SELECT * FROM sheet_import_rows WHERE store_id=$1 AND batch_id=$2 ORDER BY source_row_number,id FOR UPDATE',[s,id]);}
function verifySource(b:any,rows:any[]){
 const cells=rows.flatMap(r=>r.raw_values).sort((a,b)=>a.row-b.row||a.column-b.column);
 const computed=sha(canonical({sourceType:b.source_type,spreadsheetTitle:b.spreadsheet_title,sheetTitle:b.sheet_title,cells}));
 if(computed!==b.source_hash||rows.some(r=>sha(canonical(r.raw_values))!==r.row_hash)||b.source_type==='XLSX_UPLOAD'&&sha(b.original_file_bytes)!==b.original_file_sha256)throw new CatalogError(409,'來源版本或原始列已改變，請建立新預覽');
 return computed;
}
function planHash(b:any,rows:any[]){verifySource(b,rows);return sha(canonical({sourceHash:b.source_hash,fx:b.exchange_rate_snapshot,rows:rows.map(r=>({id:r.id,rowHash:r.row_hash,resolution:r.resolution}))}));}
async function view(c:Client,s:number,id:number){
 const b=await batch(c,s,id),rows=await batchRows(c,s,id);verifySource(b,rows);const parsed=sourceRows(rows.flatMap(r=>r.raw_values));
 const {original_file_bytes,...safe}=b;return {batch:catalogDto(safe),directLiveFreshness:'UNVERIFIED',rows:rows.map(r=>({...catalogDto(r),candidate:parsed.find(p=>p.sourceRowNumber===r.source_row_number)?.candidate,candidates:r.warnings?.candidates??[]})),effects:catalogDto(await all(c,'SELECT * FROM sheet_import_effects WHERE store_id=$1 AND batch_id=$2 ORDER BY row_id',[s,id])),audit:catalogDto(await all(c,'SELECT * FROM sheet_import_audit WHERE store_id=$1 AND batch_id=$2 ORDER BY id',[s,id]))};
}
export async function previewSheet(s:number,actor:string,input:any,file?:Buffer){
 let cells:any[],metadata:any,sourceType:string,originalHash:string|null=null;
 if(file){sourceType='XLSX_UPLOAD';const parsed=await readWorkbook(file,input.sheetTitle);if(!input.sheetTitle)return {sheetTitles:parsed.sheetTitles,limits:parsed.limits,originalFileSha256:sha(file),directLiveFreshness:'UNVERIFIED'};cells=parsed.cells;metadata={sheetTitles:parsed.sheetTitles,limits:parsed.limits};originalHash=sha(file);}
 else{if(input.sourceType!=='STRUCTURED_CELLS')throw new CatalogError(400,'必須明確提供 STRUCTURED_CELLS');sourceType='STRUCTURED_CELLS';cells=validateCells(input.cells);metadata={originalFileEvidence:'NOT_AVAILABLE',sheetTitles:[input.sheetTitle]};}
 if(!input.spreadsheetTitle?.trim()||!input.sheetTitle?.trim()||input.spreadsheetTitle.length>256||input.sheetTitle.length>128)throw new CatalogError(400,'請提供檔案與單一分頁名稱');
 cells.sort((a,b)=>a.row-b.row||a.column-b.column);const sourceHash=sha(canonical({sourceType,spreadsheetTitle:input.spreadsheetTitle,sheetTitle:input.sheetTitle,cells})),parsed=sourceRows(cells);
 return transaction(s,actor,async c=>{
  const logicalId=input.spreadsheetId?.trim()||'upload:'+sha(input.spreadsheetTitle),sourceId=originalHash?logicalId+':file:'+originalHash:logicalId;const old=await one(c,'SELECT id FROM sheet_import_batches WHERE store_id=$1 AND spreadsheet_id=$2 AND sheet_title=$3 AND source_hash=$4',[s,sourceId,input.sheetTitle,sourceHash]);if(old)return view(c,s,old.id);
  const b=await one(c,"INSERT INTO sheet_import_batches(store_id,spreadsheet_id,spreadsheet_title,sheet_title,source_hash,source_type,original_file_sha256,original_file_bytes,source_meta,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",[s,sourceId,input.spreadsheetTitle,input.sheetTitle,sourceHash,sourceType,originalHash,file??null,JSON.stringify(metadata),actor]);
  for(const r of parsed){const matches=r.rowKind==='PRODUCT'?await candidates(c,s,r.candidate):[],safe=matches.some((p:any)=>r.candidate.barcodeStatus==='REAL'&&p.barcode===r.candidate.barcode&&normalizeCatalog(p.name)===r.normalizedName),conflict=matches.some((p:any)=>(p.barcode===r.candidate.barcode&&normalizeCatalog(p.name)!==r.normalizedName)||(normalizeCatalog(p.name)===r.normalizedName&&p.barcode!==r.candidate.barcode));
   await c.query('INSERT INTO sheet_import_rows(store_id,batch_id,source_row_number,raw_values,raw_formulas,row_hash,row_kind,source_group,normalized_name,barcode_candidate,weight_candidate,original_price_jpy_candidate,effective_cost_jpy_candidate,match_status,warnings) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[s,b.id,r.sourceRowNumber,JSON.stringify(r.rawValues),JSON.stringify(r.rawFormulas),r.rowHash,r.rowKind,r.sourceGroup,r.normalizedName,r.barcodeCandidate,r.weightCandidate,r.originalPriceJpyCandidate,r.effectiveCostJpyCandidate,r.rowKind!=='PRODUCT'?'IGNORED':conflict?'CONFLICT':safe?'SAFE_CANDIDATE':'NEW',JSON.stringify({messages:r.warnings,candidates:matches})]);
  }
  await c.query("UPDATE sheet_import_batches SET status='PREVIEWED' WHERE id=$1",[b.id]);await audit(c,s,b.id,actor,'PREVIEWED',{sourceHash,originalFileSha256:originalHash,selectedSheet:input.sheetTitle,sourceType});return view(c,s,b.id);
 });
}
function resolution(input:any,row:any){
 if(!input||!['IGNORE','LINK','CREATE'].includes(input.action)||!input.reason?.trim())throw new CatalogError(400,'每列必須人工選擇並填寫審核理由');
 if(input.action==='IGNORE')return {action:'IGNORE',reason:input.reason.trim()};
 if(row.row_kind!=='PRODUCT')throw new CatalogError(400,'非 PRODUCT 列只能忽略；不能當作商品');
 if(input.action==='LINK'&&(!Number.isInteger(input.catalogProductId)||input.catalogProductId<1))throw new CatalogError(400,'請選擇已確認的商品');
 const values=confirmedValues(input.values);return {action:input.action,reason:input.reason.trim(),catalogProductId:input.action==='LINK'?input.catalogProductId:null,values,confirmed:true};
}
export async function sheetAction(s:number,id:number,actor:string,action:string,input:any){return transaction(s,actor,async c=>{
 let b=await batch(c,s,id);let rows=await batchRows(c,s,id);verifySource(b,rows);
 if(action==='get')return view(c,s,id);
 if(action==='commit'&&b.status==='COMMITTED'||action==='rollback'&&b.status==='ROLLED_BACK')return view(c,s,id);
 if(['COMMITTED','ROLLED_BACK','FAILED'].includes(b.status)&&action!=='rollback')throw new CatalogError(409,'已執行批次不能更改審核或匯率');
 if(action==='resolve'){
  if(!['PREVIEWED','APPROVED'].includes(b.status))throw new CatalogError(409,'此狀態不能審核');
  if(input.exchangeRate!==undefined){const fx=catalogDecimal(input.exchangeRate);if(ExactDecimal.from(fx).numerator<=0n)throw new CatalogError(400,'匯率必須大於零');await c.query('UPDATE sheet_import_batches SET exchange_rate_snapshot=$3 WHERE store_id=$1 AND id=$2',[s,id,fx]);}
  const seen=new Set();for(const item of input.rows??[]){if(seen.has(item.rowId))throw new CatalogError(400,'重複審核列');seen.add(item.rowId);const row=rows.find(r=>r.id===item.rowId);if(!row)throw new CatalogError(404,'列不屬於此批次');const resolved=resolution(item.resolution,row);if(resolved.action==='LINK'&&!await one(c,"SELECT id FROM catalog_products WHERE store_id=$1 AND id=$2 AND status<>'ARCHIVED'",[s,resolved.catalogProductId]))throw new CatalogError(404,'配對商品不屬於此店鋪');await c.query('UPDATE sheet_import_rows SET resolution=$3 WHERE store_id=$1 AND id=$2',[s,row.id,JSON.stringify(resolved)]);}
  await audit(c,s,id,actor,'RESOLVED',{rowIds:[...seen],fxChanged:input.exchangeRate!==undefined});return view(c,s,id);
 }
 if(action==='approve'){
  if(!['PREVIEWED','APPROVED'].includes(b.status)||input.confirmed!==true||input.reviewVersion!==b.review_version)throw new CatalogError(409,'請重新讀取並明確確認此審核版本');
  if(!b.exchange_rate_snapshot||ExactDecimal.from(b.exchange_rate_snapshot).numerator<=0n)throw new CatalogError(400,'請先確認正數匯率');
  if(rows.some(r=>r.row_kind==='PRODUCT'&&!r.resolution))throw new CatalogError(409,'所有 PRODUCT 列都必須人工審核');
  for(const r of rows)if(r.resolution)resolution(r.resolution,r);
  const hash=planHash(b,rows);await c.query("UPDATE sheet_import_batches SET status='APPROVED',approved_by=$3,approved_at=now(),approval_hash=$4,approval_version=review_version WHERE store_id=$1 AND id=$2",[s,id,actor,hash]);await audit(c,s,id,actor,'APPROVED',{reviewHash:hash,version:b.review_version});return view(c,s,id);
 }
 if(action==='commit'){
  if(input.confirmed!==true||b.status!=='APPROVED'||b.approval_version!==b.review_version||b.approval_hash!==planHash(b,rows))throw new CatalogError(409,'有效批准、來源及完整審核版本必須一致');
  const linked=rows.filter(r=>r.resolution?.action==='LINK').map(r=>r.resolution.catalogProductId);if(new Set(linked).size!==linked.length)throw new CatalogError(409,'同批多列不能覆寫同一商品成本；請忽略重複列或分批審核');
  for(const row of rows){if(row.row_kind==='PRODUCT'&&!row.resolution)throw new CatalogError(409,'尚有未審核商品');if(!row.resolution||row.resolution.action==='IGNORE')continue;
   const r=resolution(row.resolution,row),v=r.values!;let catalogId=r.catalogProductId,created=false,previous:any=null,cost:any;
   if(r.action==='CREATE'){
    if(v.barcodeStatus==='REAL'&&!v.forceCreate&&await one(c,"SELECT id FROM catalog_products WHERE store_id=$1 AND barcode_status='REAL' AND barcode=$2",[s,v.barcode]))throw new CatalogError(409,'條碼已有商品，請重新配對或明確確認仍新增');
    catalogId=(await one(c,'INSERT INTO catalog_products(store_id,name,normalized_name,barcode,barcode_status,weight_grams,status,preferred_route_label) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[s,v.name,normalizeCatalog(v.name),v.barcode,v.barcodeStatus,v.weightGrams,v.status,v.preferredRouteLabel])).id;created=true;
    cost=await one(c,"INSERT INTO product_cost_records(store_id,catalog_product_id,original_price_jpy,effective_cost_jpy,adjustment_mode,adjustment_reason,source,is_current) VALUES($1,$2,$3,$4,'MANUAL',$5,'SHEET_IMPORT',true) RETURNING id",[s,catalogId,v.originalPriceJpy,v.effectiveCostJpy,r.reason]);
    await c.query("INSERT INTO catalog_audit_events(store_id,catalog_product_id,actor,action,details) VALUES($1,$2,$3,'SHEET_CATALOG_CREATED',$4)",[s,catalogId,actor,JSON.stringify({batchId:id,rowId:row.id})]);
   }
   else{const p=await one(c,"SELECT * FROM catalog_products WHERE store_id=$1 AND id=$2 AND status<>'ARCHIVED' FOR UPDATE",[s,catalogId]);if(!p)throw new CatalogError(409,'目標商品已不存在或封存');previous=await one(c,"SELECT id FROM product_cost_records WHERE store_id=$1 AND catalog_product_id=$2 AND status='ACTIVE' AND is_current FOR UPDATE",[s,catalogId]);await c.query("UPDATE product_cost_records SET is_current=false WHERE store_id=$1 AND catalog_product_id=$2 AND is_current AND status='ACTIVE'",[s,catalogId]);cost=await one(c,"INSERT INTO product_cost_records(store_id,catalog_product_id,original_price_jpy,effective_cost_jpy,adjustment_mode,adjustment_reason,source,is_current,supersedes_cost_record_id) VALUES($1,$2,$3,$4,'MANUAL',$5,'SHEET_IMPORT',true,$6) RETURNING id",[s,catalogId,v.originalPriceJpy,v.effectiveCostJpy,r.reason,previous?.id??null]);}
   let shopee=null;if(v.shopeePriceTwd!=null)shopee=await one(c,"INSERT INTO shopee_price_observations(store_id,catalog_product_id,price_twd,source,note) VALUES($1,$2,$3,'SHEET_IMPORT',$4) RETURNING id",[s,catalogId,v.shopeePriceTwd,'批次 '+id+'；僅來源觀察價']);
   const state=await one(c,'SELECT * FROM catalog_products WHERE store_id=$1 AND id=$2',[s,catalogId]);await c.query('INSERT INTO sheet_import_effects(store_id,batch_id,row_id,catalog_product_id,created_catalog,created_cost_record_id,previous_cost_record_id,created_shopee_id,catalog_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[s,id,row.id,catalogId,created,cost.id,previous?.id??null,shopee?.id??null,JSON.stringify(state)]);
   await c.query('UPDATE sheet_import_rows SET matched_catalog_product_id=$3,committed_at=now() WHERE store_id=$1 AND id=$2',[s,row.id,catalogId]);
  }
  await c.query("UPDATE sheet_import_batches SET status='COMMITTED',committed_at=now() WHERE store_id=$1 AND id=$2",[s,id]);await audit(c,s,id,actor,'COMMITTED',{reviewHash:b.approval_hash});return view(c,s,id);
 }
 if(action==='rollback'){
  if(input.confirmed!==true||b.status!=='COMMITTED')throw new CatalogError(409,'只可回復已執行批次');
  const effects=await all(c,'SELECT * FROM sheet_import_effects WHERE store_id=$1 AND batch_id=$2 ORDER BY catalog_product_id,row_id',[s,id]),blockers=[];
  for(const effect of effects){const cat=await one(c,'SELECT * FROM catalog_products WHERE store_id=$1 AND id=$2 FOR UPDATE',[s,effect.catalog_product_id]),cost=await one(c,'SELECT * FROM product_cost_records WHERE store_id=$1 AND id=$2 FOR UPDATE',[s,effect.created_cost_record_id]);
   const count=await one(c,`SELECT
    (SELECT count(*) FROM products WHERE store_id=$1 AND catalog_product_id=$2 AND (created_at>=$5 OR updated_at>=$5 OR $6))+
    (SELECT count(*) FROM order_items WHERE store_id=$1 AND (catalog_product_id=$2 AND (created_at>=$5 OR captured_at>=$5 OR $6) OR capture_context->>'sourceCostRecordId'=$3::int::text))+
    (SELECT count(*) FROM listing_pricing_snapshots WHERE store_id=$1 AND (catalog_product_id=$2 AND (created_at>=$5 OR $6) OR source_cost_record_id=$3))+
    (SELECT count(*) FROM listing_match_actions WHERE store_id=$1 AND created_at>=$5 AND result->'items' @> jsonb_build_array(jsonb_build_object('catalogProductId',$2::int)))+
    (SELECT count(*) FROM sheet_import_effects WHERE store_id=$1 AND catalog_product_id=$2 AND batch_id<>$4 AND created_at>=$5)+
    (SELECT count(*) FROM product_cost_records WHERE store_id=$1 AND catalog_product_id=$2 AND id>$3)+
    (SELECT count(*) FROM shopee_price_observations WHERE store_id=$1 AND catalog_product_id=$2 AND created_at>=$5 AND id IS DISTINCT FROM $7::int) AS n`,[s,effect.catalog_product_id,effect.created_cost_record_id,id,effect.created_at,effect.created_catalog,effect.created_shopee_id]);
   const prev=effect.previous_cost_record_id?await one(c,"SELECT id FROM product_cost_records WHERE store_id=$1 AND catalog_product_id=$2 AND id=$3 AND status='ACTIVE'",[s,effect.catalog_product_id,effect.previous_cost_record_id]):null;
   if(Number(count.n)>0||!cost||cost.status!=='ACTIVE'||!cost.is_current||effect.previous_cost_record_id&&!prev||canonical(catalogDto(cat))!==canonical(catalogDto(effect.catalog_state)))blockers.push({rowId:effect.row_id,catalogProductId:effect.catalog_product_id,reason:'已有後續引用／成本或商品變更，或原 current 已作廢'});
  }
  if(blockers.length)throw new CatalogError(409,'無法安全回復；未修改任何資料',{blockers});
  for(const effect of effects){await c.query("UPDATE product_cost_records SET status='VOIDED',is_current=false,void_reason_code='OTHER',void_reason_text=$3,voided_at=now(),voided_by=$4 WHERE store_id=$1 AND id=$2",[s,effect.created_cost_record_id,'匯入批次 '+id+' 受控回復',actor]);if(effect.previous_cost_record_id)await c.query("UPDATE product_cost_records SET is_current=true WHERE store_id=$1 AND id=$2 AND status='ACTIVE'",[s,effect.previous_cost_record_id]);if(effect.created_shopee_id)await c.query("UPDATE shopee_price_observations SET status='VOIDED' WHERE store_id=$1 AND id=$2",[s,effect.created_shopee_id]);if(effect.created_catalog)await c.query("UPDATE catalog_products SET status='ARCHIVED',archived_at=now(),updated_at=now() WHERE store_id=$1 AND id=$2",[s,effect.catalog_product_id]);}
  await c.query("UPDATE sheet_import_batches SET status='ROLLED_BACK',rolled_back_at=now() WHERE store_id=$1 AND id=$2",[s,id]);await audit(c,s,id,actor,'ROLLED_BACK',{effects:effects.map(e=>e.id)});return view(c,s,id);
 }
 throw new CatalogError(400,'未知操作');
});}
export async function sheetReferences(s:number,catalogId:number,actor:string){return transaction(s,actor,async c=>{if(!await one(c,'SELECT id FROM catalog_products WHERE store_id=$1 AND id=$2',[s,catalogId]))throw new CatalogError(404,'找不到商品');return {label:'Sheet 來源參考；不是正式成交',items:catalogDto(await all(c,"SELECT b.spreadsheet_title,b.sheet_title,b.source_type,b.source_hash,b.original_file_sha256,b.status,r.source_row_number,r.raw_values,r.raw_formulas FROM sheet_import_effects e JOIN sheet_import_rows r ON r.store_id=e.store_id AND r.id=e.row_id JOIN sheet_import_batches b ON b.store_id=e.store_id AND b.id=e.batch_id WHERE e.store_id=$1 AND e.catalog_product_id=$2 ORDER BY b.id,r.source_row_number",[s,catalogId]))};});}
