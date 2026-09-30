import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {readFileSync,writeFileSync} from 'node:fs';
import {fixture,pool,stop} from '../productOrderE2E.mjs';
import {publicOrderPayable} from './public.ts';
import {phase6Legacy,compareLegacy} from '../../../../e2e/product-order-harness.mjs';
const s=fixture.store,base=`http://127.0.0.1:${fixture.port}/api`,e=process.env.PIKA_PHASE6_EVIDENCE;
const api=async(method,path,data,status=200)=>{const r=await fetch(base+path,{method,headers:{Connection:'close','Content-Type':'application/json',Authorization:'Bearer e2e-owner-token'},...(data===undefined?{}:{body:JSON.stringify(data)})});const body=await r.json();assert.equal(r.status,status,JSON.stringify(body));return body;};
const forbidden=/paymentNote|paidAmount|remainingAmount|creditSpent|payableAfterCredit|internalNote|cost|profit|exchange|capture|customerTier|actor|ledger|jpy/i;
const publicFields=['productId','productName','productImageUrl','specValues','quantity','unitPrice','subtotal'].sort();
let customer,ship;const results=[];
before(async()=>{
 await api('PATCH',`/stores/${s}`,{purchaseExchangeRate:1});await api('POST',`/stores/${s}/pricing-settings/initialize`,{});await api('PATCH',`/stores/${s}/pricing-settings`,{lossProtectionTwd:'0',purchasePaymentFeeRate:'0',routePaymentFeeRate:'0'});
 ship=(await api('POST',`/stores/${s}/shipping-profiles`,{name:'R2 public zero',code:'R2_PUBLIC_ZERO',rateTwd:'0',basisWeightGrams:'1000'})).record.id;
 customer=(await api('POST',`/stores/${s}/customers`,{name:'公開折抵測試',code:'R2-PUBLIC-CREDIT',tier:'general'},201)).id;
 await pool.query("INSERT INTO store_credit_transactions(store_id,customer_id,direction,type,amount,created_by) VALUES($1,$2,'credit','grant',100,$3)",[s,customer,fixture.owner]);
});
after(async()=>{try{const identity=JSON.parse(readFileSync(process.env.PIKA_PHASE6_IDENTITY,'utf8'));const legacy={};for(const [database,v]of Object.entries(identity.legacy)){const current=phase6Legacy(identity.id,database);compareLegacy(v.before,current);legacy[database]=current;}writeFileSync(e+'/public-credit-api.json',JSON.stringify({results,legacy},null,2),{flag:'wx'});}finally{await stop();}});
for(const [credit,expected]of [['10',10],['20',0],['0.15',19.85]])test(`real public payable preserves saved credit ${credit} -> ${expected}`,async()=>{
 const order=await api('POST',`/stores/${s}/catalog-orders`,{buyerName:'公開折抵測試',buyerPhone:'0912345678',pickupMethod:'自取',customerId:customer,creditSpent:credit,items:[{name:'公開合成商品',quantity:1,unitPriceTwd:'20',cost:{originalPriceJpy:'5',effectiveCostJpy:'5',weightGrams:'1',shippingProfileId:ship,isTransportCostExempt:true}}]},201);
 assert.equal(Number(order.payableAfterCredit),expected);const tracked=await api('GET',`/orders/track/${order.publicToken}`);assert.equal(tracked.orderTotal,expected);assert.equal(tracked.totalPrice,20);assert.doesNotMatch(JSON.stringify(tracked),forbidden);assert.deepEqual(Object.keys(tracked.items[0]).sort(),publicFields);
 const merchant=(await api('GET',`/stores/${s}/orders`)).find(x=>x.id===order.id);assert.equal(Number(merchant.payableAfterCredit),expected);assert.equal(Number(merchant.itemCostTotalTwd),5);assert.equal(Number(merchant.itemProfitTotalTwd),15);results.push({id:order.id,credit,expected,merchant,tracked});
});
test('real legacy null payable uses exact shipping and discount, clamped at zero',async()=>{
 for(const [total,shipping,discount,expected]of [['0.1','0.2','0',0.3],['20.25','3.15','2',21.4],['1','0','3',0]]){
  const token='r2-legacy-'+s+'-'+results.length;const row=(await pool.query("INSERT INTO orders(store_id,product_id,public_token,product_name,buyer_name,buyer_phone,pickup_method,quantity,unit_price,total_price,shipping_fee,discount_amount,payable_after_credit,status) VALUES($1,NULL,$2,'舊公開合成商品','合成買家','09','自取',1,$3,$3,$4,$5,NULL,'pending') RETURNING id",[s,token,total,shipping,discount])).rows[0];
  const tracked=await api('GET',`/orders/track/${token}`);assert.equal(tracked.orderTotal,expected);assert.doesNotMatch(JSON.stringify(tracked),forbidden);assert.equal((await pool.query('SELECT payable_after_credit FROM orders WHERE id=$1',[row.id])).rows[0].payable_after_credit,null);results.push({id:row.id,total,shipping,discount,expected,tracked});
 }
});
test('explicit payable zero and confirmed orderTotal precede legacy; no float intermediates',()=>{
 assert.equal(publicOrderPayable({payableAfterCredit:'0',orderTotal:'20',totalPrice:'99'}),0);
 assert.equal(publicOrderPayable({payableAfterCredit:null,orderTotal:'7.25',totalPrice:'99'}),7.25);
 assert.equal(publicOrderPayable({orderTotal:0,totalPrice:'99'}),0);
 assert.equal(publicOrderPayable({totalPrice:'0.1',shippingFee:'0.2',discountAmount:'0.1'}),0.2);
});
