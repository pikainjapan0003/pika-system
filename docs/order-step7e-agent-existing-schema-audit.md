# Step 7E-2A 既有 Agent 表 Schema 來源盤點

## 1. 任務背景

Step 7E-2（`docs/order-step7e-seller-agent-api-schema-spec.md`）handoff 留下一項施工前風險：

- `seller_agent_tokens` 和 `agent_run_logs` 表的實際 Drizzle schema 檔案在現有 codebase 中**未找到**
- 施工 Step 7E-1a（`seller_agent_settings` schema + migration）前，需先確認這兩個表的欄位名稱與 Step 7E-2 規格是否一致

本次任務目的：在不施工的前提下，完整盤點這兩張表的 schema 來源、實際欄位、與 Step 7D route / 測試的使用情形，並與 Step 7E-2 規格對照，回答「Step 7E-2 留下的風險是否成立」。

本次**不**進行 schema 實作、migration、API、UI 施工。

## 2. 搜尋範圍

- 全文搜尋關鍵字：`seller_agent_tokens` / `sellerAgentTokens` / `agent_run_logs` / `agentRunLogs` / `seller_agent` / `pgTable.*agent`（範圍：`artifacts/`、`docs/`，排除 `node_modules`、`.next`）
- 目前分支（`qa/step6f-cvs-store-selection-browser-mobile`）working tree 的 `lib/db/src/schema/` 目錄
- `main` 分支的 git 歷史與 commit 內容（`git show`、`git ls-tree`）
- Step 7D 最小相關檔案：
  - `artifacts/api-server/src/middlewares/agentAuth.ts`
  - `artifacts/api-server/src/routes/agent.ts`
  - `artifacts/api-server/src/routes/agent.route.test.mjs`
  - `artifacts/api-server/src/routes/agent.integration.test.mjs`

## 3. `seller_agent_tokens` 現況

### 3.1 schema 檔案來源

- **目前分支（`qa/step6f-cvs-store-selection-browser-mobile`）working tree 中：未找到**
  - `lib/db/src/schema/` 目錄下僅有 `cvsStores.ts`、`index.ts`、`orders.ts`、`productCategories.ts`、`products.ts`、`stores.ts`
  - `lib/db/src/schema/index.ts` 未 export 任何 `sellerAgentTokens` / `agentRunLogs` 相關內容
- **`main` 分支中：已找到**，commit `d441fd9 feat-db-step7d-agent-token-run-log-schema`
  - 檔案路徑：`lib/db/src/schema/sellerAgentTokens.ts`
  - `lib/db/src/schema/index.ts` 已 `export * from "./sellerAgentTokens.ts"`
- **關鍵結論**：schema **並非「從未撰寫」**，而是「**已在 `main` 完成並驗證，但尚未進入目前這條 QA 分支的 working tree**」。本分支與 `main` 的 merge-base 為 `cf799c6`，目前分支落在 commit `d441fd9` 之前的歷史線上（`git merge-base --is-ancestor d441fd9 HEAD` → NO；`...is-ancestor d441fd9 main` → YES）。

### 3.2 table 與 TypeScript export

- table 名稱：`seller_agent_tokens`（`pgTable("seller_agent_tokens", ...)`）
- TypeScript export 名稱：`sellerAgentTokensTable`
- 另 export：`sellerAgentTokenStatusEnum`（`["active","revoked","expired","disabled"]`）、`SellerAgentTokenStatus`、`insertSellerAgentTokenSchema`、`InsertSellerAgentToken`、`SellerAgentToken`

### 3.3 欄位清單（取自 `main:lib/db/src/schema/sellerAgentTokens.ts`）

| 欄位（TS）    | DB 欄名        | 型別 / 約束                                                                                     |
| ------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| `id`          | `id`           | `serial` PK                                                                                     |
| `merchantId`  | `merchant_id`  | `text` notNull                                                                                  |
| `storeId`     | `store_id`     | `integer` notNull，FK → `storesTable.id`（`onDelete: "cascade"`）                               |
| `name`        | `name`         | `text` notNull                                                                                  |
| `tokenHash`   | `token_hash`   | `text` notNull，**unique constraint**（`seller_agent_tokens_token_hash_unique`）                |
| `tokenPrefix` | `token_prefix` | `text` notNull                                                                                  |
| `status`      | `status`       | `text` notNull，default `"active"`，**check constraint** 限定 `active/revoked/expired/disabled` |
| `scopes`      | `scopes`       | `jsonb` notNull，default `["tracking:read","tracking:write","run_log:write"]`                   |
| `lastUsedAt`  | `last_used_at` | `timestamp(tz)` nullable                                                                        |
| `expiresAt`   | `expires_at`   | `timestamp(tz)` nullable                                                                        |
| `revokedAt`   | `revoked_at`   | `timestamp(tz)` nullable                                                                        |
| `createdAt`   | `created_at`   | `timestamp(tz)` notNull defaultNow                                                              |
| `updatedAt`   | `updated_at`   | `timestamp(tz)` notNull defaultNow，`$onUpdate(() => new Date())`                               |

- token hash 欄位名稱：`tokenHash`（DB: `token_hash`），唯一索引保證不重複
- token prefix 欄位名稱：`tokenPrefix`（DB: `token_prefix`）
- storeId / merchantId：兩者皆存在，`storeId` 為必填且有 FK + index，`merchantId` 為必填文字欄位
- status 欄位與允許值：`status`，允許值 `active / revoked / expired / disabled`（同時有 enum 常數與 DB check constraint 雙重保障）
- `revokedAt`：存在（nullable timestamp）
- `expiresAt`：存在（nullable timestamp，且有獨立 index）
- `lastUsedAt`：存在（nullable timestamp）
- `createdAt` / `updatedAt`：皆存在，`updatedAt` 有自動更新邏輯

### 3.4 index / unique / FK

- Index（5 個）：`store_id`、`(merchant_id, store_id)`、`token_prefix`、`status`、`expires_at`
- Unique：`token_hash`（`seller_agent_tokens_token_hash_unique`）
- Check constraint：`status IN ('active','revoked','expired','disabled')`
- FK：`storeId → storesTable.id`，`onDelete: "cascade"`

> 對照 `docs/order-step7d-agent-api-route-implementation-audit.md:53`：「`seller_agent_tokens` | **DB 已存在**，7 個 indexes ✓」— 與目前盤點到的 5 個 index + 1 unique + 1 check（共可視為 7 個 DB 層級索引/約束物件）相符。

### 3.5 與 Step 7D `agentAuth.ts` / `agent.ts` 的一致性

`main:artifacts/api-server/src/middlewares/agentAuth.ts` 直接 import `sellerAgentTokensTable`，並使用以下欄位驗證 token：

- `tokenHash`（以 SHA-256 雜湊比對）
- `status`（限定 `"active"`）
- `revokedAt`（`isNull` 條件）
- `expiresAt`（`isNull` 或 `> NOW()`）
- 成功後讀取 `id`、`merchantId`、`storeId`、`scopes`、`tokenPrefix`，並 fire-and-forget 更新 `lastUsedAt`

**結論：完全一致** — middleware 用到的每個欄位都能在 schema 中找到對應定義，型別與語意吻合。

## 4. `agent_run_logs` 現況

### 4.1 schema 檔案來源

- **目前分支 working tree 中：未找到**（同 §3.1 說明，原因相同）
- **`main` 分支中：已找到**，同樣在 commit `d441fd9 feat-db-step7d-agent-token-run-log-schema`
  - 檔案路徑：`lib/db/src/schema/agentRunLogs.ts`
  - `lib/db/src/schema/index.ts` 已 `export * from "./agentRunLogs.ts"`

### 4.2 table 與 TypeScript export

- table 名稱：`agent_run_logs`（`pgTable("agent_run_logs", ...)`）
- TypeScript export 名稱：`agentRunLogsTable`
- 另 export：`agentRunTypeEnum`（`["manual","scheduled","webhook","csv_after_import","test"]`）、`AgentRunType`、`agentRunStatusEnum`（`["running","completed","failed","partial"]`）、`AgentRunStatus`、`insertAgentRunLogSchema`、`InsertAgentRunLog`、`AgentRunLog`

### 4.3 欄位清單（取自 `main:lib/db/src/schema/agentRunLogs.ts`）

| 欄位（TS）     | DB 欄名         | 型別 / 約束                                                                                       |
| -------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `id`           | `id`            | `serial` PK                                                                                       |
| `tokenId`      | `token_id`      | `integer` nullable，FK → `sellerAgentTokensTable.id`（`onDelete: "set null"`）                    |
| `merchantId`   | `merchant_id`   | `text` notNull                                                                                    |
| `storeId`      | `store_id`      | `integer` notNull，FK → `storesTable.id`（`onDelete: "cascade"`）                                 |
| `runType`      | `run_type`      | `text` notNull，**check constraint** 限定 `manual/scheduled/webhook/csv_after_import/test`        |
| `status`       | `status`        | `text` notNull，default `"running"`，**check constraint** 限定 `running/completed/failed/partial` |
| `startedAt`    | `started_at`    | `timestamp(tz)` notNull defaultNow                                                                |
| `finishedAt`   | `finished_at`   | `timestamp(tz)` nullable                                                                          |
| `checkedCount` | `checked_count` | `integer` notNull default 0                                                                       |
| `successCount` | `success_count` | `integer` notNull default 0                                                                       |
| `failedCount`  | `failed_count`  | `integer` notNull default 0                                                                       |
| `errorCode`    | `error_code`    | `text` nullable                                                                                   |
| `errorMessage` | `error_message` | `text` nullable（註解：僅可記錄安全摘要，不可含 token 明文 / 完整 stack trace）                   |
| `createdAt`    | `created_at`    | `timestamp(tz)` notNull defaultNow                                                                |

- `tokenId`：存在（nullable，FK 設 `onDelete: "set null"` 以保留稽核歷史）
- storeId / merchantId：皆存在，皆為必填且 `storeId` 有 FK + index
- status 欄位與允許值：`status`，允許值 `running / completed / failed / partial`（注意：與 Step 7E-2 規格使用的詞彙不同，詳見 §5）
- `jobCount`：**不存在**。schema 中對應「本次查詢筆數」的欄位是 `checkedCount`，而非 `jobCount`
- `successCount` / `failedCount`：皆存在
- `errorSummary`：**不存在**。schema 中是拆成 `errorCode`（≤120 字）與 `errorMessage`（≤500 字，安全摘要）兩個獨立欄位，沒有單一的 `errorSummary` 欄位
- `rawPayload` / `metadata` / `details` 類欄位：**`agent_run_logs` 本身不存在**。經比對，`rawPayload` 實際是 `shipment_tracking_events` 表的 `rawData` 欄位（在 `agent.ts` 的 `POST /shipment-events` 中用 `sanitizePayload()` 過濾後寫入），並非 `agent_run_logs` 的欄位
- `startedAt` / `finishedAt`：皆存在
- `createdAt`：存在；**無 `updatedAt`**（設計上 run log 為 append-only 紀錄，符合稽核紀錄不可變的語意）

### 4.4 index / FK

- Index（6 個）：`token_id`、`store_id`、`(merchant_id, store_id)`、`status`、`started_at`、`created_at`
- Check constraint（3 個）：`run_type` 合法值、`status` 合法值、三個 count 欄位 `>= 0`
- FK：`tokenId → sellerAgentTokensTable.id`（`onDelete: "set null"`）、`storeId → storesTable.id`（`onDelete: "cascade"`）

> 對照 `docs/order-step7d-agent-api-route-implementation-audit.md:54`：「`agent_run_logs` | **DB 已存在**，7 個 indexes ✓」— 與盤點到的 6 個 index + 3 個 check（DB 層級物件總數可對應到 7 上下，細節需以實際 DB `\d` 結果為準，схема 程式碼層級可確認的索引數為 6）大致相符，但**精確的「7 個 index」與本次盤點到的「6 個 index + 3 個 check constraint」並非同一種物件分類，建議 Step 7E-1a 施工前以實際 DB `\d agent_run_logs` 再次核對，避免文件之間的計數方式造成誤解**。

### 4.5 與 Step 7D `POST /api/internal/agent/run-log` 的一致性

`main:artifacts/api-server/src/routes/agent.ts` 的 `router.post("/run-log", ...)`：

- 驗證並寫入：`tokenId`（取自 `res.locals.agentToken`）、`merchantId`、`storeId`、`runType`、`status`、`startedAt`、`finishedAt`、`checkedCount`、`successCount`、`failedCount`、`errorCode`、`errorMessage`
- `VALID_RUN_TYPES` = `manual/scheduled/webhook/csv_after_import/test`，`VALID_RUN_STATUSES` = `running/completed/failed/partial` — **與 schema 的 `agentRunTypeEnum` / `agentRunStatusEnum` 完全一致**
- response 只回傳 `runLogId/runType/status/startedAt/finishedAt/checkedCount/successCount/failedCount/errorCode/errorMessage/createdAt`，未包含 `tokenHash` 等敏感欄位

**結論：route 與 schema 完全一致**，欄位名稱、enum 值、約束邏輯互相吻合。

## 5. 與 Step 7E-2 規格的對照

### 5.1 `seller_agent_tokens` 對照表

| 項目                                        | Step 7E-2 規格預期                          | 現有 codebase 實際狀態                                                                                                                        | 結論                                                               |
| ------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| schema 檔案                                 | 應有 Drizzle schema                         | `lib/db/src/schema/sellerAgentTokens.ts`：**存在於 `main`（commit `d441fd9`），但目前 QA 分支 working tree 中未找到，`index.ts` 也未 export** | 待補（非從零新建，而是需要把 `main` 的 Step 7D schema 帶入本分支） |
| table 名稱                                  | `seller_agent_tokens`                       | `pgTable("seller_agent_tokens", ...)`                                                                                                         | OK                                                                 |
| TS export 名稱                              | （規格未指定）                              | `sellerAgentTokensTable`                                                                                                                      | OK                                                                 |
| `tokenHash`                                 | 不可回傳，內部比對用                        | `tokenHash`（`token_hash`），unique constraint                                                                                                | OK                                                                 |
| `tokenPrefix`                               | 可回傳，列表顯示用                          | `tokenPrefix`（`token_prefix`）                                                                                                               | OK                                                                 |
| `storeId`                                   | 必須隔離                                    | `storeId` notNull，FK→`storesTable`，`onDelete cascade`，獨立 index                                                                           | OK                                                                 |
| `status`                                    | `active/revoked/expired/disabled`           | enum 常數 + DB check constraint，值完全相同                                                                                                   | OK                                                                 |
| `revokedAt`                                 | revoke 操作需設定                           | 存在（nullable timestamp）                                                                                                                    | OK                                                                 |
| `expiresAt`                                 | 應存在                                      | 存在（nullable timestamp + index）                                                                                                            | OK                                                                 |
| `lastUsedAt`                                | 應存在（列表顯示）                          | 存在（nullable timestamp）                                                                                                                    | OK                                                                 |
| `createdAt` / `updatedAt`                   | 應存在                                      | 皆存在，`updatedAt` 有自動更新                                                                                                                | OK                                                                 |
| index / unique / FK                         | （規格未明確列出，但隱含需要 storeId 隔離） | 5 index + 1 unique + 1 check + 1 FK                                                                                                           | OK                                                                 |
| 與 Step 7D `agentAuth.ts` / `agent.ts` 一致 | —                                           | 完全一致（見 §3.5）                                                                                                                           | OK                                                                 |

**`seller_agent_tokens` 整體結論：欄位設計與 Step 7E-2 規格完全相符，無需調整規格內容。唯一的落差是「schema 檔案在目前分支中尚未存在」，但這是分支落後 `main` 造成的，而非 schema 本身缺漏。**

### 5.2 `agent_run_logs` 對照表

| 項目                                         | Step 7E-2 規格預期                       | 現有 codebase 實際狀態                                                                                                                   | 結論                                                                                                                                                                                  |
| -------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| schema 檔案                                  | 應有 Drizzle schema                      | `lib/db/src/schema/agentRunLogs.ts`：**存在於 `main`（commit `d441fd9`），但目前 QA 分支 working tree 中未找到，`index.ts` 也未 export** | 待補（同上，非從零新建）                                                                                                                                                              |
| table 名稱                                   | `agent_run_logs`                         | `pgTable("agent_run_logs", ...)`                                                                                                         | OK                                                                                                                                                                                    |
| TS export 名稱                               | （規格未指定）                           | `agentRunLogsTable`                                                                                                                      | OK                                                                                                                                                                                    |
| `id`                                         | 應存在                                   | `id`（serial PK）                                                                                                                        | OK                                                                                                                                                                                    |
| `startedAt` / `finishedAt`                   | 應存在                                   | 皆存在                                                                                                                                   | OK                                                                                                                                                                                    |
| `status`                                     | 規格用詞為 `success / failure / partial` | 實際 enum 為 `running / completed / failed / partial`（DB check constraint 強制）                                                        | **不一致 — 規格用詞與 schema 實際 enum 值不同。`success`→應為 `completed`，`failure`→應為 `failed`，且規格未提及 `running`**                                                          |
| `jobCount`                                   | 規格欄位名稱（本次查詢的訂單數）         | 實際無 `jobCount`，對應欄位是 `checkedCount`                                                                                             | **不一致 — 欄位名稱不同，Seller UI API 規格需改用 `checkedCount` 或在 mapping 層轉換**                                                                                                |
| `successCount` / `failedCount`               | 應存在                                   | 皆存在，名稱相同                                                                                                                         | OK                                                                                                                                                                                    |
| `errorSummary`                               | 規格欄位（只顯示 error_code）            | 實際無 `errorSummary`，是 `errorCode`（≤120字）+ `errorMessage`（≤500字）兩個獨立欄位                                                    | **待確認 — `errorSummary` 應定義為「直接對應 `errorCode`」還是「`errorCode` + `errorMessage` 組合後的前端顯示用摘要」，需在 Step 7E-1d 實作前明確定義映射規則**                       |
| `tokenPrefix`（顯示觸發此次執行的 token）    | 規格列為允許顯示欄位                     | `agent_run_logs` 本身**沒有** `tokenPrefix` 欄位，僅有 `tokenId`（FK → `seller_agent_tokens.id`）                                        | **待確認 — 若要顯示 `tokenPrefix`，API 層需要 JOIN `seller_agent_tokens` 表取得，規格應註明此為跨表查詢欄位，而非 `agent_run_logs` 直接擁有的欄位**                                   |
| `rawPayload` / `metadata` / `details` 類欄位 | 規格列為「嚴格禁止回傳欄位」             | `agent_run_logs` **本身沒有**這類欄位；`rawPayload` 實際屬於 `shipment_tracking_events.rawData`，非 `agent_run_logs`                     | **待確認 — 規格中「嚴格禁止回傳 `rawPayload`」這條規則對 `agent_run_logs` 本身是空話（該表沒有此欄位），實際風險點在 `shipment_tracking_events`／其他關聯表，建議釐清規格的適用範圍** |
| `createdAt`                                  | 應存在                                   | 存在；無 `updatedAt`（append-only 設計，符合稽核紀錄語意）                                                                               | OK                                                                                                                                                                                    |
| index / FK                                   | （規格未明確列出）                       | 6 index + 3 check + 2 FK（`tokenId`→tokens `set null`、`storeId`→stores `cascade`）                                                      | OK                                                                                                                                                                                    |
| 與 Step 7D `POST /run-log` route 一致        | —                                        | 完全一致（見 §4.5）                                                                                                                      | OK                                                                                                                                                                                    |

**`agent_run_logs` 整體結論：核心隔離欄位（`storeId`/`merchantId`/`tokenId`）、時間欄位、count 欄位皆存在且與 Step 7D route 完全一致；但 Step 7E-2 規格第 5.2 節中用於「Seller UI 顯示」的欄位命名（`status` 列舉值、`jobCount`、`errorSummary`、`tokenPrefix`、`rawPayload`）與實際 schema 有落差，這些落差屬於「Seller UI API 的顯示層映射規則尚未對齊底層 schema」，建議在 Step 7E-1d（run-logs API）施工前修正規格或補上明確的欄位映射表。**

## 6. 施工 Step 7E-1a 前的結論

1. **Step 7E-2 留下的風險「schema 檔案在現有 codebase 中未找到」基本成立，但成因與原本推測不同**：schema 並非缺漏未撰寫，而是**已在 `main` 分支的 commit `d441fd9 feat-db-step7d-agent-token-run-log-schema` 中完整撰寫、並通過 78 個 mock 測試與 19 個真實 DB E2E 測試**（見 `docs/order-step7e-seller-agent-workspace-ui-plan.md:25`），只是**目前這條 QA 分支（`qa/step6f-cvs-store-selection-browser-mobile`）的 working tree 落後於 `main`，尚未包含這批 commit**，所以本機搜尋不到對應檔案。
2. `seller_agent_tokens` 的欄位設計與 Step 7E-2 規格**完全一致**，且與 Step 7D `agentAuth.ts` 的實際使用方式互相吻合，無需修改規格或 schema。
3. `agent_run_logs` 的核心欄位（隔離欄位、時間欄位、count 欄位）與 Step 7D route 完全一致；但 Step 7E-2 規格第 5 節「Seller UI 顯示規格」中所用的欄位命名（`status` 列舉值、`jobCount`、`errorSummary`、`tokenPrefix`）與底層 schema 的實際命名**有落差**，這些落差需要在 Step 7E-1d（run-logs API 實作）前釐清映射規則，否則 API 實作時會出現「規格寫的欄位在 DB 找不到」的狀況。
4. **施工 Step 7E-1a（`seller_agent_settings` schema + migration）前，建議的前置動作不是「重新設計 schema」，而是先確認 Step 7D 的 schema commits（`d441fd9` 及其依賴的 `shipmentTrackings`/`shipmentTrackingEvents` 等）是否會被合併或 cherry-pick 進本分支**。若 `seller_agent_settings` 的 schema 設計需要 import `sellerAgentTokensTable`（例如做 FK 關聯），則必須先確保本分支能解析到該 export，否則 TypeScript 編譯會失敗。
5. 另外注意：`docs/order-step7d-db-schema-drift-resolution-plan.md` 已記錄一個相關但不同層次的問題——即便 schema 程式碼已在 `main` 完成，**目前 `DATABASE_URL` 指向的實際 DB 中可能仍不存在這些表**（schema drift）。這代表「schema 程式碼存在」與「DB 中表已建立」是兩件分開的事，Step 7E-1a 施工前兩者都需要核對。

## 7. 風險與待確認

1. **分支落差風險**：本分支落後 `main` 至少 `d441fd9` 等 20+ 個 commit（含 Step 7D 全部 schema/route/測試），施工 Step 7E-1a 前必須先決定「合併/cherry-pick `main` 的 Step 7D 變更」或「在本分支重新引入這些 schema 檔案」，否則 `seller_agent_settings` 若需引用 `sellerAgentTokensTable` 會無法編譯。
2. **DB schema drift 風險**：依 `docs/order-step7d-db-schema-drift-resolution-plan.md` 所述，即便 schema 程式碼存在，目前 `DATABASE_URL` 指向的 DB 可能尚未實際建立 `seller_agent_tokens` / `agent_run_logs` 等表。Step 7E-1a 的 migration 規劃必須將此 drift 一併納入考量，否則新表的 FK／關聯設計可能建立在不存在的基礎表之上。
3. **Step 7E-2 規格與實際 schema 命名落差（`agent_run_logs` 顯示層）**：
   - `status` 顯示值：規格用 `success/failure/partial`，實際 enum 為 `running/completed/failed/partial`，需確認 Seller UI 顯示時是否要做映射（例如 `completed`→顯示為「成功」）或直接修正規格用詞。
   - `jobCount` vs `checkedCount`：欄位名稱不同，需在 API 規格中明確標註對應關係。
   - `errorSummary` 的組成：需明確定義是否為 `errorCode` 直接輸出，或是 `errorCode` + `errorMessage` 的組合摘要。
   - `tokenPrefix`（顯示觸發此次執行的 token）：`agent_run_logs` 本身沒有此欄位，需 JOIN `seller_agent_tokens` 才能取得，規格應註明此為跨表欄位。
   - `rawPayload` 禁止回傳規則：對 `agent_run_logs` 本身不適用（該表無此欄位），規格中此條規則的真正適用對象應是 `shipment_tracking_events.rawData`，建議釐清規格敘述範圍以免誤導未來實作者。
4. **DB 層級索引計數的文件落差**：`docs/order-step7d-agent-api-route-implementation-audit.md` 記載兩表「皆有 7 個 indexes」，但本次從 schema 程式碼盤點到的是 `seller_agent_tokens`＝5 index + 1 unique + 1 check，`agent_run_logs`＝6 index + 3 check。兩種計數口徑可能不同（是否把 unique / check constraint 算作 index），建議施工前以實際 DB `\d <table>` 結果為準，避免文件之間互相矛盾造成誤判。
5. **本次盤點基於 `main` 分支的程式碼內容**，因為目前 QA 分支的 working tree 中沒有對應檔案。若使用者已經規劃要 cherry-pick / merge `main` 的 Step 7D 變更到本分支，以上欄位盤點結果可直接沿用；若規劃改為重新設計，則需另行評估與既有 `main` schema 的相容性（尤其是已上線環境若已依照 `main` schema 建表）。

## 8. 非目標

本次任務明確不包含、也未執行：

- 新增或修改 `seller_agent_tokens` / `agent_run_logs` / `seller_agent_settings` 等任何 Drizzle schema 檔案
- 新增、修改 migration 或執行 `drizzle-kit generate` / `drizzle-kit push` / DB push
- 修改 `agentAuth.ts`、`agent.ts`、任何 route 或 middleware
- 修改 `agent.route.test.mjs` / `agent.integration.test.mjs` 或新增任何測試
- 修改 UI 程式碼、新增 component 或頁面
- 實作 token 管理 API、run-logs API 或 webhook
- 修改 `package.json`、lockfile、`.replit`
- 修改 `artifacts/shop-app/src/lib/printHelpers.ts`、`artifacts/shop-app/src/pages/Orders.tsx`
- commit、push、stage `dev-handoff/`、stage `.claude/`

## 9. 後續建議

1. **施工 Step 7E-1a 前，先決定如何讓本分支取得 Step 7D 的 schema**：建議的選項是把 `main` 的 commit `d441fd9`（及其相依的 `shipmentTrackings`/`shipmentTrackingEvents` schema commits）合併或 cherry-pick 進本分支，而不是重新撰寫一份可能與已驗證版本不一致的 schema。
2. **在合併/cherry-pick 之前，先核對本分支是否已存在會與 `d441fd9` 衝突的 `lib/db/src/schema/` 變更**（目前盤點未發現衝突跡象，但建議施工者在合併前自行用 `git diff main...HEAD -- lib/db/src/schema/` 再次確認）。
3. **修正或補充 Step 7E-2 規格第 5.2～5.3 節的欄位命名**，使其與 `agent_run_logs` 實際 schema 對齊：
   - 將 `status` 顯示值對照表改為 `running/completed/failed/partial`，並標註 Seller UI 顯示文案的映射規則
   - 將 `jobCount` 改為 `checkedCount`，或在文件中明確標註「`jobCount` 為前端顯示別名，對應 DB `checkedCount`」
   - 明定 `errorSummary` 的組成規則（是否等於 `errorCode`，或為組合欄位）
   - 標註 `tokenPrefix` 為「需 JOIN `seller_agent_tokens` 取得的關聯欄位」，而非 `agent_run_logs` 自身欄位
   - 釐清「禁止回傳 `rawPayload`」規則的實際適用資料表（`shipment_tracking_events`，而非 `agent_run_logs`）
4. **核對 DB schema drift 狀態**：依 `docs/order-step7d-db-schema-drift-resolution-plan.md` 的計畫，確認目前 `DATABASE_URL` 指向的 DB 是否已實際建立 `seller_agent_tokens` / `agent_run_logs`（含 `idempotency_key` 欄位），這會直接影響 `seller_agent_settings` migration 的撰寫順序與相依設計。
5. **以實際 DB `\d seller_agent_tokens` / `\d agent_run_logs` 核對 index/constraint 數量**，解決 §7.4 提到的文件計數落差，確保 Step 7E-1a 的 migration 規劃基於正確的現況認知。
