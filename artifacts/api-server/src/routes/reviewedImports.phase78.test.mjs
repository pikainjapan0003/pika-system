import assert from 'node:assert/strict';import {test,before,after} from 'node:test';import {readFileSync,writeFileSync} from 'node:fs';import {createHash,randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';import JSZip from 'jszip';
import {fixture,pool,stop} from '../productImportE2E.mjs';
import {phase78Legacy,compareLegacy,phase78Sql} from '../../../../e2e/product-import-harness.mjs';
const s=fixture.store,base='http://127.0.0.1:'+fixture.port+'/api',prefix='/stores/'+s,q=(text,args=[])=>pool.query(text,args),e=process.env.PIKA_PHASE78_EVIDENCE;
const api=async(method,path,body,expected=200,token='e2e-owner-token')=>{const form=body instanceof FormData;const response=await fetch(base+path,{method,headers:{Connection:'close',...(token?{Authorization:'Bearer '+token}:{}),...(!form&&body!==undefined?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:form?body:JSON.stringify(body)})});const data=await response.json();if(expected!==null)assert.equal(response.status,expected,path+' '+JSON.stringify(data));return {data,status:response.status};};
const post=async(path,body,status=200)=>(await api('POST',prefix+path,body,status)).data;
const cells=(rows)=>rows.flatMap((row,i)=>Object.entries(row).map(([column,value])=>({row:i+1,column:Number(column),type:typeof value==='number'?'number':'text',value})));
const raw=(name='進貨品',barcode='0012345')=>cells([{2:barcode,3:name,4:'1000',5:'15.25',6:'915',7:'偏好A',18:'350',23:'400',24:'420',29:'390',38:'410'}]);
const preview=async(data=raw(),name=randomUUID())=>post('/sheet-imports/preview',{sourceType:'STRUCTURED_CELLS',spreadsheetTitle:name,sheetTitle:'Selected',cells:data});
const values=(row,overrides={})=>({confirmed:true,name:row.candidate.name,barcode:row.candidate.barcode,barcodeStatus:row.candidate.barcodeStatus,originalPriceJpy:row.candidate.originalPriceJpy,effectiveCostJpy:row.candidate.effectiveCostJpy,weightGrams:row.candidate.weightGrams,status:row.candidate.status,...(row.candidate.shopeePriceTwd?{shopeePriceTwd:row.candidate.shopeePriceTwd}:{}),...overrides});
const resolve=(b,rows,fx='0.21')=>post('/sheet-imports/'+b.batch.id+'/resolve',{exchangeRate:fx,rows});
const reviewed=async(data=raw(),overrides={})=>{const b=await preview(data);return resolve(b,b.rows.filter(r=>r.rowKind==='PRODUCT').map(r=>({rowId:r.id,resolution:{action:'CREATE',reason:'逐列人工確認',values:values(r,overrides)}})));};
const approve=b=>post('/sheet-imports/'+b.batch.id+'/approve',{confirmed:true,reviewVersion:b.batch.reviewVersion});
const commit=b=>post('/sheet-imports/'+b.batch.id+'/commit',{confirmed:true});
const rollback=(b,status=200)=>post('/sheet-imports/'+b.batch.id+'/rollback',{confirmed:true},status);
const count=async()=>(await q('SELECT (SELECT count(*) FROM catalog_products WHERE store_id=$1)::int cats,(SELECT count(*) FROM product_cost_records WHERE store_id=$1)::int costs,(SELECT count(*) FROM sheet_import_effects WHERE store_id=$1)::int effects',[s])).rows[0];
let ship;
before(async()=>{await q('UPDATE stores SET purchase_exchange_rate=1 WHERE id=$1',[s]);await post('/pricing-settings/initialize',{});await api('PATCH',prefix+'/pricing-settings',{lossProtectionTwd:'0',purchasePaymentFeeRate:'0',routePaymentFeeRate:'0'});ship=(await post('/shipping-profiles',{name:'零運費合成',code:'P78_ZERO',rateTwd:'0',basisWeightGrams:'1000'})).record.id;});
after(async()=>{try{const identity=JSON.parse(readFileSync(process.env.PIKA_PHASE78_IDENTITY,'utf8')),result={};for(const [database,v]of Object.entries(identity.legacy)){const current=phase78Legacy(identity.id,database);compareLegacy(v.before,current);assert.deepEqual(current,v.after);result[database]=current;}writeFileSync(e+'/legacy-after-api.json',JSON.stringify(result,null,2));}finally{await stop();}});
test('precision, fixed columns, unknown formula, row kinds and raw immutable evidence',async()=>{
 const input=cells([{3:'名稱'},{3:'來源分類'},{3:'測試資料',4:'10',5:'2'},{},{2:'0012345',3:'精確商品',4:'9007199254740993.123456789012',5:'15.25',6:'915',1:'TRUE',23:'499',38:'588'},{2:'457123-角色',3:'公式商品',4:1000,5:0.1,6:915},{2:12345678901234567890123456,3:'精度危險',4:1234.56,5:'10',6:'915'}]);input.push({row:6,column:13,type:'number',value:null,formula:'WEBSERVICE("https://invalid.example")',cachedValue:null});
 const before=await count(),b=await preview(input);assert.deepEqual(await count(),before);assert.deepEqual(b.rows.slice(0,4).map(r=>r.rowKind),['HEADER','SOURCE_GROUP','TEST','EMPTY']);
 const a=b.rows[4];assert.equal(a.candidate.originalPriceJpy,'9007199254740993.123456789012');assert.equal(a.candidate.weightGrams,'15.25');assert.equal(a.candidate.barcode,'0012345');assert.equal(a.candidate.status,'DISCONTINUED');assert.equal(a.candidate.effectiveCostJpy,'915.000000000000');assert.equal(a.candidate.sourcePrices.AL,'588');
 assert.ok(b.rows[5].warnings.messages.some(x=>x.includes('cached')));assert.equal(b.rows[5].candidate.barcode,'457123');assert.equal(b.rows[5].candidate.weightGrams,'0.10');assert.equal(b.rows[6].candidate.barcode,'');assert.equal(b.rows[6].candidate.originalPriceJpy,'1234.560000000000');assert.equal(b.batch.originalFileSha256,null);assert.equal(b.directLiveFreshness,'UNVERIFIED');
 await assert.rejects(q("UPDATE sheet_import_rows SET raw_values='[]' WHERE id=$1",[a.id]));await assert.rejects(q("UPDATE sheet_import_batches SET source_type='XLSX_UPLOAD' WHERE id=$1",[b.batch.id]));
 writeFileSync(e+'/precision-source.json',JSON.stringify(b,null,2));
});
test('all PRODUCT review, positive FX, stale approvals and actual six API state transitions',async()=>{
 let b=await preview(raw('狀態商品','001234500'));await post('/sheet-imports/'+b.batch.id+'/approve',{confirmed:true,reviewVersion:0},400);
 for(const fx of ['0','-1'])await post('/sheet-imports/'+b.batch.id+'/resolve',{exchangeRate:fx},400);
 b=await resolve(b,[]);await post('/sheet-imports/'+b.batch.id+'/approve',{confirmed:true,reviewVersion:b.batch.reviewVersion},409);
 b=await resolve(b,[{rowId:b.rows[0].id,resolution:{action:'CREATE',reason:'確認',values:values(b.rows[0])}}]);b=await approve(b);assert.equal(b.batch.status,'APPROVED');const approvedHash=b.batch.approvalHash;
 b=await post('/sheet-imports/'+b.batch.id+'/resolve',{exchangeRate:'0.22'});assert.equal(b.batch.status,'PREVIEWED');assert.equal(b.batch.approvalHash,null);await post('/sheet-imports/'+b.batch.id+'/commit',{confirmed:true},409);
 await post('/sheet-imports/'+b.batch.id+'/approve',{confirmed:true,reviewVersion:0},409);b=await approve(b);assert.notEqual(b.batch.approvalHash,approvedHash);b=await commit(b);assert.equal(b.batch.status,'COMMITTED');
 assert.deepEqual((await commit(b)).effects,b.effects);await post('/sheet-imports/'+b.batch.id+'/resolve',{exchangeRate:'0.23'},409);await assert.rejects(q("UPDATE sheet_import_batches SET status='PREVIEWED',committed_at=NULL WHERE id=$1",[b.batch.id]));await assert.rejects(q("UPDATE sheet_import_rows SET resolution='{}',committed_at=NULL WHERE id=$1",[b.rows[0].id]));
 const get=(await api('GET',prefix+'/sheet-imports/'+b.batch.id)).data;assert.equal(get.batch.approvalHash,b.batch.approvalHash);b=await rollback(b);assert.equal(b.batch.status,'ROLLED_BACK');assert.equal((await rollback(b)).batch.status,'ROLLED_BACK');
 const cost=(await q('SELECT * FROM product_cost_records WHERE id=$1',[b.effects[0].createdCostRecordId])).rows[0];assert.equal(cost.status,'VOIDED');await assert.rejects(q("DELETE FROM product_cost_records WHERE id=$1",[cost.id]));await assert.rejects(q("UPDATE product_cost_records SET status='ACTIVE',void_reason_code=NULL,void_reason_text=NULL,voided_by=NULL,voided_at=NULL WHERE id=$1",[cost.id]));
});
test('tenant isolation, authentication and closed generated validators',async()=>{
 const b=await preview(raw('隔離商品','001234501'));await api('GET','/stores/'+fixture.other+'/sheet-imports/'+b.batch.id,undefined,403);await api('GET',prefix+'/sheet-imports/'+b.batch.id,undefined,403,'e2e-other-token');await api('GET',prefix+'/sheet-imports/'+b.batch.id,undefined,401,null);
 await post('/sheet-imports/preview',{sourceType:'STRUCTURED_CELLS',spreadsheetTitle:'x',sheetTitle:'a',cells:[],sourceHash:'invented'},400);
 await post('/sheet-imports/'+b.batch.id+'/resolve',{rows:[{rowId:999999,resolution:{action:'IGNORE',reason:'test'}}]},404);
 const foreign=(await q('SELECT id FROM catalog_products WHERE store_id=$1 LIMIT 1',[fixture.other])).rows[0].id;await resolveForeign();
 async function resolveForeign(){await post('/sheet-imports/'+b.batch.id+'/resolve',{rows:[{rowId:b.rows[0].id,resolution:{action:'LINK',reason:'manual',catalogProductId:foreign,values:values(b.rows[0])}}]},404);}
});
test('atomic duplicate failure leaves no partial product, cost, effects or fake COMMITTED',async()=>{
 let b=await reviewed(cells([{2:'222222',3:'原子A',4:'1000',5:'15.25',6:'915'},{2:'222222',3:'原子B',4:'1000',5:'15.25',6:'915'}]));b=await approve(b);const before=await count();await post('/sheet-imports/'+b.batch.id+'/commit',{confirmed:true},409);assert.deepEqual(await count(),before);assert.equal((await api('GET',prefix+'/sheet-imports/'+b.batch.id)).data.batch.status,'APPROVED');
});
test('concurrent commit idempotency and resolve/commit serialization',async()=>{
 let b=await approve(await reviewed(raw('併行商品','333333')));const [a,c]=await Promise.all([commit(b),commit(b)]);assert.deepEqual(a.effects,c.effects);assert.equal(a.effects.length,1);
 let next=await approve(await reviewed(raw('競爭商品','333334')));const responses=await Promise.all([api('POST',prefix+'/sheet-imports/'+next.batch.id+'/resolve',{exchangeRate:'0.23'},null),api('POST',prefix+'/sheet-imports/'+next.batch.id+'/commit',{confirmed:true},null)]);assert.ok(responses.some(r=>r.status===409));const current=(await api('GET',prefix+'/sheet-imports/'+next.batch.id)).data;assert.ok(['COMMITTED','PREVIEWED'].includes(current.batch.status));if(current.batch.status==='PREVIEWED')assert.equal(current.effects.length,0);
});
test('rollback restores durable previous current and refuses later refs or voided previous',async()=>{
 const cat=(await post('/catalog-products',{name:'已有商品',barcode:'444444',barcodeStatus:'REAL',weightGrams:'1',originalPriceJpy:'50'})).product,previous=cat.currentCost.id;
 let b=await preview(raw('已有商品','444444'));b=await resolve(b,[{rowId:b.rows[0].id,resolution:{action:'LINK',catalogProductId:cat.id,reason:'同商品確認',values:values(b.rows[0])}}]);b=await commit(await approve(b));assert.equal(b.effects[0].previousCostRecordId,previous);await rollback(b);assert.equal((await q('SELECT is_current FROM product_cost_records WHERE id=$1',[previous])).rows[0].is_current,true);
 let blocked=await commit(await approve(await reviewed(raw('後續引用商品','444445'))));const id=blocked.effects[0].catalogProductId;await post('/catalog-products/'+id+'/cost-records',{originalPriceJpy:'1200',adjustmentMode:'NONE',reasonCode:'OTHER',reasonText:'後續成本'});
 await rollback(blocked,409);assert.equal((await api('GET',prefix+'/sheet-imports/'+blocked.batch.id)).data.batch.status,'COMMITTED');
 let voidPrevious=await preview(raw('已有商品','444444'));voidPrevious=await resolve(voidPrevious,[{rowId:voidPrevious.rows[0].id,resolution:{action:'LINK',catalogProductId:cat.id,reason:'同商品新來源',values:values(voidPrevious.rows[0])}}]);voidPrevious=await commit(await approve(voidPrevious));await post('/catalog-products/'+cat.id+'/cost-records/'+previous+'/void',{reasonCode:'OTHER',reasonText:'舊成本已作廢'});await rollback(voidPrevious,409);
});
async function workbook(selectedName='選定頁',other='not imported'){
 const w=new ExcelJS.Workbook(),a=w.addWorksheet(selectedName);a.getCell('B1').value='00009999';a.getCell('C1').value='XLSX 商品';a.getCell('D1').value=1000;a.getCell('E1').value={formula:'1/10',result:0.1};a.getCell('F1').value=915;a.getCell('W1').value=777;w.addWorksheet('其他頁').getCell('C1').value=other;return Buffer.from(await w.xlsx.writeBuffer());
}
async function upload(bytes,selected='選定頁',status=200){const form=new FormData();form.append('sourceType','XLSX_UPLOAD');form.append('spreadsheetTitle','固定來源');if(selected)form.append('sheetTitle',selected);form.append('file',new Blob([bytes]),'source.xlsx');return post('/sheet-imports/preview',form,status);}
test('real bounded XLSX upload, original bytes SHA, one worksheet and separate hashes',async()=>{
 const bytes=await workbook(),before=await count(),discovery=await upload(bytes,'');assert.deepEqual(discovery.sheetTitles,['選定頁','其他頁']);assert.deepEqual(await count(),before);
 const b=await upload(bytes);assert.equal(b.batch.originalFileSha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(b.rows.length,1);assert.equal(b.rows[0].candidate.barcode,'00009999');assert.equal(b.rows[0].candidate.weightGrams,'0.10');assert.ok(!JSON.stringify(b.rows).includes('not imported'));
 const otherBytes=await workbook('選定頁','different unselected'),same=await upload(otherBytes);assert.equal(same.batch.sourceHash,b.batch.sourceHash);assert.notEqual(createHash('sha256').update(otherBytes).digest('hex'),b.batch.originalFileSha256);
 // Different original bytes are separate immutable upload versions, even with the same selected worksheet.
 assert.notEqual(same.batch.id,b.batch.id);assert.equal(same.batch.originalFileSha256,createHash('sha256').update(otherBytes).digest('hex'));assert.notEqual(b.batch.sourceHash,b.batch.originalFileSha256);writeFileSync(e+'/source.xlsx',bytes);writeFileSync(e+'/xlsx-source.json',JSON.stringify({first:b,unselectedChange:same},null,2));
});
test('bounded malformed, ZIP64/encrypted metadata, inflated bytes, rows/sheets/text and no writes',async()=>{
 const before=(await q('SELECT count(*)::int n FROM sheet_import_batches')).rows[0].n;await upload(Buffer.from('bad'),'x',400);
 const bytes=await workbook(),bad=Buffer.from(bytes);const central=bad.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));bad.writeUInt16LE(bad.readUInt16LE(central+8)|1,central+8);await upload(bad,'選定頁',400);
 const zip=new JSZip();zip.file('x.xml','x'.repeat(4*1024*1024+1));await upload(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),'x',400);
 for(const type of ['rows','sheets','text']){const w=new ExcelJS.Workbook(),a=w.addWorksheet('x');if(type==='rows')a.getCell('C501').value='too far';if(type==='text')a.getCell('C1').value='x'.repeat(4097);if(type==='sheets')for(let i=0;i<8;i++)w.addWorksheet('s'+i);await upload(Buffer.from(await w.xlsx.writeBuffer()),'x',400);}
 assert.equal((await q('SELECT count(*)::int n FROM sheet_import_batches')).rows[0].n,before);
 await post('/sheet-imports/preview',{sourceType:'STRUCTURED_CELLS',spreadsheetTitle:'x',sheetTitle:'x',cells:[{row:501,column:3,type:'text',value:'bad'}]},400);
});
const newListing=async(name,extra={})=>{const keys=['store_id','name','price','share_token','cost_jpy','weight_kg','sku_code','international_shipping_profile_id','is_transport_cost_exempt'],vals=[s,name,'20',randomUUID(),'5','0.010','0012345',ship,true];for(const [k,v]of Object.entries(extra)){const ix=keys.indexOf(k);if(ix<0){keys.push(k);vals.push(v);}else vals[ix]=v;}return (await q('INSERT INTO products('+keys.join(',')+') VALUES('+keys.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING *',vals)).rows[0];};
test('listing preview item-first distinct order counts, SKU never barcode, missing original atomic refusal',async()=>{
 const p=await newListing('舊品真值'),legacy=async(items)=>{return (await q("INSERT INTO orders(store_id,product_id,buyer_name,buyer_phone,quantity,unit_price,total_price,items,public_token,pickup_method) VALUES($1,$2,$3,$4,2,20,40,$5,$6,'self_pickup') RETURNING id",[s,p.id,'合成','0912345678',JSON.stringify(items),randomUUID()])).rows[0].id;};
 await legacy([]);await legacy([{productId:p.id,quantity:1},{productId:p.id,quantity:1}]);const dual=await legacy([{productId:p.id,quantity:2}]);await q("INSERT INTO order_items(store_id,order_id,listing_product_id,product_name_snapshot,quantity,unit_price_twd,subtotal_twd) VALUES($1,$2,$3,'舊品真值',2,20,40)",[s,dual,p.id]);
 const result=(await api('GET',prefix+'/listing-matches/preview')).data.items.find(i=>i.id===p.id);assert.equal(result.relatedOrderCount,3);assert.equal(result.listingBarcode,null);assert.equal(result.skuCode,'0012345');assert.equal(result.originalPriceJpy,null);assert.equal(result.weightGrams,'10.000');assert.equal(result.selected,false);
 const prior=await count();await post('/listing-matches/apply',{requestKey:randomUUID(),rows:[{productId:p.id,action:'CREATE',values:{...values({candidate:{name:p.name,barcode:'0',barcodeStatus:'NONE',weightGrams:'10',effectiveCostJpy:'5'}}),originalPriceJpy:undefined}}]},400);assert.deepEqual(await count(),prior);
 const body={requestKey:randomUUID(),rows:[{productId:p.id,action:'CREATE',values:{confirmed:true,name:p.name,barcode:'0',barcodeStatus:'NONE',weightGrams:'10',originalPriceJpy:'7',effectiveCostJpy:'5'}}]},saved=await post('/listing-matches/apply',body);assert.deepEqual(await post('/listing-matches/apply',body),saved);const after=(await q('SELECT * FROM products WHERE id=$1',[p.id])).rows[0];assert.equal(after.price,p.price);assert.equal(after.cost_jpy,p.cost_jpy);assert.equal(after.sku_code,p.sku_code);
});
test('current listing snapshot barcode wins over SKU and linked listings cannot be recreated',async()=>{
 const cat=(await post('/catalog-products',{name:'快照條碼',barcode:'00012340',barcodeStatus:'REAL',weightGrams:'15.25',originalPriceJpy:'99'})).product.id;
 const body={mode:'PREVIEW',listingBarcode:'00098765',skuCode:'SKU-NOT-BARCODE',shippingProfileId:ship,isTransportCostExempt:true,generalFinalPriceTwd:'1000',syncFields:[],confirmLowProfit:true};
 const draft=await post('/catalog-products/'+cat+'/create-listing',body),saved=await post('/catalog-products/'+cat+'/create-listing',{...body,mode:'SAVE',expectedContext:draft.reference.context},201);
 const p=saved.product,first=(await api('GET',prefix+'/listing-matches/preview')).data.items.find(x=>x.id===p.id);assert.equal(first.listingBarcode,'00098765');assert.equal(first.skuCode,'SKU-NOT-BARCODE');assert.equal(first.weightGrams,'15.25');
 const next={...body,listingBarcode:'00098766'},preview2=await post('/products/'+p.id+'/recalculate-pricing',next);await post('/products/'+p.id+'/recalculate-pricing',{...next,mode:'SAVE',expectedContext:preview2.reference.context});
 const current=(await api('GET',prefix+'/listing-matches/preview')).data.items.find(x=>x.id===p.id);assert.equal(current.listingBarcode,'00098766');
 const snapshots=(await q('SELECT to_jsonb(x) body FROM listing_pricing_snapshots x WHERE product_id=$1 ORDER BY id',[p.id])).rows;assert.equal(snapshots[0].body.listing_barcode,'00098765');
 await post('/listing-matches/apply',{requestKey:randomUUID(),rows:[{productId:p.id,action:'CREATE',values:{confirmed:true,name:p.name,barcode:'0',barcodeStatus:'NONE',weightGrams:'15.25',originalPriceJpy:'99',effectiveCostJpy:'99'}}]},409);
 assert.deepEqual((await q('SELECT to_jsonb(x) body FROM listing_pricing_snapshots x WHERE product_id=$1 ORDER BY id',[p.id])).rows,snapshots);
});
test('link leaves old completed captured bytes and attribution unchanged; new order captures new link',async()=>{
 const p=await newListing('未連結完成品'),create=async()=>(await api('POST',prefix+'/catalog-orders',{buyerName:'合成',buyerPhone:'0912345678',pickupMethod:'自取',items:[{listingProductId:p.id,quantity:1}]},201)).data;
 const old=await create();await api('PATCH','/orders/'+old.id+'/status',{status:'completed'});const bytes=(await q('SELECT to_jsonb(i) body FROM order_items i WHERE order_id=$1',[old.id])).rows;
 const cat=(await post('/catalog-products',{name:p.name,barcode:'0',barcodeStatus:'NONE',weightGrams:'10',originalPriceJpy:'7'})).product.id;
 await post('/listing-matches/apply',{requestKey:randomUUID(),rows:[{productId:p.id,action:'LINK',catalogProductId:cat}]});assert.deepEqual((await q('SELECT to_jsonb(i) body FROM order_items i WHERE order_id=$1',[old.id])).rows,bytes);assert.equal(bytes[0].body.catalog_product_id,null);
 let sales=(await api('GET',prefix+'/catalog-sales?ids='+cat)).data.items[0];assert.equal(sales.general,null);const fresh=await create();assert.equal(fresh.orderItems[0].catalogProductId,cat);await api('PATCH','/orders/'+fresh.id+'/status',{status:'completed'});sales=(await api('GET',prefix+'/catalog-sales?ids='+cat)).data.items[0];assert.equal(sales.general.orderCount,1);
 const tracked=(await api('GET','/orders/track/'+fresh.publicToken,undefined,200,null)).data;assert.ok(!/cost|profit|exchange|capture|customerTier|sourceHash/i.test(JSON.stringify(tracked)));
});
test('real HTTP listing pages preserve strict bounded integer queries and never write',async()=>{
 for(let i=0;i<26;i++)await newListing('HTTP 分頁 '+String(i).padStart(2,'0'));
 const expected=(await q('SELECT id FROM products WHERE store_id=$1 ORDER BY id',[s])).rows.map(x=>x.id);
 assert.ok(expected.length>=26);
 // Snapshot every public table so rejected queries cannot hide writes in audit/history tables.
 const state=async()=>{const tables=(await q("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;const result={};for(const {tablename}of tables){const table='"'+tablename.replaceAll('"','""')+'"';result[tablename]=(await q('SELECT to_jsonb(t) body FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows;}return result;};
 const before=await state(),first=(await api('GET',prefix+'/listing-matches/preview?page=1')).data,second=(await api('GET',prefix+'/listing-matches/preview?page=2')).data;
 assert.equal(first.page,1);assert.equal(second.page,2);assert.equal(first.total,expected.length);assert.equal(second.total,expected.length);
 assert.deepEqual(first.items.map(x=>x.id),expected.slice(0,25));assert.deepEqual(second.items.map(x=>x.id),expected.slice(25,50));
 assert.deepEqual((await api('GET',prefix+'/listing-matches/preview')).data,first);
 assert.equal((await api('GET',prefix+'/listing-matches/preview?page=100000')).data.page,100000);
 const rejected=[];
 for(const query of ['page=','page=0','page=-1','page=1.5','page=100001','page=text','page=1&page=2','page[x]=1','page[]=1','page=01','page=%2B1','page=%201','page=1%0A','page=1e2','page=Infinity','unknown=1','page=1&unknown=1']){
  const result=await api('GET',prefix+'/listing-matches/preview?'+query,undefined,null);assert.ok(result.status>=400&&result.status<500,query+' returned '+result.status);rejected.push({query,status:result.status});
 }
 assert.deepEqual(await state(),before);
 writeFileSync(e+'/listing-query-http.json',JSON.stringify({total:expected.length,page1:first.items.map(x=>x.id),page2:second.items.map(x=>x.id),defaultPage:1,maxPage:100000,rejected,allPublicTablesUnchanged:true},null,2));
});
test('0045 controlled migration down refuses durable import history without deletion',()=>{const identity=JSON.parse(readFileSync(process.env.PIKA_PHASE78_IDENTITY));assert.throws(()=>phase78Sql(identity.id,'pika_phase78',readFileSync(new URL('../../../../lib/db/migrations/rollback/0045_reviewed_sheet_imports.sql',import.meta.url))));});
