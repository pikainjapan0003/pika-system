import {test,expect} from "@playwright/test";
import {writeFileSync} from "node:fs";
import {installClerkStub} from "./clerkStub.mjs";
const fixture=JSON.parse(process.env.PIKA_PHASE5_FIXTURES),evidence=process.env.PIKA_PHASE5_EVIDENCE;
const headers={Authorization:"Bearer e2e-owner-token"};
const api=async(page,method,url,data,status=200)=>{const r=await page.request.fetch("/api"+url,{method,headers,data});const v=await r.json();expect(r.status(),JSON.stringify(v)).toBe(status);return v;};
test.beforeEach(async({page})=>{await installClerkStub(page,{signedIn:true,userId:fixture.owner});});
test("listing UI selection, editable exact values, VIP following, save and immutable repricing",async({page})=>{
 const s=fixture.store,settings=await api(page,"POST",`/stores/${s}/pricing-settings/initialize`,{});
 const template=settings.templates.find(t=>t.code==="PERFUME"),shipping=settings.shippingProfiles.find(t=>t.code==="TIGERAIR_BAGGAGE");
 const trips=[];for(const name of ["上架旅程甲","上架旅程乙"]){const t=await api(page,"POST","/trips",{name,exchangeRate:0.21},201);const r=await api(page,"POST",`/trips/${t.id}/routes`,{areaTitle:"偏好路線",estQty:10,etcJpy:0,trainJpy:0,fuelJpy:0,parkingJpy:0},201);trips.push({trip:t.id,route:r.id});}
 const cat=(await api(page,"POST",`/stores/${s}/catalog-products`,{name:"瀏覽器精確上架香水",barcode:"77771111",barcodeStatus:"REAL",weightGrams:"12.34",originalPriceJpy:"1000",adjustmentMode:"RATE",adjustmentRate:"0.915",defaultPricingTemplateId:template.id,defaultShippingProfileId:shipping.id,categoryId:fixture.category,internalNote:"原始備註"})).product;
 await page.goto(`/products/new?catalogId=${cat.id}`);
 await expect(page.getByLabel("日本原始售價 JPY",{exact:true})).toHaveValue("1000.000000000000");
 await expect(page.getByLabel("一般售價",{exact:true})).toHaveValue("");
 await expect(page.getByLabel("重量 g",{exact:true})).toHaveValue("12.34");
 await expect(page.getByLabel("實際計價成本 JPY",{exact:true})).toHaveValue("915.000000000000");
 await api(page,"PATCH",`/stores/${s}/catalog-products/${cat.id}`,{preferredRouteLabel:"偏好路線"});
 await page.reload();await expect(page.getByLabel("日本原始售價 JPY")).toHaveValue("1000.000000000000");
 await page.getByLabel("選擇旅程",{exact:true}).selectOption(String(trips[1].trip));await expect(page.getByLabel("行程路線",{exact:true})).toHaveValue(String(trips[1].route));
 await page.getByLabel("一般售價",{exact:true}).fill("500.25");await expect(page.getByLabel("VIP 售價",{exact:true})).toHaveValue("500.25");
 await page.getByLabel("VIP 售價",{exact:true}).fill("450.10");await page.getByLabel("一般售價",{exact:true}).fill("510.25");await expect(page.getByLabel("VIP 售價",{exact:true})).toHaveValue("450.10");
 await page.getByRole("button",{name:"VIP 重新跟隨一般售價",exact:true}).click();await expect(page.getByLabel("VIP 售價",{exact:true})).toHaveValue("510.25");
 await page.getByLabel("VIP 售價",{exact:true}).fill("450.10");await page.getByLabel("上架條碼（不等於 SKU）",{exact:true}).fill("88882222");
 await page.getByLabel("重量 g",{exact:true}).fill("0.01");await page.getByLabel("免攤交通成本",{exact:true}).check();
 await page.getByRole("button",{name:"預覽目前輸入",exact:true}).click();await expect(page.getByRole("heading",{name:"目前重算",exact:true})).toBeVisible();
 await expect(page.getByText("待確認：")).toHaveCount(0);
 await page.screenshot({path:evidence+"/listing-preview-390.png",fullPage:true});
 await page.getByRole("button",{name:"建立",exact:true}).click();await expect(page.getByRole("heading",{name:"商品已建立",exact:true})).toBeVisible();
 const listings=await api(page,"GET",`/stores/${s}/products`),p=listings.find(p=>p.catalogProductId===cat.id);expect(p.weightGrams).toBe("0.01");
 const historyUrl=`/stores/${s}/products/${p.id}/pricing-history`,before=await api(page,"GET",historyUrl);expect(before.current.listingBarcode).toBe("88882222");expect(before.product.costJpy).toBe("915.000000000000");
 expect((await api(page,"GET",`/stores/${s}/catalog-products/${cat.id}`)).product.barcode).toBe("77771111");
 await api(page,"POST",`/stores/${s}/catalog-products/${cat.id}/cost-records`,{originalPriceJpy:"1200",reasonCode:"OTHER",reasonText:"瀏覽器成本更新"});
 await page.goto("/products");await expect(page.getByText("成本資料已更新",{exact:true})).toBeVisible();
 await page.goto(`/products/${p.id}/edit`);await expect(page.getByLabel("實際計價成本 JPY",{exact:true})).toHaveValue("915.000000000000");
 await page.getByRole("button",{name:"依最新成本重算",exact:true}).click();await expect(page.getByLabel("實際計價成本 JPY",{exact:true})).toHaveValue("1200.000000000000");
 expect((await api(page,"GET",historyUrl)).items).toEqual(before.items);
 await page.screenshot({path:evidence+"/listing-difference-390.png",fullPage:true});
 await page.getByRole("heading",{name:"原本估算",exact:true}).locator("..").locator("..").screenshot({path:evidence+"/listing-difference-panel.png"});
 await page.getByLabel("一般售價",{exact:true}).fill("650.35");await page.getByLabel("VIP 售價",{exact:true}).fill("600.25");await page.getByRole("button",{name:"預覽目前輸入",exact:true}).click();
 await page.getByRole("button",{name:"手動套用新價格",exact:true}).click();await expect(page).toHaveURL(/\/products$/);
 const after=await api(page,"GET",historyUrl);expect(after.items).toHaveLength(2);expect(after.items[1]).toEqual(before.current);expect(after.product.price).toBe("650.35");expect(after.costUpdated).toBe(false);
 writeFileSync(evidence+"/listing-ui-history.json",JSON.stringify({before,after},null,2));
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});await page.goto(`/products/${p.id}/edit`);await expect(page.getByLabel("日本原始售價 JPY")).toHaveValue("1200.000000000000");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:evidence+`/listing-edit-${width}.png`,fullPage:true});
 }
});
test("listing UI stale preview preserves manual values and loss confirmation",async({page})=>{
 const s=fixture.store,settings=await api(page,"GET",`/stores/${s}/pricing-settings`),t=settings.templates.find(t=>t.code==="GENERAL");
 const p=(await api(page,"POST",`/stores/${s}/catalog-products`,{name:"低利潤確認商品",barcode:"55553333",barcodeStatus:"REAL",weightGrams:"12.34",originalPriceJpy:"1000",defaultPricingTemplateId:t.id})).product;
 await page.goto(`/products/new?catalogId=${p.id}`);await expect(page.getByLabel("日本原始售價 JPY")).toHaveValue("1000.000000000000");
 await page.getByLabel("一般售價",{exact:true}).fill("1.01");await page.getByLabel("免攤交通成本").check();await page.getByRole("button",{name:"預覽目前輸入",exact:true}).click();
 const warning=page.getByLabel("一般或 VIP 利潤偏低／虧損，我確認仍要儲存");await expect(warning).toBeVisible();
 await page.getByRole("button",{name:"建立",exact:true}).click();await expect(page.getByText("一般或 VIP 利潤低於門檻，請確認仍要儲存").first()).toBeVisible();
 await warning.check();await api(page,"POST",`/stores/${s}/catalog-products/${p.id}/cost-records`,{originalPriceJpy:"2000",reasonCode:"OTHER",reasonText:"預覽後變更"});
 await page.getByRole("button",{name:"建立",exact:true}).click();await expect(page.getByText(/成本、設定或上架內容已變更/).first()).toBeVisible();await expect(page.getByLabel("一般售價",{exact:true})).toHaveValue("1.01");
 await expect(page.getByLabel("實際計價成本 JPY",{exact:true})).toHaveValue("1000.000000000000");
 await page.getByRole("button",{name:"預覽目前輸入",exact:true}).click();await expect(warning).not.toBeChecked();await warning.check();await page.getByRole("button",{name:"建立",exact:true}).click();await expect(page.getByRole("heading",{name:"商品已建立"})).toBeVisible();
});
test("listing UI cross-store deep link refusal and manual skip",async({page})=>{
 const other=await api(page,"GET",`/stores/${fixture.store}/catalog-products?pageSize=1`);const id=other.items[0].id;
 await page.route("**/api/stores/*/catalog-products/"+id,route=>route.continue({headers:{...route.request().headers(),authorization:"Bearer e2e-other-token"}}));
 await page.goto(`/products/new?catalogId=${id}`);await expect(page.getByRole("alert").first()).toBeVisible();
 await page.getByRole("button",{name:"略過資料庫，手動建立",exact:true}).click();await expect(page.getByLabel("日本原始售價 JPY")).toHaveCount(0);
 await page.getByLabel("商品名稱",{exact:true}).fill("純手動上架");await page.getByLabel("一般售價",{exact:true}).fill("150.25");await page.getByRole("button",{name:"建立",exact:true}).click();await expect(page.getByRole("heading",{name:"商品已建立"})).toBeVisible();
});
test("listing UI changing Catalog resets route and manual VIP state",async({page})=>{
 const s=fixture.store,first=(await api(page,"GET",`/stores/${s}/catalog-products?q=${encodeURIComponent("瀏覽器精確上架香水")}`)).items[0];
 const second=(await api(page,"POST",`/stores/${s}/catalog-products`,{name:"另一個路線商品",barcode:"22223333",barcodeStatus:"REAL",weightGrams:"20.00",originalPriceJpy:"200",preferredRouteLabel:"不存在的路線"})).product;
 await page.goto(`/products/new?catalogId=${first.id}`);await expect(page.getByLabel("日本原始售價 JPY")).toHaveValue("1200.000000000000");
 await page.getByLabel("選擇旅程",{exact:true}).selectOption({label:"上架旅程乙"});await expect(page.getByLabel("行程路線",{exact:true})).not.toHaveValue("");
 await page.getByLabel("一般售價",{exact:true}).fill("500");await page.getByLabel("VIP 售價",{exact:true}).fill("420");
 await page.getByRole("button",{name:"更換資料庫商品",exact:true}).click();await page.getByLabel("搜尋名稱或手動輸入條碼").fill(second.name);
 await page.getByRole("button",{name:second.name+" · "+second.barcode,exact:true}).click();
 await expect(page.getByLabel("一般售價",{exact:true})).toHaveValue("500");await expect(page.getByLabel("VIP 售價",{exact:true})).toHaveValue("500");await expect(page.getByLabel("行程路線",{exact:true})).toHaveValue("");
 await expect(page.getByText("此旅程沒有偏好路線，請自行選擇。",{exact:true})).toBeVisible();
 await page.getByLabel("一般售價",{exact:true}).fill("400.25");await expect(page.getByLabel("VIP 售價",{exact:true})).toHaveValue("400.25");
});
test("listing UI explicit field-only sync and recoverable history deletion",async({page})=>{
 const s=fixture.store,settings=await api(page,"GET",`/stores/${s}/pricing-settings`),t=settings.templates.find(t=>t.code==="GENERAL");
 const cat=(await api(page,"POST",`/stores/${s}/catalog-products`,{name:"同步驗證商品",barcode:"0",barcodeStatus:"NONE",weightGrams:"12.34",originalPriceJpy:"100",defaultPricingTemplateId:t.id})).product;
 await page.goto(`/products/new?catalogId=${cat.id}`);await expect(page.getByLabel("日本原始售價 JPY")).toHaveValue("100.000000000000");
 const checkboxes=page.getByRole("group",{name:"明確同步回資料庫（預設不勾選）"}).getByRole("checkbox");await expect(checkboxes).toHaveCount(9);for(let i=0;i<9;i++)await expect(checkboxes.nth(i)).not.toBeChecked();
 await page.getByLabel("商品名稱",{exact:true}).fill("僅同步名稱的商品");await page.getByLabel("實際計價成本 JPY",{exact:true}).fill("90");
 await page.getByLabel("一般售價",{exact:true}).fill("300.10");await page.getByLabel("免攤交通成本").check();await checkboxes.nth(0).check();
 await page.getByRole("button",{name:"預覽目前輸入",exact:true}).click();await expect(page.getByRole("heading",{name:"目前重算",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"建立",exact:true}).click();await expect(page.getByRole("heading",{name:"商品已建立"})).toBeVisible();
 const c=(await api(page,"GET",`/stores/${s}/catalog-products/${cat.id}`)).product;expect(c.name).toBe("僅同步名稱的商品");expect(c.currentCost.id).toBe(cat.currentCost.id);expect(c.currentCost.effectiveCostJpy).toBe("100.000000000000");
 const p=(await api(page,"GET",`/stores/${s}/products`)).find(p=>p.catalogProductId===cat.id);expect((await api(page,"GET",`/stores/${s}/products/${p.id}/pricing-history`)).current.listingBarcode).toBe(null);
 await page.goto("/products");const card=page.getByText("僅同步名稱的商品",{exact:true}).locator('xpath=ancestor::div[contains(@class,"relative")][1]');
 await card.getByRole("button",{name:"⋯",exact:true}).click();page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"刪除商品",exact:true}).click();
 await expect(page.getByRole("alert").filter({hasText:"計價快照"})).toBeVisible();await page.getByRole("button",{name:"將此商品下架",exact:true}).click();
 await expect.poll(async()=>(await api(page,"GET",`/stores/${s}/products/${p.id}`)).isActive).toBe(false);
 await page.screenshot({path:evidence+"/listing-deletion-recovery.png"});
});

async function expectUsableFocus(page, target, tag) {
 await expect(target).toBeFocused();
 const position=await target.evaluate(node=>{const r=node.getBoundingClientRect(),header=node.closest('form').querySelector('header').getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {rect:r.toJSON(),headerBottom:header.bottom,height:innerHeight,hit:node.contains(hit),active:document.activeElement===node};});
 expect(position.rect.top).toBeGreaterThanOrEqual(position.headerBottom);
 expect(position.rect.bottom).toBeLessThanOrEqual(position.height);
 expect(position.hit).toBe(true);
 writeFileSync(evidence+`/${tag}.json`,JSON.stringify(position,null,2));
}

for(const viewport of [{width:390,height:844},{width:390,height:400},{width:1440,height:900}]){
 test(`listing r1 submit errors and keyboard recovery ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);
  const settings=await api(page,"POST",`/stores/${fixture.store}/pricing-settings/initialize`,{});
  const template=settings.templates.find(t=>t.code==="GENERAL");
  const cat=(await api(page,"POST",`/stores/${fixture.store}/catalog-products`,{name:`錯誤焦點 ${viewport.width}x${viewport.height}`,barcode:"0",barcodeStatus:"NONE",weightGrams:"12.34",originalPriceJpy:"100",defaultPricingTemplateId:template.id})).product;
  await page.goto(`/products/new?catalogId=${cat.id}`);
  await expect(page.getByLabel("日本原始售價 JPY")).toHaveValue("100.000000000000");
  await page.getByRole("button",{name:"建立",exact:true}).press("Enter");
  const summary=page.getByRole("alert",{name:"商品儲存錯誤"});
  const tag=`r1-focus-${viewport.width}x${viewport.height}`;
  await expectUsableFocus(page,summary,tag);
  await page.screenshot({path:evidence+`/${tag}.png`});
  await page.keyboard.press("Tab");await expect(summary.getByRole("link",{name:"前往一般售價",exact:true})).toBeFocused();
  await page.keyboard.press("Enter");await expectUsableFocus(page,page.getByLabel("一般售價",{exact:true}),tag+"-price");
  await page.keyboard.type("500.123");await page.getByRole("button",{name:"建立",exact:true}).click();await expectUsableFocus(page,summary,tag+"-precision");
  await summary.getByRole("link",{name:"前往一般售價",exact:true}).click();await page.getByLabel("一般售價",{exact:true}).fill("500.25");
  await page.getByLabel("重量 g",{exact:true}).fill("12.345");await page.getByLabel("免攤交通成本",{exact:true}).check();
  await page.getByRole("button",{name:"預覽目前輸入",exact:true}).click();await expect(summary).toContainText("上架欄位格式錯誤");await expectUsableFocus(page,summary,tag+"-api");
  await summary.getByRole("link",{name:"前往重量 g",exact:true}).click();await expectUsableFocus(page,page.getByLabel("重量 g",{exact:true}),tag+"-weight");
  await page.getByLabel("重量 g",{exact:true}).fill("12.34");await page.getByRole("button",{name:"預覽目前輸入",exact:true}).click();await expect(page.getByRole("heading",{name:"目前重算",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"建立",exact:true}).click();await expect(page.getByRole("heading",{name:"商品已建立",exact:true})).toBeVisible();
  const p=(await api(page,"GET",`/stores/${fixture.store}/products`)).find(p=>p.catalogProductId===cat.id);
  await page.goto(`/products/${p.id}/edit`);await expect(page.getByLabel("一般售價",{exact:true})).toHaveValue("500.25");
  await page.getByLabel("商品名稱",{exact:true}).fill("");await page.getByRole("button",{name:"儲存",exact:true}).click();await expectUsableFocus(page,summary,tag+"-edit");
  await summary.getByRole("link",{name:"前往商品名稱",exact:true}).click();await expectUsableFocus(page,page.getByLabel("商品名稱",{exact:true}),tag+"-name");
  await page.getByLabel("商品名稱",{exact:true}).fill(cat.name);await page.getByRole("button",{name:"預覽目前輸入",exact:true}).click();await expect(page.getByRole("heading",{name:"目前重算",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"儲存",exact:true}).click();await expect(page).toHaveURL(/\/products$/);
  const h=await api(page,"GET",`/stores/${fixture.store}/products/${p.id}/pricing-history`);expect(h.product.weightGrams).toBe("12.34");expect(h.product.price).toBe("500.25");expect(h.items).toHaveLength(2);
 });
}

test("listing r1 manual fields survive selection reselection save and refresh",async({page})=>{
 const s=fixture.store,settings=await api(page,"POST",`/stores/${s}/pricing-settings/initialize`,{}),general=settings.templates.find(t=>t.code==="GENERAL"),perfume=settings.templates.find(t=>t.code==="PERFUME"),shipping=settings.shippingProfiles[0];
 const make=async(name,weight,price)=> (await api(page,"POST",`/stores/${s}/catalog-products`,{name,barcode:"0",barcodeStatus:"NONE",weightGrams:weight,originalPriceJpy:price,internalNote:"資料庫備註",categoryId:fixture.category,defaultPricingTemplateId:general.id})).product;
 const first=await make("手動保留商品甲","12.34","1200"),second=await make("手動保留商品乙","30.00","2000");
 await page.goto("/products/new");await expect(page.getByLabel("搜尋名稱或手動輸入條碼")).toBeVisible();
 await page.getByLabel("商品名稱",{exact:true}).fill("我已手動編輯的名稱");await page.getByLabel("實際計價成本 JPY",{exact:true}).fill("777.123456789012");await page.getByLabel("重量 g",{exact:true}).fill("23.45");
 await page.getByLabel("一般售價",{exact:true}).fill("900.25");
 await page.getByRole("button",{name:/進階：直接輸入圖片網址/}).click();await page.getByLabel("圖片網址").fill("https://example.com/manual.png");
 await page.getByLabel("搜尋名稱或手動輸入條碼").fill(first.name);await page.getByRole("button",{name:first.name+" · 無條碼",exact:true}).click();
 await expect(page.getByLabel("商品名稱",{exact:true})).toHaveValue("我已手動編輯的名稱");await expect(page.getByLabel("實際計價成本 JPY",{exact:true})).toHaveValue("777.123456789012");await expect(page.getByLabel("重量 g",{exact:true})).toHaveValue("23.45");
 await expect(page.getByLabel("日本原始售價 JPY")).toHaveValue("1200.000000000000");await expect(page.getByLabel("一般售價",{exact:true})).toHaveValue("900.25");await expect(page.getByLabel("VIP 售價",{exact:true})).toHaveValue("900.25");await expect(page.getByLabel("圖片網址")).toHaveValue("https://example.com/manual.png");
 await expect(page.getByRole("status").filter({hasText:"已保留你手動編輯"})).toContainText("名稱");
 await page.getByLabel("日本原始售價 JPY").fill("1333.123456789012");await page.getByLabel("上架條碼（不等於 SKU）").fill("000012345678901234567890");
 await page.getByLabel("計價模板",{exact:true}).selectOption(String(perfume.id));await page.getByLabel("國際運費方案",{exact:true}).selectOption(String(shipping.id));await page.getByLabel("百貨手續費率（空白使用模板）").fill("0.0123");
 await page.getByLabel("VIP 售價",{exact:true}).fill("800.10");
 // Existing form's textarea has no associated label; use its product section.
 const noteInput=page.locator('textarea').last();await noteInput.fill("人工保留備註");
 await page.getByRole("button",{name:"保養分類 ›",exact:true}).click();await page.getByRole("button",{name:"未分類",exact:true}).click();
 await page.getByRole("button",{name:"更換資料庫商品",exact:true}).click();await page.getByLabel("搜尋名稱或手動輸入條碼").fill(second.name);await page.getByRole("button",{name:second.name+" · 無條碼",exact:true}).click();
 await expect(page.getByLabel("日本原始售價 JPY")).toHaveValue("1333.123456789012");await expect(page.getByLabel("上架條碼（不等於 SKU）")).toHaveValue("000012345678901234567890");await expect(page.getByLabel("計價模板",{exact:true})).toHaveValue(String(perfume.id));await expect(page.getByLabel("國際運費方案",{exact:true})).toHaveValue(String(shipping.id));await expect(page.getByLabel("百貨手續費率（空白使用模板）")).toHaveValue("0.0123");
 await expect(page.getByLabel("實際計價成本 JPY",{exact:true})).toHaveValue("777.123456789012");await expect(page.getByLabel("重量 g",{exact:true})).toHaveValue("23.45");await expect(page.getByLabel("VIP 售價",{exact:true})).toHaveValue("900.25");await expect(noteInput).toHaveValue("人工保留備註");
 const boxes=page.getByRole("group",{name:"明確同步回資料庫（預設不勾選）"}).getByRole("checkbox");for(let i=0;i<9;i++)await expect(boxes.nth(i)).not.toBeChecked();
 await page.getByLabel("免攤交通成本",{exact:true}).check();await page.getByRole("button",{name:"預覽目前輸入",exact:true}).click();await expect(page.getByRole("heading",{name:"目前重算",exact:true})).toBeVisible();await page.screenshot({path:evidence+"/r1-dirty-preserved.png",fullPage:true});
 await page.getByRole("button",{name:"建立",exact:true}).click();await expect(page.getByRole("heading",{name:"商品已建立",exact:true})).toBeVisible();
 const p=(await api(page,"GET",`/stores/${s}/products`)).find(p=>p.catalogProductId===second.id);const h=await api(page,"GET",`/stores/${s}/products/${p.id}/pricing-history`);
 expect(h.product.name).toBe("我已手動編輯的名稱");expect(h.product.effectiveCostJpy).toBe("777.123456789012");expect(h.product.originalPriceJpy).toBe("1333.123456789012");expect(h.product.weightGrams).toBe("23.45");expect(h.product.imageUrl).toBe("https://example.com/manual.png");expect(h.product.internalNote).toBe("人工保留備註");
 expect(h.product.categoryId).toBe(null);
 expect((await api(page,"GET",`/stores/${s}/catalog-products/${second.id}`)).product.currentCost.originalPriceJpy).toBe("2000.000000000000");
 await page.goto(`/products/${p.id}/edit`);await expect(page.getByLabel("實際計價成本 JPY",{exact:true})).toHaveValue("777.123456789012");await page.reload();await expect(page.getByLabel("重量 g",{exact:true})).toHaveValue("23.45");await expect(page.getByLabel("日本原始售價 JPY")).toHaveValue("1333.123456789012");
 writeFileSync(evidence+"/r1-dirty-saved.json",JSON.stringify(h,null,2));
});

test("listing r1 another store session clears prior form and picker values",async({page})=>{
 await page.goto('/products/new');await expect(page.getByLabel('搜尋名稱或手動輸入條碼')).toBeVisible();
 await page.getByLabel('商品名稱',{exact:true}).fill('不可帶到外店的名稱');await page.getByLabel('實際計價成本 JPY',{exact:true}).fill('777.123456789012');await page.getByLabel('重量 g',{exact:true}).fill('23.45');await page.getByLabel('一般售價',{exact:true}).fill('900.25');
 await page.route('**/api/**',route=>route.continue({headers:{...route.request().headers(),authorization:'Bearer e2e-other-token'}}));
 await page.reload();await expect(page.getByRole('button',{name:'外店專用商品 · 9900000',exact:true})).toBeVisible();
 for(const label of ['商品名稱','實際計價成本 JPY','重量 g','一般售價','VIP 售價'])await expect(page.getByLabel(label,{exact:true})).toHaveValue('');
 await expect(page.getByRole('button',{name:/手動保留商品/})).toHaveCount(0);
 await page.getByRole('button',{name:'外店專用商品 · 9900000',exact:true}).click();await expect(page.getByLabel('商品名稱',{exact:true})).toHaveValue('外店專用商品');await expect(page.getByLabel('重量 g',{exact:true})).toHaveValue('15.25');
 await page.screenshot({path:evidence+'/r1-store-cleared.png'});
});

// Delay delivery only: every body below is fetched from the actual business API.
async function holdListingResponse(page, matches) {
 let open, readyResolve, finishedResolve, claimed=false, released=false, wire,heldRequest,transport;
 const gate=new Promise(resolve=>{open=resolve;});
 const ready=new Promise(resolve=>{readyResolve=resolve;});
 const finished=new Promise(resolve=>{finishedResolve=resolve;});
 const received=request=>{if(request===heldRequest)transport='finished';};
 const failed=request=>{if(request===heldRequest)transport=request.failure()?.errorText??'failed';};
 page.on('requestfinished',received);page.on('requestfailed',failed);
 const handler=async route=>{
  if(claimed||!matches(route.request()))return route.fallback();
  claimed=true;
  heldRequest=route.request();
  const response=await route.fetch();
  wire={url:route.request().url(),method:route.request().method(),request:route.request().postDataJSON(),status:response.status(),response:await response.json()};
  readyResolve(wire);await gate;
  try{await route.fulfill({response});}catch(error){if(!route.request().failure())throw error;}finally{finishedResolve();}
 };
 await page.route('**/api/**',handler);
 return {ready,release:async()=>{
  if(released)return;released=true;
  if(claimed){open();await finished;await expect.poll(()=>transport,{timeout:15000}).toBeTruthy();}
  await page.unroute('**/api/**',handler);page.off('requestfinished',received);page.off('requestfailed',failed);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  return {...wire,transport};
 }};
}
const catalogRequest=id=>request=>request.method()==='GET'&&new URL(request.url()).pathname===`/api/stores/${fixture.store}/catalog-products/${id}`;
const previewRequest=id=>request=>request.method()==='POST'&&new URL(request.url()).pathname===`/api/stores/${fixture.store}/catalog-products/${id}/create-listing`&&request.postDataJSON()?.generalFinalPriceTwd==='900.25';
async function raceCatalogs(page,tag){
 const settings=await api(page,'POST',`/stores/${fixture.store}/pricing-settings/initialize`,{}),t=settings.templates.find(t=>t.code==='GENERAL');
 const make=async(name,price,weight,rate)=> (await api(page,'POST',`/stores/${fixture.store}/catalog-products`,{name,barcode:'0',barcodeStatus:'NONE',weightGrams:weight,originalPriceJpy:price,defaultPricingTemplateId:t.id,...(rate?{adjustmentMode:'RATE',adjustmentRate:rate}:{})})).product;
 return {a:await make(`延遲甲 ${tag}`,'1200','12.34'),b:await make(`較新乙 ${tag}`,'2000','30.00','0.915')};
}
async function chooseRaceCatalog(page,p){
 const change=page.getByRole('button',{name:'更換資料庫商品',exact:true});if(await change.isVisible())await change.click();
 await page.getByLabel('搜尋名稱或手動輸入條碼').fill(p.name);await page.getByRole('button',{name:p.name+' · 無條碼',exact:true}).click();
 await expect(page.getByRole('link',{name:'查看資料庫／恢復封存／另建商品',exact:true})).toHaveAttribute('href',`/product-database/${p.id}`);
}
async function listingValues(page){return Object.fromEntries(await Promise.all(['商品名稱','實際計價成本 JPY','重量 g','日本原始售價 JPY','一般售價','VIP 售價'].map(async name=>[name,await page.getByLabel(name,{exact:true}).inputValue()])));}
async function saveRaceListing(page,p){
 await page.getByLabel('一般售價',{exact:true}).fill('900.25');await page.getByLabel('免攤交通成本',{exact:true}).check();
 await page.getByRole('button',{name:'預覽目前輸入',exact:true}).click();await expect(page.getByRole('heading',{name:'目前重算',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'建立',exact:true}).click();await expect(page.getByRole('heading',{name:'商品已建立',exact:true})).toBeVisible();
 const product=(await api(page,'GET',`/stores/${fixture.store}/products`)).find(x=>x.catalogProductId===p.id);
 expect(product).toBeTruthy();const history=await api(page,'GET',`/stores/${fixture.store}/products/${product.id}/pricing-history`);expect(history.current.catalogProductId).toBe(p.id);return history;
}
async function switchLiveListingStore(page){
 const before=await page.evaluate(()=>performance.timeOrigin);
 await page.route('**/api/**',route=>route.fallback({headers:{...route.request().headers(),authorization:'Bearer e2e-other-token'}}));
 const after=await page.evaluate(async()=>{
  const {queryClient}=await import('/src/lib/queryClient.ts');
  await queryClient.invalidateQueries({queryKey:['/api/me/store'],exact:true});
  return {timeOrigin:performance.timeOrigin,store:queryClient.getQueryData(['/api/me/store'])};
 });
 expect(after.timeOrigin).toBe(before);expect(after.store.id).toBe(fixture.other);return {before,...after};
}

test('listing r2 late deep link cannot replace newer Catalog or its saved source',async({page})=>{
 const {a,b}=await raceCatalogs(page,'選擇');const held=await holdListingResponse(page,catalogRequest(a.id));
 try{
  await page.goto(`/products/new?catalogId=${a.id}`,{waitUntil:'domcontentloaded'});await held.ready;
  await chooseRaceCatalog(page,b);const before=await listingValues(page);expect(before['實際計價成本 JPY']).toBe('1830.000000000000');
  const wire=await held.release();await expect(page.getByRole('link',{name:'查看資料庫／恢復封存／另建商品',exact:true})).toHaveAttribute('href',`/product-database/${b.id}`);
  expect(await listingValues(page)).toEqual(before);await expect(page.getByRole('button',{name:'建立',exact:true})).toBeEnabled();
  await page.screenshot({path:evidence+'/r2-late-selection.png'});const history=await saveRaceListing(page,b);
  writeFileSync(evidence+'/r2-late-selection.json',JSON.stringify({before,wire,history},null,2));
 }finally{await held.release();}
});

test('listing r2 manual edits survive the current delayed deep link',async({page})=>{
 const {a}=await raceCatalogs(page,'人工');const held=await holdListingResponse(page,catalogRequest(a.id));
 try{
  await page.goto(`/products/new?catalogId=${a.id}`,{waitUntil:'domcontentloaded'});await held.ready;
  await page.getByLabel('商品名稱',{exact:true}).fill('延遲期間人工名稱');await page.getByLabel('實際計價成本 JPY',{exact:true}).fill('888.123456789012');await page.getByLabel('重量 g',{exact:true}).fill('34.56');await page.getByLabel('一般售價',{exact:true}).fill('700.35');
  await held.release();await expect(page.getByLabel('日本原始售價 JPY')).toHaveValue('1200.000000000000');
  const values=await listingValues(page);expect(values['商品名稱']).toBe('延遲期間人工名稱');expect(values['實際計價成本 JPY']).toBe('888.123456789012');expect(values['重量 g']).toBe('34.56');expect(values['一般售價']).toBe('700.35');expect(values['VIP 售價']).toBe('700.35');
  writeFileSync(evidence+'/r2-late-manual.json',JSON.stringify(values,null,2));await page.screenshot({path:evidence+'/r2-late-manual.png'});
 }finally{await held.release();}
});

test('listing r2 skip invalidates delayed linking and keeps manual creation',async({page})=>{
 const {a}=await raceCatalogs(page,'略過');const held=await holdListingResponse(page,catalogRequest(a.id));
 try{
  await page.goto(`/products/new?catalogId=${a.id}`,{waitUntil:'domcontentloaded'});await held.ready;
  await page.getByLabel('商品名稱',{exact:true}).fill('略過後手動商品');await page.getByLabel('一般售價',{exact:true}).fill('500.25');
  await page.getByRole('button',{name:'略過資料庫，手動建立',exact:true}).click();await held.release();
  await expect(page.getByRole('link',{name:'查看資料庫／恢復封存／另建商品',exact:true})).toHaveCount(0);await expect(page.getByLabel('商品名稱',{exact:true})).toHaveValue('略過後手動商品');
  await page.getByRole('button',{name:'建立',exact:true}).click();await expect(page.getByRole('heading',{name:'商品已建立',exact:true})).toBeVisible();
  const product=(await api(page,'GET',`/stores/${fixture.store}/products`)).find(p=>p.name==='略過後手動商品');expect(product.catalogProductId).toBe(null);
  writeFileSync(evidence+'/r2-skip-saved.json',JSON.stringify(product,null,2));
 }finally{await held.release();}
});

test('listing r2 live store change clears exemption and rejects the old deep reply',async({page})=>{
 const otherApi=async(method,url,data,status=200)=>{const r=await page.request.fetch('/api'+url,{method,headers:{Authorization:'Bearer e2e-other-token'},data});const body=await r.json();expect(r.status(),JSON.stringify(body)).toBe(status);return body;};
 const otherSettings=await otherApi('POST',`/stores/${fixture.other}/pricing-settings/initialize`,{});
 await otherApi('PATCH',`/stores/${fixture.other}`,{purchaseExchangeRate:0.21});
 const otherTrip=await otherApi('POST','/trips',{name:'切店後手動旅程',exchangeRate:0.21},201);
 const otherArea=await otherApi('POST',`/stores/${fixture.other}/trips/${otherTrip.id}/areas`,{name:'切店後合成區域',mode:'ESTIMATE',cardboardUnitJpy:0,shippingUnitJpy:0,parcelCount:1,estimatedItemQuantity:10},201);
 const otherRoute=await otherApi('POST',`/trips/${otherTrip.id}/routes`,{areaTitle:'切店後手動路線',tripAreaId:otherArea.id,estQty:10,etcJpy:0,trainJpy:100,fuelJpy:0,parkingJpy:0},201);
 const {a}=await raceCatalogs(page,'切店');const held=await holdListingResponse(page,catalogRequest(a.id));
 try{
  await page.goto(`/products/new?catalogId=${a.id}`,{waitUntil:'domcontentloaded'});await held.ready;
  await page.getByLabel('商品名稱',{exact:true}).fill('舊店人工內容');await page.getByLabel('一般售價',{exact:true}).fill('900.25');await page.getByLabel('免攤交通成本',{exact:true}).check();
  const transition=await switchLiveListingStore(page);await expect(page.getByLabel('免攤交通成本',{exact:true})).not.toBeChecked();await expect(page.getByLabel('行程路線',{exact:true})).toBeVisible();
  await held.release();await expect(page.getByRole('alert',{name:'商品儲存錯誤'})).toHaveCount(0);await expect(page.getByLabel('商品名稱',{exact:true})).toHaveValue('');
  await page.getByRole('button',{name:'外店專用商品 · 9900000',exact:true}).click();await expect(page.getByLabel('實際計價成本 JPY',{exact:true})).toHaveValue('999.000000000000');
  await expect(page.getByLabel('免攤交通成本',{exact:true})).not.toBeChecked();await expect(page.getByLabel('行程路線',{exact:true})).toBeVisible();
  await page.getByLabel('計價模板',{exact:true}).selectOption(String(otherSettings.templates.find(t=>t.code==='GENERAL').id));
  await page.getByLabel('國際運費方案',{exact:true}).selectOption(String(otherSettings.shippingProfiles[0].id));
  await page.getByLabel('選擇旅程',{exact:true}).selectOption(String(otherTrip.id));
  await page.getByLabel('行程路線',{exact:true}).selectOption(String(otherRoute.id));
  await page.getByLabel('行程路線',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:evidence+'/r2-live-store-route.png'});
  await page.getByLabel('一般售價',{exact:true}).fill('500.25');
  const submitted=page.waitForRequest(r=>r.method()==='POST'&&r.url().includes(`/stores/${fixture.other}/catalog-products/`)&&r.postDataJSON()?.generalFinalPriceTwd==='500.25');
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes(`/stores/${fixture.other}/catalog-products/`)&&r.request().postDataJSON()?.generalFinalPriceTwd==='500.25');
  await page.getByRole('button',{name:'預覽目前輸入',exact:true}).click();const request=await submitted;expect(request.postDataJSON().isTransportCostExempt).toBe(false);expect(request.postDataJSON().tripRouteId).toBe(otherRoute.id);
  const preview=await (await response).json();expect(preview.preview.status).toBe('READY');
  await expect(page.getByRole('heading',{name:'目前重算',exact:true})).toBeVisible();await page.screenshot({path:evidence+'/r2-live-store.png'});
  writeFileSync(evidence+'/r2-live-store.json',JSON.stringify({transition,otherTrip,otherRoute,request:request.postDataJSON(),preview,values:await listingValues(page)},null,2));
 }finally{await held.release();}
});

test('listing r2 older preview cannot publish or clear newer preview busy state',async({page})=>{
 const {a,b}=await raceCatalogs(page,'預覽');await page.goto(`/products/new?catalogId=${a.id}`);await expect(page.getByLabel('日本原始售價 JPY')).toHaveValue('1200.000000000000');
 await page.getByLabel('一般售價',{exact:true}).fill('900.25');await page.getByLabel('免攤交通成本',{exact:true}).check();
 const old=await holdListingResponse(page,previewRequest(a.id));let newer;
 try{
  await page.getByRole('button',{name:'預覽目前輸入',exact:true}).click();await old.ready;await chooseRaceCatalog(page,b);
  newer=await holdListingResponse(page,previewRequest(b.id));await page.getByRole('button',{name:'預覽目前輸入',exact:true}).click();await newer.ready;
  await old.release();await expect(page.getByRole('button',{name:'預覽目前輸入',exact:true})).toBeDisabled();await expect(page.getByRole('heading',{name:'目前重算',exact:true})).toHaveCount(0);
  const wire=await newer.release();await expect(page.getByRole('button',{name:'預覽目前輸入',exact:true})).toBeEnabled();await expect(page.getByRole('heading',{name:'目前重算',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'建立',exact:true}).click();await expect(page.getByRole('heading',{name:'商品已建立',exact:true})).toBeVisible();
  const p=(await api(page,'GET',`/stores/${fixture.store}/products`)).find(p=>p.catalogProductId===b.id);const history=await api(page,'GET',`/stores/${fixture.store}/products/${p.id}/pricing-history`);expect(history.current.catalogProductId).toBe(b.id);
  writeFileSync(evidence+'/r2-preview-ownership.json',JSON.stringify({wire,history},null,2));
 }finally{await old.release();if(newer)await newer.release();}
});

test('listing r2 delayed latest cost respects newer manual input and stored exemption',async({page})=>{
 const {a}=await raceCatalogs(page,'最新');await page.goto(`/products/new?catalogId=${a.id}`);await expect(page.getByLabel('日本原始售價 JPY')).toHaveValue('1200.000000000000');const before=await saveRaceListing(page,a);
 await api(page,'POST',`/stores/${fixture.store}/catalog-products/${a.id}/cost-records`,{originalPriceJpy:'2000',reasonCode:'OTHER',reasonText:'延遲最新成本'});
 await page.goto(`/products/${before.product.id}/edit`);await expect(page.getByRole('link',{name:'查看資料庫／恢復封存／另建商品',exact:true})).toHaveAttribute('href',`/product-database/${a.id}`);await expect(page.getByText('已連結：'+a.name,{exact:false})).toBeVisible();await expect(page.getByLabel('免攤交通成本',{exact:true})).toBeChecked();
 const held=await holdListingResponse(page,catalogRequest(a.id));
 try{
  await page.getByRole('button',{name:'依最新成本重算',exact:true}).click();await held.ready;await page.getByLabel('實際計價成本 JPY',{exact:true}).fill('777.123456789012');
  await held.release();await expect(page.getByLabel('實際計價成本 JPY',{exact:true})).toHaveValue('777.123456789012');await expect(page.getByLabel('日本原始售價 JPY')).toHaveValue('1200.000000000000');await expect(page.getByRole('button',{name:'預覽目前輸入',exact:true})).toBeEnabled();
  const after=await api(page,'GET',`/stores/${fixture.store}/products/${before.product.id}/pricing-history`);expect(after.items).toEqual(before.items);
  writeFileSync(evidence+'/r2-latest-manual.json',JSON.stringify({values:await listingValues(page),before,after},null,2));await page.screenshot({path:evidence+'/r2-latest-manual.png'});
 }finally{await held.release();}
});

test('listing r2 delayed history cannot hydrate a different live store',async({page})=>{
 const {a}=await raceCatalogs(page,'歷史');await page.goto(`/products/new?catalogId=${a.id}`);await expect(page.getByLabel('日本原始售價 JPY')).toHaveValue('1200.000000000000');const before=await saveRaceListing(page,a);
 const held=await holdListingResponse(page,r=>r.method()==='GET'&&new URL(r.url()).pathname===`/api/stores/${fixture.store}/products/${before.product.id}/pricing-history`);
 try{
  await page.goto(`/products/${before.product.id}/edit`,{waitUntil:'domcontentloaded'});await held.ready;await expect(page.getByLabel('免攤交通成本',{exact:true})).toBeChecked();
  const transition=await switchLiveListingStore(page);await expect(page.getByLabel('免攤交通成本',{exact:true})).not.toBeChecked();await held.release();
  for(const label of ['商品名稱','實際計價成本 JPY','重量 g','一般售價','VIP 售價'])await expect(page.getByLabel(label,{exact:true})).toHaveValue('');
  await expect(page.getByRole('link',{name:'查看資料庫／恢復封存／另建商品',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'目前重算',exact:true})).toHaveCount(0);
  writeFileSync(evidence+'/r2-history-store.json',JSON.stringify({transition,oldHistory:before},null,2));await page.screenshot({path:evidence+'/r2-history-store.png'});
 }finally{await held.release();}
});

// UI-state-only upload transport mock; Catalog/listing APIs and SQL remain real.
const uploadPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=','base64');
async function holdUploadResponse(page,status){
 const pattern='**/api/stores/*/products/image';let open,readyResolve,doneResolve,claimed=false,released=false,wire,transport;
 const gate=new Promise(r=>open=r),ready=new Promise(r=>readyResolve=r),done=new Promise(r=>doneResolve=r);
 const url=new URL('/r2-ui-only-upload.png',page.url()).href;let request;
 const received=r=>{if(r===request)transport='received';};page.on('requestfinished',received);
 const handler=async route=>{claimed=true;request=route.request();wire={uiStateMockOnly:true,externalStorageTested:false,url:request.url(),method:request.method(),contentType:request.headers()['content-type'],bytes:request.postDataBuffer()?.length,status,imageUrl:url};readyResolve(wire);await gate;try{await route.fulfill({status,contentType:'application/json',body:JSON.stringify(status===200?{imageUrl:url}:{error:'合成延遲上傳錯誤'})});}finally{doneResolve();}};
 await page.route(pattern,handler);
 return {ready,url,release:async()=>{if(released)return wire;released=true;if(claimed){open();await done;await expect.poll(()=>transport).toBe('received');}await page.unroute(pattern,handler);page.off('requestfinished',received);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return wire;}};
}
async function startSyntheticUpload(page,held){
 await page.locator('input[type="file"]').setInputFiles({name:'r2-synthetic.png',mimeType:'image/png',buffer:uploadPng});
 const wire=await held.ready;expect(wire.method).toBe('POST');expect(wire.contentType).toContain('multipart/form-data');expect(wire.bytes).toBeGreaterThan(uploadPng.length);
 await expect(page.getByRole('button',{name:'建立',exact:true})).toBeDisabled();
}
test('listing r2 manual upload completes after a newer Catalog selection in the same form',async({page})=>{
 const {a,b}=await raceCatalogs(page,'圖片保留');await page.goto(`/products/new?catalogId=${a.id}`);await expect(page.getByLabel('日本原始售價 JPY')).toHaveValue('1200.000000000000');
 const held=await holdUploadResponse(page,200);
 try{
  await startSyntheticUpload(page,held);await chooseRaceCatalog(page,b);const wire=await held.release();
  await expect(page.getByText('✓ 圖片已上傳',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'建立',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:/進階：直接輸入圖片網址/}).click();await expect(page.getByLabel('圖片網址',{exact:true})).toHaveValue(held.url);
  await expect(page.getByRole('link',{name:'查看資料庫／恢復封存／另建商品',exact:true})).toHaveAttribute('href',`/product-database/${b.id}`);
  await page.getByLabel('圖片網址',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:evidence+'/r2-upload-same-form.png'});
  writeFileSync(evidence+'/r2-upload-same-form.json',JSON.stringify({wire,catalogId:b.id,imageUrl:await page.getByLabel('圖片網址',{exact:true}).inputValue()},null,2));
 }finally{await held.release();}
});
for(const status of [200,500])test(`listing r2 old upload ${status} cannot update the new live store form`,async({page})=>{
 const {a}=await raceCatalogs(page,'圖片切店'+status);await page.goto(`/products/new?catalogId=${a.id}`);await expect(page.getByLabel('日本原始售價 JPY')).toHaveValue('1200.000000000000');
 const held=await holdUploadResponse(page,status);
 try{
  await startSyntheticUpload(page,held);const transition=await switchLiveListingStore(page);
  await expect(page.getByRole('button',{name:'建立',exact:true})).toBeEnabled();await expect(page.getByRole('img',{name:'商品圖',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'外店專用商品 · 9900000',exact:true}).click();await expect(page.getByLabel('商品名稱',{exact:true})).toHaveValue('外店專用商品');
  const wire=await held.release();await expect(page.getByText('✓ 圖片已上傳',{exact:true})).toHaveCount(0);await expect(page.getByText('合成延遲上傳錯誤',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'建立',exact:true})).toBeEnabled();await expect(page.getByRole('img',{name:'商品圖',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:/進階：直接輸入圖片網址/}).click();await expect(page.getByLabel('圖片網址',{exact:true})).toHaveValue('');
  await page.getByLabel('圖片網址',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:evidence+`/r2-upload-new-store-${status}.png`});
  writeFileSync(evidence+`/r2-upload-new-store-${status}.json`,JSON.stringify({wire,transition,imageUrl:await page.getByLabel('圖片網址',{exact:true}).inputValue()},null,2));
 }finally{await held.release();}
});
