# Step 7D Agent API 真實 DB Integration Test 計畫

日期：2026-06-08
執行者：Claude B
前置任務：Step 7D-4A（Agent API 整體驗收盤點文件，commit a96d22a）

---

## 1. 背景

Step 7D 已完成 4 支 Agent API endpoint：

| Endpoint                                     | Commit  |
| -------------------------------------------- | ------- |
| GET /api/internal/agent/orders/tracking-jobs | c98944f |
| POST /api/internal/agent/shipment-events     | 345f83d |
| PATCH /api/internal/agent/shipment-status    | c6abd79 |
| POST /api/internal/agent/run-log             | d2abac2 |

目前 78/78 unit mock tests 通過（`agent.route.test.mjs`），但所有測試均使用 mock DB，尚未驗證：

- 真實 DB schema 欄位對應是否正確
- FK 限制、CHECK constraint 是否符合實作假設
- idempotencyKey unique constraint 真實行為
- rawData sanitization 在真實 DB 的實際儲存結果
- 跨 store 隔離在真實 DB 查詢中的實際效果
- agent_run_logs tokenId nullable FK 行為

本計畫設計最小 E2E seed / cleanup 策略，作為 Step 7D-4B-2（實作 integration test）的施工基礎。

---

## 2. 本次盤點結果

### 2.1 Git 狀態

| 項目                | 值                                                           |
| ------------------- | ------------------------------------------------------------ |
| main                | `a96d22a docs-order-step7d-agent-api-final-acceptance-audit` |
| gitsafe-backup/main | `a96d22a`（與 main 一致）                                    |
| 盤點時間            | 2026-06-08                                                   |

### 2.2 DB 表存在結果

| 表                                            | 存在 |
| --------------------------------------------- | ---- |
| public.stores                                 | ✓    |
| public.orders                                 | ✓    |
| public.shipment_trackings                     | ✓    |
| public.shipment_tracking_events               | ✓    |
| public.seller_agent_tokens                    | ✓    |
| public.agent_run_logs                         | ✓    |
| shipment_tracking_events.idempotency_key 欄位 | ✓    |
| orders.discount_amount 欄位                   | ✓    |
| orders.discount_note 欄位                     | ✓    |

### 2.3 API Endpoint 狀態

| Endpoint                                     | 狀態                            |
| -------------------------------------------- | ------------------------------- |
| GET /api/internal/agent/orders/tracking-jobs | ✓ 已完成、已測（15 unit tests） |
| POST /api/internal/agent/shipment-events     | ✓ 已完成、已測（16 unit tests） |
| PATCH /api/internal/agent/shipment-status    | ✓ 已完成、已測（16 unit tests） |
| POST /api/internal/agent/run-log             | ✓ 已完成、已測（16 unit tests） |

---

## 3. 現有測試架構盤點

### 3.1 Unit mock test（現有）

- 檔案：`artifacts/api-server/src/routes/agent.route.test.mjs`
- Runner：Node.js v24 built-in test runner with `--experimental-test-module-mocks`
- DB：`@workspace/db` 完整 mock，不連真實 DB
- 啟動：mock 模組直接 import app，不 listen port
- 執行指令：
  ```
  node --experimental-test-module-mocks --import tsx/esm \
    --test src/routes/agent.route.test.mjs
  ```
- 結果：78/78 通過

### 3.2 Integration test（現有先例：orders.route.test.mjs）

- 檔案：`artifacts/api-server/src/routes/orders.route.test.mjs`
- 架構：`before()` seed DB → HTTP fetch → `after()` cleanup DB
- 使用真實 DB（DATABASE_URL）
- 啟動真實 Express server（`app.listen(0)` 自動選 port）
- seed pattern：
  ```javascript
  before(async () => {
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    const [store] = await db.insert(storesTable).values({...}).returning();
    testStoreId = store.id;
  });
  after(async () => {
    await db.delete(ordersTable).where(eq(ordersTable.storeId, testStoreId));
    await db.delete(storesTable).where(eq(storesTable.id, testStoreId));
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });
  ```
- cleanup：按 FK 反向順序刪除，以 id 精確比對，不 truncate

### 3.3 Integration test 慣例差異（Agent vs Orders）

| 項目          | orders.route.test.mjs             | 預計 agent.integration.test.mjs         |
| ------------- | --------------------------------- | --------------------------------------- |
| Auth          | Clerk mock，x-test-user-id header | Bearer token → SHA-256 hash → DB lookup |
| storeId 來源  | 從 Clerk userId 推算              | 從 DB seller_agent_tokens.store_id      |
| Token 建立    | 不需要                            | 需要 seed seller_agent_tokens           |
| 跨 store 測試 | 無                                | 需要 seed 兩個 store                    |

---

## 4. Integration Test 目標

| 目標                  | 說明                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| 驗證真實 DB 寫入      | shipment_tracking_events / agent_run_logs 能否正確 INSERT             |
| 驗證跨 store 隔離     | Store A token 不能讀寫 Store B 的 tracking                            |
| 驗證 idempotency      | 同 trackingId + idempotencyKey 第二次呼叫 → 200，不重複 INSERT        |
| 驗證 rawPayload 清洗  | 含 phone/address/name/email 的 payload，DB 中 raw_data 不保留這些 key |
| 驗證 run-log 寫入     | agent_run_logs 能正確 INSERT，欄位值正確                              |
| 驗證 CHECK constraint | runType / status / eventStatus / trackingStatus 使用正確 enum 值      |
| 驗證 FK cascade       | token 對應 store 的 store_id 在 agent_run_logs 中正確                 |

---

## 5. 建議測試檔案

```
artifacts/api-server/src/routes/agent.integration.test.mjs
```

- 與 `agent.route.test.mjs`（unit mock）**分開**，不互相影響
- 不需要 `--experimental-test-module-mocks`（直接使用真實 DB）
- 需要 `--import tsx/esm`（ESM + TypeScript import）
- 執行指令（Step 7D-4B-2 實作時建議）：
  ```
  RUN_AGENT_INTEGRATION_TESTS=1 node --import tsx/esm \
    --test src/routes/agent.integration.test.mjs
  ```

---

## 6. 建議測試環境旗標

| 旗標                            | 說明                             |
| ------------------------------- | -------------------------------- |
| `RUN_AGENT_INTEGRATION_TESTS=1` | 必須明確設定，否則 skip 所有測試 |
| `DATABASE_URL`                  | 必須存在且可連線                 |

**Skip 邏輯**：

```javascript
const RUN_INTEGRATION = process.env.RUN_AGENT_INTEGRATION_TESTS === "1";
if (!RUN_INTEGRATION) {
  // skip all tests with test.skip(...)
}
```

**目的**：避免 CI unit test 誤連真實 DB，避免污染共享 DB。

---

## 7. Seed 資料表清單

### 7.1 FK 依賴圖

```
stores
  ├── products (storeId FK)
  │     └── orders (storeId FK + product_id FK)
  │           └── shipment_trackings (order_id FK)
  │                 └── shipment_tracking_events (shipment_tracking_id FK)
  └── seller_agent_tokens (store_id FK)
        └── agent_run_logs (token_id nullable FK + store_id FK)
```

### 7.2 必要 seed 欄位盤點

| 表                       | 必填欄位（NOT NULL 且無 default）                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| stores                   | merchant_id, name, slug                                                                             |
| products                 | storeId, name, price, shareToken, isActive                                                          |
| orders                   | product_id, store_id, buyer_name, buyer_phone, pickup_method, unit_price, total_price, public_token |
| shipment_trackings       | order_id, tracking_code, tracking_provider                                                          |
| shipment_tracking_events | shipment_tracking_id, event_status, occurred_at                                                     |
| seller_agent_tokens      | merchant_id, store_id, name, token_hash, token_prefix                                               |
| agent_run_logs           | merchant_id, store_id, run_type, status                                                             |

### 7.3 Seed prefix 規則

所有測試資料的**文字識別欄位**必須使用 `STEP7D_E2E_` prefix：

| 表.欄位                          | 建議值                                         |
| -------------------------------- | ---------------------------------------------- |
| stores.merchant_id               | `STEP7D_E2E_merchant`                          |
| stores.name                      | `STEP7D_E2E_store_main`                        |
| stores.slug                      | `step7d-e2e-store-main-<timestamp>`            |
| seller_agent_tokens.merchant_id  | `STEP7D_E2E_merchant`                          |
| seller_agent_tokens.name         | `STEP7D_E2E_token`                             |
| seller_agent_tokens.token_prefix | rawToken 前 12 個字元                          |
| orders.buyer_name                | `STEP7D_E2E_buyer`（不在 API response 中出現） |
| orders.public_token              | `STEP7D_E2E_order_<timestamp>`                 |
| agent_run_logs 查詢              | by inserted id                                 |

**注意**：cleanup 必須用 inserted id 或 prefix 精確比對，不可 truncate。

---

## 8. Agent Token 建立策略

Agent token 的 **rawToken 只在測試記憶體存在，不落 DB**，DB 只保存 tokenHash 和 tokenPrefix。

```javascript
import { createHash } from "node:crypto";

const RAW_TOKEN_MAIN = "sagt_STEP7D_E2E_main_token_abc123xyz";
const TOKEN_HASH_MAIN = createHash("sha256")
  .update(RAW_TOKEN_MAIN)
  .digest("hex");
const TOKEN_PREFIX_MAIN = RAW_TOKEN_MAIN.slice(0, 12); // 'sagt_STEP7D_'

// Seed into DB:
// await db.insert(sellerAgentTokensTable).values({
//   merchantId: 'STEP7D_E2E_merchant',
//   storeId: testStoreIdMain,
//   name: 'STEP7D_E2E_token_main',
//   tokenHash: TOKEN_HASH_MAIN,
//   tokenPrefix: TOKEN_PREFIX_MAIN,
//   status: 'active',
//   scopes: ['tracking:read', 'tracking:write', 'run_log:write'],
// });

// HTTP request:
// Authorization: Bearer sagt_STEP7D_E2E_main_token_abc123xyz
```

這與 `agentAuth.ts` 的驗證邏輯完全一致（Bearer token → SHA-256 → DB lookup by tokenHash）。

**跨 store 測試（Flow B）需要 Store B 的獨立 token**：

```javascript
const RAW_TOKEN_STORE_B = "sagt_STEP7D_E2E_storeb_token_xyz456abc";
const TOKEN_HASH_STORE_B = createHash("sha256")
  .update(RAW_TOKEN_STORE_B)
  .digest("hex");
```

---

## 9. Cleanup 策略

### 9.1 Cleanup 順序（必須遵守 FK 依賴）

```
1. shipment_tracking_events  → DELETE WHERE shipment_tracking_id IN (test tracking ids)
2. agent_run_logs            → DELETE WHERE store_id = testStoreIdMain OR store_id = testStoreIdB
3. shipment_trackings        → DELETE WHERE order_id IN (test order ids)
4. seller_agent_tokens       → DELETE WHERE store_id = testStoreIdMain OR store_id = testStoreIdB
5. orders                    → DELETE WHERE store_id = testStoreIdMain OR store_id = testStoreIdB
6. products                  → DELETE WHERE store_id = testStoreIdMain OR store_id = testStoreIdB
7. stores                    → DELETE WHERE id IN (testStoreIdMain, testStoreIdB)
```

### 9.2 Cleanup 規則

- **不可 TRUNCATE** 任何表
- **不可無條件 DELETE**（必須加 WHERE 條件）
- **必須只刪除 prefix 對應或 inserted id 對應的資料**
- cleanup 必須放在 `after()` 鉤子中，確保測試失敗也能執行
- cleanup 失敗應 throw 錯誤並清楚記錄哪個表失敗
- cleanup 前必須確認 testStoreId 不為 null（避免誤刪所有資料）

### 9.3 Cleanup 保護示例

```javascript
after(async () => {
  // Guard: 確保只刪測試資料
  if (!testStoreIdMain)
    throw new Error(
      "testStoreIdMain is null — cleanup skipped to avoid data loss",
    );

  await db
    .delete(shipmentTrackingEventsTable)
    .where(
      inArray(shipmentTrackingEventsTable.shipmentTrackingId, testTrackingIds),
    );

  await db
    .delete(agentRunLogsTable)
    .where(
      inArray(
        agentRunLogsTable.storeId,
        [testStoreIdMain, testStoreIdB].filter(Boolean),
      ),
    );

  // ... 其餘按順序
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});
```

---

## 10. 測試案例表格

| Case | Flow                        | API                    | 輸入                                                  | 預期 HTTP                            | 預期 DB                                                |
| ---- | --------------------------- | ---------------------- | ----------------------------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| A-1  | Full happy path             | GET /tracking-jobs     | valid token, storeId=main                             | 200, jobs 包含 seed tracking         | —                                                      |
| A-2  | Full happy path             | POST /shipment-events  | valid token, valid trackingId, eventStatus=in_transit | 201, idempotent=false                | shipment_tracking_events +1 row                        |
| A-3  | Full happy path             | PATCH /shipment-status | valid token, valid trackingId, trackingStatus=active  | 200                                  | shipment_trackings.tracking_status updated             |
| A-4  | Full happy path             | POST /run-log          | valid token, runType=scheduled, status=completed      | 201                                  | agent_run_logs +1 row，tokenId/merchantId/storeId 正確 |
| B-1  | Cross-store isolation       | GET /tracking-jobs     | store A token                                         | 200, jobs 不包含 store B 的 tracking | —                                                      |
| B-2  | Cross-store isolation       | POST /shipment-events  | store A token, store B trackingId                     | 404 tracking_not_found               | shipment_tracking_events 無新 row                      |
| B-3  | Cross-store isolation       | PATCH /shipment-status | store A token, store B trackingId                     | 404 tracking_not_found               | shipment_trackings 無變動                              |
| C-1  | Idempotency first           | POST /shipment-events  | idempotencyKey=idem_step7d_001                        | 201, idempotent=false                | +1 row                                                 |
| C-2  | Idempotency repeat          | POST /shipment-events  | 同 idempotencyKey=idem_step7d_001                     | 200, idempotent=true                 | row 數不變                                             |
| D-1  | rawPayload sanitization     | POST /shipment-events  | rawPayload 含 phone/address/name/email                | 201                                  | DB raw_data 不含 phone/address/name/email key          |
| E-1  | Invalid token               | GET /tracking-jobs     | Bearer invalid_token_xyz                              | 401 agent_auth_unauthorized          | —                                                      |
| E-2  | Missing token               | GET /tracking-jobs     | 無 Authorization header                               | 401 agent_auth_missing               | —                                                      |
| E-3  | Invalid trackingStatus      | GET /tracking-jobs     | status=invalid_status                                 | 400 invalid_tracking_status          | —                                                      |
| E-4  | Invalid eventStatus         | POST /shipment-events  | eventStatus=invalid                                   | 400 invalid_event_status             | —                                                      |
| E-5  | Invalid runType             | POST /run-log          | runType=invalid                                       | 400 invalid_run_type                 | —                                                      |
| E-6  | Invalid run status          | POST /run-log          | status=invalid                                        | 400 invalid_run_status               | —                                                      |
| F-1  | DB verify agent_run_logs    | POST /run-log          | tokenId=seeded token                                  | 201                                  | agent_run_logs.token_id = seeded token id              |
| F-2  | DB verify run-log isolation | POST /run-log          | store A token                                         | 201                                  | agent_run_logs.store_id = store A id，非 store B       |
| G-1  | Cleanup verification        | （cleanup 後）         | —                                                     | —                                    | 所有 STEP7D*E2E* 資料已移除                            |

---

## 11. 安全邊界

integration test 本身也必須遵守以下安全規範：

| 規範                     | 說明                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| rawToken 只在記憶體      | 不把 rawToken 寫入 DB，不寫入 log，不寫入文件                      |
| 不信任 body 身份         | 測試不嘗試在 body 傳 tokenId/merchantId/storeId 來繞過認證         |
| response 不含 rawPayload | assert.strictEqual(response.rawPayload, undefined)                 |
| 不查其他 store 資料      | cross-store 測試只驗證 API 拒絕，不自行去 DB 查 store B 資料並比對 |
| 不碰真實資料             | 所有 seed 資料都有 STEP7D*E2E* prefix                              |
| 不輸出 DATABASE_URL      | 測試 log 不印出 DATABASE_URL                                       |
| cleanup 有 guard         | testStoreId === null 時 throw，不執行 cleanup                      |

---

## 12. 風險

| 風險                                   | 說明                                                       | 緩解方式                                              |
| -------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| 共享 DB 污染                           | Integration test 對共享 DB 寫入，若 cleanup 失敗留下髒資料 | STEP7D*E2E* prefix + after() guard                    |
| cleanup 失敗                           | DB error 或 FK 順序錯誤導致 cleanup 未完成                 | cleanup 順序嚴格按 FK 反向，after() 內 throw 明確錯誤 |
| 測試 token 洩漏                        | rawToken 被意外寫入 log 或 DB                              | rawToken 只在 test file 記憶體存在，不寫入任何持久層  |
| DB schema drift                        | agent.ts 與 DB 欄位不同步                                  | integration test 本身就是最佳 schema drift 偵測機制   |
| orders 無 merchantId                   | orders 表沒有 merchant_id 欄位，只能以 storeId 做租戶隔離  | 所有測試以 storeId 隔離，不依賴 merchantId            |
| seller_agent_tokens name 欄位 NOT NULL | seed 時必填 name 欄位                                      | 建議 name: 'STEP7D_E2E_token_main'                    |
| orders product_id NOT NULL FK          | seed order 前必須先 seed product                           | cleanup 時 products 在 orders 後刪除                  |
| orders.public_token NOT NULL UNIQUE    | 多次測試可能碰撞                                           | 加 timestamp：STEP7D*E2E_order*<Date.now()>           |
| stores.slug NOT NULL UNIQUE            | 多次測試可能碰撞                                           | 加 timestamp：step7d-e2e-store-<Date.now()>           |
| 測試並發衝突                           | 若多個 integration test 同時執行，seed id 可能碰撞         | 使用 DB RETURNING id，不假設固定 id                   |

---

## 13. 完整 Seed / Cleanup 流程示意

```
before() {
  // 1. 啟動 Express server
  server = await new Promise(resolve => app.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}/api`;

  // 2. Seed store（Main）
  [storeMain] = await db.insert(storesTable).values({
    merchantId: 'STEP7D_E2E_merchant',
    name: 'STEP7D_E2E_store_main',
    slug: `step7d-e2e-main-${Date.now()}`,
  }).returning();

  // 3. Seed store（B，用於跨 store 測試）
  [storeB] = await db.insert(storesTable).values({
    merchantId: 'STEP7D_E2E_merchant_b',
    name: 'STEP7D_E2E_store_b',
    slug: `step7d-e2e-storeb-${Date.now()}`,
  }).returning();

  // 4. Seed product（Main）
  [product] = await db.insert(productsTable).values({
    storeId: storeMain.id,
    name: 'STEP7D_E2E_product',
    price: '100.00',
    shareToken: `step7d-e2e-prod-${Date.now()}`,
    isActive: true,
  }).returning();

  // 5. Seed order（Main）
  [order] = await db.insert(ordersTable).values({
    storeId: storeMain.id,
    productId: product.id,
    buyerName: 'STEP7D_E2E_buyer',
    buyerPhone: '0900000000',
    pickupMethod: 'cvs',
    unitPrice: '100.00',
    totalPrice: '100.00',
    publicToken: `STEP7D_E2E_order_${Date.now()}`,
  }).returning();

  // 6. Seed order（B）
  // ...同上，storeId: storeB.id

  // 7. Seed shipment_tracking（Main）
  [trackingMain] = await db.insert(shipmentTrackingsTable).values({
    orderId: order.id,
    trackingCode: 'STEP7D_E2E_TC001',
    trackingProvider: 'TCAT',
  }).returning();

  // 8. Seed shipment_tracking（B）
  // ...同上，orderId: orderB.id

  // 9. Seed seller_agent_token（Main）
  [tokenMain] = await db.insert(sellerAgentTokensTable).values({
    merchantId: 'STEP7D_E2E_merchant',
    storeId: storeMain.id,
    name: 'STEP7D_E2E_token_main',
    tokenHash: TOKEN_HASH_MAIN,
    tokenPrefix: TOKEN_PREFIX_MAIN,
    status: 'active',
    scopes: ['tracking:read', 'tracking:write', 'run_log:write'],
  }).returning();

  // 10. Seed seller_agent_token（B）
  // ...同上，storeId: storeB.id
}

after() {
  // Guard
  if (!storeMain?.id) throw new Error('storeMain not seeded — cleanup aborted');

  // 1. shipment_tracking_events（by tracking id）
  await db.delete(shipmentTrackingEventsTable)
    .where(inArray(shipmentTrackingEventsTable.shipmentTrackingId,
      [trackingMain?.id, trackingB?.id].filter(Boolean)));

  // 2. agent_run_logs（by store id）
  await db.delete(agentRunLogsTable)
    .where(inArray(agentRunLogsTable.storeId,
      [storeMain?.id, storeB?.id].filter(Boolean)));

  // 3. shipment_trackings（by order id）
  await db.delete(shipmentTrackingsTable)
    .where(inArray(shipmentTrackingsTable.orderId,
      [order?.id, orderB?.id].filter(Boolean)));

  // 4. seller_agent_tokens（by store id）
  await db.delete(sellerAgentTokensTable)
    .where(inArray(sellerAgentTokensTable.storeId,
      [storeMain?.id, storeB?.id].filter(Boolean)));

  // 5. orders（by store id）
  await db.delete(ordersTable)
    .where(inArray(ordersTable.storeId,
      [storeMain?.id, storeB?.id].filter(Boolean)));

  // 6. products（by store id）
  await db.delete(productsTable)
    .where(inArray(productsTable.storeId,
      [storeMain?.id, storeB?.id].filter(Boolean)));

  // 7. stores（by id）
  await db.delete(storesTable)
    .where(inArray(storesTable.id,
      [storeMain?.id, storeB?.id].filter(Boolean)));

  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
```

---

## 14. 下一步建議

| 優先序 | Step                 | 說明                                                                                                 |
| ------ | -------------------- | ---------------------------------------------------------------------------------------------------- |
| 1      | **Step 7D-4B-2**     | 實作 `agent.integration.test.mjs`，按本計畫 seed/cleanup 策略，至少涵蓋 Flow A~E（17 個 test cases） |
| 2      | **Step 7D-4B-3**     | 執行一次最小 E2E 測試並記錄結果（`RUN_AGENT_INTEGRATION_TESTS=1`）                                   |
| 3      | **通過後進 Step 7E** | Seller Agent Workspace UI                                                                            |
| 4      | **Step 7F**          | Agent 安全防護強化（rate limit / kill switch）                                                       |

---

## 15. 非目標（本文件明確排除）

- **不寫 integration test 程式碼**（本文件只做計畫）
- **不 seed DB**
- **不寫入 DB**
- **不修改 API 程式碼**（`agent.ts`、`agent.route.test.mjs` 均未更動）
- **不修改 DB schema**
- **不執行 DB push / drizzle-kit push**
- **不新增 migration**
- **不修改 UI**
- **不做 worker / 排程**
- **不做 Seller Agent Workspace**
