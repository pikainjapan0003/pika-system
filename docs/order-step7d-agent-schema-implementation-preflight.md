# Step 7D-2A：Agent Schema 實作前檢查（schema 實作前檢查）

## 0. 文件定位

本文件是 **Step 7D-2B（Drizzle schema 實作）開工前的最後一關檢查**，目的是把 `docs/order-step7d-agent-token-run-log-schema-spec.md`（Step 7D-1C）第 12 章列出的「待確認」項目逐一收斂成**可直接落地的 MVP 決策**，並據此產出：

- `seller_agent_tokens`、`agent_run_logs` 的最終欄位建議表
- 是否需在 `shipment_tracking_events` 補 `idempotencyKey` 的判斷
- Index / Constraint 最終建議
- `merchantId` + `storeId` 歸屬檢查方式
- Step 7D-2B 要新增/修改的 schema 檔案清單
- typecheck / DB push / rollback 計畫
- 測試計畫與風險清單
- **是否可進入 Step 7D-2B 的明確判斷**

本文件**不包含**任何 schema 程式碼、migration、`drizzle-kit push`、API route、UI、worker 實作；純粹是文件層級的決策收斂。

---

## 1. Step 7D-1C「待確認」項目逐項檢視與建議

逐一檢視 `docs/order-step7d-agent-token-run-log-schema-spec.md` 第 12 章施工前檢查清單列出的待確認項目，給出 MVP 階段的明確建議：

### 1.1 `tokenHash` 應使用何種雜湊演算法？

- **建議**：使用 **SHA-256 或 HMAC-SHA-256**；若系統目前沒有可用的 app secret，**先採用 SHA-256**
- **不可保存明文**——資料庫外洩時，不應能逆推出可用憑證
- 待未來導入 app secret 機制後，可平滑升級為 HMAC-SHA-256（雜湊演算法本身不影響欄位設計，僅影響驗證 middleware 的實作方式，不阻塞 schema 實作）

### 1.2 `tokenPrefix` 應保存幾碼？

- **建議**：保存 token 明文的**前 8～12 碼**
- 用途僅限於「讓使用者在介面上辨識這是哪一把 token」
- **不可用於驗證**——驗證一律以 `tokenHash` 比對為準，`tokenPrefix` 只是顯示用途的冗余欄位

### 1.3 `scopes` 應採用何種格式？

- **建議**：MVP 階段使用 **`jsonb`**，內容為**字串陣列**
- 範例：`["tracking:read", "tracking:write", "run_log:write"]`
- 與 Step 7D-1C 規格文件草案中暫定的「MVP 固定單一範圍 `'["shipment:write"]'`」相比，本建議改為**陣列形式**，保留未來擴充多範圍的彈性，但 MVP 階段建立 token 時可先只給單一或少量範圍

### 1.4 `expiresAt` 是否應強制必填？

- **建議**：MVP 階段**允許 nullable**（`null` 代表不過期）
- 但**建議管理介面未來預設提供 90 天 / 180 天的選項**，引導賣家主動設定到期時間，降低長期有效憑證外洩的風險
- 本欄位是否必填屬於「應用層／介面層的政策」，不需要在資料庫層強制 `NOT NULL`

### 1.5 `status` 白名單內容為何？

- **建議白名單**：`active` / `revoked` / `expired` / `disabled`
- 比照現有 schema 慣例（如 `ordersTable.status`、`shipmentTrackingsTable.status`），以 `check` constraint 搭配 `sql\`${t.status} IN (...)\`` 的形式實作
- 與 `revokedAt` 的關係：當 `status = 'revoked'` 時，`revokedAt` 必須有值；驗證 middleware 應同時檢查 `status` 與 `expiresAt`，任一條件判定為無效即拒絕

### 1.6 `agent_run_logs.runType` 白名單內容為何？

- **建議白名單**：`manual` / `scheduled` / `webhook` / `csv_after_import` / `test`
- 涵蓋目前可預見的觸發來源：人工手動執行、排程執行、webhook 觸發、CSV 匯入後自動執行、測試執行
- 同樣以 `check` constraint 實作，比照現有 enum 欄位的命名與寫法慣例

### 1.7 `agent_run_logs.status`（run status）白名單內容為何？

- **建議白名單**：`running` / `completed` / `failed` / `partial`
- `running`：執行中尚未結束；`completed`：全部成功；`failed`：整批失敗；`partial`：部分成功部分失敗（對應 `successCount` / `failedCount` 同時 > 0 的情境）
- 同樣以 `check` constraint 實作

### 1.8 `agent_run_logs.tokenId` 的 FK `onDelete` 策略應為何？

- **建議**：採 **`set null`**，且 `agent_run_logs.tokenId` 欄位本身改為 **nullable**
- 理由：`agent_run_logs` 是「執行歷史紀錄」，其價值在於可稽核性與可觀測性；若 token 被刪除時連帶刪除其所有執行紀錄（`cascade`），會造成歷史資料遺失，不利於事後追查問題或爭議處理
- 此建議與 Step 7D-1C 規格文件第 5.2 節「待確認，傾向 `set null`」的方向一致，本文件將其**收斂為最終建議**
- 注意：這與 §1.9（`seller_agent_tokens.storeId` → `stores.id` 的 FK）建議維持 `cascade` 是兩個不同的 FK，**不應混淆**——store 被刪除時，其名下的 agent token 應隨之失效清除（安全考量優先），但 token 被刪除（或失效）時，其產生過的執行紀錄應該保留（稽核考量優先）

### 1.9 Log 的保留期限（retention）策略為何？

- **建議**：**MVP 階段不做自動清理機制**
- 僅在文件中記錄「未來若資料量過大，應導入定期歸檔或清理機制（例如保留最近 N 天 / N 筆）」，作為 Step 7F 之後的優化項目
- 不在 schema 層級加入任何與清理相關的欄位或排程邏輯

### 1.10 是否需要在本階段為 `shipment_tracking_events` 補上 `idempotencyKey`？

- **建議**：**是，建議與 Step 7D-2B 一併補進 `shipment_tracking_events`**
- 理由：若不在這個時間點補上，後續 Step 7D-2（Agent Write API）的防重複寫入機制將缺少對應欄位可用，屆時還是得回頭修改 `shipment_tracking_events` 的 schema，不如一次到位
- 詳細欄位規格與 index 建議見本文件第 4 章

### 1.11 進行 `drizzle-kit push` 前是否需要備份？

- **建議**：**需要**——任何會異動既有資料表結構（新增欄位、新增表、新增 constraint/index）的 `drizzle-kit push` 操作前，**必須先備份資料庫**
- 這是 Step 7D-2B 開工前的硬性前置條件，不是「建議」而是「必要步驟」

---

## 2. MVP 決策建議彙總（速查表）

| 項目 | MVP 建議 |
|------|----------|
| `tokenHash` 演算法 | SHA-256，或 HMAC-SHA-256（若有 app secret）；不得保存明文 |
| `tokenPrefix` 長度 | 前 8～12 碼，僅供辨識，不可用於驗證 |
| `scopes` 格式 | `jsonb`，字串陣列，例如 `["tracking:read", "tracking:write", "run_log:write"]` |
| `expiresAt` 必填性 | nullable；管理介面未來建議預設 90 / 180 天選項 |
| `status` 白名單 | `active` / `revoked` / `expired` / `disabled` |
| `runType` 白名單 | `manual` / `scheduled` / `webhook` / `csv_after_import` / `test` |
| `agent_run_logs.status` 白名單 | `running` / `completed` / `failed` / `partial` |
| `agent_run_logs.tokenId` FK onDelete | `set null`，`tokenId` 欄位 nullable，避免刪 token 連帶刪 log |
| Log 保留期限 | MVP 不做自動清理，僅文件記錄未來優化方向 |
| `idempotencyKey` | 建議 Step 7D-2B 一併補進 `shipment_tracking_events` |
| DB 備份 | Step 7D-2B 執行 `drizzle-kit push` 前必須備份 |

---

## 3. `seller_agent_tokens` 最終欄位建議表

| 欄位 | DB 欄名 | 型別 | nullable | 預設值 | FK / Constraint |
|------|---------|------|----------|--------|------------------|
| `id` | `id` | `serial` | 否 | — | PK |
| `merchantId` | `merchant_id` | `text` | 否 | — | 對應 `storesTable.merchantId`，由 token 建立流程查詢 `storesTable` 取得，不直接信任請求方輸入 |
| `storeId` | `store_id` | `integer` | 否 | — | FK → `stores.id`，`onDelete: "cascade"` |
| `name` | `name` | `text` | 否 | — | 供使用者辨識用途的顯示名稱 |
| `tokenHash` | `token_hash` | `text` | 否 | — | SHA-256 / HMAC-SHA-256 雜湊值，不存明文 |
| `tokenPrefix` | `token_prefix` | `text` | 否 | — | 明文前 8～12 碼，僅供辨識 |
| `status` | `status` | `text` | 否 | `'active'` | `check`：`status IN ('active','revoked','expired','disabled')` |
| `scopes` | `scopes` | `jsonb` | 否 | `'[]'` | 字串陣列，例如 `["tracking:read","tracking:write","run_log:write"]` |
| `lastUsedAt` | `last_used_at` | `timestamp (withTimezone)` | 是 | `null` | 不應每次請求都同步寫入，避免高頻寫入 |
| `expiresAt` | `expires_at` | `timestamp (withTimezone)` | 是 | `null` | `null` = 不過期；介面層建議預設 90 / 180 天 |
| `revokedAt` | `revoked_at` | `timestamp (withTimezone)` | 是 | `null` | `status = 'revoked'` 時應有值 |
| `createdAt` | `created_at` | `timestamp (withTimezone)` | 否 | `defaultNow()` | 比照現有慣例 |
| `updatedAt` | `updated_at` | `timestamp (withTimezone)` | 否 | `defaultNow()` + `$onUpdate(() => new Date())` | 比照現有慣例 |

---

## 4. `agent_run_logs` 最終欄位建議表（含 `idempotencyKey` 規劃）

### 4.1 `agent_run_logs` 欄位

| 欄位 | DB 欄名 | 型別 | nullable | 預設值 | FK / Constraint |
|------|---------|------|----------|--------|------------------|
| `id` | `id` | `serial` | 否 | — | PK |
| `tokenId` | `token_id` | `integer` | **是** | `null` | FK → `seller_agent_tokens.id`，`onDelete: "set null"` |
| `merchantId` | `merchant_id` | `text` | 否 | — | 與 token 建立時相同的冗余存放原則 |
| `storeId` | `store_id` | `integer` | 否 | — | FK → `stores.id`，`onDelete: "cascade"` |
| `runType` | `run_type` | `text` | 否 | — | `check`：`run_type IN ('manual','scheduled','webhook','csv_after_import','test')` |
| `status` | `status` | `text` | 否 | `'running'` | `check`：`status IN ('running','completed','failed','partial')` |
| `startedAt` | `started_at` | `timestamp (withTimezone)` | 否 | `defaultNow()` | 執行開始時間 |
| `finishedAt` | `finished_at` | `timestamp (withTimezone)` | 是 | `null` | 執行結束時間，`status = 'running'` 時應為 `null` |
| `checkedCount` | `checked_count` | `integer` | 否 | `0` | `check`：`>= 0`（比照 `productsTable.inventory` 的 non-negative 慣例） |
| `successCount` | `success_count` | `integer` | 否 | `0` | `check`：`>= 0` |
| `failedCount` | `failed_count` | `integer` | 否 | `0` | `check`：`>= 0` |
| `errorCode` | `error_code` | `text` | 是 | `null` | 機器可讀的錯誤代碼 |
| `errorMessage` | `error_message` | `text` | 是 | `null` | **不可包含 token 明文、敏感憑證或個資**，僅記錄可安全呈現的錯誤摘要 |
| `createdAt` | `created_at` | `timestamp (withTimezone)` | 否 | `defaultNow()` | 比照現有慣例 |

### 4.2 `idempotencyKey`（建議補進 `shipment_tracking_events`）

| 欄位 | DB 欄名 | 型別 | nullable | 預設值 | Constraint |
|------|---------|------|----------|--------|------------|
| `idempotencyKey` | `idempotency_key` | `text` | 是 | `null` | 建議搭配 `unique` 索引：`unique("shipment_tracking_events_idempotency_key_unique").on(t.idempotencyKey)`（允許多筆 `null`，PostgreSQL `unique` 對 `null` 不做唯一性檢查，符合「非 Agent 寫入路徑可不提供此值」的需求）|

- 用途：讓 Step 7D-2 Agent Write API 在寫入事件時可帶入冪等鍵，避免同一筆事件因重試或重複觸發被寫入多次
- nullable 設計確保既有寫入路徑（非 Agent 來源）不受影響
- **本次僅在文件中規劃此欄位規格，實際新增由 Step 7D-2B 執行**

---

## 5. Index / Constraint 最終建議

### 5.1 `seller_agent_tokens`

| 類型 | 名稱 | 內容 | 用途 |
|------|------|------|------|
| index | `seller_agent_tokens_merchant_id_idx` | `merchantId` | 依賣家查詢其名下所有 token |
| index | `seller_agent_tokens_store_id_idx` | `storeId` | 依店鋪查詢 token，比照 `productsTable.storeId` 慣例 |
| index | `seller_agent_tokens_token_prefix_idx` | `tokenPrefix` | 介面列表辨識查詢 |
| unique | `seller_agent_tokens_token_hash_unique` | `tokenHash` | 確保雜湊值不重複，亦可作為驗證查詢的快速路徑 |
| check | `seller_agent_tokens_status_valid` | `status IN ('active','revoked','expired','disabled')` | 白名單約束 |

### 5.2 `agent_run_logs`

| 類型 | 名稱 | 內容 | 用途 |
|------|------|------|------|
| index | `agent_run_logs_token_id_idx` | `tokenId` | 依 token 查詢其執行歷史 |
| index | `agent_run_logs_store_id_idx` | `storeId` | 依店鋪查詢執行歷史 |
| index | `agent_run_logs_status_started_at_idx` | `(status, startedAt)` | 監控「執行中」與依時間排序查詢，比照 `shipmentTrackingsTable.isActive + nextCheckAt` 複合索引慣例 |
| check | `agent_run_logs_run_type_valid` | `run_type IN ('manual','scheduled','webhook','csv_after_import','test')` | 白名單約束 |
| check | `agent_run_logs_status_valid` | `status IN ('running','completed','failed','partial')` | 白名單約束 |
| check | `agent_run_logs_counts_non_negative` | `checked_count >= 0 AND success_count >= 0 AND failed_count >= 0` | 比照 `inventory_non_negative` 慣例 |

### 5.3 `shipment_tracking_events`（新增 `idempotencyKey` 後）

| 類型 | 名稱 | 內容 | 用途 |
|------|------|------|------|
| unique | `shipment_tracking_events_idempotency_key_unique` | `idempotencyKey` | 防止同一冪等鍵重複寫入；nullable 欄位上的 unique 索引允許多個 `null` |

---

## 6. `merchantId` + `storeId` 歸屬檢查方式

承接 Step 7D-1C 規格文件第 3 章的命名與語意定案，本文件將檢查方式收斂為以下具體流程，供 Step 7D-2B 之後的 middleware／API 實作參考（**本階段不寫程式碼**）：

1. **建立 token 時**：後端必須先查詢 `storesTable`，確認「目前登入的賣家（Clerk session 的 merchantId）」確實擁有 `storeId` 所指的店鋪，即 `storesTable.merchantId === session.merchantId AND storesTable.id === storeId` 同時成立，才允許寫入 `seller_agent_tokens`；寫入的 `merchantId` 一律從 `storesTable.merchantId` 查詢結果取得，**不直接信任請求方傳入的值**
2. **驗證 token 時**：
   - 第一層：以 `tokenHash` 比對找到對應的 `seller_agent_tokens` 記錄，並檢查 `status`、`expiresAt` 是否有效
   - 第二層：從找到的記錄解析出權威的 `merchantId` 與 `storeId`，作為本次請求的權限範圍依據
   - 第三層（建議的額外檢查）：比對 `seller_agent_tokens.storeId` 對應的 `storesTable.merchantId` 是否仍與 `seller_agent_tokens.merchantId` 一致，用於偵測「店鋪轉移擁有者」等邊界情境；是否要做到這一層、做到什麼頻率（每次請求 vs. 定期批次檢查），建議留待 Step 7D-2B 實作時依效能需求決定，**不阻塞 schema 設計**
3. **任何情況下**，都不允許 request body / query / header 自帶 `merchantId` 來決定權限——正確順序永遠是「先驗證 token → 從 token 記錄解析出 `merchantId` / `storeId` → 再用解析出的值去檢查請求中的 `storeId` / 資源歸屬是否吻合」

---

## 7. Step 7D-2B schema 檔案規劃

依現有 `lib/db/src/schema/index.ts` 的匯出順序與命名慣例（`stores` → `productCategories` → `products` → `orders` → `cvsStores` → `shipmentTrackings` → `shipmentTrackingEvents`），Step 7D-2B 預計需要：

### 7.1 新增檔案

| 檔案路徑 | 內容 |
|----------|------|
| `lib/db/src/schema/sellerAgentTokens.ts` | `seller_agent_tokens` 表定義（依本文件第 3 章欄位表） |
| `lib/db/src/schema/agentRunLogs.ts` | `agent_run_logs` 表定義（依本文件第 4.1 節欄位表） |

### 7.2 修改檔案

| 檔案路徑 | 修改內容 |
|----------|----------|
| `lib/db/src/schema/index.ts` | 新增 `sellerAgentTokens`、`agentRunLogs` 兩個匯出，建議接在 `shipmentTrackingEvents` 之後 |
| `lib/db/src/schema/shipmentTrackingEvents.ts` | 新增 `idempotencyKey` 欄位與對應 `unique` index（依本文件第 4.2 節與第 5.3 節） |

### 7.3 不需新增/修改

- 不需要 `seller_agents` 表（Step 7D-1C 第 6 章已確認 MVP 不需要）
- 不需要 `agent_audit_logs` 表（Step 7D-1C 第 7 章已確認延後至 Step 7F）

---

## 8. Typecheck / DB Push / Rollback 計畫

### 8.1 Typecheck

1. 完成 schema 檔案撰寫後，於 `lib/db` 套件執行 typecheck（依現有套件設定的指令，例如 `pnpm --filter @workspace/db typecheck` 或對應腳本，實際指令名稱以 Step 7D-2B 開工時 `lib/db/package.json` 的腳本定義為準）
2. 確認新增的 `sellerAgentTokens`、`agentRunLogs` 型別可被 `schema/index.ts` 正確匯出且無型別錯誤

### 8.2 DB Push

1. **執行 `drizzle-kit push` 前，必須先完成資料庫備份**（見第 1.11 節），備份方式與保存位置由執行者依現有環境的備份機制決定
2. 確認 `DATABASE_URL` 環境變數已正確設定（`drizzle.config.ts` 在缺少此變數時會拋出錯誤）
3. 先以非破壞性的 `push`（而非 `push-force`）執行，觀察 `drizzle-kit` 產生的異動預覽，確認異動範圍僅包含本次規劃的兩個新表與 `shipment_tracking_events` 的新欄位/索引，**不包含任何非預期的異動**
4. 確認異動內容無誤後才正式套用

### 8.3 Rollback 計畫

1. 若 push 後發現問題，優先使用備份還原資料庫（見 8.2.1）
2. 若僅需撤銷 schema 變更本身（尚未有資料寫入新表/新欄位的情況），可手動撰寫對應的 `DROP TABLE` / `ALTER TABLE ... DROP COLUMN` 還原語句，或重新調整 schema 程式碼後再次執行 `push` 收斂回原狀
3. **不建議**在已有資料寫入新表/新欄位之後才執行 rollback——應優先評估是否能透過修正 schema 向前修復，而非向後還原，避免資料遺失

---

## 9. 測試計畫

| # | 測試項目 | 類型 | 說明 |
|---|----------|------|------|
| 1 | `seller_agent_tokens` schema 型別檢查 | typecheck | 確認欄位型別、FK、nullable 設定符合本文件第 3 章規格 |
| 2 | `agent_run_logs` schema 型別檢查 | typecheck | 確認欄位型別、FK、nullable 設定符合本文件第 4.1 節規格 |
| 3 | `shipment_tracking_events.idempotencyKey` 型別檢查 | typecheck | 確認新欄位與 unique index 正確匯出 |
| 4 | `drizzle-kit push` 異動預覽檢查 | 手動驗證 | 確認異動範圍僅限本次規劃內容，無非預期異動 |
| 5 | `status` / `runType` / run `status` 白名單 constraint 驗證 | 手動驗證（SQL） | 嘗試寫入白名單外的值，確認被資料庫拒絕 |
| 6 | `checkedCount` / `successCount` / `failedCount` non-negative constraint 驗證 | 手動驗證（SQL） | 嘗試寫入負值，確認被資料庫拒絕 |
| 7 | `seller_agent_tokens.tokenHash` unique constraint 驗證 | 手動驗證（SQL） | 嘗試寫入重複雜湊值，確認被資料庫拒絕 |
| 8 | `agent_run_logs.tokenId` FK `set null` 行為驗證 | 手動驗證（SQL） | 刪除對應 token 後，確認既有 log 的 `tokenId` 變為 `null` 而非整列被刪除 |
| 9 | `seller_agent_tokens.storeId` FK `cascade` 行為驗證 | 手動驗證（SQL） | 刪除對應 store 後，確認其名下 token 隨之被刪除 |
| 10 | `idempotencyKey` unique index 對 `null` 的容忍度驗證 | 手動驗證（SQL） | 確認可寫入多筆 `idempotencyKey = null` 的事件記錄，但相同非 null 鍵值會被拒絕 |
| 11 | `index.ts` 匯出完整性驗證 | typecheck / 手動驗證 | 確認 `sellerAgentTokens`、`agentRunLogs` 可被其他模組正確 import |
| 12 | Schema 變更對既有功能無回歸 | 手動驗證 | 確認既有 `orders`、`shipmentTrackings`、`shipmentTrackingEvents` 等表的既有查詢與寫入流程不受影響 |

**未執行自動化測試，原因是：本次僅新增 Step 7D-2A Agent schema 實作前檢查文件，未修改功能程式碼。**

---

## 10. 風險清單

| # | 風險 | 等級 | 說明 |
|---|------|------|------|
| 1 | `drizzle-kit push` 異動範圍超出預期 | 高 | 若 schema 檔案撰寫有誤，`push` 可能產生非預期的 `DROP` / `ALTER` 異動，影響既有資料表；務必先備份並檢視異動預覽 |
| 2 | 未備份即執行 push | 高 | 一旦發生問題且無備份，可能造成資料不可逆遺失 |
| 3 | `tokenHash` / `tokenPrefix` 設計不慎導致可逆推出明文 | 高 | 必須確保只存雜湊值與不足以重組的前綴片段，且 `errorMessage` 等欄位不可記錄敏感資訊 |
| 4 | `merchantId` 冗余存放與 `storesTable.merchantId` 不一致 | 中 | 需仰賴第 6 章所述的建立流程與（可選的）驗證時一致性檢查來避免漂移 |
| 5 | `idempotencyKey` 與既有 `shipment_tracking_events` 寫入路徑的相容性 | 中 | nullable 設計理論上不影響既有路徑，但仍需在實作時驗證既有寫入邏輯不會因新欄位/新索引而出錯 |
| 6 | white-list（`status` / `runType` / run `status`）未來擴充需求 | 低 | 目前白名單以 MVP 可預見範圍設計，未來若需新增類型，需同步修改 `check` constraint，屬於可預期的維護成本 |
| 7 | Log 不清理導致資料量成長 | 低 | MVP 階段刻意不做自動清理，需在文件中持續追蹤，作為未來優化項目排入規劃 |
| 8 | 主工作區持續存在未處理的 modified/untracked 檔案 | 中 | `.replit`、`orderStatusMachine.ts`、`orders.route.test.mjs`、`orderStatus.ts`、`Orders.tsx` 為 modified，`docs/order-step7c-schema-migration-implementation-audit.md`、`docs/order-step8a-order-actions-audit.md` 為新增 untracked，狀態與前次觀察一致（無變化），疑似有其他並行工作線（如 Claude A）正在進行中的變更；本次任務全程只在 worktree 操作，未觸碰主工作區任何檔案，僅如實記錄、不處理 |

---

## 11. 是否可進入 Step 7D-2B 的明確判斷

**結論：可以進入 Step 7D-2B（Drizzle schema 實作）。**

判斷依據：

1. Step 7D-1C 規格文件第 12 章列出的所有「待確認」項目，本文件第 1 章已逐項給出明確的 MVP 建議，**沒有遺留任何阻塞性的開放問題**
2. 本文件第 3、4 章已產出 `seller_agent_tokens`、`agent_run_logs` 與 `shipment_tracking_events.idempotencyKey` 的最終欄位建議表，欄位型別、nullable、預設值、FK、`onDelete` 策略均已明確
3. 第 5 章已產出完整的 index / constraint 建議，命名與寫法均比照現有 schema 慣例（`check`、`unique`、`index`），無需引入新模式
4. 第 6 章已說明 `merchantId` + `storeId` 歸屬檢查的具體流程，足以指導後續 middleware／API 設計，且不影響 schema 結構本身
5. 第 7 章已明確列出 Step 7D-2B 需要新增與修改的檔案清單，範圍可控（2 個新檔案 + 2 個修改檔案）
6. 第 8 章已提供 typecheck / DB push / rollback 的具體執行順序，**特別強調「push 前必須備份」這個硬性前置條件**

**唯一的執行前提**：Step 7D-2B 開工時，執行者必須先完成資料庫備份，再進行 `drizzle-kit push`；本文件不對「是否已完成備份」做出判斷或代為執行，僅將其列為 Step 7D-2B 的硬性前置條件。

---

## 12. 下一步建議

1. **Step 7D-2B**：依本文件第 3、4、5、7 章的最終建議，建立 `lib/db/src/schema/sellerAgentTokens.ts`、`agentRunLogs.ts`，修改 `schema/index.ts` 與 `shipmentTrackingEvents.ts`（補 `idempotencyKey`），並依第 8 章計畫完成備份、typecheck、`drizzle-kit push`
2. **Step 7D-2C**：建議接續進行 Agent token 建立／撤銷的 API 設計（依本文件第 6 章的歸屬檢查流程），仍屬規格與設計層級，尚未進入完整實作
3. **Step 7D-2D**：建議接續進行 `agent_run_logs` 寫入流程與驗證 middleware 的詳細設計
4. **本次任務範圍不包含**：Step 7D-2B 的 schema 程式碼撰寫、API route 實作、UI、worker、OpenClaw / n8n、Seller Agent Workspace、Step 7E / 7F / 7G / 7H 的任何內容
5. 建議請主工作區的其他工作線確認 `.replit` / `orderStatusMachine.ts` / `orders.route.test.mjs` / `orderStatus.ts` / `Orders.tsx` 的異動狀態，以及新增的 `docs/order-step7c-schema-migration-implementation-audit.md`、`docs/order-step8a-order-actions-audit.md`，避免後續整合衝突
