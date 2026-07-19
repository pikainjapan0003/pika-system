# Step 7D-1A：Agent 寫入 API 施工前盤點稽核（Implementation Audit）

> **文件性質聲明**：本文件為 **Step 7D-1A 施工前盤點 / 稽核文件**，目的是調查現有程式碼、auth 模型、DB schema 現況，並對照 Step 7D-0 規格文件（`docs/order-step7d-agent-write-api-spec.md`，commit `df8a78a`）盤點落差、提出 MVP 切分與 token 方案選項比較。
>
> **本文件不包含任何 API 實作、不修改任何程式碼、不建立任何資料表**。所有「建議」均為待 Step 7D-1B 決策後才會進入 Step 7D-2 實作階段。

---

## 1. 定位（本文件在 Step 7D 系列中的位置）

```
Step 7D-0  → 規格文件（已完成，commit df8a78a，已 push gitsafe-backup/main）
Step 7D-1A → 本文件：施工前盤點 / 稽核（只調查、不實作）
Step 7D-1B → （待後續）決定 MVP auth/token 方案、決定需要新增的資料表 schema
Step 7D-2  → （待後續）API route 實作
Step 7E~7H → （待後續）Agent worker 實作、上線、監控
```

本文件的角色是「在動工前先把地基探勘清楚」：

- 確認 Step 7D-0 規格中描述的概念（`sellerId`、`storeId`、Agent token、權限隔離…）在現有程式碼中是否已有對應實作、命名是否一致
- 找出規格與現況之間的落差，作為 Step 7D-1B 決策的輸入
- 列出潛在新增 API route 的清單與風險評估，但**不決定**最終要採用哪一個方案
- 比較 Agent token 的可能實作選項，**不選定**最終方案（留給 Step 7D-1B）

---

## 2. 現有 API Server 架構盤點

### 2.1 框架與掛載方式

- 技術棧：Express.js（`artifacts/api-server/src/app.ts`）
- 所有業務路由統一掛載在 `/api` 前綴下：`app.use("/api", router)`
- Middleware 順序：`pino-http`（日誌）→ Clerk proxy middleware → CORS allowlist（`ALLOWED_ORIGINS` 環境變數，預設 `localhost:5173` / `localhost:3000`）→ `express.json()` / `express.urlencoded()` → `clerkMiddleware()`（注入 session）→ 業務路由 → 404 handler → 錯誤 handler

### 2.2 路由組合模式（Route Composition Pattern）

`artifacts/api-server/src/routes/index.ts`：每個業務領域是獨立檔案，各自 export 一個 Express `Router`，最後在 `index.ts` 用 `router.use()` 組合：

```
healthRouter / publicRouter / storesRouter / productsRouter /
categoriesRouter / ordersRouter / cvsRouter / uploadRouter /
devHandoffRouter（僅非 production 環境掛載）
```

若 Step 7D-2 要新增 Agent 寫入 API，依現有慣例應該是**新增一個獨立路由檔案**（例如 `routes/agent.ts`）並在 `index.ts` 中 `router.use()` 掛載，而不是塞進現有的 `orders.ts` 或 `cvs.ts`。

### 2.3 現有路由檔案總覽

```
routes/health.ts        — 健康檢查（無 auth）
routes/public.ts        — 買家端公開查詢（無 Clerk session，靠 publicToken + rate limit）
routes/stores.ts        — 商店管理（Clerk session + verifyStoreOwner）
routes/products.ts      — 商品管理（Clerk session + verifyStoreOwner）
routes/categories.ts    — 分類管理（Clerk session + verifyStoreOwner）
routes/orders.ts        — 訂單管理（Clerk session + verifyStoreOwner，含 Step 7B tracking-import）
routes/cvs.ts           — 超商門市資料（Step 6 系列）
routes/upload.ts        — 圖片上傳
routes/devHandoff.ts    — 開發用，僅非 production 環境掛載
```

### 2.4 共用 lib

```
lib/logger.ts             — pino logger
lib/orderStatusMachine.ts — 訂單狀態機（轉換規則）
lib/r2.ts                 — Cloudflare R2 物件儲存
```

`lib/orderStatusMachine.ts` 與 `routes/orders.route.test.mjs` 目前在主工作區顯示為 modified（疑似其他工作線正在進行中，詳見第 10 節風險）。

---

## 3. 現有權限 / Auth / Token 盤點

### 3.1 現有 auth 機制：Clerk Session-based

`artifacts/api-server/src/middlewares/auth.ts`（完整檔案，僅兩個函式）：

```typescript
export const requireAuth = (req, res, next) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
};

export const verifyStoreOwner = async (req, res, storeId) => {
  const store = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, storeId))
    .limit(1);
  if (store.length === 0) {
    res.status(404).json({ error: "Store not found" });
    return false;
  }
  if (store[0].merchantId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
};
```

**重點**：

- 整個系統**只有兩種 auth 機制**：
  1. **Clerk session**（`requireAuth` + `getAuth(req)`，給商店經營者用的後台）
  2. **publicToken**（給買家公開查詢用，無 session，見 3.3）
- **完全沒有**任何形式的「內部 token / agent token / API key / service account」機制

### 3.2 ⚠️ 關鍵發現：「sellerId」在現有程式碼中不存在

Step 7D-0 規格文件（`docs/order-step7d-agent-write-api-spec.md`）中多處使用 **`sellerId` / `storeId`** 並列的措辞描述權限隔離範圍。

但經過全文 grep 確認：

```
grep -Rn "sellerId" — 0 個結果（整個 codebase 都沒有 sellerId 這個欄位或概念）
```

實際的資料模型是：

| 規格文件用語                             | 實際對應     | 型別 / 位置                                             |
| ---------------------------------------- | ------------ | ------------------------------------------------------- |
| `sellerId`（規格中暗示的「賣家」識別碼） | `merchantId` | `text`，`storesTable.merchantId`，值為 Clerk user ID    |
| `storeId`（規格中的「商店」識別碼）      | `storeId`    | `integer` FK，存在於 `ordersTable` / `productsTable` 等 |

也就是說：**系統中「賣家」就是「商店的 Clerk 擁有者（merchant）」**，沒有獨立的 sellers 資料表，也沒有 `sellerId` 欄位。`verifyStoreOwner` 的權限模型是 `merchantId === req.userId`（Clerk user ID 字串比對），而不是某個整數型 `sellerId`。

**影響**：Step 7D-0 規格中所有提到 `sellerId` 的權限隔離敘述，在實作時都必須轉譯為「`merchantId`（Clerk user ID）+ `storeId`（integer FK）」的雙層範圍檢查，而不是字面上去找一個不存在的 `sellerId` 欄位。此落差已記錄於第 10 節，建議在 Step 7D-1B 決策時一併修正規格用語或在實作文件中加註對應關係，避免後續 worker 依照規格字面去找不存在的欄位。

### 3.3 publicToken（買家端公開查詢 token）—— 與「Agent token」是兩個不同概念

`artifacts/api-server/src/routes/public.ts`（約 220-270 行）：

- 路由：`GET /orders/track/:publicToken`
- `publicToken`：`ordersTable` 上的 16 bytes 隨機 hex token（unique），給**買家**用來公開查詢自己訂單的物流狀態
- 有獨立的 `trackOrderLimiter` rate limiting
- 該路由的程式碼中有**明確的隱私排除註解區塊**，列出絕對不可回傳給公開端點的欄位：`internalNote`、`paymentNote`、`paidAmount`、`recipientPhone`、`recipientAddress`、`shippingNote`、`recipientName`、`paymentMethod`、`paymentStatus`、`remainingAmount`

**這個「公開查詢 token + 隱私欄位白名單排除」的既有模式，是未來 Agent API 在處理 `rawPayload` 清洗時可以直接參考、延伸的既有先例**——同樣是「對外暴露最小資訊集合」的設計哲學，可以沿用同一套思路來定義 Agent 寫入時哪些欄位可寫、哪些欄位嚴禁寫入或外洩。

但 **`publicToken` 與規格文件中設想的「Agent token」是兩個完全不同的概念**：

|            | `publicToken`（已存在）                   | Agent token（規格中設想，尚未存在）     |
| ---------- | ----------------------------------------- | --------------------------------------- |
| 使用者     | 買家（無 Clerk 帳號）                     | 賣家自己的 Agent / worker（自動化程式） |
| 權限       | 唯讀，且嚴格欄位白名單                    | 規格設想為可寫入物流事件、可更新貨態    |
| 存放位置   | `ordersTable.publicToken`（每筆訂單一個） | 尚無資料表（規格設想需新增）            |
| Rate limit | 已有 `trackOrderLimiter`                  | 規格中設想需要，但尚未實作              |

**不應混用或重用 `publicToken` 機制來實作 Agent token**，兩者的信任模型、暴露範圍、生命週期完全不同。

### 3.4 現有 trackingCode / trackingProvider 欄位分布

兩處都有，需注意不要混淆：

- `ordersTable.trackingCode` / `ordersTable.trackingProvider`（Step 7B，單一物流單）
- `shipmentTrackingsTable.trackingCode` / `shipmentTrackingsTable.trackingProvider`（Step 7C，物流追蹤查詢任務的主表）

---

## 4. 現有 DB Schema 盤點

`lib/db/src/schema/index.ts` 目前匯出的所有 schema：

```
stores.ts                — storesTable（含 merchantId, 無 sellerId）
productCategories.ts
products.ts
orders.ts                — ordersTable（含 storeId, publicToken, trackingCode, trackingProvider, shippingStatus）
cvsStores.ts
shipmentTrackings.ts     — shipmentTrackingsTable（Step 7C，已建表）
shipmentTrackingEvents.ts — shipmentTrackingEventsTable（Step 7C，已建表）
```

### 4.1 `shipmentTrackingsTable`（Step 7C，已於 7C-4B 建立於 DB）

```typescript
shipmentTrackingsTable = {
  id, orderId (FK → orders, cascade),
  trackingCode, trackingProvider,
  isActive, trackingStatus (enum: pending/checking/active/delivered/failed/inactive),
  lastCheckedAt, nextCheckAt, failureCount, checkError,
  latestEventStatus, latestEventDescription, latestEventAt,  // ← 註解明確標示「Step 7D worker 寫入」
  createdAt, updatedAt
}
```

**關鍵觀察**：`latestEventStatus` / `latestEventDescription` / `latestEventAt` 三個欄位的 schema 註解直接寫明「Step 7D worker 寫入」——這代表 **Step 7C 的 schema 設計階段已經預留了 Step 7D Agent 寫入的目標欄位**，Agent Write API 的其中一個核心職責就是讓 Agent 能夠合法地更新這三個欄位（以及透過寫入 `shipmentTrackingEventsTable` 來連動更新它們）。

### 4.2 `shipmentTrackingEventsTable`（Step 7C，已於 7C-4B 建立於 DB）

```typescript
shipmentTrackingEventsTable = {
  id, shipmentTrackingId (FK → shipment_trackings, cascade),
  eventCode, eventStatus (enum: unknown/pending/in_transit/arrived_store/picked_up/delivered/returned/exception),
  eventDescription, eventLocation, occurredAt,
  rawData (jsonb),   // ← 業者 API 原始回傳，未來 Agent 寫入時的 rawPayload 即對應此欄位
  createdAt
}
```

`eventStatus` 的白名單列舉（8 個值）已經在 schema 層定義好，Step 7D-0 規格中提到的「eventStatus 白名單」**不需要重新發明**，可直接引用 `shipmentTrackingEventStatusEnum`。

### 4.3 目前完全不存在的資料表 / 概念

逐一 grep 確認，以下 Step 7D-0 規格中設想的概念，**目前在 schema 與 codebase 中完全不存在**：

```
grep -Rln "seller_agents|sellerAgents|agent_run_logs|agentRunLogs|agentToken|agent_token" → 0 個結果
```

- 沒有 `seller_agents`（或任何 agent 設定表）
- 沒有 `agent_run_logs`（或任何執行紀錄表）
- 沒有任何形式的 `agent_token` / `agentToken` 欄位或表
- 沒有 token 撤銷 / 輪替（rotation）機制
- 沒有 audit log 表
- 沒有 rate limit 設定表（現有 rate limit 是程式內寫死的 middleware，如 `trackOrderLimiter`）

這代表 **Step 7D-2 實作 Agent Write API 時，至少需要新增資料表**（確切要新增哪些、欄位設計如何，留給 Step 7D-1B 決策——本文件只負責指出「目前是空白，需要從零設計」）。

---

## 5. 潛在新增 API Routes 盤點（對照 Step 7D-0 規格的 4 個端點草案）

> 以下逐一盤點 Step 7D-0 規格草案中提到的 4 個端點，標註：可能的檔案位置 / DB 依賴 / MVP 可行性 / 安全風險 / 測試重點。**本節僅為盤點與風險評估，不代表最終會採用此設計**，最終 route 設計由 Step 7D-1B → 7D-2 決定。

### 5.1 `GET /api/agent/tracking-jobs`（Agent 拉取待查詢任務清單）

| 項目         | 內容                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 可能檔案位置 | 新檔案 `routes/agent.ts`（依現有 route composition 慣例獨立成檔）                                                                                                                        |
| DB 依賴      | 讀取 `shipmentTrackingsTable`（依 `isActive` + `nextCheckAt` 篩選，索引 `shipment_trackings_active_next_check_idx` 已存在可直接利用），需 JOIN `ordersTable` 取得 `storeId` 以做範圍隔離 |
| MVP 可行性   | **中**——查詢邏輯本身不複雜（現有索引已支援），但「依 Agent 身分過濾出該賣家自己的任務」需要先有 token → merchantId/storeId 的對應機制（即第 7 節要決策的部分），這是前置依賴             |
| 安全風險     | **中**——若範圍過濾邏輯有誤，可能讓 Agent 拉到其他賣家的訂單追蹤任務（跨店資料外洩）；需嚴格依 `merchantId`/`storeId` 雙層過濾                                                            |
| 測試重點     | 跨店隔離測試（Agent A 不能看到 Agent B 的任務）、`nextCheckAt` 篩選正確性、分頁/數量上限                                                                                                 |

### 5.2 `POST /api/agent/shipment-events`（Agent 回報物流事件）

| 項目         | 內容                                                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 可能檔案位置 | `routes/agent.ts`                                                                                                                                                                                                                   |
| DB 依賴      | 寫入 `shipmentTrackingEventsTable`（含 `rawData` jsonb），可能連動更新 `shipmentTrackingsTable.latestEventStatus/latestEventDescription/latestEventAt`                                                                              |
| MVP 可行性   | **中**——`eventStatus` 白名單已存在（`shipmentTrackingEventStatusEnum`，可直接複用，不需重新定義），但需要設計「驗證歸屬權」（這個 `shipmentTrackingId` 是否真的屬於這個 Agent 的賣家）與 idempotency（避免 Agent 重試造成重複事件） |
| 安全風險     | **高**——這是唯一一個會寫入「他人可見資料」（買家會在 publicToken 查詢頁看到這些事件）的端點，`rawData`/`eventDescription` 若未清洗，可能把業者原始回傳中的雜訊或惡意內容（如 prompt injection 文字）寫入並暴露給買家                |
| 測試重點     | `eventStatus` 白名單強制驗證、`rawData` 大小與內容清洗（比照 `public.ts` 的隱私欄位排除模式）、跨表歸屬權驗證、idempotency（重複送同一事件不應產生多筆）                                                                            |

### 5.3 `PATCH /api/agent/shipment-status`（Agent 更新追蹤任務狀態）

| 項目         | 內容                                                                                                                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 可能檔案位置 | `routes/agent.ts`                                                                                                                                                                                                                            |
| DB 依賴      | 更新 `shipmentTrackingsTable`（`trackingStatus`、`isActive`、`lastCheckedAt`、`failureCount`、`checkError`）                                                                                                                                 |
| MVP 可行性   | **中**——`trackingStatus` 白名單已存在（`shipmentTrackingStatusEnum`，6 個值，可直接複用），但需設計「Agent 只能將狀態轉換到允許的下一狀態」（狀態機概念，可參考現有 `lib/orderStatusMachine.ts` 的設計模式，但**不可修改**該檔案，僅供參考） |
| 安全風險     | **中**——若無狀態機限制，Agent 可能把任務狀態跳轉到不合理的組合（如從 `delivered` 跳回 `pending`），造成查詢任務無限循環或資源浪費                                                                                                            |
| 測試重點     | 狀態轉換合法性驗證、`failureCount` 累加邏輯、`isActive` 與 `nextCheckAt` 的連動正確性                                                                                                                                                        |

### 5.4 `POST /api/agent/run-log`（Agent 回報執行紀錄）

| 項目         | 內容                                                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 可能檔案位置 | `routes/agent.ts`                                                                                                                                                           |
| DB 依賴      | 需要**全新資料表**（如規格中設想的 `agent_run_logs`），目前完全不存在                                                                                                       |
| MVP 可行性   | **低（MVP 階段建議先做最小版本）**——完整的 audit log / 執行歷史查詢 UI 屬於規格中的「進階」項目，MVP 階段可以只做「寫入一筆最小欄位的 log row」，不做查詢介面、不做統計分析 |
| 安全風險     | **低**——主要是內部可觀測性用途，不直接暴露給買家，但仍需注意寫入內容不可包含 secrets/credentials                                                                            |
| 測試重點     | 最小欄位寫入成功、寫入失敗不應影響主流程（log 失敗不該讓事件回報整個失敗）                                                                                                  |

---

## 6. MVP 切分建議（A：可立即做 / B：延後到 Step 7F）

> 本節為**建議性質**的切分草案，供 Step 7D-1B 決策參考，不是定案。

### 6.1 A 組：MVP 階段可立即做的最小項目

| 項目                                                                                                | 理由                                                                                                   |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 最小 token 驗證機制（單一固定值或單表查詢，不含輪替/UI）                                            | 沒有它就完全無法啟動 Agent API 開發；做最小可行版本即可解除阻塞                                        |
| `merchantId` + `storeId` 雙層範圍檢查                                                               | 這是防止跨店資料外洩的**最低限度安全要求**，不可省略；可直接複用現有 `verifyStoreOwner` 的比對邏輯思路 |
| 直接複用 `shipmentTrackingEventStatusEnum` / `shipmentTrackingStatusEnum` 白名單                    | 已存在於 schema，零成本可用，不需重新設計                                                              |
| `rawPayload`/`rawData` 基礎清洗（大小限制 + 比照 `public.ts` 的欄位白名單排除模式）                 | 防止最基本的資料污染與儲存爆量，做法已有既有模式可抄                                                   |
| Idempotency 基礎版（如以 `shipmentTrackingId + eventCode + occurredAt` 做唯一性檢查，避免重複寫入） | 避免 Agent 重試造成資料重複，是資料正確性的最低要求                                                    |
| 最小 run log（單表單筆寫入，無查詢介面）                                                            | 提供基本可觀測性，成本低                                                                               |

### 6.2 B 組：建議延後到 Step 7F（或更後）的進階項目

| 項目                                      | 理由                                                                                                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token 輪替（rotation）UI                  | 屬於營運維運功能，MVP 階段可用「手動換值」代替，不阻塞核心流程開發                                                                                             |
| 完整 audit log 查詢 UI / 後台介面         | 需要額外的前端開發與設計，不影響 Agent 寫入流程本身能否運作                                                                                                    |
| 進階 rate limit（依賽道/ 依賣家分級限速） | MVP 階段可先用全域固定速率限制頂著，進階分級需要更多營運資料才能設計合理閾值                                                                                   |
| Kill switch UI（後台一鍵停用某 Agent）    | 可先用「手動改 DB 欄位 / 環境變數」的應急方式頂著，UI 化是體驗優化非阻塞項                                                                                     |
| BYOK（賣家自帶金鑰）加密儲存機制          | 涉及金鑰管理、加密/解密流程設計，複雜度高，且 MVP 階段可先用 BYOA（賣家自帶 Agent，系統不存放金鑰）模式繞過此需求（此模式已在 Step 7D-0 規格中提及為預設策略） |
| Prompt injection 評分 / 自動偵測機制      | 屬於進階防禦強化，MVP 階段可先用「白名單欄位 + 長度限制 + 不可執行任意內容」的基礎防線頂著，自動評分需要額外的偵測邏輯與調校期                                 |

---

## 7. Agent Token 實作選項比較

> **本節僅列出選項與風險，不選定方案**。最終方案由 Step 7D-1B 決策。

| 選項                                                                  | 說明                                                                                       | MVP 友善度                                                                                                                                | 主要風險                                                                                                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. 沿用現有 Clerk session auth**                                    | 讓 Agent 直接用賣家的 Clerk session 呼叫 API（如 service account 或長期 token）            | 低——Clerk session 設計上是給人類瀏覽器用的短期 session，不適合長期執行的自動化程式；且會讓 Agent 與賣家共用同一信任層級，難以做細粒度撤銷 | Token 外洩時等同賣家帳號全權限外洩；Clerk session 過期機制與 Agent 長期執行的需求衝突                                                                                                   |
| **B. 新增 Agent token 資料表（如 `agent_tokens` / `seller_agents`）** | 新建一張表存放 token（hash 化）與其對應的 `merchantId`/`storeId` 範圍、有效期、狀態        | **高**——可獨立於 Clerk 之外管理，可單獨撤銷/輪替，範圍可精確控制到 store 層級，是規格中設想的「每個賣家自己的 Agent」架構最自然的落地方式 | 需要新增 schema（migration）、需要設計 token 產生/儲存（hash, 不存明文）、需要設計撤銷流程；初期開發成本略高於選項 C                                                                    |
| **C. 環境變數內部共用 token**                                         | 用單一環境變數存放一組「內部信任 token」，所有 Agent 共用                                  | 中——實作最快，幾乎零 schema 改動                                                                                                          | **嚴重安全疑慮**：所有賣家共用同一組憑證，無法做到「每個賣家自己的 Agent」的隔離目標（與 Step 7D-0 規格的核心架構精神直接衝突），token 外洩影響範圍是全系統而非單一賣家，且無法個別撤銷 |
| **D. Seller-scoped API Key（每個賣家獨立金鑰，存於 stores 或新表）**  | 為每個 `storeId`（或 `merchantId`）產生一組獨立 API key，可附加在 `storesTable` 或獨立表中 | 中偏高——隔離性佳，但若附加在 `storesTable` 上會讓該表職責混雜（商店資料 vs 認證憑證），架構上不如獨立表乾淨                               | 若選擇加欄位於 `storesTable`，未來要做多 Agent / 多金鑰（一店多 Agent）會卡住；建議若採此方向仍應走獨立表設計（實質上會收斂回選項 B）                                                   |

### 7.1 MVP 建議方向（僅供 Step 7D-1B 參考，非定案）

從上述比較可以觀察到：

- 選項 C 因為與「每個賣家自己的 Agent」的核心隔離精神衝突，**風險明顯偏高**，較不建議作為正式方向
- 選項 A 因為 Clerk session 的設計目標（人類短期瀏覽器 session）與 Agent 長期自動化執行的需求不匹配，**也存在結構性問題**
- 選項 B 與選項 D 在「需要新增資料表」這一點上**實質殊途同歭**——即使選 D，為了做到乾淨的權限隔離與未來可擴充性，最終也很可能收斂成「獨立的 token/agent 表」設計

因此，**選項 B（新增 Agent token 資料表）這個方向，似乎是與規格精神最契合、且後續擴充性最好的路徑**——但具體要設計成什麼樣的表結構（單一 token 表 / agent 設定表 + token 子表 / 是否需要區分 agent 身分與 token 本身等），仍需要在 Step 7D-1B 階段進一步討論定案，本文件不代為決定。

---

## 8. 資料寫入流程說明（草案層級，待 7D-1B/7D-2 細化）

依據現有 schema 設計（特別是 `shipmentTrackingsTable.latestEventStatus` 等欄位的「Step 7D worker 寫入」註解），可以推測出大致的資料流向草案：

```
1. Agent 認證
   → Agent 帶著 token 呼叫 Agent API（token 驗證機制：待 7D-1B 決策）
   → 系統將 token 解析為 merchantId + storeId 範圍（沿用 verifyStoreOwner 的比對精神）

2. Agent 拉取任務
   → GET /api/agent/tracking-jobs
   → 系統依 merchantId/storeId 範圍 + isActive + nextCheckAt 篩選出該賣家自己的待查詢任務
   → 回傳 shipmentTrackingsTable 中屬於該賣家的任務清單（不含其他賣家資料）

3. Agent 執行查詢（在系統外部，由賣家自己的 Agent 對物流業者 API 查詢）

4. Agent 回報事件
   → POST /api/agent/shipment-events
   → 系統驗證歸屬權（此 shipmentTrackingId 是否屬於呼叫者範圍）
   → 驗證 eventStatus 是否在白名單內（沿用 shipmentTrackingEventStatusEnum）
   → 清洗 rawData / eventDescription（比照 public.ts 隱私欄位排除模式做基礎過濾）
   → 寫入 shipmentTrackingEventsTable
   → 連動更新 shipmentTrackingsTable.latestEventStatus / latestEventDescription / latestEventAt

5. Agent 更新任務狀態
   → PATCH /api/agent/shipment-status
   → 驗證狀態轉換合法性（沿用 shipmentTrackingStatusEnum 白名單 + 狀態機精神）
   → 更新 shipmentTrackingsTable（trackingStatus / isActive / lastCheckedAt / failureCount / checkError）

6. Agent 回報執行紀錄（可選，MVP 可做最小版本）
   → POST /api/agent/run-log
   → 寫入新表（如 agent_run_logs，待 7D-1B 決定結構）

7. 買家查詢
   → 透過既有 GET /orders/track/:publicToken
   → 看到 Agent 寫入的事件資料（已清洗過的版本）
```

> 注意：以上流程中第 1 步「token → merchantId/storeId 範圍解析」是整條流程的**前置阻塞依賴**——沒有先決定 token 機制（第 7 節），後面所有端點的權限檢查設計都無法定案。這是建議將 Step 7D-1B 列為下一步、且不可跳過的核心原因。

---

## 9. 測試計畫（草案，待 7D-2 落地時細化為實際測試案例）

延續現有測試模式（`orders.route.test.mjs` 採用 Node.js 內建 test runner + `mock.module` 模擬 `@clerk/express`，對真實 DB 做整合測試 + 自動清理），未來 Agent API 測試應涵蓋：

| 測試類別                     | 重點                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 認證測試                     | 無 token / 錯誤 token / 過期 token / 已撤銷 token 均應回傳適當錯誤碼                                                                                    |
| 範圍隔離測試                 | Agent A 的 token 不能存取 / 修改 Agent B（不同 `merchantId`/`storeId`）的資料——這是**最高優先級**的安全測試，比照現有 `verifyStoreOwner` 的跨店測試精神 |
| 白名單驗證測試               | `eventStatus`/`trackingStatus` 帶入白名單外的值應被拒絕（400/422），且不應寫入 DB                                                                       |
| rawPayload 清洗測試          | 帶入超大內容 / 含特殊字元 / 含疑似指令注入文字的 `rawData`，驗證系統是否正確清洗或拒絕，且不會外洩到買家端 `publicToken` 查詢結果                       |
| Idempotency 測試             | 同一事件重複送出兩次，DB 中不應產生重複紀錄                                                                                                             |
| 狀態轉換合法性測試           | 嘗試把 `trackingStatus` 從終態（如 `delivered`/`failed`）轉回非終態，應被拒絕或至少有明確規則驗證                                                       |
| 連動更新測試                 | 寫入 `shipmentTrackingEventsTable` 後，`shipmentTrackingsTable.latestEventStatus` 等欄位應正確同步                                                      |
| Run log 失敗不阻斷主流程測試 | run-log 寫入失敗時，不應導致事件回報整體失敗                                                                                                            |

---

## 10. 風險與待確認

| 項目                                                   | 等級   | 說明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **規格與現況落差：「sellerId」不存在**                 | **高** | Step 7D-0 規格文件多處使用 `sellerId` 字眼描述權限隔離範圍，但現有程式碼與 schema **完全沒有 `sellerId` 這個概念**，實際對應為 `merchantId`（text, Clerk user ID, on `storesTable`）+ `storeId`（integer FK）。建議 Step 7D-1B 決策時，明確訂出「規格中的 sellerId = merchantId + storeId」的對應關係，並評估是否需要回頭修正 Step 7D-0 規格文件用語，避免後續 worker 依字面去尋找不存在的欄位而卡關                                                                                                                                                                                                                                                                                                             |
| **Agent token 機制完全空白**                           | **高** | 目前系統只有 Clerk session 與 publicToken 兩種機制，沒有任何形式的內部/agent token、API key、service account。第 7 節列出的 4 個選項都需要額外開發成本，且選項 A/C 存在結構性風險。此項是 Step 7D-2 實作的**前置阻塞依賴**，必須在 Step 7D-1B 先定案                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **需要新增資料表（schema migration）**                 | **中** | 不論最終 token 方案為何，幾乎必然需要新增至少一張資料表（如 agent token 表 / agent run log 表）。這代表 Step 7D-1B 階段除了決定方案，也需要一併設計 schema 並規劃 migration（schema 變更與 migration 屬於 Step 7D-1B/後續階段範疇，本次稽核**不涉及、不執行**任何 schema 異動）                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **`rawData`/`rawPayload` 清洗策略需要明確規則**        | **中** | 雖然 `public.ts` 提供了既有的隱私欄位白名單排除模式可參考，但 Agent 寫入的 `rawData`（業者 API 原始回傳）內容更不可控，可能包含過長文字、特殊字元、甚至疑似 prompt injection 的內容。建議 Step 7D-1B 一併定義「最小可行的清洗規則」（如長度上限、字元過濾、欄位白名單），而不是留到 7D-2 才臨時決定                                                                                                                                                                                                                                                                                                                                                                                                              |
| **主工作區持續存在未處理的 modified / untracked 檔案** | 中     | 本次盤點期間觀察到主工作區（`/home/runner/workspace`，分支 `qa/step6f-cvs-store-selection-browser-mobile`）存在以下未提交變更：`.replit` (M)、`artifacts/api-server/src/lib/orderStatusMachine.ts` (M)、`artifacts/api-server/src/routes/orders.route.test.mjs` (M)、`artifacts/shop-app/src/lib/orderStatus.ts` (M)、`artifacts/shop-app/src/pages/Orders.tsx` (M)，以及兩個 untracked 檔案 `docs/order-step7c-schema-migration-implementation-audit.md`、`docs/order-step8a-order-actions-audit.md`。疑似有其他並行工作線（如 Claude A）正在進行中的變更。本次任務全程僅在 worktree（`/home/runner/worktree-step7c-shipment-tracking-model`，分支 `main`）操作，**未觸碰主工作區任何檔案**，僅如實記錄、不處理 |

---

## 11. 下一步建議

本文件僅完成「施工前盤點」，**尚未具備足夠條件直接進入 API route 實作**。原因是第 10 節列出的「Agent token 機制完全空白」與「sellerId/merchantId 對應關係待釐清」兩項都是 Step 7D-2 實作的前置阻塞依賴——若跳過決策直接讓 worker 動工，極可能在權限模型設計階段卡關或走錯方向，造成返工。

**因此明確建議下一步是：**

> **Step 7D-1B：先決定 MVP auth/token 方案與需要新增的資料表，然後才進 Step 7D-2：API route 實作。**

Step 7D-1B 階段建議至少完成以下決策（依本文件第 6、7 節的盤點結果作為輸入）：

1. 從第 7 節的 4 個選項中，選定 Agent token 的最終實作方向（本文件僅列出比較表與觀察，不代為選定）
2. 明確定義「規格中的 `sellerId` = `merchantId` + `storeId`」的對應關係，並決定是否需要回頭修正 Step 7D-0 規格文件用語
3. 設計新增資料表的 schema 草案（欄位、索引、與既有表的關聯）
4. 確認 MVP（A 組）與延後項目（B 組）的最終切分範圍

待 Step 7D-1B 完成上述決策後，才具備足夠的設計基礎進入 Step 7D-2 的 API route 實作工作。**不建議跳過 7D-1B 直接安排 worker 進行 7D-2 實作。**

---

## 附錄：本次盤點涉及的檔案清單

**已讀取 / 盤點的程式碼檔案**：

```
artifacts/api-server/src/app.ts
artifacts/api-server/src/routes/index.ts
artifacts/api-server/src/middlewares/auth.ts
artifacts/api-server/src/routes/public.ts（節錄）
artifacts/api-server/src/routes/health.ts
artifacts/api-server/src/routes/orders.ts（節錄，tracking-import handler）
artifacts/api-server/src/routes/orders.route.test.mjs（節錄，測試模式）
lib/db/src/schema/index.ts
lib/db/src/schema/stores.ts
lib/db/src/schema/orders.ts（節錄）
lib/db/src/schema/shipmentTrackings.ts
lib/db/src/schema/shipmentTrackingEvents.ts
```

**已執行的盤點指令（grep 確認落差）**：

```
grep -Rn "sellerId" → 0 個結果
grep -Rln "seller_agents|sellerAgents|agent_run_logs|agentRunLogs|agentToken|agent_token" → 0 個結果
```

本文件未修改、未新增、未刪除任何上述檔案；僅讀取與分析。
