import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {installClerkStub} from './clerkStub.mjs';
const f=JSON.parse(process.env.PIKA_PHASE6_FIXTURES),s=f.store,evidence=process.env.PIKA_PHASE6_BROWSER_EVIDENCE;
const api=async(page,method,path,data,status=200,headers={})=>{const r=await page.request.fetch('/api'+path,{method,headers:{Authorization:'Bearer e2e-owner-token',...headers},data});const body=await r.json();expect(r.status(),JSON.stringify(body)).toBe(status);return body;};
const privateFields=/paymentNote|paidAmount|remainingAmount|creditSpent|payableAfterCredit|internalNote|cost|profit|exchange|capture|customerTier|actor|ledger|jpy/i;
test.beforeEach(async({page})=>{await installClerkStub(page,{signedIn:true,userId:f.owner});});

const targets=async(dialog,names)=>{const rects=[];for(const name of names){const node=dialog.getByRole('button',{name,exact:true});const r=await node.boundingBox();expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);rects.push({name,...r});}return rects;};
for(const width of [390,1440]){
test(`r2 public ${width}`,async({page})=>{
 const kind='public';
 await page.setViewportSize({width,height:900});const consoleMessages=[],pageErrors=[],network=[];
 page.on('console',m=>consoleMessages.push({type:m.type(),text:m.text()}));page.on('pageerror',e=>pageErrors.push(String(e)));page.on('request',r=>network.push({kind:'request',url:r.url(),method:r.method(),at:Date.now()}));page.on('response',r=>network.push({kind:'response',url:r.url(),status:r.status(),at:Date.now()}));page.on('requestfailed',r=>network.push({kind:'failed',url:r.url(),failure:r.failure(),at:Date.now()}));
 const observations=[];try{
  await api(page,'PATCH',`/stores/${s}`,{purchaseExchangeRate:1});await api(page,'POST',`/stores/${s}/pricing-settings/initialize`,{});await api(page,'PATCH',`/stores/${s}/pricing-settings`,{lossProtectionTwd:'0',purchasePaymentFeeRate:'0',routePaymentFeeRate:'0'});
  const ship=(await api(page,'POST',`/stores/${s}/shipping-profiles`,{name:`R2 UI zero ${width}`,code:`R2_UI_PUBLIC_${width}`,rateTwd:'0',basisWeightGrams:'1000'})).record.id;
  const cost=n=>({originalPriceJpy:String(n),effectiveCostJpy:String(n),weightGrams:'1',shippingProfileId:ship,isTransportCostExempt:true});
  const customer=await api(page,'POST',`/stores/${s}/customers`,{name:`R2購物金${width}`,code:`R2-CREDIT-${width}`,tier:'general'},201);
  await api(page,'POST',`/stores/${s}/customers/${customer.id}/store-credit`,{type:'grant',amount:'100',reasonCode:'R2_SYNTHETIC',idempotencyKey:`r2-credit-${s}-${width}`},201,{'x-confirm-store-credit':'true'});
  for(const [credit,expected]of [['10',10],['20',0],['0.15',19.85]]){
   const o=await api(page,'POST',`/stores/${s}/catalog-orders`,{buyerName:'公開合成買家',buyerPhone:'0912345678',pickupMethod:'自取',customerId:customer.id,creditSpent:credit,items:[{name:`公開商品${width}`,quantity:1,unitPriceTwd:'20',cost:cost(5)}]},201);
   expect(Number(o.payableAfterCredit)).toBe(expected);const tracked=await api(page,'GET',`/orders/track/${o.publicToken}`);expect(tracked.orderTotal).toBe(expected);expect(JSON.stringify(tracked)).not.toMatch(privateFields);expect(Object.keys(tracked.items[0]).sort()).toEqual(['productId','productName','productImageUrl','specValues','quantity','unitPrice','subtotal'].sort());
   await page.goto(`/track/${o.publicToken}`);await expect(page.getByText('NT$ '+expected,{exact:true})).toBeVisible();await page.screenshot({path:`${evidence}/public-credit-${width}-${credit}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);observations.push({kind:'public',id:o.id,credit,expected,tracked});
  }

  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(pageErrors).toEqual([]);expect(consoleMessages.filter(x=>/DialogTitle|Missing.*Description|aria-describedby/i.test(x.text))).toEqual([]);
 }finally{writeFileSync(`${evidence}/observations-${kind}-${width}.json`,JSON.stringify({observations,consoleMessages,pageErrors,network,url:page.url()},null,2));if(!page.isClosed())writeFileSync(`${evidence}/dom-${kind}-${width}.html`,await page.content().catch(error=>'DOM capture unavailable: '+String(error)));}
});

test(`r2 card ${width}`,async({page})=>{
 const kind='card';
 await page.setViewportSize({width,height:900});const consoleMessages=[],pageErrors=[],network=[];
 page.on('console',m=>consoleMessages.push({type:m.type(),text:m.text()}));page.on('pageerror',e=>pageErrors.push(String(e)));page.on('request',r=>network.push({kind:'request',url:r.url(),method:r.method(),at:Date.now()}));page.on('response',r=>network.push({kind:'response',url:r.url(),status:r.status(),at:Date.now()}));page.on('requestfailed',r=>network.push({kind:'failed',url:r.url(),failure:r.failure(),at:Date.now()}));
 const observations=[];try{
  await page.goto('/product-database');await expect(page.getByRole('heading',{name:'商品資料庫',exact:true})).toBeVisible();const trigger=page.getByRole('button',{name:'加入訂單',exact:true}).first(),before=(await api(page,'GET',`/stores/${s}/orders`)).length;
  await trigger.click();const create=page.getByRole('dialog');await expect(create.getByRole('heading',{name:'新增訂單',exact:true})).toBeVisible({timeout:15000});await expect(create).toHaveAccessibleName('新增訂單');
  const draftName=await create.getByLabel('品項 1 品名',{exact:true}).inputValue();expect(draftName.length).toBeGreaterThan(0);await create.getByPlaceholder('請輸入買家姓名',{exact:true}).fill('保留未存輸入');await create.getByLabel('品項 1 單價',{exact:true}).fill('123');
  observations.push({kind:'createTargets',targets:await targets(create,['建立訂單','取消']),draftName});
  await create.getByPlaceholder('請輸入買家姓名',{exact:true}).focus();await page.keyboard.press('Tab');expect(await create.evaluate(el=>el.contains(document.activeElement))).toBe(true);expect((await api(page,'GET',`/stores/${s}/orders`)).length).toBe(before);await page.screenshot({path:`${evidence}/create-dialog-${width}.png`,fullPage:true});
  await page.keyboard.press('Escape');await expect(create).toHaveCount(0);await trigger.click();await expect(create.getByRole('heading',{name:'新增訂單',exact:true})).toBeVisible({timeout:15000});await expect(create.getByPlaceholder('請輸入買家姓名',{exact:true})).toHaveValue('保留未存輸入');await expect(create.getByLabel('品項 1 單價',{exact:true})).toHaveValue('123');await expect(create.getByLabel('品項 1 品名',{exact:true})).toHaveValue(draftName);await create.getByRole('button',{name:'取消',exact:true}).click();await expect(create).toHaveCount(0);expect((await api(page,'GET',`/stores/${s}/orders`)).length).toBe(before);

  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(pageErrors).toEqual([]);expect(consoleMessages.filter(x=>/DialogTitle|Missing.*Description|aria-describedby/i.test(x.text))).toEqual([]);
 }finally{writeFileSync(`${evidence}/observations-${kind}-${width}.json`,JSON.stringify({observations,consoleMessages,pageErrors,network,url:page.url()},null,2));if(!page.isClosed())writeFileSync(`${evidence}/dom-${kind}-${width}.html`,await page.content().catch(error=>'DOM capture unavailable: '+String(error)));}
});

test(`r2 edit ${width}`,async({page})=>{
 const kind='edit';
 await page.setViewportSize({width,height:900});const consoleMessages=[],pageErrors=[],network=[];
 page.on('console',m=>consoleMessages.push({type:m.type(),text:m.text()}));page.on('pageerror',e=>pageErrors.push(String(e)));page.on('request',r=>network.push({kind:'request',url:r.url(),method:r.method(),at:Date.now()}));page.on('response',r=>network.push({kind:'response',url:r.url(),status:r.status(),at:Date.now()}));page.on('requestfailed',r=>network.push({kind:'failed',url:r.url(),failure:r.failure(),at:Date.now()}));
 const observations=[];try{
  await api(page,'PATCH',`/stores/${s}`,{purchaseExchangeRate:1});await api(page,'POST',`/stores/${s}/pricing-settings/initialize`,{});await api(page,'PATCH',`/stores/${s}/pricing-settings`,{lossProtectionTwd:'0',purchasePaymentFeeRate:'0',routePaymentFeeRate:'0'});
  const ship=(await api(page,'POST',`/stores/${s}/shipping-profiles`,{name:`R2 UI zero ${width}`,code:`R2_UI_EDIT_${width}`,rateTwd:'0',basisWeightGrams:'1000'})).record.id;
  const cost=n=>({originalPriceJpy:String(n),effectiveCostJpy:String(n),weightGrams:'1',shippingProfileId:ship,isTransportCostExempt:true});
  const items=[[2,100,70,'A'],[3,50,40,'B'],[1,20,5,'Manual']].map(([quantity,price,n,name])=>({name:`R2 ${name} ${width}`,quantity,unitPriceTwd:String(price),cost:cost(n)}));
  const order=await api(page,'POST',`/stores/${s}/catalog-orders`,{buyerName:'多品項合成買家',buyerPhone:'0912345678',pickupMethod:'自取',items},201);
  await page.goto('/orders');await page.getByPlaceholder('搜尋姓名、電話、訂單編號').fill(String(order.id));await page.getByText('#'+order.id,{exact:true}).first().click();
  const transition=async name=>{const pending=page.waitForResponse(r=>r.url().endsWith(`/orders/${order.id}/status`)&&r.request().method()==='PATCH');await page.getByRole('button',{name,exact:true}).last().click();if(name==='備貨中'){const confirm=page.getByRole('alertdialog',{name:'復原訂單狀態'});await expect(confirm).toBeVisible();await confirm.getByRole('button',{name:'確認變更',exact:true}).click();}expect((await pending).status()).toBe(200);};
  await transition('已完成');await transition('備貨中');await page.getByRole('button',{name:'編輯訂單',exact:true}).click();const edit=page.getByRole('dialog');await expect(edit).toHaveAccessibleName('編輯訂單');await expect(edit.getByRole('heading',{name:'編輯訂單',exact:true})).toBeVisible();await expect(edit).toHaveAccessibleDescription('訂單 #'+order.id);observations.push({kind:'editTargets',targets:await targets(edit,['儲存變更','取消'])});
  await edit.getByPlaceholder('請輸入買家姓名',{exact:true}).fill('非財務更新');await page.keyboard.press('Tab');expect(await edit.evaluate(el=>el.contains(document.activeElement))).toBe(true);await page.screenshot({path:`${evidence}/edit-dialog-${width}.png`,fullPage:true});
  const patch=page.waitForResponse(r=>r.url().endsWith(`/orders/${order.id}`)&&r.request().method()==='PATCH');await edit.getByRole('button',{name:'儲存變更',exact:true}).click();const response=await patch;expect(response.status(),await response.text()).toBe(200);expect(response.request().postDataJSON()).not.toHaveProperty('quantity');await expect(edit).toHaveCount(0);await transition('已完成');
  const saved=(await api(page,'GET',`/stores/${s}/orders`)).find(x=>x.id===order.id);expect([Number(saved.totalPrice),Number(saved.itemCostTotalTwd),Number(saved.itemProfitTotalTwd)]).toEqual([370,265,105]);observations.push({kind:'recompleted',id:order.id,totals:[370,265,105],patch:response.request().postDataJSON()});
  await page.evaluate(()=>Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=> 'Android Chrome'}));const popupPending=page.waitForEvent('popup');await page.getByRole('button',{name:'列印銷貨單',exact:true}).click();const popup=await popupPending;await popup.waitForLoadState('domcontentloaded');const stored=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('pickbee-receipt-preview:')).map(k=>JSON.parse(localStorage.getItem(k))).at(-1));expect(stored.html).toContain(`R2 Manual ${width}`);expect(stored.html).toContain('370');expect(stored.html).not.toContain('2220');expect(stored.html).not.toMatch(/totalCostTwd|unitProfit|exchangeRate|captureContext|internalNote/);writeFileSync(`${evidence}/receipt-${width}.html`,stored.html);await popup.screenshot({path:`${evidence}/receipt-${width}.png`,fullPage:true});await popup.close();

  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(pageErrors).toEqual([]);expect(consoleMessages.filter(x=>/DialogTitle|Missing.*Description|aria-describedby/i.test(x.text))).toEqual([]);
 }finally{writeFileSync(`${evidence}/observations-${kind}-${width}.json`,JSON.stringify({observations,consoleMessages,pageErrors,network,url:page.url()},null,2));if(!page.isClosed())writeFileSync(`${evidence}/dom-${kind}-${width}.html`,await page.content().catch(error=>'DOM capture unavailable: '+String(error)));}
});
}
