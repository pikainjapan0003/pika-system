# Step 7D-3A：Agent API Route 實作前盤點

> **文件性質**：本文件為 Step 7D-3A 的盤點與設計細化文件，**不包含任何 API route 實作、middleware 程式碼、DB schema 修改或 migration**。
>
> **本文件做什麼**：整理現有 API server 架構、提出 Agent route 檔案位置建議、設計 token middleware 流程、規劃 API 實作順序、規劃測試計畫、明確標示實作風險，以及給出 Step 7D-3B 是否可以開始的判斷。
>
> **本文件不做什麼**：不寫程式碼、不改 schema、不改 API、不做 worker、不做 Seller Agent Workspace UI、不進 Step 7D-3B / Step 7E / 7F / 7G / 7H 施工。

---

## 1. Step 7D-3A 定位

```
Step 7D-0  → 規格文件（已完成，commit df8a78a）
Step 7D-1A → 施工前盤點稽核（已完成，commit f555121）
Step 7D-1B → Agent auth/token 決策文件（已完成，commit d8e460e）
Step 7D-1C → Agent token / run log schema 規格文件（已完成，commit a856f1d）
Step 7D-2A → Agent schema 實作前檢查（已完成，commit f454ab4）
Step 7D-2B → Agent token / run log schema 程式碼（已完成，commit d441fd9）
Step 7D-2C → DB push 前 preflight（已完成）
Step 7D-2D → pg_dump 備份 + drizzle-kit push + DB 驗證（已完成）
Step 7D-3A → 本文件：Agent API route 實作前盤點（只盤點、不實作）
Step 7D-3B → （待後續）Agent token middleware + route skeleton
Step 7D-3C → GET /internal/agent/orders/tracking-jobs
Step 7D-3D → POST /internal/agent/shipment-events
Step 7D-3E → PATCH /internal/agent/shipment-status + POST /internal/agent/run-log
Step 7E    → Seller Agent Workspace UI
Step 7F~7H → 安全強化、業者串接、買家 timeline
```

本文件**明確不做**：

- 不實作 API route
- 不新增 middleware 程式碼
- 不改 DB schema
- 不執行 drizzle-kit push
- 不產生 migration
- 不改 UI
- 不做 worker
- 不做 Seller Agent Workspace
- 不進 Step 7D-3B 實作

---

## 2. 前置狀態確認

本文件撰寫時的 DB 與 Git 狀態：

| 項目                                     | 狀態                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| local main commit                        | `d441fd9` feat-db-step7d-agent-token-run-log-schema                         |
| gitsafe-backup/main                      | `d441fd9`（已同步）                                                         |
| seller_agent_tokens                      | **DB 已存在**，7 個 indexes ✓                                               |
| agent_run_logs                           | **DB 已存在**，7 個 indexes ✓                                               |
| shipment_tracking_events.idempotency_key | **DB 已存在** ✓                                                             |
| typecheck                                | PASS（exit_code=0）                                                         |
| 備份                                     | `/home/runner/backups/backup-pre-step7d-2d-push-20260608060545.sql`（3.6M） |
| Agent API route                          | **尚未實作**（0 個 route 檔案、0 個 middleware）                            |

---

## 3. 現有 API Server 架構盤點

### 3.1 框架與入口

- **框架**：Express.js（`artifacts/api-server/src/app.ts`）
- **API 前綴**：所有 API 掛載在 `/api`（`app.use("/api", router)`）
- **全域 middleware 順序**（依 `app.ts` 實際順序）：
  1. `pinoHttp`（request logging）
  2. `clerkProxyMiddleware`（Clerk 代理）
  3. `cors`（允許 ALLOWED_ORIGINS 或 localhost）
  4. `express.json()` / `express.urlencoded()`
  5. `clerkMiddleware`（Clerk session 注入）
  6. `/api` → router（routes/index.ts）
  7. 404 handler
  8. global error handler

### 3.2 Route 掛載位置（`routes/index.ts`）

```
Router()
  .use(healthRouter)      → /api/health
  .use(publicRouter)      → /api/p/:shareToken、/api/o/:publicToken、/api/submit-order/...
  .use(storesRouter)      → /api/stores/...
  .use(productsRouter)    → /api/stores/:storeId/products/...
  .use(categoriesRouter)  → /api/categories/...
  .use(ordersRouter)      → /api/stores/:storeId/orders/...
  .use(cvsRouter)         → /api/cvs/...
  .use(uploadRouter)      → /api/upload/...
  .use(devHandoffRouter)  → /api/dev-handoff（僅 dev 環境）
```

### 3.3 現有 Route 檔案清單

| 檔案            | 路徑前綴                     | 說明                          |
| --------------- | ---------------------------- | ----------------------------- |
| `health.ts`     | `/health`                    | 健康檢查                      |
| `public.ts`     | `/p/` `/o/` `/submit-order/` | 買家公開端點，無需 Clerk auth |
| `stores.ts`     | `/stores/`                   | 賣家商店管理                  |
| `products.ts`   | `/stores/:storeId/products/` | 商品管理                      |
| `categories.ts` | `/categories/`               | 商品分類                      |
| `orders.ts`     | `/stores/:storeId/orders/`   | 訂單管理（Clerk auth 必要）   |
| `cvs.ts`        | `/cvs/`                      | 超商門市選擇                  |
| `upload.ts`     | `/upload/`                   | 檔案上傳                      |
| `devHandoff.ts` | `/dev-handoff`               | 開發輔助（dev only）          |

### 3.4 現有 Auth 機制

**`middlewares/auth.ts`** 提供兩個 helper：

```
requireAuth(req, res, next)
  → getAuth(req) 取得 Clerk session
  → userId = sessionClaims.userId || userId
  → 設 req.userId，無則 401

verifyStoreOwner(req, res, storeId) → Promise<boolean>
  → 查 storesTable where id = storeId
  → store 不存在 → 404
  → store.merchantId !== req.userId → 403
  → 成功 → return true
```

**用法模式（orders.ts 範例）**：

```typescript
router.get("/stores/:storeId/orders", requireAuth, async (req, res) => {
  const storeId = parseInt(req.params.storeId);
  if (!(await verifyStoreOwner(req, res, storeId))) return;
  // ...
});
```

**重點觀察**：

- 現有 auth 完全依賴 Clerk session（cookie-based）
- `requireAuth` 是 middleware function，掛在 route handler 之前
- `verifyStoreOwner` 是 async helper，在 handler 內呼叫
- **沒有任何 Bearer token / API key 驗證機制**
- **沒有 Authorization header 解析邏輯**

### 3.5 現有測試檔案與測試框架

| 測試檔案                | 對應 route | 框架                          |
| ----------------------- | ---------- | ----------------------------- |
| `orders.route.test.mjs` | orders.ts  | Node.js `node:test` + 真實 DB |
| `cvs.route.test.mjs`    | cvs.ts     | Node.js `node:test` + 真實 DB |
| `public.route.test.mjs` | public.ts  | Node.js `node:test` + 真實 DB |

**測試慣例**：

- `mock.module('@clerk/express', ...)` 在 import 前 mock Clerk
- `getAuth` 改為讀取 `x-test-user-id` header
- 真實 DB（`DATABASE_URL`），測試自行建立 / 清理資料
- `before` / `after` 管理 server 生命週期
- 使用 `fetch` 做 HTTP 請求（不需 supertest）
- 測試檔使用 `.mjs` 副檔名（ESM module）

---

## 4. Agent API Route 建議檔案位置

### 4.1 方案比較

| 方案          | 檔案位置                                           | 優點                       | 缺點                                              |
| ------------- | -------------------------------------------------- | -------------------------- | ------------------------------------------------- |
| **A（建議）** | `artifacts/api-server/src/routes/agent.ts`         | 命名直接，路徑簡單，易搜尋 | 名字較通用                                        |
| B             | `artifacts/api-server/src/routes/internalAgent.ts` | 明確標示 internal          | 檔名較長                                          |
| C             | 放進現有 `orders.ts`                               | 不需新檔案                 | 混入買家訂單邏輯，auth 機制完全不同，必定造成混亂 |
| D             | 放進現有 `public.ts`                               | —                          | **嚴格禁止**：public 是無 auth 買家端點           |

**MVP 建議：方案 A**

- 新增 `artifacts/api-server/src/routes/agent.ts`
- 路由前綴：`/internal/agent/`（最終掛載在 `/api/internal/agent/`）
- 在 `routes/index.ts` 新增 `router.use(agentRouter)`
- 同時建議新增 `middlewares/agentAuth.ts`（存放 token middleware）

**不放 public route 原因**：public route 無 auth、給買家使用，Agent API 有獨立 token auth，絕不可混入。

**不放 orders route 原因**：orders route 的 auth 模型是 Clerk session + verifyStoreOwner，Agent API 的 auth 模型是 Bearer token hash 查詢，兩者完全不同，強行合併將使兩種 auth 邏輯相互汙染。

---

## 5. Agent Token Middleware 設計

### 5.1 請求驗證流程（不含程式碼）

```
1. 解析 Authorization header
   → 格式：Authorization: Bearer <token>
   → 無 header → 401 { error: "Missing Authorization header" }
   → 格式錯誤（非 Bearer 或空值）→ 401 { error: "Invalid Authorization format" }

2. 對 token 明文做 SHA-256 hash
   → hash 演算法必須與 token 建立時一致（Step 7D-3B 定案）
   → token 明文在驗證後立即丟棄，不存入任何變數長時間保留

3. 查詢 seller_agent_tokens.tokenHash = hash(token)
   → 找不到 → 401 { error: "Invalid token" }（不可洩漏「找不到」或「hash 不符」的細節）

4. 狀態檢查（依序）
   a. status !== 'active'        → 401 { error: "Token is not active" }
   b. expiresAt != null && expiresAt < now → 401 { error: "Token has expired" }
   c. revokedAt != null          → 401 { error: "Token has been revoked" }（通常 status 已是 revoked，此為防禦性檢查）

5. 取出 merchantId + storeId
   → 從 token record 取得，不信任 request body
   → 注入 req.agentToken = { id, merchantId, storeId, scopes }

6. 非同步更新 lastUsedAt
   → 背景更新（fire-and-forget 或 setImmediate）
   → 不阻塞主流程
   → 失敗不影響本次 request（僅 log warning）

7. 進入 route handler
```

### 5.2 重要安全原則

| 原則                                      | 說明                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------- |
| token 原文只在 header                     | 不接受 body / query 中的 token 參數                                  |
| tokenPrefix 不參與驗證                    | 只用於管理介面顯示，不可用於比對                                     |
| merchantId / storeId 只從 token record 取 | request body 的 merchantId 不可信，不可用於決定權限                  |
| 錯誤訊息不洩漏細節                        | "Invalid token" 涵蓋所有找不到的情況，避免 timing/enumeration attack |
| lastUsedAt 非同步更新                     | 避免每次 request 都同步寫 DB 增加延遲                                |

### 5.3 middleware 建議位置

- 新增 `artifacts/api-server/src/middlewares/agentAuth.ts`
- 匯出 `agentTokenAuth` middleware function
- 匯出 `requireAgentScope(scope: string)` helper（MVP 暫不強制，可 Phase 2 補）
- `agent.ts` route 所有 handler 必須先過 `agentTokenAuth`

---

## 6. merchantId + storeId Scope 檢查流程

### 6.1 Token 層級的 scope 建立

```
Token 建立時：
  merchantId + storeId 由賣家（透過 Seller Agent Workspace）指定
  → 綁定到 seller_agent_tokens.merchantId / storeId
  → 不可在 API 呼叫時動態改變

Token 驗證後：
  req.agentToken.merchantId = "clerk_merchant_xyz"
  req.agentToken.storeId = 42
```

### 6.2 每個 API handler 的 scope 檢查責任

**GET tracking-jobs**：

```
1. agentTokenAuth 確認 token 有效
2. 查詢 shipment_trackings JOIN orders WHERE orders.storeId = req.agentToken.storeId
3. 不接受 query 帶入不同 storeId
```

**POST shipment-events**：

```
1. agentTokenAuth 確認 token 有效
2. 從 body 取 shipmentTrackingId
3. 查 shipment_trackings → orderId
4. 查 orders where id = orderId AND storeId = req.agentToken.storeId
   → 查不到或 storeId 不符 → 404（不回 403，避免 enumeration）
5. 確認 ownership 後才寫入 shipment_tracking_events
```

**PATCH shipment-status**：

```
1. agentTokenAuth 確認 token 有效
2. 從 body 取 shipmentTrackingId
3. 同上：透過 orders 確認 storeId ownership
4. 更新 shipment_trackings 欄位
```

**POST run-log**：

```
1. agentTokenAuth 確認 token 有效
2. merchantId + storeId 強制從 req.agentToken 取，body 不可覆蓋
3. tokenId = req.agentToken.id（token record 的 PK）
```

### 6.3 跨店保護原則

- **A 店 token 不可查 B 店資料**：所有資料查詢必須加 `storeId = req.agentToken.storeId` 條件
- **shipmentTrackingId ownership 必須透過 orders 關聯確認**，不可讓 Agent 直接用數字 ID 存取任意 tracking
- **storeId 不可從 request body 帶入**：即使 body 包含 `storeId` 欄位，一律忽略，以 token record 為準

---

## 7. API 實作順序建議

### 7.1 建議順序

```
Phase 1（Step 7D-3B）：
  → agentTokenAuth middleware（agentAuth.ts）
  → route skeleton（agent.ts，無 handler 邏輯，只有路由宣告 + middleware 掛載 + 暫回 501）
  → 在 routes/index.ts 掛載 agentRouter
  → 對應測試：agent.route.test.mjs（只測 auth middleware）

Phase 2（Step 7D-3C）：
  → GET /internal/agent/orders/tracking-jobs

Phase 3（Step 7D-3D）：
  → POST /internal/agent/shipment-events

Phase 4（Step 7D-3E）：
  → PATCH /internal/agent/shipment-status
  → POST /internal/agent/run-log
```

### 7.2 各 API 詳細規劃

---

#### API-1：Agent Token Middleware

| 項目         | 內容                                   |
| ------------ | -------------------------------------- |
| 用途         | 驗證 Bearer token，注入 req.agentToken |
| 建議位置     | `middlewares/agentAuth.ts`             |
| 查詢資料表   | `seller_agent_tokens`（by tokenHash）  |
| 必要權限檢查 | status=active、expiresAt、revokedAt    |
| 測試重點     | 見第 14 章測試計畫                     |
| MVP 是否要做 | **是**（所有 Agent API 前置依賴）      |

---

#### API-2：GET /internal/agent/orders/tracking-jobs

| 項目              | 內容                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| 用途              | Agent 取得需要查詢的物流任務列表                                                                     |
| 建議 handler 位置 | `routes/agent.ts`                                                                                    |
| 查詢資料表        | `shipment_trackings` JOIN `orders`（WHERE orders.storeId = token.storeId）                           |
| 必要權限檢查      | agentTokenAuth + storeId scope                                                                       |
| 回傳欄位（安全）  | trackingId, trackingCode, trackingProvider, trackingStatus, nextCheckAt, lastCheckedAt, failureCount |
| 禁止回傳欄位      | buyerName, buyerPhone, recipientPhone, recipientAddress, internalNote, paymentNote, rawData          |
| 選填篩選          | `status`（如只查 pending/active）、`limit`（預設 50）、`nextCheckBefore`（時間篩選）                 |
| 狀態白名單        | 見第 13 章 trackingStatus                                                                            |
| 測試重點          | 不洩漏個資、storeId scope 隔離                                                                       |
| MVP 是否要做      | **是**                                                                                               |

---

#### API-3：POST /internal/agent/shipment-events

| 項目              | 內容                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| 用途              | Agent 寫入貨態事件（timeline 記錄）                                                                                |
| 建議 handler 位置 | `routes/agent.ts`                                                                                                  |
| 查詢資料表        | `shipment_tracking_events`（寫入）、`shipment_trackings`（查 ownership + 更新 snapshot）、`orders`（確認 storeId） |
| 必要權限檢查      | agentTokenAuth + ownership（shipmentTrackingId → orderId → storeId）                                               |
| 必要狀態白名單    | `eventStatus`（見第 13 章）                                                                                        |
| idempotencyKey    | 提供時透過 unique index 防重（ON CONFLICT DO NOTHING 或 UNIQUE violation catch）                                   |
| rawPayload 清洗   | 寫入 rawData 前，移除第 12 章列出的敏感欄位                                                                        |
| 寫入後動作        | 在同一 transaction 內更新 `shipment_trackings.latestEventStatus / latestEventDescription / latestEventAt`          |
| 禁止行為          | 不可接受跨店 shipmentTrackingId、不可把外部 error stack 寫入公開欄位                                               |
| 測試重點          | idempotencyKey 防重、eventStatus 白名單、rawPayload 清洗、storeId scope                                            |
| MVP 是否要做      | **是**                                                                                                             |

---

#### API-4：PATCH /internal/agent/shipment-status

| 項目              | 內容                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| 用途              | Agent 更新物流任務狀態與查詢控制欄位                                  |
| 建議 handler 位置 | `routes/agent.ts`                                                     |
| 查詢資料表        | `shipment_trackings`（更新）、`orders`（確認 storeId）                |
| 必要權限檢查      | agentTokenAuth + storeId ownership                                    |
| 可更新欄位        | trackingStatus、lastCheckedAt、nextCheckAt、failureCount、checkError  |
| 必要狀態白名單    | `trackingStatus`（見第 13 章）                                        |
| checkError 清洗   | 移除 stack / trace / credential 相關內容，長度截斷（建議 ≤ 500 字元） |
| 禁止行為          | 不可直接改 orders 金額 / 商品 / 客戶資料                              |
| 測試重點          | trackingStatus 白名單、storeId scope、checkError 清洗                 |
| MVP 是否要做      | **是**                                                                |

---

#### API-5：POST /internal/agent/run-log

| 項目                 | 內容                                                                               |
| -------------------- | ---------------------------------------------------------------------------------- |
| 用途                 | Agent 寫入執行記錄（每次 run 的開始 / 完成 / 失敗）                                |
| 建議 handler 位置    | `routes/agent.ts`                                                                  |
| 查詢資料表           | `agent_run_logs`（寫入）                                                           |
| 必要權限檢查         | agentTokenAuth                                                                     |
| tokenId              | 強制使用 req.agentToken.id（不可由 body 帶入）                                     |
| merchantId / storeId | 強制使用 req.agentToken.merchantId / storeId                                       |
| 必要白名單           | runType、status（見第 13 章）                                                      |
| 數量欄位限制         | checkedCount / successCount / failedCount 不可為負（schema check constraint 已有） |
| errorMessage 清洗    | 不可含 token 明文、敏感憑證、個資、完整 stack trace（schema 已有 comment）         |
| 禁止行為             | 買家公開頁不可讀 agent_run_logs                                                    |
| 測試重點             | runType/status 白名單、負數防禦、errorMessage 清洗、public route 不可讀            |
| MVP 是否要做         | **是**                                                                             |

---

## 8. GET tracking-jobs 資料設計

### 8.1 查詢邏輯

```
SELECT
  st.id as trackingId,
  st.tracking_code as trackingCode,
  st.tracking_provider as trackingProvider,
  st.tracking_status as trackingStatus,
  st.next_check_at as nextCheckAt,
  st.last_checked_at as lastCheckedAt,
  st.failure_count as failureCount
FROM shipment_trackings st
JOIN orders o ON o.id = st.order_id
WHERE
  o.store_id = req.agentToken.storeId
  AND st.is_active = true
  AND (status filter if provided)
  AND (nextCheckAt filter if provided)
ORDER BY st.next_check_at ASC NULLS LAST
LIMIT :limit (default 50, max 200)
```

### 8.2 安全邊界

- **絕不回傳**：buyerName, buyerPhone, recipientPhone, recipientAddress, internalNote, paymentNote, rawData, rawPayload
- rawData / rawPayload 永遠不可流出 Agent API
- orderId 可選擇性回傳（Agent 需要用來 log），但不回傳訂單金額與個資

---

## 9. POST shipment-events 資料設計

### 9.1 Request body（預期欄位）

```json
{
  "shipmentTrackingId": 123,
  "eventStatus": "in_transit",
  "eventCode": "DEPT",
  "eventDescription": "包裹已離開轉運站",
  "eventLocation": "台北轉運站",
  "occurredAt": "2026-06-08T10:00:00Z",
  "idempotencyKey": "run-456-event-789",
  "rawData": {
    /* 清洗後的原始業者資料 */
  }
}
```

### 9.2 idempotencyKey 防重策略

- 若提供 idempotencyKey：嘗試插入，若 unique index 衝突（`(shipmentTrackingId, idempotencyKey)`）→ 視為重複請求，回傳 200（冪等成功），不重複寫入
- 若未提供 idempotencyKey：直接插入（schema 允許 nullable）
- 注意：PostgreSQL unique constraint 對 NULL 不做唯一性檢查，所以多筆 null idempotencyKey 不會衝突

### 9.3 Transaction 邊界

```
BEGIN
  INSERT INTO shipment_tracking_events (...) → 一筆新事件
  UPDATE shipment_trackings SET
    latest_event_status = eventStatus,
    latest_event_description = eventDescription,
    latest_event_at = occurredAt,
    updated_at = NOW()
  WHERE id = shipmentTrackingId
COMMIT
```

失敗時整筆 ROLLBACK，不留下部分寫入。

---

## 10. PATCH shipment-status 資料設計

### 10.1 Request body（預期欄位，全部 optional）

```json
{
  "shipmentTrackingId": 123,
  "trackingStatus": "active",
  "lastCheckedAt": "2026-06-08T10:00:00Z",
  "nextCheckAt": "2026-06-08T14:00:00Z",
  "failureCount": 0,
  "checkError": null
}
```

### 10.2 可更新欄位說明

| 欄位           | 類型                  | 限制                 |
| -------------- | --------------------- | -------------------- |
| trackingStatus | string                | 白名單（見第 13 章） |
| lastCheckedAt  | ISO timestamp         | 必須是合法時間字串   |
| nextCheckAt    | ISO timestamp or null | null 表示清除排程    |
| failureCount   | integer               | >= 0                 |
| checkError     | string or null        | 清洗後，≤ 500 字元   |

### 10.3 禁止更新欄位

- orderId（不可換訂單）
- trackingCode / trackingProvider（若需修改，應建新 tracking 記錄）
- orders 表任何欄位

---

## 11. POST run-log 資料設計

### 11.1 Request body（預期欄位）

```json
{
  "runType": "scheduled",
  "status": "completed",
  "startedAt": "2026-06-08T10:00:00Z",
  "finishedAt": "2026-06-08T10:05:00Z",
  "checkedCount": 10,
  "successCount": 9,
  "failedCount": 1,
  "errorCode": "NETWORK_TIMEOUT",
  "errorMessage": "連線超時，已重試 3 次"
}
```

### 11.2 強制注入欄位（Handler 從 req.agentToken 取，不接受 body 覆蓋）

- `merchantId` = req.agentToken.merchantId
- `storeId` = req.agentToken.storeId
- `tokenId` = req.agentToken.id

---

## 12. rawPayload / Error 清洗規則（MVP）

### 12.1 rawData 清洗（POST shipment-events 的 rawData 欄位）

在將 rawData 寫入 DB 前，遞迴移除以下 key（不分大小寫）：

```
phone
address
email
payment
token
password
authorization
cookie
set-cookie
stack
trace
secret
credential
```

### 12.2 errorMessage 清洗（PATCH shipment-status 的 checkError、POST run-log 的 errorMessage）

- 字串截斷：≤ 500 字元
- 禁止包含：完整 stack trace、token 明文、exception 物件序列化（`Error: ... at ...` 格式）
- 應只包含：人類可讀的錯誤摘要（如 "連線超時"、"業者 API 回傳 503"）

### 12.3 注意事項

- 清洗邏輯應集中於 helper function（如 `lib/sanitize.ts`），不要在各 handler 內重複
- MVP 清洗可能不足（業者資料格式多樣），後續需補強
- 清洗後的 rawData 仍不可出現在買家公開 API 回傳中

---

## 13. 狀態白名單

### 13.1 eventStatus（shipment_tracking_events）

```
unknown
pending
in_transit
arrived_store
picked_up
delivered
returned
exception
```

（源自 schema `shipmentTrackingEventStatusEnum`，與 DB check constraint 一致）

### 13.2 trackingStatus（shipment_trackings）

```
pending
checking
active
delivered
failed
inactive
```

（源自 schema `shipmentTrackingStatusEnum`，Step 7D-3E 僅允許 Agent 更新部分值；`delivered` / `inactive` 是終態，Agent 更新時需特別確認 transition 合理性）

### 13.3 runType（agent_run_logs）

```
manual
scheduled
webhook
csv_after_import
test
```

（源自 schema `agentRunTypeEnum`，DB check constraint 已有防護）

### 13.4 run log status（agent_run_logs）

```
running
completed
failed
partial
```

（源自 schema `agentRunStatusEnum`，DB check constraint 已有防護）

---

## 14. 測試計畫

### 14.1 Agent Token Middleware 測試

| 測試案例                                      | 預期結果                          |
| --------------------------------------------- | --------------------------------- |
| 無 Authorization header                       | 401 Missing Authorization header  |
| `Authorization: token abc` （非 Bearer 格式） | 401 Invalid Authorization format  |
| `Authorization: Bearer ` （空 token）         | 401 Invalid Authorization format  |
| Bearer token 格式正確但 hash 查不到           | 401 Invalid token                 |
| token 存在但 status = 'revoked'               | 401 Token is not active           |
| token 存在但 status = 'expired'               | 401 Token is not active           |
| token 存在但 status = 'disabled'              | 401 Token is not active           |
| token 存在但 expiresAt 已過期                 | 401 Token has expired             |
| 有效 token（status = 'active'，未過期）       | 200，req.agentToken 注入正確      |
| token 屬於 store A，但嘗試存取 store B 的資料 | 404（不回 403，避免 enumeration） |

### 14.2 GET tracking-jobs 測試

| 測試案例                                   | 預期結果                               |
| ------------------------------------------ | -------------------------------------- |
| 正常請求（有效 token）                     | 200，回傳 tracking list                |
| 回傳不含 buyerPhone                        | response body 無 buyerPhone 欄位       |
| 回傳不含 recipientAddress                  | response body 無 recipientAddress 欄位 |
| 回傳不含 rawData                           | response body 無 rawData 欄位          |
| Store A token 只能看到 Store A 的 tracking | Store B 的 tracking 不出現             |

### 14.3 POST shipment-events 測試

| 測試案例                                 | 預期結果                             |
| ---------------------------------------- | ------------------------------------ |
| 正常寫入（有效 token + 正確欄位）        | 201                                  |
| 相同 idempotencyKey 重複送出             | 200（冪等，不重複寫入）              |
| idempotencyKey = null 多次送出           | 每次都新增一筆（null 不觸發 unique） |
| eventStatus = 'invalid_status'           | 400                                  |
| eventStatus 在白名單內                   | 201                                  |
| 嘗試寫入其他 store 的 shipmentTrackingId | 404                                  |
| rawData 含 phone 欄位                    | DB 中 rawData 不含 phone             |
| rawData 含 stack trace                   | DB 中 rawData 不含 stack             |

### 14.4 PATCH shipment-status 測試

| 測試案例                       | 預期結果                          |
| ------------------------------ | --------------------------------- |
| 正常更新（有效 token）         | 200                               |
| trackingStatus 不在白名單      | 400                               |
| 嘗試更新其他 store 的 tracking | 404                               |
| checkError 含完整 stack trace  | DB 儲存的 checkError 為清洗後摘要 |

### 14.5 POST run-log 測試

| 測試案例                         | 預期結果                          |
| -------------------------------- | --------------------------------- |
| 正常寫入                         | 201                               |
| runType 不在白名單               | 400                               |
| status 不在白名單                | 400                               |
| body 帶入 merchantId（嘗試覆蓋） | merchantId 使用 token record 的值 |
| body 帶入 storeId（嘗試覆蓋）    | storeId 使用 token record 的值    |

### 14.6 Public API 隔離測試

| 測試案例                                     | 預期結果 |
| -------------------------------------------- | -------- |
| GET /o/:publicToken 不含 agent_run_logs 資料 | 確認     |
| GET /o/:publicToken 不含 rawData             | 確認     |
| GET /p/:shareToken 不觸及 agent_run_logs     | 確認     |

---

## 15. 實作風險

| 風險                                     | 說明                                                                                                                                         | 嚴重度 | 建議處理時機      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------- |
| Token hash 演算法未定案                  | SHA-256 是預設方向，但 token 建立時的 hash 函式必須與驗證時一致；Step 7D-3B 開始前需明確定案                                                 | 高     | Step 7D-3B 前     |
| lastUsedAt 更新是否每次都寫 DB           | 背景更新可降低延遲，但若 DB 連線繁忙時 fire-and-forget 可能靜默失敗；MVP 可接受，後續需監控                                                  | 中     | MVP 後            |
| idempotencyKey unique index 對 null 行為 | PostgreSQL 允許多筆 null（已在 schema comment 記錄）；API handler 需確保 null idempotencyKey 的防重策略明確                                  | 中     | Step 7D-3D 前確認 |
| rawPayload 清洗初版可能不足              | 業者 API 回傳格式多樣，初版清洗 key list 可能未涵蓋所有情境；需建立後續補充機制                                                              | 中     | MVP 後持續補強    |
| rate limit 尚未做                        | Agent route 目前無 rate limit；短期內風險低（token 必須有效），但長期需補                                                                    | 低     | Step 7F           |
| audit log 尚未做                         | 現無完整的 token 使用 audit log；lastUsedAt 是唯一的使用記錄                                                                                 | 低     | Step 7F           |
| kill switch 尚未做                       | 目前若 token 被濫用，只能手動更新 status = revoked；需 Seller Agent Workspace UI 才能自助操作                                                | 低     | Step 7E           |
| Agent route 不可暴露給買家公開頁         | `/api/internal/agent/` 前綴本身不保證安全；必須在每個 handler 掛 agentTokenAuth                                                              | 高     | Step 7D-3B 確認   |
| publicToken 與 Agent token 不可混用      | 兩個 auth 機制完全不同；不可在同一 middleware 鏈中混淆兩者                                                                                   | 高     | Step 7D-3B 確認   |
| step transition 複雜度                   | trackingStatus 的合法轉換（如 failed → active 是否允許）目前未定義 white list；MVP 先允許 Agent 設定任意合法狀態值，後續再補 transition 驗證 | 低     | Step 7D-3E 後     |

---

## 16. 是否可進 Step 7D-3B

### 16.1 判斷結論

**可以進入 Step 7D-3B**，條件如下：

1. 接受本文件的路由切分方案（新增 `agent.ts` + `agentAuth.ts`）
2. Step 7D-3B 只做 token middleware + route skeleton（暫回 501），不做完整 handler
3. token hash 演算法在 Step 7D-3B 開始前明確定案（建議 SHA-256）

### 16.2 Step 7D-3B 建議範圍（精確）

- 新增 `middlewares/agentAuth.ts`（agentTokenAuth middleware 完整實作）
- 新增 `routes/agent.ts`（4 個 route 宣告 + agentTokenAuth 掛載，handler 暫回 501 Not Implemented）
- 修改 `routes/index.ts`（加入 agentRouter）
- 新增 `routes/agent.route.test.mjs`（只測 auth middleware：無 token / invalid token / 有效 token）
- **不做**：任何一個 handler 的完整邏輯

### 16.3 不建議做的事

- 不建議 Step 7D-3B 一次完成全部 API handler
- 不建議直接做 worker（Step 7G）
- 不建議進 Step 7E（Seller Agent Workspace UI）

---

## 17. 下一步建議

| 步驟           | 內容                                                                                 | 狀態                 |
| -------------- | ------------------------------------------------------------------------------------ | -------------------- |
| **Step 7D-3B** | Agent token middleware（agentAuth.ts）+ route skeleton（agent.ts）+ auth 測試        | **下一步**（可開始） |
| Step 7D-3C     | GET /internal/agent/orders/tracking-jobs 完整實作 + 測試                             | 待 7D-3B 完成後      |
| Step 7D-3D     | POST /internal/agent/shipment-events 完整實作 + 測試                                 | 待 7D-3C 後          |
| Step 7D-3E     | PATCH /internal/agent/shipment-status + POST /internal/agent/run-log 完整實作 + 測試 | 待 7D-3D 後          |
| Step 7E        | Seller Agent Workspace UI                                                            | 待 7D-3E 後          |

**明確不建議**：

- 不建議直接做 worker（Step 7G）
- 不建議進 Seller Agent Workspace（Step 7E）跳過 Step 7D-3B～7D-3E
