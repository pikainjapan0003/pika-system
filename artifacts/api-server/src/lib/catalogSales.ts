import {and,eq,sql} from 'drizzle-orm';
import {db,orderItemsTable,catalogProductsTable,productCostRecordsTable,storePricingSettingsTable} from '@workspace/db';
import {ExactDecimal} from '@workspace/db/transport-cost';
import {PreviewPricingV2Body} from '@workspace/api-zod';
import {CatalogError} from '@workspace/db/catalog';
import {resolvePricing} from './pricingResolution.ts';
type Executor=Pick<typeof db,'select'|'execute'>;
export function saleDateStatus(latestAt:string|null,days:number,now=new Date()){if(!latestAt)return 'UNKNOWN';const at=Date.parse(latestAt);if(!Number.isFinite(at))return 'UNKNOWN';return Math.floor((now.getTime()-at)/86400000)>days?'STALE':'CURRENT';}
/** One grouped query for all visible cards. Latest event is unique per order. */
export async function catalogSales(ex:Executor,storeId:number,ids:number[],now=new Date()){
 const [settings]=await ex.select().from(storePricingSettingsTable).where(eq(storePricingSettingsTable.storeId,storeId));const staleSaleDays=settings?.staleSaleDays??180;
 if(!ids.length)return {asOf:now.toISOString(),staleSaleDays,items:[]};
 const rows=(await ex.execute(sql`
 WITH completed AS (
  SELECT o.id,e.id AS event_id,e.completed_at FROM orders o
  JOIN LATERAL (SELECT id,to_status,completed_at FROM order_completion_events e WHERE e.store_id=o.store_id AND e.order_id=o.id ORDER BY id DESC LIMIT 1) e ON e.to_status='completed' AND e.completed_at IS NOT NULL
  WHERE o.store_id=${storeId} AND o.status='completed'
 )
 SELECT i.catalog_product_id AS "catalogProductId",i.customer_tier_snapshot AS tier,
 sum(i.quantity)::text AS quantity,count(DISTINCT i.order_id)::integer AS "orderCount",
 min(i.unit_price_twd)::text AS "minPriceTwd",max(i.unit_price_twd)::text AS "maxPriceTwd",
 round(sum(i.subtotal_twd)/sum(i.quantity),12)::text AS "weightedAverageTwd",
 min(c.completed_at) AS "fromAt",max(c.completed_at) AS "toAt",
 (array_agg(i.unit_price_twd ORDER BY c.completed_at DESC,c.event_id DESC,i.id DESC))[1]::text AS "latestPriceTwd",
 (array_agg(i.unit_profit_twd_snapshot ORDER BY c.completed_at DESC,c.event_id DESC,i.id DESC))[1]::text AS "latestUnitProfitTwd",
 (array_agg(i.total_cost_twd_snapshot ORDER BY c.completed_at DESC,c.event_id DESC,i.id DESC))[1]::text AS "latestUnitCostTwd"
 FROM order_items i JOIN completed c ON c.id=i.order_id
 WHERE i.store_id=${storeId} AND i.catalog_product_id=ANY(${`{${ids.join(',')}}`}::int[])
 AND i.customer_tier_snapshot IN ('general','vip') AND i.profit_snapshot_status IN ('CAPTURED','EXEMPT') AND i.captured_at IS NOT NULL
 GROUP BY i.catalog_product_id,i.customer_tier_snapshot`)).rows as any[];
 const dated=rows.map(r=>({...r,fromAt:new Date(r.fromAt).toISOString(),toAt:new Date(r.toAt).toISOString(),dateStatus:saleDateStatus(new Date(r.toAt).toISOString(),staleSaleDays,now)}));
 return {asOf:now.toISOString(),staleSaleDays,rangeLabel:'全部可確認的已完成成交',items:ids.map(catalogProductId=>({catalogProductId,general:dated.find(r=>r.catalogProductId===catalogProductId&&r.tier==='general')??null,vip:dated.find(r=>r.catalogProductId===catalogProductId&&r.tier==='vip')??null}))};
}
export async function formalVipHistory(ex:Executor,storeId:number,catalogId:number|null){if(catalogId===null)return null;return (await catalogSales(ex,storeId,[catalogId])).items[0]?.vip??null;}
/** Detail-only current reference. No per-card resolver waterfall and no history mutation. */
export async function currentCatalogSaleReference(ex:Executor,storeId:number,catalogId:number){
 const [catalog]=await ex.select().from(catalogProductsTable).where(and(eq(catalogProductsTable.storeId,storeId),eq(catalogProductsTable.id,catalogId)));if(!catalog)throw new CatalogError(404,'找不到此店鋪商品');
 const [cost]=await ex.select().from(productCostRecordsTable).where(and(eq(productCostRecordsTable.storeId,storeId),eq(productCostRecordsTable.catalogProductId,catalogId),eq(productCostRecordsTable.isCurrent,true),eq(productCostRecordsTable.status,'ACTIVE')));
 const [latest]=(await ex.execute(sql`SELECT i.* FROM order_items i JOIN orders o ON o.store_id=i.store_id AND o.id=i.order_id JOIN LATERAL(SELECT completed_at,to_status FROM order_completion_events e WHERE e.store_id=o.store_id AND e.order_id=o.id ORDER BY id DESC LIMIT 1)e ON e.to_status='completed' AND e.completed_at IS NOT NULL WHERE i.store_id=${storeId} AND i.catalog_product_id=${catalogId} AND o.status='completed' AND i.customer_tier_snapshot IN ('general','vip') AND i.profit_snapshot_status IN ('CAPTURED','EXEMPT') ORDER BY e.completed_at DESC,i.id DESC LIMIT 1`)).rows as any[];
 const stats=await catalogSales(ex,storeId,[catalogId]);const sale=stats.items[0];
 if(!cost||!latest)return {...stats,currentReference:{status:'PENDING_CONFIRMATION',label:'目前完整成本尚待確認',generalUnitProfitTwd:null,vipUnitProfitTwd:null}};
 const input=PreviewPricingV2Body.parse({originalPriceJpy:cost.originalPriceJpy,effectiveCostJpy:cost.effectiveCostJpy,weightGrams:catalog.weightGrams,templateId:catalog.defaultPricingTemplateId??undefined,shippingProfileId:catalog.defaultShippingProfileId??latest.international_shipping_profile_snapshot?.id??undefined,tripRouteId:catalog.lastUsedTripRouteId??latest.trip_route_id_snapshot??undefined,isTransportCostExempt:latest.capture_context?.isTransportCostExempt===true,generalFinalPriceTwd:sale.general?.latestPriceTwd??sale.vip?.latestPriceTwd,vipFinalPriceTwd:sale.vip?.latestPriceTwd??sale.general?.latestPriceTwd});
 if(catalog.defaultDepartmentStoreFeeRate!==null) input.departmentStoreFeeRate=catalog.defaultDepartmentStoreFeeRate;
 const preview=await resolvePricing(ex,storeId,input);return {...stats,currentReference:{status:preview.general.status,label:'以目前成本、設定及最近成交交通條件重算；歷史不變',totalCostTwd:preview.amounts.totalCostTwd,generalUnitProfitTwd:sale.general?preview.general.values.netProfitTwd:null,vipUnitProfitTwd:sale.vip?preview.vip.values.netProfitTwd:null,reasons:preview.general.reasons}};
}
