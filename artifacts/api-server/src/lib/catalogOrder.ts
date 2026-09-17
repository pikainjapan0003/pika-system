import {and,eq,inArray,sql} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {randomBytes} from 'node:crypto';
import {db,pool,ordersTable,orderItemsTable,orderCompletionEventsTable,productsTable,storesTable,customersTable,catalogProductsTable,productCostRecordsTable,listingPricingSnapshotsTable,resolveTierPrice,customerTierEnum,storeCreditTransactionsTable,auditLogsTable} from '@workspace/db';
import {ExactDecimal} from '@workspace/db/transport-cost';
import {CatalogError,catalogDecimal,catalogName} from '@workspace/db/catalog';
import {PreviewPricingV2Body,CatalogCreateBody,CreateCatalogOrderBody} from '@workspace/api-zod';
import {resolvePricing} from './pricingResolution.ts';
import {catalogDto,catalogExecuteInTransaction} from './catalogService.ts';
import {getShippingFee} from './shippingFee.ts';
import {parsePaymentLast5} from './paymentLast5.ts';
import {resolveCustomerCvsDefaults} from './customerOrderDefaults.ts';
import {calculateStoreCreditBalance,prepareOrderStoreCreditApplication,prepareStoreCreditSpend} from '@workspace/db/store-credit';
import {buildStoreCreditAuditTarget} from './auditLog.ts';

export type OrderExecutor=Pick<typeof db,'select'|'insert'|'update'|'delete'|'execute'>;
export const catalogOrderBody=CreateCatalogOrderBody;
export type OrderLineInput=ReturnType<typeof catalogOrderBody.parse>['items'][number];
const spec={parse(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([k,v])=>k.length>100||typeof v!=='string'||v.length>500))throw new CatalogError(422,'規格必須是文字欄位');return value as Record<string,string>;}};
const dec=(v:string)=>ExactDecimal.from(v),sub=(a:ExactDecimal,b:ExactDecimal)=>a.add(b.multiply(dec('-1')));
const cmp=(a:ExactDecimal,b:ExactDecimal)=>a.numerator*b.denominator-b.numerator*a.denominator;
export function orderMoney(value:string){const d=dec(value);if(d.isNegative()||cmp(d,dec('99999999.99'))>0n||!d.equals(dec(d.toDecimalPlaces(2))))throw new CatalogError(422,'訂單金額超出可保存範圍或超過兩位小數');return d.toDecimalPlaces(2);}
export function orderId(value:unknown){if(typeof value!=='string'||! /^[1-9]\d*$/.test(value)||Number(value)>2147483647)throw new CatalogError(400,'ID 必須是標準正整數');return Number(value);}
export async function lockOrderStore(ex:OrderExecutor,storeId:number,actor?:string){const [store]=await ex.select().from(storesTable).where(eq(storesTable.id,storeId)).for('update');if(!store)throw new CatalogError(404,'找不到店鋪');if(actor!==undefined&&store.merchantId!==actor)throw new CatalogError(403,'不是此店鋪擁有者');if(actor)await ex.execute(sql`SELECT set_config('pika.actor',${actor},true)`);return store;}
const captureFields=['originalPriceJpy','effectiveCostJpy','weightGrams','exchangeRate','routeCostTwd','lossProtectionTwd','protectedRouteCostTwd','internationalShippingTwd','purchasePaymentFeeRate','purchasePaymentFeeTwd','routePaymentFeeRate','departmentStoreFeeRate','departmentStoreFeeTwd','totalCostTwd'] as const;
function captureFromPreview(preview:any,context:Record<string,unknown>,exempt:boolean){
 if(preview.general.status!=='READY')return {profitSnapshotStatus:'PENDING',captureContext:{...context,reasons:preview.general.reasons}};
 const values:Record<string,unknown>={profitSnapshotStatus:exempt?'EXEMPT':'CAPTURED',capturedAt:new Date(),formulaVersion:preview.formulaVersion,settingsVersion:preview.settingsVersion,internationalShippingProfileSnapshot:preview.shippingProfile,tripRouteIdSnapshot:preview.routeMetadata?.routeId??null,captureContext:{...context,routeMetadata:preview.routeMetadata,isTransportCostExempt:exempt}};
 for(const key of captureFields)values[key+'Snapshot']=preview.amounts[key];
 for(const [key,field] of Object.entries({netProfitTwd:'unitProfitTwdSnapshot',profitRate:'profitRateSnapshot',contributionProfitTwd:'contributionProfitTwdSnapshot',contributionProfitRate:'contributionProfitRateSnapshot',perceivedDifferenceTwd:'perceivedDifferenceTwdSnapshot'}))values[field]=preview.general.values[key];
 values.profitLevelSnapshot=preview.general.profitLevel;return values;
}
function captureListingSnapshot(snapshot:any,price:string){
 const context=snapshot.pricingContext??{},thresholds=context.configuration?.thresholds??{loss:'25',low:'50',medium:'100'};
 const net=sub(dec(price),dec(snapshot.totalCostTwd)),contribution=net.add(dec(snapshot.protectedRouteCostTwd));
 const values:any={profitSnapshotStatus:context.input?.isTransportCostExempt?'EXEMPT':'CAPTURED',capturedAt:new Date(),formulaVersion:snapshot.formulaVersion,settingsVersion:snapshot.settingsVersion,internationalShippingProfileSnapshot:snapshot.internationalShippingProfileSnapshot,tripRouteIdSnapshot:snapshot.tripRouteId,captureContext:{source:'LISTING_SNAPSHOT',listingPricingSnapshotId:snapshot.id,configuration:context.configuration,isTransportCostExempt:!!context.input?.isTransportCostExempt},unitProfitTwdSnapshot:net.toDecimalPlaces(12),profitRateSnapshot:net.divide(dec(price)).toDecimalPlaces(12),contributionProfitTwdSnapshot:contribution.toDecimalPlaces(12),contributionProfitRateSnapshot:contribution.divide(dec(price)).toDecimalPlaces(12),perceivedDifferenceTwdSnapshot:sub(dec(price),dec(snapshot.effectiveProductCostTwd)).toDecimalPlaces(12),profitLevelSnapshot:cmp(net,dec(thresholds.loss))<=0n?'LOSS':cmp(net,dec(thresholds.low))<=0n?'LOW':cmp(net,dec(thresholds.medium))<=0n?'MEDIUM':'HIGH'};
 values.captureContext.input=context.input;
 values.captureContext.routeMetadata=context.preview?.routeMetadata;
 for(const key of captureFields)values[key+'Snapshot']=snapshot[key];return values;
}
export async function prepareListingItem(ex:OrderExecutor,product:typeof productsTable.$inferSelect,quantity:number,price:string,specValues:unknown,tier:string){
 if(!Number.isInteger(quantity)||quantity<1||quantity>2147483647)throw new CatalogError(422,'品項數量必須是有效正整數');
 orderMoney(price);orderMoney(dec(price).multiply(dec(String(quantity))).toDecimalPlaces(2));
 const [raw]=(await ex.execute(sql`SELECT s.* FROM listing_current_pricing_snapshots c JOIN listing_pricing_snapshots s ON s.store_id=c.store_id AND s.id=c.snapshot_id WHERE c.store_id=${product.storeId} AND c.product_id=${product.id}`)).rows;
 let capture:Record<string,unknown>;
 if(raw){capture=captureListingSnapshot(catalogDto(raw),price);}else{
  const input=PreviewPricingV2Body.parse({originalPriceJpy:product.originalPriceJpy??product.costJpy,effectiveCostJpy:product.effectiveCostJpy??product.costJpy,weightGrams:product.weightGrams??(product.weightKg==null?null:dec(product.weightKg).multiply(dec('1000')).toDecimalPlaces(2)),templateId:product.pricingTemplateId??undefined,shippingProfileId:product.internationalShippingProfileId??undefined,tripRouteId:product.tripRouteId??undefined,isTransportCostExempt:product.isTransportCostExempt,generalFinalPriceTwd:price,vipFinalPriceTwd:price});
  let configuration={};const preview=await resolvePricing(ex,product.storeId,input,c=>configuration=c);capture=captureFromPreview(preview,{source:'LEGACY_LISTING_RESOLVER',input,configuration},product.isTransportCostExempt);
 }
 return {storeId:product.storeId,listingProductId:product.id,catalogProductId:product.catalogProductId,productNameSnapshot:product.name,barcodeSnapshot:raw?(raw as any).listing_barcode??null:null,quantity,unitPriceTwd:price,subtotalTwd:dec(price).multiply(dec(String(quantity))).toDecimalPlaces(12),specValues:spec.parse(specValues??{}),customerTierSnapshot:tier,priceSourceSnapshot:tier==='general'?'general':'tier',...capture};
}
export function orderItemProjection(item:any){
 const pending=item.profitSnapshotStatus==='PENDING';
 return {orderItemId:item.id,productId:item.listingProductId??null,catalogProductId:item.catalogProductId??null,productName:item.productNameSnapshot,productImageUrl:null,specValues:item.specValues??{},quantity:item.quantity,unitPrice:Number(item.unitPriceTwd),subtotal:Number(item.subtotalTwd),unitPriceTwd:item.unitPriceTwd,subtotalTwd:item.subtotalTwd,profitSnapshot:{profitSnapshotStatus:pending?'pending':item.profitSnapshotStatus==='EXEMPT'?'exempt':'captured',profitSnapshotUnitProfitTwd:item.unitProfitTwdSnapshot??null,profitSnapshotFullUnitProfitTwd:item.unitProfitTwdSnapshot??null,profitSnapshotProductCostTwd:item.totalCostTwdSnapshot??null,profitSnapshotTransportCostTwd:item.routeCostTwdSnapshot??null,profitSnapshotCapturedAt:item.capturedAt??null},captureStatus:item.profitSnapshotStatus,capturedAt:item.capturedAt??null};
}
export function itemOrderView(order:any,items:any[]){
 if(!items.length)return order;
 const pending=items.some(i=>i.profitSnapshotStatus==='PENDING');const profit=pending?null:items.reduce((sum,i)=>sum.add(dec(i.unitProfitTwdSnapshot).multiply(dec(String(i.quantity)))),ExactDecimal.zero()).toDecimalPlaces(12);
 const cost=pending?null:items.reduce((sum,i)=>sum.add(dec(i.totalCostTwdSnapshot).multiply(dec(String(i.quantity)))),ExactDecimal.zero()).toDecimalPlaces(12);
 return {...order,items:items.map(orderItemProjection),orderItems:items,cartProfitSnapshotStatus:pending?'pending':'captured',cartProfitSnapshotTotalTwd:profit,itemCostTotalTwd:cost,itemProfitTotalTwd:profit,itemQuantity:items.reduce((sum,i)=>sum+i.quantity,0)};
}
export async function hydrateItemOrders(ex:OrderExecutor,orders:any[]){if(!orders.length)return orders;const ids=orders.map(o=>o.id);const items=await ex.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId,ids)).orderBy(orderItemsTable.id);const grouped=new Map<number,any[]>();for(const item of items){const a=grouped.get(item.orderId)??[];a.push(item);grouped.set(item.orderId,a);}return orders.map(o=>itemOrderView(o,(grouped.get(o.id)??[]).filter(i=>i.storeId===o.storeId)));}
export async function persistOrderItems(ex:OrderExecutor,order:any,prepared:any[]){
 if(!prepared.length)throw new CatalogError(422,'至少需要一個品項');
 const items=await ex.insert(orderItemsTable).values(prepared.map(i=>({...i,orderId:order.id,capturedAt:i.profitSnapshotStatus==='PENDING'?null:sql`clock_timestamp()`}))).returning();
 const view=itemOrderView(order,items);const total=items.reduce((sum,i)=>sum.add(dec(i.subtotalTwd)),ExactDecimal.zero());orderMoney(total.toDecimalPlaces(12));
 const quantity=items.reduce((sum,i)=>sum+i.quantity,0);if(!Number.isSafeInteger(quantity)||quantity>2147483647)throw new CatalogError(422,'總數量超出範圍');
 const [saved]=await ex.update(ordersTable).set({orderItemsVersion:1,items:view.items,quantity,unitPrice:items.length===1?items[0].unitPriceTwd:total.toDecimalPlaces(2),totalPrice:total.toDecimalPlaces(2),cartProfitSnapshotStatus:view.cartProfitSnapshotStatus,cartProfitSnapshotTotalTwd:view.cartProfitSnapshotTotalTwd}).where(eq(ordersTable.id,order.id)).returning();return itemOrderView(saved,items);
}
export async function createCatalogOrder(storeId:number,raw:unknown,actor:string){
 const body=catalogOrderBody.parse(raw),c=await pool.connect();
 try{await c.query('BEGIN');const ex=drizzle(c);await lockOrderStore(ex,storeId,actor);
  const [customer]=body.customerId==null?[]:await ex.select().from(customersTable).where(and(eq(customersTable.id,body.customerId),eq(customersTable.storeId,storeId))).for('share');if(body.customerId!=null&&!customer)throw new CatalogError(404,'客戶不屬於此店鋪');
  const tier=customer&&customerTierEnum.includes(customer.tier as any)?customer.tier:'general';
  const listingIds=[...new Set(body.items.flatMap(i=>i.listingProductId?[i.listingProductId]:[]))].sort((a,b)=>a-b);const listings=listingIds.length?await ex.select().from(productsTable).where(and(eq(productsTable.storeId,storeId),inArray(productsTable.id,listingIds))).orderBy(productsTable.id).for('update'):[];
  const prepared:any[]=[];
  for(const line of body.items){
   if(line.listingProductId){if(line.catalogProductId||line.saveCatalog||line.cost||line.unitPriceTwd)throw new CatalogError(422,'上架品項由同店上架快照與實際客群決定價格成本');const p=listings.find(x=>x.id===line.listingProductId);if(!p)throw new CatalogError(404,'上架商品不屬於此店鋪');const price=resolveTierPrice({generalPrice:p.price,vipPrice:p.vipPrice,wholesalePrice:p.wholesalePrice,partnerPrice:p.partnerPrice,customerTier:tier as any}).priceTwd;prepared.push(await prepareListingItem(ex,p,line.quantity,price,line.specValues,tier));continue;}
   if(!line.unitPriceTwd||dec(line.unitPriceTwd).equals(ExactDecimal.zero()))throw new CatalogError(422,'請填寫品項實際單價');const price=orderMoney(line.unitPriceTwd);orderMoney(dec(price).multiply(dec(String(line.quantity))).toDecimalPlaces(12));
   let catalogId=line.catalogProductId??null;if(line.saveCatalog!==undefined){if(catalogId!==null)throw new CatalogError(422,'既有商品不能同時另存新商品');const saved=await catalogExecuteInTransaction(c,'catalogCreate',{storeId},CatalogCreateBody.parse(line.saveCatalog),{},actor);catalogId=saved.product.id;}
   const [catalog]=catalogId==null?[]:await ex.select().from(catalogProductsTable).where(and(eq(catalogProductsTable.storeId,storeId),eq(catalogProductsTable.id,catalogId))).for('share');if(catalogId!=null&&!catalog)throw new CatalogError(404,'資料庫商品不屬於此店鋪');if(catalog?.status==='ARCHIVED')throw new CatalogError(409,'商品已封存，請先恢復');
   const [cost]=catalog?await ex.select().from(productCostRecordsTable).where(and(eq(productCostRecordsTable.storeId,storeId),eq(productCostRecordsTable.catalogProductId,catalog.id),eq(productCostRecordsTable.isCurrent,true),eq(productCostRecordsTable.status,'ACTIVE'))):[];
   const supplied=line.cost===undefined?{}:PreviewPricingV2Body.parse(line.cost);const input=PreviewPricingV2Body.parse({originalPriceJpy:cost?.originalPriceJpy??null,effectiveCostJpy:cost?.effectiveCostJpy??null,weightGrams:catalog?.weightGrams??null,templateId:catalog?.defaultPricingTemplateId??undefined,shippingProfileId:catalog?.defaultShippingProfileId??undefined,tripRouteId:catalog?.lastUsedTripRouteId??undefined,departmentStoreFeeRate:catalog?.defaultDepartmentStoreFeeRate??undefined,...supplied,generalFinalPriceTwd:price,vipFinalPriceTwd:price});
   if(input.originalPriceJpy!=null)catalogDecimal(input.originalPriceJpy);if(input.effectiveCostJpy!=null)catalogDecimal(input.effectiveCostJpy);if(input.weightGrams!=null)catalogDecimal(input.weightGrams,2);
   let configuration={};const preview=await resolvePricing(ex,storeId,input,v=>configuration=v);
   prepared.push({storeId,catalogProductId:catalogId,listingProductId:null,productNameSnapshot:catalog?.name??catalogName(line.name??''),barcodeSnapshot:catalog?.barcode??null,quantity:line.quantity,unitPriceTwd:price,subtotalTwd:dec(price).multiply(dec(String(line.quantity))).toDecimalPlaces(12),specValues:line.specValues??{},customerTierSnapshot:tier,priceSourceSnapshot:tier==='general'?'general':'tier',...captureFromPreview(preview,{source:catalog?'CATALOG':'MANUAL',sourceCostRecordId:cost?.id??null,input,configuration},!!input.isTransportCostExempt)});
  }
  const total=prepared.reduce((sum,i)=>sum.add(dec(i.subtotalTwd)),ExactDecimal.zero()),shipping=String(getShippingFee(body.pickupMethod));orderMoney(total.toDecimalPlaces(12));orderMoney(total.add(dec(shipping)).toDecimalPlaces(12));
  let ledger:any[]=[];if(body.creditSpent!==undefined){if(!customer)throw new CatalogError(422,'購物金需要同店客戶');await ex.execute(sql`SELECT pg_advisory_xact_lock(${storeId},${customer.id})`);ledger=await ex.select().from(storeCreditTransactionsTable).where(and(eq(storeCreditTransactionsTable.storeId,storeId),eq(storeCreditTransactionsTable.customerId,customer.id)));}
  const balance=calculateStoreCreditBalance(ledger),credit=prepareOrderStoreCreditApplication({orderPayable:total.add(dec(shipping)).toDecimalPlaces(12),requestedAmount:body.creditSpent??null,availableBalance:balance.toDecimalPlaces(12),customerId:customer?.id??null});
  const cvs=resolveCustomerCvsDefaults(body,customer??null);const [order]=await ex.insert(ordersTable).values({storeId,productId:prepared[0].listingProductId,orderItemsVersion:1,customerId:customer?.id??null,productName:prepared[0].productNameSnapshot,publicToken:randomBytes(16).toString('hex'),buyerName:body.buyerName,buyerPhone:body.buyerPhone,pickupMethod:body.pickupMethod,notes:body.notes??null,quantity:1,unitPrice:total.toDecimalPlaces(2),totalPrice:total.toDecimalPlaces(2),shippingFee:shipping,creditSpent:credit.creditSpent.toDecimalPlaces(12),payableAfterCredit:credit.payableAfterCredit.toDecimalPlaces(12),paymentLast5:parsePaymentLast5(body.paymentLast5),status:'pending',shippingMethod:body.shippingMethod??null,recipientName:body.recipientName??null,recipientPhone:body.recipientPhone??null,recipientAddress:body.recipientAddress??null,cvsStoreId:cvs.storeCode,cvsStoreName:cvs.storeName,cvsStoreAddress:cvs.cvsStoreAddress,cvsStorePhone:cvs.cvsStorePhone,storeSelectedBy:cvs.storeCode?(cvs.usedCustomerDefault?'customer_default':'admin'):null,storeSelectedAt:cvs.storeCode?new Date():null}).returning();
  const saved=await persistOrderItems(ex,order,prepared);
  if(!credit.creditSpent.equals(ExactDecimal.zero())){const spend=prepareStoreCreditSpend({amount:credit.creditSpent.toDecimalPlaces(12),availableBalance:balance.toDecimalPlaces(12),relatedOrderId:order.id});const [row]=await ex.insert(storeCreditTransactionsTable).values({storeId,customerId:customer!.id,direction:spend.direction,type:spend.type,amount:spend.amount.toDecimalPlaces(12),relatedOrderId:order.id,createdBy:actor}).returning();await ex.insert(auditLogsTable).values({storeId,actor,action:'store_credit_spend',target:buildStoreCreditAuditTarget({customerId:customer!.id,transactionId:row.id,amount:spend.amount.toDecimalPlaces(12),relatedOrderId:order.id})});}
  await c.query('COMMIT');return saved;
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
export async function capturePendingItem(storeId:number,orderId:number,itemId:number,raw:unknown,actor:string){
 const input=PreviewPricingV2Body.parse(raw);for(const key of ['originalPriceJpy','effectiveCostJpy'] as const)if(input[key]!=null)catalogDecimal(input[key]);if(input.weightGrams!=null)catalogDecimal(input.weightGrams,2);
 return db.transaction(async ex=>{await lockOrderStore(ex,storeId,actor);const [order]=await ex.select().from(ordersTable).where(and(eq(ordersTable.storeId,storeId),eq(ordersTable.id,orderId))).for('update');if(!order)throw new CatalogError(404,'找不到訂單');const [item]=await ex.select().from(orderItemsTable).where(and(eq(orderItemsTable.storeId,storeId),eq(orderItemsTable.orderId,orderId),eq(orderItemsTable.id,itemId))).for('update');if(!item)throw new CatalogError(404,'找不到品項');if(item.profitSnapshotStatus!=='PENDING')throw new CatalogError(409,'成本已捕捉，不能覆寫');if(['completed','cancelled'].includes(order.status))throw new CatalogError(409,'目前狀態不能補成本');
  const finalInput={...input,generalFinalPriceTwd:item.unitPriceTwd,vipFinalPriceTwd:item.unitPriceTwd};let configuration={};const preview=await resolvePricing(ex,storeId,finalInput,c=>configuration=c);if(preview.general.status!=='READY')throw new CatalogError(422,'成本仍不完整',{reasons:preview.general.reasons});const captured=captureFromPreview(preview,{source:'PENDING_CAPTURE',input:finalInput,configuration},!!input.isTransportCostExempt);await ex.update(orderItemsTable).set({...captured,capturedAt:sql`clock_timestamp()`}).where(eq(orderItemsTable.id,item.id));const [view]=await hydrateItemOrders(ex,[order]);await ex.update(ordersTable).set({items:view.items,cartProfitSnapshotStatus:view.cartProfitSnapshotStatus,cartProfitSnapshotTotalTwd:view.cartProfitSnapshotTotalTwd}).where(eq(ordersTable.id,order.id));return view;
 });
}
export async function patchItemOrder(storeId:number,id:number,updates:Record<string,any>,actor:string){
 return db.transaction(async ex=>{
  await lockOrderStore(ex,storeId,actor);
  const [order]=await ex.select().from(ordersTable).where(and(eq(ordersTable.id,id),eq(ordersTable.storeId,storeId))).for('update');
  if(!order)throw new CatalogError(404,'找不到訂單');
  if(['completed','cancelled'].includes(order.status))throw new CatalogError(422,'目前狀態不能編輯訂單');
  const items=await ex.select().from(orderItemsTable).where(eq(orderItemsTable.orderId,id)).orderBy(orderItemsTable.id).for('update');
  if(items.length){
   const [history]=await ex.select({id:orderCompletionEventsTable.id}).from(orderCompletionEventsTable).where(eq(orderCompletionEventsTable.orderId,id)).limit(1);
   if(history&&items.length===1&&updates.quantity===items[0].quantity){delete updates.quantity;delete updates.totalPrice;}
   if(updates.quantity!==undefined){
    if(items.length!==1)throw new CatalogError(422,'多品項訂單請省略整單數量；聯絡與物流資料仍可保存');
    if(history)throw new CatalogError(409,'訂單已有完成歷史，不能修改數量或金額');
    const quantity=updates.quantity,subtotal=orderMoney(dec(items[0].unitPriceTwd).multiply(dec(String(quantity))).toDecimalPlaces(12));
    const [item]=await ex.update(orderItemsTable).set({quantity,subtotalTwd:subtotal,specValues:updates.specValues??items[0].specValues}).where(eq(orderItemsTable.id,items[0].id)).returning();
    const view=itemOrderView(order,[item]);Object.assign(updates,{totalPrice:subtotal,unitPrice:item.unitPriceTwd,items:view.items,cartProfitSnapshotStatus:view.cartProfitSnapshotStatus,cartProfitSnapshotTotalTwd:view.cartProfitSnapshotTotalTwd});
   }else if(updates.specValues!==undefined&&items.length===1&&!history){
    const [item]=await ex.update(orderItemsTable).set({specValues:updates.specValues}).where(eq(orderItemsTable.id,items[0].id)).returning();updates.items=[orderItemProjection(item)];
   }
   if(updates.quantity!==undefined||updates.shippingFee!==undefined||updates.discountAmount!==undefined){
    const payable=dec(String(updates.totalPrice??order.totalPrice)).add(dec(String(updates.shippingFee??order.shippingFee))).add(dec(String(updates.discountAmount??order.discountAmount??0)).multiply(dec('-1'))).add(dec(order.creditSpent??'0').multiply(dec('-1')));
    if(payable.isNegative())throw new CatalogError(422,'折扣與購物金不能超過訂單總額');updates.payableAfterCredit=payable.toDecimalPlaces(12);
   }
  }
  const [saved]=await ex.update(ordersTable).set(updates).where(eq(ordersTable.id,id)).returning();return (await hydrateItemOrders(ex,[saved]))[0];
 });
}
export function flattenOrderLines(orders:any[]):any[]{return orders.flatMap(o=>Array.isArray(o.items)&&o.items.length?o.items.map((i:any)=>({...o,orderItemId:i.orderItemId,capturedRouteId:o.orderItems?.find((x:any)=>x.id===i.orderItemId)?.tripRouteIdSnapshot??null,productId:i.productId??null,productName:i.productName,specValues:i.specValues??{},quantity:i.quantity,unitPrice:String(i.unitPrice),totalPrice:String(i.subtotal)})):[o]);}
