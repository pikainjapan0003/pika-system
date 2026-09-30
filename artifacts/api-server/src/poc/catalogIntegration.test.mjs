import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// This suite must never accept the hosted POC or an ambient application database.
const target = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/invalid');
assert.equal(process.env.PIKA_CATALOG_TEST, 'SITES-PRODUCT-DATABASE-20260930');
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.username, 'pika_test');
assert.equal(target.pathname, '/pika_sites_catalog_test');
const require = createRequire(import.meta.url);
mock.module(pathToFileURL(require.resolve('@clerk/express').replace(/index\.js$/, 'index.mjs')), {
  namedExports: { getAuth: req => ({ userId: req.headers['x-test-owner'] ?? null }),
    clerkMiddleware: () => (_req, _res, next) => next() },
});
const { default: express } = await import('express');
const { pool } = await import('@workspace/db');
const { privatePocBoundary } = await import('../lib/privatePoc.ts');
const { publicLaunchBoundary } = await import('../middlewares/publicLaunch.ts');
const { default: router } = await import('../routes/index.ts');

test('Sites catalog: real PostgreSQL transactions, owner isolation and existing orders', { timeout: 120000 }, async t => {
  const legacyOrders = (await pool.query('SELECT id,to_jsonb(o)::text content FROM orders o ORDER BY id')).rows;
  const owner = 'user_sites_catalog_' + Date.now();
  const { rows: [store] } = await pool.query("INSERT INTO stores(merchant_id,name,slug,purchase_exchange_rate) VALUES($1,'整合測試假店鋪',$2,.2) RETURNING id", [owner, owner]);
  const s = store.id, prefix = `/stores/${s}`;
  process.env.PIKA_PRIVATE_POC = 'true';
  process.env.PIKA_PUBLIC_SHOP = 'true';
  process.env.PIKA_OWNER_CLERK_USER_ID = owner;
  process.env.PIKA_OWNER_STORE_ID = String(s);
  process.env.PIKA_POC_PROXY_SECRET = 'catalog-integration-local-gateway-20260930';
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.log = { info() {}, warn() {}, error() {} }; next(); });
  app.use(privatePocBoundary, publicLaunchBoundary); app.use('/api', router);
  app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ error: err.message }));
  const server = await new Promise(resolve => { const v = app.listen(0, '127.0.0.1', () => resolve(v)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function api(method, path, body, expected = 200, identity = owner, gateway = true) {
    const response = await fetch(base + path, { method, headers: {
      'content-type': 'application/json', 'connection': 'close',
      ...(identity ? { 'x-test-owner': identity } : {}),
      ...(gateway ? { 'x-pika-poc-key': process.env.PIKA_POC_PROXY_SECRET } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data).slice(0,1200)}`);
    return data;
  }
  let ship, a, b, order, listing;
  const requestId = randomUUID();
  try {
    await t.test('all new catalog routes retain gateway and fixed owner checks', async () => {
      await api('GET', prefix + '/catalog-products', undefined, 403, owner, false);
      await api('GET', prefix + '/catalog-products', undefined, 401, null);
      await api('GET', prefix + '/catalog-products', undefined, 403, 'user_other');
      await api('GET', '/stores/2147483647/catalog-products', undefined, 403);
      await api('POST', prefix + '/pricing-settings/initialize', {});
      await api('PATCH', prefix + '/pricing-settings', { lossProtectionTwd: '0' });
      ship = (await api('POST', prefix + '/shipping-profiles', { code:'INTEGRATION_ZERO',name:'合成零運費',rateTwd:'0',basisWeightGrams:'1000' })).record.id;
    });
    await t.test('barcode preserves leading zeros; names and cost history remain searchable', async () => {
      a = (await api('POST', prefix + '/catalog-products', { name:'整合商品 A',barcode:'0001234567890123456789012345',barcodeStatus:'REAL',weightGrams:'10',originalPriceJpy:'100',defaultShippingProfileId:ship })).product;
      b = (await api('POST', prefix + '/catalog-products', { name:'整合商品 B',barcode:'00022',barcodeStatus:'REAL',weightGrams:'5',originalPriceJpy:'50',defaultShippingProfileId:ship })).product;
      const exact = await api('GET', prefix + '/catalog-products?exactBarcode=' + a.barcode);
      assert.equal(exact.items.length, 1); assert.equal(exact.items[0].id, a.id);
      assert.equal((await api('GET', prefix + '/catalog-products?exactBarcode=1234567890123456789012345')).items.length, 0);
      await api('PATCH', prefix + `/catalog-products/${a.id}`, { name:'整合商品 A 改名' });
      assert.equal((await api('GET', prefix + `/catalog-products/${a.id}/aliases`)).items[0].alias, '整合商品 A');
    });
    await t.test('price preview agrees with independent arithmetic and stays pending for missing cost', async () => {
      const input = { originalPriceJpy:'100',weightGrams:'10',shippingProfileId:ship,isTransportCostExempt:true,generalFinalPriceTwd:'50',vipFinalPriceTwd:'45' };
      const preview = await api('POST', prefix + '/pricing/preview', input);
      // 100 JPY * .2 = 20; purchase fee 20*.015=.3; shipping/route=0.
      // Total cost 20.3; 50-20.3 = 29.7, VIP 45-20.3 = 24.7.
      assert.equal(preview.amounts.totalCostTwd, '20.300000000000');
      assert.equal(preview.general.values.netProfitTwd, '29.700000000000');
      assert.equal(preview.vip.values.netProfitTwd, '24.700000000000');
      const pending = await api('POST', prefix + '/pricing/preview', { ...input, originalPriceJpy:null });
      assert.equal(pending.status, 'PENDING_CONFIRMATION');
    });
    await t.test('listing preview and explicit save preserve snapshots and private image URLs', async () => {
      const imageUrl = `https://pika-jpselects.com/api/poc/images/products/${s}/1770000000000-0123456789abcdef.png`;
      await api('PATCH', prefix + `/catalog-products/${a.id}`, { imageUrl });
      const input = { mode:'PREVIEW',generalFinalPriceTwd:'50',vipFinalPriceTwd:'45',shippingProfileId:ship,isTransportCostExempt:true };
      const preview = await api('POST', prefix + `/catalog-products/${a.id}/create-listing`, input);
      const saved = await api('POST', prefix + `/catalog-products/${a.id}/create-listing`, { ...input,mode:'SAVE',expectedContext:preview.reference.context,confirmLowProfit:true }, 201);
      listing = saved.product;
      assert.equal(Number(listing.price), 50); assert.equal(listing.catalogProductId, a.id);
      const history = await api('GET', prefix + `/products/${listing.id}/pricing-history`);
      assert.ok(history.items.length >= 1);
      assert.equal((await api('GET', prefix + `/catalog-products/${a.id}`)).product.imageUrl, imageUrl);
    });
    await t.test('existing manual, share-link and cart orders retain totals and private item snapshots', async () => {
      await api('PATCH', prefix + `/products/${listing.id}`, {isActive:true});
      const buyer={buyerName:'既有流程合成買家',buyerPhone:'0900000001',pickupMethod:'self_pickup',quantity:2,specValues:{}};
      const request={...buyer,productId:listing.id,clientRequestId:randomUUID()};
      const manual=await api('POST',prefix+'/orders',request,201);
      assert.equal(Number(manual.totalPrice),100);
      assert.equal((await api('POST',prefix+'/orders',request,200)).id,manual.id);
      const shared=await api('POST',`/p/${listing.shareToken}/orders`,buyer,201);
      const cart=await api('POST','/cart/orders',{...buyer,items:[{shareToken:listing.shareToken,quantity:2,specValues:{}}]},201);
      for(const saved of [manual,shared,cart]) {
        const row=(await pool.query('SELECT id,total_price FROM orders WHERE store_id=$1 AND public_token=$2',[s,saved.publicToken])).rows[0];
        assert.equal(Number(row.total_price),100);
        const item=(await pool.query('SELECT quantity,unit_price_twd,unit_profit_twd_snapshot FROM order_items WHERE order_id=$1',[row.id])).rows[0];
        assert.equal(item.quantity,2);assert.equal(Number(item.unit_price_twd),50);
        assert.equal(Number(item.unit_profit_twd_snapshot),29.7);
      }
      for(const dto of [shared,cart]) assert.doesNotMatch(JSON.stringify(dto),/profitSnapshot|captureContext|costJpy|pricingContext|internalNote/);
    });
    const payload = () => ({ clientRequestId:requestId,buyerName:'合成買家',buyerPhone:'0900000000',pickupMethod:'自取',items:[
      { catalogProductId:a.id,quantity:2,unitPriceTwd:'50',cost:{shippingProfileId:ship,isTransportCostExempt:true} },
      { catalogProductId:b.id,quantity:1,unitPriceTwd:'30',cost:{shippingProfileId:ship,isTransportCostExempt:true} },
    ] });
    await t.test('multi-item order totals, immutable costs and retry idempotency', async () => {
      order = await api('POST', prefix + '/catalog-orders', payload(), 201);
      assert.equal(Number(order.totalPrice), 130); assert.equal(order.orderItems.length, 2);
      // 2*(50-20.3) + (30-10.15) = 79.25.
      assert.equal(Number(order.cartProfitSnapshotTotalTwd), 79.25);
      const same = await api('POST', prefix + '/catalog-orders', payload(), 201);
      assert.equal(same.id, order.id);
      const changed = payload(); changed.items[0].quantity = 3;
      await api('POST', prefix + '/catalog-orders', changed, 409);
      assert.equal((await pool.query('SELECT count(*)::int n FROM orders WHERE store_id=$1 AND client_request_id=$2',[s,requestId])).rows[0].n, 1);
    });
    await t.test('cost updates do not recalculate old orders; completed sales count exactly once', async () => {
      await api('POST', prefix + `/catalog-products/${a.id}/cost-records`, { originalPriceJpy:'200',adjustmentMode:'NONE',reasonCode:'PRICE_UPDATE' });
      const unchanged = (await api('GET', prefix + '/orders')).find(saved=>saved.id===order.id);
      assert.equal(Number(unchanged.cartProfitSnapshotTotalTwd), 79.25);
      for (const status of ['awaiting_payment','preparing','shipped','completed']) await api('PATCH', `/orders/${order.id}/status`, { status });
      // Sites' unchanged status machine rejects a transition to the same status.
      const repeat = await api('PATCH', `/orders/${order.id}/status`, {status:'completed'}, 422);
      assert.equal(repeat.error, 'Order is already in status: completed');
      const sales = await api('GET', prefix + `/catalog-sales?ids=${a.id},${b.id}`);
      assert.equal(sales.items.length, 2);
      const aSales = sales.items.find(item=>item.catalogProductId===a.id).general;
      const bSales = sales.items.find(item=>item.catalogProductId===b.id).general;
      assert.equal(Number(aSales.quantity), 2); assert.equal(aSales.orderCount, 1);
      assert.equal(Number(aSales.weightedAverageTwd), 50);
      assert.equal(Number(bSales.quantity), 1); assert.equal(bSales.orderCount, 1);
      assert.equal(Number(bSales.weightedAverageTwd), 30);
      const events = await pool.query('SELECT count(*)::int n FROM order_completion_events WHERE order_id=$1',[order.id]);
      assert.equal(events.rows[0].n, 1);
      const originalItem = order.orderItems[0];
      await assert.rejects(pool.query('UPDATE order_items SET quantity=quantity+1,subtotal_twd=unit_price_twd*(quantity+1) WHERE id=$1',[originalItem.id]), /完成歷史/);
    });
    await t.test('customer projection excludes all cost and owner-only fields', async () => {
      const tracked = await api('GET', '/orders/track/' + order.publicToken);
      const text = JSON.stringify(tracked);
      assert.doesNotMatch(text, /unitProfit|captureContext|costJpy|exchangeRate|pricingContext|internalNote/);
      await api('GET', '/orders/track/' + order.publicToken, undefined, 404, null);
    });
    await t.test('matching pagination validates malformed pages and does not rewrite old orders', async () => {
      await api('GET', prefix + '/listing-matches/preview?page=1');
      await api('GET', prefix + '/listing-matches/preview?page=0', undefined, 400);
      await api('GET', prefix + '/listing-matches/preview?page=1e2', undefined, 400);
      assert.equal(Number((await api('GET', prefix + '/orders')).find(saved=>saved.id===order.id).totalPrice), 130);
    });
    await t.test('sheet imports require explicit review and approval before writes', async () => {
      const cells = [{row:1,column:2,type:'text',value:'001001'}, {row:1,column:3,type:'text',value:'匯入合成商品'},
        {row:1,column:4,type:'text',value:'100'}, {row:1,column:5,type:'text',value:'10'}, {row:1,column:6,type:'text',value:'100'}];
      const batch = await api('POST', prefix + '/sheet-imports/preview', {sourceType:'STRUCTURED_CELLS',spreadsheetTitle:'整合驗證',sheetTitle:'Selected',cells});
      await api('POST', prefix + `/sheet-imports/${batch.batch.id}/commit`, {confirmed:true}, 409);
      assert.equal((await api('GET', prefix + `/sheet-imports/${batch.batch.id}`)).batch.status, 'PREVIEWED');
    });
    await t.test('removed signup and Seller Agent routes remain unavailable', async () => {
      await api('POST', '/stores', {}, 403);
      await api('GET', prefix + '/agent-settings', undefined, 403);
    });
    await t.test('all orders present before integration remain byte-for-byte unchanged', async () => {
      const current = (await pool.query('SELECT id,to_jsonb(o)::text content FROM orders o WHERE id=ANY($1::int[]) ORDER BY id',[legacyOrders.map(order=>order.id)])).rows;
      assert.deepEqual(current, legacyOrders);
    });
  } finally {
    await new Promise(resolve => server.close(resolve)); await pool.end();
  }
});
