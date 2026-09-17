import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {readFileSync,writeFileSync} from 'node:fs';
import {fixture,pool,stop} from '../productOrderE2E.mjs';
import {phase6Legacy,compareLegacy,phase6Sql} from '../../../../e2e/product-order-harness.mjs';
const s=fixture.store,q=(sql,args)=>pool.query(sql,args),prefix=`/stores/${s}`,base=`http://127.0.0.1:${fixture.port}/api`;
const api=async(method,path,body,expected=200,token='e2e-owner-token')=>{const r=await fetch(base+path,{method,headers:{Connection:'close','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();if(expected!==null)assert.equal(r.status,expected,method+' '+path+' '+JSON.stringify(data));return {status:r.status,data};};
let ship,catA,catB,listingA,listingB,vip,whole,partner,mixed;
const cost=(n)=>({originalPriceJpy:String(n),effectiveCostJpy:String(n),weightGrams:'1',shippingProfileId:ship,isTransportCostExempt:true});
const line=(n,price,quantity=1,extra={})=>({name:'一次性測試',quantity,unitPriceTwd:String(price),cost:cost(n),...extra});
const create=async(items,extra={})=>(await api('POST',prefix+'/catalog-orders',{buyerName:'合成買家',buyerPhone:'0912345678',pickupMethod:'自取',items,...extra},201)).data;
async function complete(id){for(const status of ['awaiting_payment','preparing','shipped','completed'])await api('PATCH',`/orders/${id}/status`,{status});}
async function listing(catalog,price){const input={mode:'PREVIEW',generalFinalPriceTwd:String(price),vipFinalPriceTwd:String(price),shippingProfileId:ship,isTransportCostExempt:true};const pre=(await api('POST',prefix+`/catalog-products/${catalog}/create-listing`,input)).data;const saved=(await api('POST',prefix+`/catalog-products/${catalog}/create-listing`,{...input,mode:'SAVE',expectedContext:pre.reference.context,confirmLowProfit:true},201)).data;return saved.product;}
before(async()=>{
 await q('UPDATE stores SET purchase_exchange_rate=1 WHERE id=$1',[s]);await api('POST',prefix+'/pricing-settings/initialize',{});
 await api('PATCH',prefix+'/pricing-settings',{lossProtectionTwd:'0',purchasePaymentFeeRate:'0',routePaymentFeeRate:'0'});
 ship=(await api('POST',prefix+'/shipping-profiles',{name:'合成零運费',code:'SYNTHETIC_ZERO',rateTwd:'0',basisWeightGrams:'1000'})).data.record.id;
 const cat=async(name,n)=>(await api('POST',prefix+'/catalog-products',{name,barcode:'0',barcodeStatus:'NONE',weightGrams:'1',originalPriceJpy:String(n),defaultShippingProfileId:ship})).data.product.id;
 catA=await cat('Oracle A',70);catB=await cat('Oracle B',40);
 listingA=await listing(catA,100);listingB=await listing(catB,50);
 for(const tier of ['vip','wholesale','partner']){const id=(await q('INSERT INTO customers(store_id,code,name,tier) VALUES($1,$2,$3,$4) RETURNING id',[s,'P6-'+tier,'合成 '+tier,tier])).rows[0].id;if(tier==='vip')vip=id;if(tier==='wholesale')whole=id;if(tier==='partner')partner=id;}
});
after(async()=>{const identity=JSON.parse(readFileSync(process.env.PIKA_PHASE6_EVIDENCE+'/database.json'));const final={};for(const [database,v]of Object.entries(identity.legacy)){const current=phase6Legacy(identity.id,database);compareLegacy(v.before,current);final[database]=current;}writeFileSync(process.env.PIKA_PHASE6_EVIDENCE+'/legacy-after-api.json',JSON.stringify(final,null,2));await stop();});
test('real mixed order 370 sale / 265 cost / 105 profit / 6 units; server tier and full immutable capture',async()=>{
 const before=(await q('SELECT inventory FROM products WHERE id=$1',[listingA.id])).rows[0];
 mixed=await create([{listingProductId:listingA.id,quantity:2,specValues:{尺寸:'A'}},{catalogProductId:catB,quantity:3,unitPriceTwd:'50',cost:{isTransportCostExempt:true}},line(5,20)]);
 assert.equal(mixed.productId,listingA.id);assert.equal(mixed.orderItems.length,3);assert.equal(mixed.quantity,6);assert.equal(Number(mixed.totalPrice),370);assert.equal(Number(mixed.itemCostTotalTwd),265);assert.equal(Number(mixed.itemProfitTotalTwd),105);assert.equal(mixed.orderItems[2].catalogProductId,null);assert.equal(mixed.orderItems[2].listingProductId,null);
 for(const i of mixed.orderItems){assert.equal(i.customerTierSnapshot,'general');assert.ok(i.capturedAt);assert.equal(i.formulaVersion,'v2');assert.ok(i.captureContext);assert.ok(i.internationalShippingProfileSnapshot);}
 assert.deepEqual((await q('SELECT inventory FROM products WHERE id=$1',[listingA.id])).rows[0],before);
 const captured=(await q('SELECT to_jsonb(i) body FROM order_items i WHERE order_id=$1 ORDER BY id',[mixed.id])).rows;
 await api('POST',prefix+`/catalog-products/${catA}/cost-records`,{originalPriceJpy:'200',adjustmentMode:'NONE',reasonCode:'OTHER',reasonText:'合成成本更新驗證'});
 await api('PATCH',prefix+'/pricing-settings',{purchasePaymentFeeRate:'0.01'});await q('UPDATE stores SET purchase_exchange_rate=.99 WHERE id=$1',[s]);
 assert.deepEqual((await q('SELECT to_jsonb(i) body FROM order_items i WHERE order_id=$1 ORDER BY id',[mixed.id])).rows,captured);
 await api('PATCH',prefix+'/pricing-settings',{purchasePaymentFeeRate:'0'});await q('UPDATE stores SET purchase_exchange_rate=1 WHERE id=$1',[s]);
 const list=(await api('GET',prefix+'/orders')).data.find(o=>o.id===mixed.id);assert.equal(Number(list.itemProfitTotalTwd),105);assert.equal(list.items[2].productName,'一次性測試');
 const edited=(await api('PATCH',`/orders/${mixed.id}`,{buyerName:'聯絡資料修改'})).data;assert.equal(Number(edited.totalPrice),370);await api('PATCH',`/orders/${mixed.id}`,{quantity:6},422);
 const summary=(await api('GET',prefix+'/orders/profit-summary')).data;assert.ok(JSON.stringify(summary).includes('105'));
 const picking=(await api('POST','/orders/picking-list',{orderIds:[mixed.id]})).data;assert.equal(picking.orderCount,1);assert.equal(picking.items.reduce((n,i)=>n+i.quantityTotal,0),6);assert.equal(picking.orderItems.length,3);assert.ok(picking.orderItems.some(i=>i.itemKey===`order-item:${mixed.orderItems[2].id}`));
 const tracked=(await api('GET',`/orders/track/${mixed.publicToken}`,undefined,200,null)).data;assert.equal(tracked.totalPrice,370);assert.equal(tracked.items.length,3);assert.equal(tracked.items[2].productId,null);assert.ok(!/cost|profit|exchange|capture|customerTier|actor|internalNote/i.test(JSON.stringify(tracked)));assert.deepEqual(Object.keys(tracked.items[2]).sort(),['productId','productName','productImageUrl','specValues','quantity','unitPrice','subtotal'].sort());
 await api('PATCH',`/orders/track/${mixed.publicToken}/payment-last5`,{paymentLast5:'01234'},200,null);assert.equal((await api('GET',`/orders/track/${mixed.publicToken}`,undefined,200,null)).data.paymentLast5,'01234');
});
test('pending T1 -> capture T2 -> complete T3; completeness guards and immutable financial history',async()=>{
 const o=await create([{name:'缺成本手動品',quantity:2,unitPriceTwd:'100'}]);const i=o.orderItems[0];assert.equal(o.productId,null);assert.equal(i.profitSnapshotStatus,'PENDING');assert.equal(i.capturedAt,null);
 await api('PATCH',`/orders/${o.id}/status`,{status:'completed'},422);
 await api('POST',prefix+`/orders/${o.id}/items/${i.id}/capture`,{isTransportCostExempt:true},422);
 await assert.rejects(q("UPDATE order_items SET profit_snapshot_status='EXEMPT' WHERE id=$1",[i.id]));
 await new Promise(r=>setTimeout(r,20));const captured=(await api('POST',prefix+`/orders/${o.id}/items/${i.id}/capture`,cost(70))).data.orderItems[0];assert.ok(Date.parse(captured.capturedAt)>Date.parse(i.createdAt));
 const edited=(await api('PATCH',`/orders/${o.id}`,{quantity:3})).data;assert.equal(edited.quantity,3);assert.equal(Number(edited.totalPrice),300);assert.equal(edited.orderItems[0].quantity,3);assert.equal(Number(edited.orderItems[0].subtotalTwd),300);assert.equal(Number(edited.orderItems[0].totalCostTwdSnapshot),70);
 await complete(o.id);const events=(await q('SELECT * FROM order_completion_events WHERE order_id=$1 ORDER BY id',[o.id])).rows;assert.equal(events.length,1);assert.ok(events[0].completed_at.getTime()>=Date.parse(captured.capturedAt));
 await api('PATCH',`/orders/${o.id}/status`,{status:'preparing'});await api('PATCH',`/orders/${o.id}`,{quantity:4},409);await api('PATCH',`/orders/${o.id}`,{buyerName:'重開聯絡編輯'});await api('DELETE',prefix+`/orders/${o.id}`,undefined,409);
 await api('PATCH',`/orders/${o.id}`,{buyerName:'原數量下聯絡編輯',quantity:3});
 await api('PATCH',`/orders/${o.id}/status`,{status:'completed'});assert.equal((await q('SELECT count(*)::int n FROM order_completion_events WHERE order_id=$1',[o.id])).rows[0].n,3);
 assert.equal((await q('SELECT captured_at FROM order_items WHERE id=$1',[i.id])).rows[0].captured_at.toISOString(),captured.capturedAt);
 for(const change of ["total_cost_twd_snapshot=0","unit_price_twd=9","quantity=4,subtotal_twd=400","captured_at=now()","formula_version='bad'","total_cost_twd_snapshot='NaN'"]){await assert.rejects(q('UPDATE order_items SET '+change+' WHERE id=$1',[i.id]));}
 await assert.rejects(q('DELETE FROM order_completion_events WHERE order_id=$1',[o.id]));
 const identity=JSON.parse(readFileSync(process.env.PIKA_PHASE6_EVIDENCE+'/database.json'));assert.throws(()=>phase6Sql(identity.id,'pika_phase6',readFileSync(new URL('../../../../lib/db/migrations/rollback/0044_order_items_capture.sql',import.meta.url))));
});
test('latest formal general and VIP weighted sales, history/current reference separation and recompletion',async()=>{
 const cat=(await api('POST',prefix+'/catalog-products',{name:'正式成交獨立樣本',barcode:'0',barcodeStatus:'NONE',weightGrams:'1',originalPriceJpy:'100',defaultShippingProfileId:ship})).data.product.id;
 const values=[[70,100,2,null],[100,200,3,null],[80,90,1,vip],[100,150,4,vip],[1,999,30,whole],[1,999,30,partner]];let last;
 for(const [c,p,n,customerId]of values){const o=await create([line(c,p,n,{catalogProductId:cat})],{customerId});await complete(o.id);last=o;}
 let result=(await api('GET',prefix+`/catalog-sales?ids=${cat}`)).data.items[0];assert.equal(result.general.quantity,'5');assert.equal(Number(result.general.weightedAverageTwd),160);assert.equal(Number(result.general.latestPriceTwd),200);assert.equal(Number(result.general.latestUnitProfitTwd),100);assert.equal(result.vip.quantity,'5');assert.equal(Number(result.vip.weightedAverageTwd),138);assert.equal(Number(result.vip.latestPriceTwd),150);assert.equal(Number(result.vip.latestUnitProfitTwd),50);
 await api('POST',prefix+`/catalog-products/${cat}/cost-records`,{originalPriceJpy:'200',adjustmentMode:'NONE',reasonCode:'OTHER',reasonText:'合成成本更新驗證'});const ref=(await api('GET',prefix+`/catalog-products/${cat}/sales-reference`)).data.currentReference;assert.equal(Number(ref.generalUnitProfitTwd),0);assert.equal(Number(ref.vipUnitProfitTwd),-50);
 await api('PATCH',`/orders/${last.id}/status`,{status:'preparing'});await api('PATCH',`/orders/${last.id}/status`,{status:'completed'});assert.deepEqual((await api('GET',prefix+`/catalog-sales?ids=${cat}`)).data.items[0],result);
 await api('PATCH',prefix+'/pricing-settings',{staleSaleDays:181});assert.equal((await api('GET',prefix+`/catalog-sales?ids=${cat}`)).data.staleSaleDays,181);
 const {saleDateStatus}=await import('../lib/catalogSales.ts');const now=new Date('2026-09-14T00:00:00Z');assert.equal(saleDateStatus(new Date(now.getTime()-180*86400000).toISOString(),180,now),'CURRENT');assert.equal(saleDateStatus(new Date(now.getTime()-181*86400000).toISOString(),180,now),'STALE');assert.equal(saleDateStatus(null,180,now),'UNKNOWN');
});
test('normal CAPTURED includes every fee once and concurrent completion adds one event',async()=>{
 const trip=(await q("INSERT INTO trips(store_id,name,exchange_rate,hep_total_jpy,total_item_quantity) VALUES($1,'正常交通合成',1,0,10) RETURNING id",[s])).rows[0].id;
 const route=(await q("INSERT INTO trip_routes(store_id,trip_id,area_title,start_place,end_place,train_jpy,fuel_jpy,etc_jpy,est_qty,domestic_per_item_is_overridden,domestic_per_item_override) VALUES($1,$2,'正常','A','B',100,0,0,10,true,0) RETURNING id",[s,trip])).rows[0].id;
 const area=(await q("INSERT INTO trip_areas(store_id,trip_id,name) VALUES($1,$2,'合成區域') RETURNING id",[s,trip])).rows[0].id;
 await q("INSERT INTO trip_area_costs(trip_area_id,mode,cardboard_unit_jpy,shipping_unit_jpy,parcel_count,estimated_item_quantity) VALUES($1,'ESTIMATE',0,0,0,10)",[area]);await q('UPDATE trip_routes SET trip_area_id=$1 WHERE id=$2',[area,route]);
 const shipping=(await api('POST',prefix+'/shipping-profiles',{name:'正常航運',code:'NORMAL_CAPTURE',rateTwd:'2',basisWeightGrams:'1000'})).data.record.id;
 const input={originalPriceJpy:'70',effectiveCostJpy:'70',weightGrams:'1000',shippingProfileId:shipping,tripRouteId:route,isTransportCostExempt:false,purchasePaymentFeeRate:'0.1',lossProtectionTwd:'3',generalFinalPriceTwd:'150',vipFinalPriceTwd:'150'};
 const preview=(await api('POST',prefix+'/pricing/preview',input)).data;
 const order=await create([{name:'正常全成本',quantity:2,unitPriceTwd:'150',cost:input}]);const item=order.orderItems[0];
 assert.equal(item.profitSnapshotStatus,'CAPTURED');assert.equal(item.tripRouteIdSnapshot,route);assert.equal(Number(item.totalCostTwdSnapshot),Number(preview.amounts.totalCostTwd));assert.ok(Number(item.routeCostTwdSnapshot)>0);assert.ok(Number(item.internationalShippingTwdSnapshot)>0);assert.equal(Number(item.unitProfitTwdSnapshot),150-Number(item.totalCostTwdSnapshot));
 const statuses=await Promise.all([api('PATCH',`/orders/${order.id}/status`,{status:'completed'},null),api('PATCH',`/orders/${order.id}/status`,{status:'completed'},null)]);assert.ok(statuses.some(r=>r.status===200));assert.ok(statuses.every(r=>[200,422].includes(r.status)));assert.equal((await q('SELECT count(*)::int n FROM order_completion_events WHERE order_id=$1',[order.id])).rows[0].n,1);
 const frozen=(await q('SELECT to_jsonb(i) body FROM order_items i WHERE id=$1',[item.id])).rows;await q('UPDATE trip_routes SET train_jpy=9999 WHERE id=$1',[route]);assert.deepEqual((await q('SELECT to_jsonb(i) body FROM order_items i WHERE id=$1',[item.id])).rows,frozen);
});
test('manual item stays present in actual normal-temperature export and absent-temperature stays ineligible',async()=>{
 const order=await create([line(5,20,2,{specValues:{溫層:'常溫'}})],{pickupMethod:'7-11 賣貨便',storeCode:'123456'});await api('PATCH',`/orders/${order.id}/status`,{status:'preparing'});
 const preview=(await api('GET',prefix+'/orders/maihuobian-export')).data;assert.ok(preview.eligible.some(x=>x.orderId===order.id&&x.productSummary.includes('一次性測試')),JSON.stringify(preview));
 const exported=await fetch(base+prefix+'/orders/maihuobian-export?format=csv',{method:'POST',headers:{Authorization:'Bearer e2e-owner-token','Content-Type':'application/json','x-confirm-cleartext-export':'true','x-confirm-maihuobian-export':'true'},body:JSON.stringify({orderIds:[order.id]})});const csv=await exported.text();assert.equal(exported.status,200,csv);assert.ok(csv.includes('一次性測試'));assert.ok(!/profit|cost|exchangeRate|captureContext/.test(csv));writeFileSync(process.env.PIKA_PHASE6_EVIDENCE+'/manual-export.csv',csv);
 const unknown=await create([line(5,20)],{pickupMethod:'7-11 賣貨便',storeCode:'123456'});await api('PATCH',`/orders/${unknown.id}/status`,{status:'preparing'});assert.ok((await api('GET',prefix+'/orders/maihuobian-export')).data.ineligible.some(x=>x.orderId===unknown.id));
});
test('legacy unknown completion date stays excluded and later Listing relink never rewrites captured catalog',async()=>{
 const untouched=(await api('GET',prefix+`/catalog-sales?ids=${catB}`)).data.items[0];
 await q("INSERT INTO orders(store_id,product_id,public_token,buyer_name,buyer_phone,pickup_method,quantity,unit_price,total_price,status) VALUES($1,$2,$3,'舊單未知日期','09','自取',99,1,99,'completed')",[s,listingB.id,'phase6-legacy-'+s]);
 assert.deepEqual((await api('GET',prefix+`/catalog-sales?ids=${catB}`)).data.items[0],untouched);
 const o=await create([{listingProductId:listingB.id,quantity:2}]);await complete(o.id);const bStats=(await api('GET',prefix+`/catalog-sales?ids=${catB}`)).data.items[0];
 await q('UPDATE products SET catalog_product_id=$1 WHERE id=$2',[catA,listingB.id]);assert.deepEqual((await api('GET',prefix+`/catalog-sales?ids=${catB}`)).data.items[0],bStats);assert.equal((await q('SELECT catalog_product_id FROM order_items WHERE order_id=$1',[o.id])).rows[0].catalog_product_id,catB);await q('UPDATE products SET catalog_product_id=$1 WHERE id=$2',[catB,listingB.id]);
});
test('strict canonical IDs, same-store references, derived input rejection, bounds and atomic optional catalog save',async()=>{
 const body={buyerName:'測試',buyerPhone:'09',pickupMethod:'自取',items:[line(5,20)]};
 for(const extra of [{customerTier:'vip'},{actor:'forged'},{profit:10}])await api('POST',prefix+'/catalog-orders',{...body,...extra},400);
 for(const item of [{...line(5,20),quantity:'2'},{...line(5,20),totalCostTwdSnapshot:'0'},{...line(5,20),catalogProductId:'1'}])await api('POST',prefix+'/catalog-orders',{...body,items:[item]},400);
 await api('POST',`/stores/0${s}/catalog-orders`,body,400);await api('POST',prefix+'/catalog-orders',body,401,null);await api('POST',`/stores/${fixture.other}/catalog-orders`,body,403);
 await api('POST',prefix+'/catalog-orders',{...body,customerId:2147483647},404);await api('POST',prefix+'/catalog-orders',{...body,items:[line(5,99999999.99,2)]},422);
 const before=(await q('SELECT count(*)::int n FROM catalog_products WHERE store_id=$1',[s])).rows[0].n;
 await api('POST',prefix+'/catalog-orders',{...body,items:[{...line(5,20),saveCatalog:{name:'不完整'}}]},400);assert.equal((await q('SELECT count(*)::int n FROM catalog_products WHERE store_id=$1',[s])).rows[0].n,before);
 const saved=await create([{...line(5,20),saveCatalog:{name:'正式另存一次性品',barcode:'0',barcodeStatus:'NONE',weightGrams:'1',originalPriceJpy:'5'}}]);assert.ok(saved.orderItems[0].catalogProductId);assert.equal((await q('SELECT count(*)::int n FROM product_cost_records WHERE catalog_product_id=$1',[saved.orderItems[0].catalogProductId])).rows[0].n,1);
});
test('public stock preserves merchant/no-restock policy and repeated/reversed carts are atomic',async()=>{
 await q('UPDATE products SET inventory=10 WHERE id=ANY($1)',[[listingA.id,listingB.id]]);
 await api('POST',prefix+'/orders',{productId:listingA.id,buyerName:'店家',buyerPhone:'09',pickupMethod:'自取',quantity:2},201);assert.equal((await q('SELECT inventory FROM products WHERE id=$1',[listingA.id])).rows[0].inventory,10);
 const cart=items=>api('POST','/cart/orders',{buyerName:'公開',buyerPhone:'09',pickupMethod:'自取',items},null,null);
 const a={shareToken:listingA.shareToken,quantity:2},b={shareToken:listingB.shareToken,quantity:2};const results=await Promise.all([cart([a,b,a]),cart([b,a]),api('POST',prefix+`/catalog-products/${catA}/cost-records`,{originalPriceJpy:'200',adjustmentMode:'NONE',reasonCode:'OTHER',reasonText:'合成成本更新驗證'})]);assert.equal(results[0].status,201);assert.equal(results[1].status,201);
 const inventory=(await q('SELECT id,inventory FROM products WHERE id=ANY($1) ORDER BY id',[[listingA.id,listingB.id]])).rows;assert.deepEqual(inventory.map(i=>i.inventory),[4,6]);
 const bad=await cart([{shareToken:listingA.shareToken,quantity:3},{shareToken:listingA.shareToken,quantity:3}]);assert.equal(bad.status,409);assert.equal((await q('SELECT inventory FROM products WHERE id=$1',[listingA.id])).rows[0].inventory,4);
 const pub=(await api('POST',`/p/${listingA.shareToken}/orders`,{buyerName:'公開單品',buyerPhone:'09',pickupMethod:'自取',quantity:1},201,null)).data;const o=(await q('SELECT id FROM orders WHERE public_token=$1',[pub.publicToken])).rows[0];await api('PATCH',`/orders/${o.id}/status`,{status:'cancelled'});assert.equal((await q('SELECT inventory FROM products WHERE id=$1',[listingA.id])).rows[0].inventory,3);
 await q('UPDATE products SET inventory=NULL WHERE id=$1',[listingB.id]);await cart([{shareToken:listingB.shareToken,quantity:1}]);assert.equal((await q('SELECT inventory FROM products WHERE id=$1',[listingB.id])).rows[0].inventory,null);
});
test('safe new item deletion; immutable credit cancellation reversal remains once under concurrency',async()=>{
 const disposable=await create([line(1,10)]);await api('DELETE',prefix+`/orders/${disposable.id}`);assert.equal((await q('SELECT count(*)::int n FROM order_items WHERE order_id=$1',[disposable.id])).rows[0].n,0);
 await q("INSERT INTO store_credit_transactions(store_id,customer_id,direction,type,amount,created_by) VALUES($1,$2,'credit','grant',100,$3)",[s,vip,fixture.owner]);
 const o=await create([line(5,20)],{customerId:vip,creditSpent:'10'});assert.equal(Number(o.payableAfterCredit),10);
 const replies=await Promise.all([api('PATCH',`/orders/${o.id}/status`,{status:'cancelled'}),api('PATCH',`/orders/${o.id}/status`,{status:'cancelled'})]);assert.equal(replies.length,2);assert.equal((await q("SELECT count(*)::int n FROM store_credit_transactions WHERE related_order_id=$1 AND type='reversal'",[o.id])).rows[0].n,1);await api('DELETE',prefix+`/orders/${o.id}`,undefined,409);
});
