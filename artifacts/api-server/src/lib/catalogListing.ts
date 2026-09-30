import { CreateCatalogListingBody } from "@workspace/api-zod";
import { createHash, randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool, productsTable, listingPricingSnapshotsTable } from "@workspace/db";
import { ExactDecimal } from "@workspace/db/transport-cost";
import { CatalogError, catalogBarcode, catalogName } from "@workspace/db/catalog";
import { resolvePricing } from "./pricingResolution.ts";
import { catalogDto, catalogExecuteInTransaction } from "./catalogService.ts";
import {formalVipHistory} from './catalogSales.ts';

export const listingBody = CreateCatalogListingBody;
function connect(){return pool.connect();}
type Client = Awaited<ReturnType<typeof connect>>;
const one = async(c:Client,sql:string,args:unknown[]) => (await c.query(sql,args)).rows[0];
const hash = (value:unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const supplied = <T>(value:T|undefined,fallback:T):T => value === undefined ? fallback : value;

async function lockStore(c:Client,storeId:number,actor:string){
  const store=await one(c,"SELECT * FROM stores WHERE id=$1 FOR UPDATE",[storeId]);
  if(!store)throw new CatalogError(404,"找不到店鋪");
  if(store.merchant_id!==actor)throw new CatalogError(403,"不是店鋪擁有者");
}
async function state(c:Client,storeId:number,productId:number){
  const product=await one(c,"SELECT * FROM products WHERE store_id=$1 AND id=$2 FOR UPDATE",[storeId,productId]);
  if(!product)throw new CatalogError(404,"找不到上架商品");
  const current=await one(c,"SELECT s.* FROM listing_current_pricing_snapshots p JOIN listing_pricing_snapshots s ON s.store_id=p.store_id AND s.id=p.snapshot_id WHERE p.store_id=$1 AND p.product_id=$2",[storeId,productId]);
  return {product,current};
}
async function availableTrips(c:Client,storeId:number){
  return catalogDto((await c.query("SELECT t.id,t.store_id,t.name,coalesce(jsonb_agg(jsonb_build_object('id',r.id,'storeId',r.store_id,'areaTitle',r.area_title) ORDER BY r.id) FILTER (WHERE r.id IS NOT NULL),'[]'::jsonb) AS routes FROM trips t LEFT JOIN trip_routes r ON r.trip_id=t.id AND r.store_id=$1 WHERE t.store_id=$1 GROUP BY t.id ORDER BY t.id",[storeId])).rows);
}
export async function listingHistory(storeId:number,productId:number,actor:string){
  const c=await pool.connect();
  try{
    await c.query("BEGIN");await lockStore(c,storeId,actor);
    const {product,current}=await state(c,storeId,productId);
    const cost=product.catalog_product_id==null?null:await one(c,"SELECT id FROM product_cost_records WHERE store_id=$1 AND catalog_product_id=$2 AND is_current AND status='ACTIVE'",[storeId,product.catalog_product_id]);
    const items=(await c.query("SELECT * FROM listing_pricing_snapshots WHERE store_id=$1 AND product_id=$2 ORDER BY id DESC",[storeId,productId])).rows;
    const trips=await availableTrips(c,storeId);
    const vipHistory=await formalVipHistory(drizzle(c),storeId,product.catalog_product_id);
    await c.query("COMMIT");
    return {product:catalogDto(product),current:catalogDto(current??null),items:catalogDto(items),currentCostRecordId:cost?.id??null,costUpdated:current?current.source_cost_record_id!==(cost?.id??null):false,vipHistory,availableTrips:trips};
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}

/** All locks, catalog synchronization, product and snapshot writes share this connection. */
export async function catalogListing(storeId:number,catalogId:number|null,productId:number|null,raw:unknown,actor:string){
  if(raw && typeof raw==="object"){
    const deadline=(raw as Record<string,unknown>).orderDeadlineAt;
    if(deadline!=null&&(typeof deadline!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(deadline)))throw new CatalogError(400,"截止時間須為 ISO UTC 字串或空值");
  }
  const b=listingBody.parse(raw),c=await pool.connect();
  try{
    await c.query("BEGIN");await lockStore(c,storeId,actor);
    let existing:any=null,current:any=null;
    // Store lock serializes our writes, before any product/catalog lock.
    if(productId!==null){({product:existing,current}=await state(c,storeId,productId));catalogId=existing.catalog_product_id;}
    if(catalogId==null)throw new CatalogError(409,"此商品尚未連結資料庫，請使用手動商品編輯");
    const catalog=await one(c,"SELECT * FROM catalog_products WHERE store_id=$1 AND id=$2 FOR UPDATE",[storeId,catalogId]);
    if(!catalog)throw new CatalogError(404,"找不到此店鋪資料庫商品");
    if(!existing&&catalog.status==="ARCHIVED")throw new CatalogError(409,"商品已封存，請先至資料庫明確恢復狀態",{catalogProductId:catalogId,restoreRequired:true});
    const cost=await one(c,"SELECT * FROM product_cost_records WHERE store_id=$1 AND catalog_product_id=$2 AND is_current AND status='ACTIVE' FOR SHARE",[storeId,catalogId]);
    if(!cost)throw new CatalogError(409,"目前沒有有效成本紀錄，請先新增成本；不以零元計價");
    const fromLatest=!existing||b.useLatestCost;
    const original=supplied(b.originalPriceJpy,fromLatest?cost.original_price_jpy:existing.original_price_jpy);
    const effective=supplied(b.effectiveCostJpy,fromLatest?cost.effective_cost_jpy:existing.effective_cost_jpy);
    const weight=supplied(b.weightGrams,existing?existing.weight_grams:catalog.weight_grams);
    const templateId=supplied(b.templateId,existing?existing.pricing_template_id:catalog.default_pricing_template_id);
    const shippingId=supplied(b.shippingProfileId,existing?existing.international_shipping_profile_id:catalog.default_shipping_profile_id);
    const routeId=supplied(b.tripRouteId,existing?.trip_route_id??null);
    const exempt=supplied(b.isTransportCostExempt,existing?.is_transport_cost_exempt??false);
    const general=supplied(b.generalFinalPriceTwd,existing?.price??null),vip=supplied(b.vipFinalPriceTwd,existing?.vip_price??general);
    const barcodeInput=supplied(b.listingBarcode,current?current.listing_barcode:(catalog.barcode_status==="REAL"?catalog.barcode:null));
    const barcode=barcodeInput?catalogBarcode(barcodeInput,"REAL"):null;
    if(routeId!==null){
      // Legacy route updates do not use settingsVersion. Share locks make the read/save context stable.
      await c.query("SELECT id FROM trip_routes WHERE store_id=$1 AND id=$2 FOR SHARE",[storeId,routeId]);
      await c.query("SELECT id FROM trips WHERE store_id=$1 AND id=(SELECT trip_id FROM trip_routes WHERE store_id=$1 AND id=$2) FOR SHARE",[storeId,routeId]);
      await c.query("SELECT id FROM trip_areas WHERE store_id=$1 AND id=(SELECT trip_area_id FROM trip_routes WHERE store_id=$1 AND id=$2) FOR SHARE",[storeId,routeId]);
      await c.query("SELECT id FROM trip_area_costs WHERE trip_area_id=(SELECT trip_area_id FROM trip_routes WHERE store_id=$1 AND id=$2) FOR SHARE",[storeId,routeId]);
    }
    const input={originalPriceJpy:original,effectiveCostJpy:effective,weightGrams:weight,templateId:templateId??undefined,shippingProfileId:shippingId??undefined,tripRouteId:routeId??undefined,isTransportCostExempt:exempt,generalFinalPriceTwd:general,vipFinalPriceTwd:vip,...(b.departmentStoreFeeRate===null?{}:b.departmentStoreFeeRate!=null?{departmentStoreFeeRate:b.departmentStoreFeeRate}:current?.pricing_context?.input?.departmentStoreFeeRate!=null&&!fromLatest?{departmentStoreFeeRate:current.pricing_context.input.departmentStoreFeeRate}:catalog.default_department_store_fee_rate!=null?{departmentStoreFeeRate:catalog.default_department_store_fee_rate}:{})};
    const executor=drizzle(c);
    let configuration:Record<string,unknown>={};
    const preview=await resolvePricing(executor,storeId,input,value=>{configuration=value;});
    const context=hash({catalog,cost,existing,currentId:current?.id??null,preview,input,configuration});
    const warnings=[...new Set([preview.general.profitLevel,preview.vip.profitLevel].filter(v=>v==="LOSS"||v==="LOW"))];
    const reference={sourceCostRecordId:cost.id,settingsVersion:preview.settingsVersion,context,latestOriginalPriceJpy:cost.original_price_jpy,latestEffectiveCostJpy:cost.effective_cost_jpy};
    if(b.mode==="PREVIEW"){const trips=await availableTrips(c,storeId);const vipHistory=catalogId?await formalVipHistory(drizzle(c),storeId,catalogId):null;await c.query("COMMIT");return {preview,reference,current:catalogDto(current??null),warnings,product:catalogDto(existing??null),vipHistory,availableTrips:trips};}
    if(b.expectedContext!==context)throw new CatalogError(409,"成本、設定或上架內容已變更，請重新預覽並確認；手動輸入仍保留",{code:"STALE_PRICING_CONTEXT",reference});
    if(preview.status!=="READY")throw new CatalogError(422,"計價資料尚未完整，請補齊後儲存",{reasons:preview.reasons});
    if(warnings.length&&!b.confirmLowProfit)throw new CatalogError(409,"一般或 VIP 利潤低於門檻，請確認仍要儲存",{code:"LOW_PROFIT_CONFIRMATION",warnings});
    const categoryId=supplied(b.categoryId,existing?existing.category_id:catalog.category_id);
    if(categoryId!=null&&!await one(c,"SELECT id FROM product_categories WHERE store_id=$1 AND id=$2",[storeId,categoryId]))throw new CatalogError(404,"分類不屬於此店鋪");
    if(b.imageUrl){const u=new URL(b.imageUrl);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw new CatalogError(400,"圖片網址格式不正確");}
    const kg=weight==null?null:ExactDecimal.from(weight).divide(ExactDecimal.from("1000")).toDecimalPlaces(3);
    // Grams remain exact; explicitly leave unrepresentable legacy kilograms null.
    const legacyKg=kg!==null&&kg.split(".")[0].length>5?null:kg;
    const values:any={storeId,catalogProductId:catalogId,name:b.name??existing?.name??catalog.name,description:supplied(b.description,existing?.description??null),price:general,vipPrice:vip,wholesalePrice:supplied(b.wholesalePrice,existing?.wholesale_price??null),partnerPrice:supplied(b.partnerPrice,existing?.partner_price??null),weightGrams:weight,weightKg:legacyKg,originalPriceJpy:original,effectiveCostJpy:effective,costJpy:effective,pricingTemplateId:templateId,internationalShippingProfileId:preview.shippingProfile?.id??null,categoryId,tripRouteId:routeId,isTransportCostExempt:exempt,internalNote:supplied(b.internalNote,existing?.internal_note??catalog.internal_note),imageUrl:supplied(b.imageUrl,existing?.image_url??catalog.image_url),specs:b.specs??existing?.specs??[],inventory:supplied(b.inventory,existing?.inventory??null),skuCode:supplied(b.skuCode,existing?.sku_code??null),storageTemp:supplied(b.storageTemp,existing?.storage_temp??null),storageTempClass:supplied(b.storageTempClass,existing?.storage_temp_class??null),shelfLife:supplied(b.shelfLife,existing?.shelf_life??null),orderDeadlineAt:b.orderDeadlineAt===undefined?existing?.order_deadline_at??null:b.orderDeadlineAt===null?null:new Date(b.orderDeadlineAt)};
    const params={storeId,catalogProductId:catalogId};
    values.name=catalogName(values.name);
    const fields:Record<string,string>={name:"name",weightGrams:"weightGrams",categoryId:"categoryId",imageUrl:"imageUrl",internalNote:"internalNote",templateId:"defaultPricingTemplateId",shippingProfileId:"defaultShippingProfileId"};
    const changed:Record<string,unknown>={};
    for(const field of b.syncFields)if(fields[field])changed[fields[field]]=field==="templateId"?templateId:field==="shippingProfileId"?values.internationalShippingProfileId:values[field];
    if(Object.keys(changed).length)await catalogExecuteInTransaction(c,"catalogPatch",params,changed,{},actor);
    let sourceId=fromLatest?cost.id:current?.source_cost_record_id??cost.id;
    if(b.syncFields.includes("cost")){
      const appended=await catalogExecuteInTransaction(c,"catalogCostCreate",params,{originalPriceJpy:original,effectiveCostJpy:effective,adjustmentMode:"MANUAL",adjustmentReason:"上架明確同步成本",reasonCode:b.reasonCode??"OTHER",reasonText:b.reasonText??"上架明確同步成本"},{},actor);
      sourceId=appended.record.id;
    }
    if(b.syncFields.includes("barcode"))await catalogExecuteInTransaction(c,"catalogCorrectBarcode",params,{barcode:barcode||"0",barcodeStatus:barcode?"REAL":"NONE",reasonCode:b.reasonCode??"OTHER",reasonText:b.reasonText,forceCreate:b.forceBarcodeCorrection},{},actor);
    let saved:any;
    if(existing){
      const {eq,and}=await import("drizzle-orm");
      [saved]=await executor.update(productsTable).set({...values,updatedAt:new Date()}).where(and(eq(productsTable.storeId,storeId),eq(productsTable.id,productId!))).returning();
    }else [saved]=await executor.insert(productsTable).values({...values,shareToken:randomBytes(12).toString("hex"),isActive:true}).returning();
    const snapshot:any={storeId,productId:saved.id,catalogProductId:catalogId,sourceCostRecordId:sourceId,listingBarcode:barcode||null,createdBy:actor,pricingContext:{input,preview,previewReference:reference,configuration,previewSourceCost:catalogDto(cost),appliedSourceCostRecordId:sourceId,legacyWeightKgOmitted:kg!==null&&legacyKg===null},formulaVersion:preview.formulaVersion,settingsVersion:preview.settingsVersion,tripRouteId:routeId,internationalShippingProfileSnapshot:preview.shippingProfile};
    const financial=["originalPriceJpy","effectiveCostJpy","exchangeRate","routeCostTwd","lossProtectionTwd","protectedRouteCostTwd","internationalShippingTwd","purchasePaymentFeeRate","purchasePaymentFeeTwd","routePaymentFeeRate","departmentStoreFeeRate","departmentStoreFeeTwd","originalPriceTwd","effectiveProductCostTwd","totalCostTwd","targetPriceTwd"];
    for(const field of financial)snapshot[field]=preview.amounts[field];
    snapshot.weightGrams=weight;
    for(const tier of ["general","vip"] as const){for(const [key,value] of Object.entries(preview[tier].values))snapshot[tier+key[0].toUpperCase()+key.slice(1)]=value;snapshot[tier+"ProfitLevel"]=preview[tier].profitLevel;}
    const [snap]=await executor.insert(listingPricingSnapshotsTable).values(snapshot).returning();
    await c.query("INSERT INTO listing_current_pricing_snapshots(store_id,product_id,snapshot_id) VALUES($1,$2,$3) ON CONFLICT(store_id,product_id) DO UPDATE SET snapshot_id=excluded.snapshot_id,updated_at=now()",[storeId,saved.id,snap.id]);
    const vipHistory=catalogId?await formalVipHistory(drizzle(c),storeId,catalogId):null;await c.query("COMMIT");return {product:saved,snapshot:snap,preview,reference,warnings,vipHistory};
  }catch(error:any){await c.query("ROLLBACK");if(error instanceof CatalogError)throw error;if(["23503","23505","23514","22003"].includes(error.code??error.cause?.code))throw new CatalogError(409,"資料已被使用或不符合限制，未儲存任何變更");throw error;}finally{c.release();}
}
