import {Router} from 'express';
import {formatOrder} from './orders.ts';
import {sql} from 'drizzle-orm';
import {catalogDto} from '../lib/catalogService.ts';
import {db} from '@workspace/db';
import {CatalogError} from '@workspace/db/catalog';
import {requireAuth,verifyStoreOwner} from '../middlewares/auth.ts';
import {createCatalogOrder,capturePendingItem,orderId} from '../lib/catalogOrder.ts';
import {catalogSales,currentCatalogSaleReference} from '../lib/catalogSales.ts';
const router=Router();
router.get('/stores/:storeId/order-cost-options',requireAuth,async(req:any,res)=>{try{const s=orderId(req.params.storeId);if(!await verifyStoreOwner(req,res,s))return;const rows=(await db.execute(sql`SELECT t.id,t.store_id,t.name,coalesce(jsonb_agg(jsonb_build_object('id',r.id,'storeId',r.store_id,'areaTitle',r.area_title) ORDER BY r.id) FILTER (WHERE r.id IS NOT NULL),'[]'::jsonb) AS routes FROM trips t LEFT JOIN trip_routes r ON r.trip_id=t.id AND r.store_id=${s} WHERE t.store_id=${s} GROUP BY t.id ORDER BY t.id`)).rows;return res.json({trips:catalogDto(rows)});}catch(e){return failure(res,e);}});
function failure(res:any,error:any){if(error instanceof CatalogError)return res.status(error.status).json({error:error.message,details:error.details});if([400,403,404,409,422].includes(error?.status))return res.status(error.status).json({error:error.message});if(error?.name==='ZodError')return res.status(400).json({error:'輸入欄位不正確',details:error.issues});if(error instanceof TypeError||error instanceof RangeError)return res.status(422).json({error:error.message});if(['23514','23503','22003'].includes(error.code??error.cause?.code))return res.status(422).json({error:'品項成本不完整、金額超出範圍或已有不可變歷史，未保存變更'});throw error;}
router.post('/stores/:storeId/catalog-orders',requireAuth,async(req:any,res)=>{try{const storeId=orderId(req.params.storeId);if(!await verifyStoreOwner(req,res,storeId))return;return res.status(201).json(formatOrder(await createCatalogOrder(storeId,req.body,req.userId)));}catch(e){return failure(res,e);}});
router.post('/stores/:storeId/orders/:orderId/items/:itemId/capture',requireAuth,async(req:any,res)=>{try{const storeId=orderId(req.params.storeId);if(!await verifyStoreOwner(req,res,storeId))return;return res.json(formatOrder(await capturePendingItem(storeId,orderId(req.params.orderId),orderId(req.params.itemId),req.body,req.userId)));}catch(e){return failure(res,e);}});
router.get('/stores/:storeId/catalog-sales',requireAuth,async(req:any,res)=>{try{const storeId=orderId(req.params.storeId);if(!await verifyStoreOwner(req,res,storeId))return;if(Object.keys(req.query).some(k=>k!=='ids')||typeof req.query.ids!=='string')throw new CatalogError(400,'請提供商品 ID 清單');const ids=[...new Set(req.query.ids.split(',').map(orderId))] as number[];if(ids.length>100)throw new CatalogError(400,'一次最多查詢100個商品');return res.json(await catalogSales(db,storeId,ids));}catch(e){return failure(res,e);}});
router.get('/stores/:storeId/catalog-products/:catalogProductId/sales-reference',requireAuth,async(req:any,res)=>{try{const storeId=orderId(req.params.storeId);if(!await verifyStoreOwner(req,res,storeId))return;return res.json(await currentCatalogSaleReference(db,storeId,orderId(req.params.catalogProductId)));}catch(e){return failure(res,e);}});
export default router;
