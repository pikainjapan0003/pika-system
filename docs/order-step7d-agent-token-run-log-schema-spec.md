# Step 7D-1C：Agent Token / Run Log Schema 規格文件

> **文件性質聲明**：本文件是 **Step 7D-1C schema 規格文件**，目的是把 [[order-step7d-agent-auth-token-decision|Step 7D-1B 決策文件]] 中已定案的 Agent token / run log 方向，轉成可供 Step 7D-2 實作參考的精準 schema 草案（欄位、型別、索引、約束、關聯）。
>
> 本文件**不是** DB schema 實作、**不是** migration、**不是** API route 實作、**不是** worker、**不是** Seller Agent Workspace UI。所有規劃內容仍以「規格草案」性質呈現，實際 schema 程式碼與 migration 由 Step 7D-2（依本文件第 12 章檢查清單先行確認後）撰寫。

---

## 1. Step 7D-1C 定位

- 本文件是 **Agent token / run log 的 schema 規格文件**，把決策轉成可被 Step 7D-2 直接參照的欄位/型別/索引/約束/關聯草案
- **不做 DB schema 實作**（不新增 `lib/db/src/schema/sellerAgentTokens.ts`、`agentRunLogs.ts` 等檔案）
- **不產生 migration**（不執行 `drizzle-kit push` 或產生 SQL migration 檔）
- **不做 API route**（不修改 `artifacts/api-server/src/routes/`）
- **不做 worker**（不修改任何背景查詢/回報邏輯）
- **不做 Seller Agent Workspace UI**（UI 規劃留待 Step 7E）

---

## 2. 與 Step 7D-1B 的關係

| 階段 | 內容 | 產出 |
|---|---|---|
| Step 7D-1B（已完成） | 決策 MVP token 方向、idempotency key 放置位置、rawPayload 清洗規則 | [[order-step7d-agent-auth-token-decision]]（決策文件，定出「要做什麼」） |
| **Step 7D-1C（本文件）** | 把上述決策轉成精準 schema 規格：欄位、型別、nullable、預設值、索引、約束、關聯 | 本文件（規格草案，定出「schema 長什麼樣子」） |
| Step 7D-2A（下一步） | 依本文件第 12 章檢查清單，逐項確認待確認事項，作為實作前最後把關 | 檢查結果 / 確認紀錄 |
| Step 7D-2B（再下一步） | 依本文件規格，正式撰寫 `sellerAgentTokens.ts`、`agentRunLogs.ts`、執行 migration | 實際 schema 程式碼 + migration |

本文件**只規劃 schema 草案**，不在 Step 7D-1C 階段下任何「最終 schema 定案」——凡標註「待確認」者，一律留到 Step 7D-2A 由使用者拍板後才視為定案。

---

## 3. 命名與語意定案

延續 [[order-step7d-agent-auth-token-decision|Step 7D-1B 第 3 章]] 的決策，本文件重申並落實到 schema 設計層面：

1. **不新增 `sellerId` 欄位**——現有系統（`storesTable`、`ordersTable` 等）完全沒有 `sellerId` 欄位或概念，本文件規劃的所有資料表也不會新增此欄位
2. **使用 `merchantId` + `storeId`**——`merchantId`（text，對應 Clerk user ID，與 `storesTable.merchantId` 同型別同語意）+ `storeId`（integer，FK → `stores.id`）共同構成資料隔離與權限範圍的依據
3. **`seller_agent_tokens` 表名保留 `seller` 作為產品語意，但欄位使用 `merchantId`**——表名沿用 Step 7D-1B 決策中「賣家自己的 Agent」這個產品概念用語，但實際欄位命名與型別完全比照現有系統慣例（`merchantId: text`），不引入新術語造成程式碼與規格用語不一致
4. **Agent token scope 綁定 `merchantId` + `storeId`**——一把 token 的有效範圍由這兩個欄位共同決定，缺一不可
5. **`storeId` 對外可見，`merchantId` 由 token 解析取得**——
   - API 請求路徑/參數中可以包含 `storeId`（例如 `GET /agent/tracking-jobs?storeId=123`），這是公開可見的識別資訊
   - `merchantId` **不應該**由請求方提供或在請求中暴露，而是 middleware 驗證 token 時，從 `seller_agent_tokens.merchantId` 解析取得，作為「這把 token 真正屬於誰」的權威來源
6. **不允許 request body / query / header 自帶 `merchantId` 來決定權限**——任何「以請求方提供的 `merchantId` 作為權限判斷依據」的設計都是不安全的（等同信任客戶端自報身分）；正確順序永遠是：**先驗證 token → 從 token 記錄解析出 `merchantId`/`storeId` → 再用解析出的值去檢查請求中的 `storeId`/資源歸屬是否吻合**

---

## 4. `seller_agent_tokens` Schema 規格

> 用途：儲存賣家為自己的 Agent 產生的 token（雜湊後），作為 Agent Write API 的認證與授權範圍依據。對應 [[order-step7d-agent-auth-token-decision|Step 7D-1B 第 6.1 章]] 的規劃草案。

### 4.1 欄位規格

| 欄位 | 建議 DB 欄位名 | 建議型別 | Nullable | 預設值 | 用途 | 安全注意事項 |
|---|---|---|---|---|---|---|
| `id` | `id` | `serial` (PK) | 否 | 自動遞增 | 主鍵 | 無 |
| `merchantId` | `merchant_id` | `text` | 否 | 無 | 對應 `storesTable.merchantId`（Clerk user ID），標識 token 歸屬的賣家 | 不可由請求方提供，只能從 token 驗證結果解析取得；比對時須與 `storesTable.merchantId` 一致（見 4.3） |
| `storeId` | `store_id` | `integer` (FK → `stores.id`) | 否 | 無 | 標識 token 授權範圍對應的店鋪 | 與 `merchantId` 共同構成 scope，缺一不可；FK 保證不會指向不存在的店鋪 |
| `name` | `name` | `text` | 否 | 無 | 賣家自訂名稱，方便辨識用途（例：「我的出貨機器人」） | 屬於賣家自填內容，寫入前可考慮長度限制（待 Step 7D-2A 確認），不應包含敏感資訊 |
| `tokenHash` | `token_hash` | `text` | 否 | 無 | 儲存 token 雜湊後的值，用於驗證請求 | **不存明文**；只存雜湊；雜湊演算法待第 12 章確認；資料庫外洩時不應可逆推出可用憑證 |
| `tokenPrefix` | `token_prefix` | `text` | 否 | 無 | 儲存 token 明文的前綴片段（例如 `agt_xxxxx` 的 `agt_xxxxx` 前 8 碼），用於使用者在介面上辨識「這是哪一把 token」而不需重新顯示明文 | 只存「足以辨識、不足以重組出完整 token」的片段；長度與格式待第 12 章確認 |
| `status` | `status` | `text` | 否 | `'active'` | 標示 token 目前狀態 | 白名單：`active` / `revoked` / `expired` / `disabled`（見 4.4），驗證 middleware 必須檢查此欄位 |
| `scopes` | `scopes` | `jsonb`（MVP 建議，見 4.6） | 否 | `'["shipment:write"]'`（MVP 固定單一範圍） | 標示這把 token 被授權執行的操作範圍 | MVP 階段格式與內容待第 12 章確認；不可僅因「token 存在且未過期」就視為擁有所有權限，仍須檢查 `scopes` |
| `lastUsedAt` | `last_used_at` | `timestamp (withTimezone)` | 是 | `null` | 記錄這把 token 最後一次成功通過驗證並使用的時間 | 提供「這個 token 是否還在使用」的可觀測性依據；更新時機見 4.7（不應每次請求都同步寫入，避免高頻寫入造成效能負擔） |
| `expiresAt` | `expires_at` | `timestamp (withTimezone)` | 是 | `null` | 記錄 token 的過期時間 | `null` 代表不過期；MVP 是否強制必填待第 12 章確認；驗證 middleware 必須檢查「若不為 null 且已過期，視為無效」 |
| `revokedAt` | `revoked_at` | `timestamp (withTimezone)` | 是 | `null` | 記錄 token 被撤銷的時間 | 與 `status` 欄位的關係見 4.8；撤銷後的 token 必須立即且不可逆地無法使用 |
| `createdAt` | `created_at` | `timestamp (withTimezone)` | 否 | `defaultNow()` | 記錄建立時間 | 比照現有 schema 慣例（如 `storesTable.createdAt`） |
| `updatedAt` | `updated_at` | `timestamp (withTimezone)` | 否 | `defaultNow()` + `$onUpdate(() => new Date())` | 記錄最後更新時間 | 比照現有 schema 慣例（如 `storesTable.updatedAt`） |

### 4.2 FK：`storeId` → `stores.id`

- 比照 `productsTable.storeId`、`ordersTable.storeId`、`shipmentTrackingsTable.orderId` 的現有寫法：`integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" })`
- `onDelete` 策略建議採 `"cascade"`——當店鋪被刪除時，其名下的 Agent token 應一併失效並清除，避免殘留可用憑證指向不存在的店鋪（這是安全考量，優先於資料保留考量）；最終策略待 Step 7D-2A 確認

### 4.3 `merchantId` 與 `stores.merchantId` 的一致性檢查方式

- **設計原則**：`seller_agent_tokens.merchantId` 是「冗余存放」（denormalized），目的是讓驗證 middleware 不需要每次都 join `storesTable` 即可取得 `merchantId`，但這也意味著**必須有機制保證它與 `storesTable.merchantId` 不會不一致**
- **建議的一致性保證方式**（MVP，應用層）：
  1. 建立 token 時，後端必須先查詢 `storesTable`，確認「目前登入的賣家（Clerk session 的 merchantId）」確實擁有 `storeId` 所指的店鋪（即 `storesTable.merchantId === session.merchantId AND storesTable.id === storeId`），才允許寫入 `seller_agent_tokens`，且寫入的 `merchantId` 一律從 `storesTable.merchantId` 查詢結果取得，**不直接信任請求方傳入的值**
  2. 驗證 token 時，除了檢查 `tokenHash` 是否匹配、`status`/`expiresAt` 是否有效之外，建議**額外檢查** `seller_agent_tokens.storeId` 對應的 `storesTable.merchantId` 是否仍與 `seller_agent_tokens.merchantId` 一致（用於偵測「店鋪轉移擁有者」等邊界情境，是否要做這層檢查、做到什麼程度待 Step 7D-2A 確認）
- **DB 層級的一致性保證**（待評估，非 MVP 必須）：可考慮在 `(merchantId, storeId)` 組合上建立 check constraint 或透過應用層交易保證，但這涉及與 `storesTable` 的跨表約束，Postgres 原生不支援跨表 check constraint，預期仍以應用層檢查為主

### 4.4 `status` 白名單

- `active`：正常可用
- `revoked`：已被賣家或系統主動撤銷，不可逆
- `expired`：已超過 `expiresAt`（可由排程或驗證當下即時判斷，不一定需要寫回 DB；是否需要主動更新此狀態待 Step 7D-2A 確認）
- `disabled`：因其他原因（如安全事件、平台維運）被停用，與 `revoked` 的差異在於 `disabled` 可能可逆（例如平台排查完畢後重新啟用），`revoked` 不可逆

> 驗證邏輯應以「`status === 'active'` 且 `expiresAt` 為 null 或尚未到期」作為唯一的「token 有效」判斷依據，不應只檢查其中一項。

### 4.5 `tokenHash` / `tokenPrefix` 是否 unique

- **`tokenHash`：建議 `unique`**——同一雜湊值理論上不應對應到兩筆不同的 token 記錄（雜湊碰撞機率極低，且若發生應視為異常），加上 `unique` 約束可在 DB 層面提供最後防線，也讓「依雜湊值查找 token」的查詢具有唯一性保證
- **`tokenPrefix`：不建議設為 `unique`**——前綴片段本來就可能重複（不同賣家可能拿到相同前綴的 token），加上 `unique` 反而會造成「前綴碰撞時無法建立新 token」的不合理限制；建議改為**一般 index**（用於介面上「依前綴搜尋/篩選 token」的查詢效能），不做唯一性約束

### 4.6 `scopes` 欄位格式建議

- **MVP 建議使用 `jsonb`**，理由：
  - 比 `text[]` 更彈性，未來若 scope 需要攜帶額外結構化資訊（例如某個 scope 的子範圍限制）時不需要改變欄位型別
  - 與現有 schema 慣例一致（`ordersTable.specValues` 已使用 `jsonb`）
  - `drizzle-zod` 對 `jsonb` 欄位的型別推導與驗證整合較直接
- **MVP 內容建議**：先固定為單一範圍陣列，例如 `["shipment:write"]`，代表「這把 token 只能寫入物流貨態相關資料」；不需要在 MVP 階段設計細緻的權限樹狀結構
- 確切的 scope 命名規則（例如是否要設計成 `resource:action` 格式、未來是否要支援多重 scope 組合）待第 12 章確認

### 4.7 `expiresAt` 是否必填

- **MVP 建議：不強制必填（nullable，預設 `null`）**
- 理由：
  - 延續 [[order-step7d-agent-auth-token-decision|Step 7D-1B 第 5 章]] 決策原文：「`expiresAt` 提供生命週期管理的彈性（MVP 階段可允許為 null 代表不過期，但欄位本身要存在）」
  - 強制要求賣家在建立 token 時就決定過期時間，會增加 MVP 階段的操作複雜度與認知負擔
  - 欄位已存在，未來若要在 UI 上引導或強制賣家設定過期時間，屬於介面與政策層面的調整，不需要改變 schema
- 是否要在 MVP 階段就「建議」一個預設過期時間（例如 90 天）由前端帶入，待 Step 7D-2A 確認

### 4.8 `lastUsedAt` 更新時機

- **建議**：在驗證 middleware 成功通過驗證、且請求即將進入實際業務邏輯處理前，非同步更新 `lastUsedAt = now()`
- **不建議**：每次請求都同步（阻塞主流程）寫入——這會在高頻請求情境下對資料庫造成不必要的寫入壓力
- **可選的優化方向**（留待 Step 7D-2A 評估是否 MVP 階段就採用）：例如「距離上次更新超過 N 分鐘才寫入」的節流策略，避免短時間內大量重複寫入同一筆記錄

### 4.9 `revokedAt` 與 `status` 的關係

- 兩者應保持邏輯一致：當 `status = 'revoked'` 時，`revokedAt` 必須有值；當 `status != 'revoked'` 時，`revokedAt` 應為 `null`
- **建議的撤銷操作順序**：同一個交易（transaction）內，同時將 `status` 更新為 `'revoked'` 並寫入 `revokedAt = now()`，避免兩個欄位狀態不一致的中間態
- 是否要透過 DB check constraint 強制這個一致性（例如 `CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))`），待 Step 7D-2A 確認是否在 MVP 階段就導入

### 4.10 `createdAt` / `updatedAt` 更新策略

- 完全比照現有 schema 慣例（`storesTable`、`shipmentTrackingsTable` 等）：
  - `createdAt`：`timestamp("created_at", { withTimezone: true }).notNull().defaultNow()`
  - `updatedAt`：`timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())`
- 不需要額外設計，沿用現有模式即可

---

## 5. `agent_run_logs` Schema 規格

> 用途：記錄每次 Agent 執行（一輪查詢/回報）的基本執行紀錄，提供最低限度的可觀測性與除錯依據。對應 [[order-step7d-agent-auth-token-decision|Step 7D-1B 第 6.2 章]] 的「最小版本」規劃。

### 5.1 欄位規格

| 欄位 | 建議 DB 欄位名 | 建議型別 | Nullable | 預設值 | 用途 | 安全注意事項 |
|---|---|---|---|---|---|---|
| `id` | `id` | `serial` (PK) | 否 | 自動遞增 | 主鍵 | 無 |
| `tokenId` | `token_id` | `integer` (FK → `seller_agent_tokens.id`) | 否 | 無 | 標識這次執行使用的是哪一把 token | 用於追蹤「哪個 Agent 做了什麼」；FK 策略見 5.2 |
| `merchantId` | `merchant_id` | `text` | 否 | 無 | 冗余存放，避免每次查詢都需要 join `seller_agent_tokens` | 寫入時必須從 `seller_agent_tokens.merchantId` 取得，不可信任請求方傳入值 |
| `storeId` | `store_id` | `integer` (FK → `stores.id`) | 否 | 無 | 冗余存放，同上，並提供依店鋪篩選執行紀錄的查詢效率 | 同上，從 `seller_agent_tokens.storeId` 取得 |
| `runType` | `run_type` | `text` | 否 | 無 | 標示這次執行的觸發來源/類型 | 白名單見 5.4 |
| `status` | `status` | `text` | 否 | `'running'` | 標示這次執行目前/最終的狀態 | 白名單見 5.5 |
| `startedAt` | `started_at` | `timestamp (withTimezone)` | 否 | `defaultNow()` | 記錄這次執行開始的時間 | 無 |
| `finishedAt` | `finished_at` | `timestamp (withTimezone)` | 是 | `null` | 記錄這次執行結束的時間 | `null` 代表尚未結束（執行中）或異常中斷未正常收尾；是否要設計逾時機制待 Step 7D-2A 評估（非 MVP 必須） |
| `checkedCount` | `checked_count` | `integer` | 否 | `0` | 本輪檢查/處理的任務總數 | 無 |
| `successCount` | `success_count` | `integer` | 否 | `0` | 本輪成功處理的數量 | 無 |
| `failedCount` | `failed_count` | `integer` | 否 | `0` | 本輪失敗的數量 | 無 |
| `errorCode` | `error_code` | `text` | 是 | `null` | 記錄本輪執行若有整體性錯誤的錯誤代碼 | 應為平台定義的標準化代碼，不應直接存放第三方服務的原始錯誤碼（避免洩漏內部依賴細節） |
| `errorMessage` | `error_message` | `text` | 是 | `null` | 記錄本輪執行若有整體性錯誤的簡要說明 | **必須遵循第 8 章清洗規則**：只存清洗後摘要，不可存放 stack trace 或敏感資訊（見第 9 章） |
| `createdAt` | `created_at` | `timestamp (withTimezone)` | 否 | `defaultNow()` | 記錄這筆 log 的建立時間 | 無 |

### 5.2 FK：`tokenId` → `seller_agent_tokens.id`、`storeId` → `stores.id`

- **`tokenId` FK**：`integer("token_id").notNull().references(() => sellerAgentTokensTable.id, { onDelete: ... })`
  - `onDelete` 策略：[[order-step7d-agent-auth-token-decision|Step 7D-1B 第 6.2 章]] 提出 `"cascade"` 或 `"set null"` 兩個方向，本文件建議傾向 **`"set null"` 並將 `tokenId` 改為 nullable**——因為 run log 是「歷史執行紀錄」，即使對應的 token 之後被刪除，仍應保留「曾經有這次執行」的紀錄以利追溯；但若採 `"set null"`，則 `tokenId` 欄位定義需調整為 nullable，這是與上表「`tokenId` 否 nullable」不同的設計選擇，**最終策略待 Step 7D-2A 確認**（本文件先以 `notNull` + 待確認的方式呈現，避免本文件自行拍板影響範圍超出規格文件性質）
- **`storeId` FK**：比照 `seller_agent_tokens.storeId` 的設計，`integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" })`

### 5.3 `runType` 白名單

- `manual`：賣家或操作者手動觸發
- `scheduled`：排程自動觸發（例如定時查詢物流狀態）
- `webhook`：由外部服務（物流業者、n8n、OpenClaw 等）透過 webhook 觸發
- `csv_after_import`：CSV 匯入後接續觸發的執行
- `test`：測試/除錯用途的執行（**正式環境是否允許寫入此類型待 Step 7D-2A 確認**，避免測試資料污染正式統計）

### 5.4 `status` 白名單

- `running`：執行中（尚未結束）
- `completed`：成功完成（`successCount` 應等於或接近 `checkedCount`，視業務定義而定）
- `failed`：整體執行失敗（例如連線失敗、認證失敗等導致整輪都無法進行）
- `partial`：部分成功部分失敗（`checkedCount = successCount + failedCount` 且兩者皆大於 0 的情境）

### 5.5 `errorMessage` 安全要求

- **不可保存 stack trace**——任何包含程式檔案路徑、行號、呼叫堆疊的內容都不可寫入此欄位
- **不可保存敏感資料**——包含但不限於：Authorization / Cookie 標頭內容、token / API key / password、買家個資（電話、地址、email）、付款資訊
- 寫入前必須先經過與第 8 章相同等級的清洗流程，只保留「足以讓開發者定位問題類型」的摘要文字（例如：`"物流業者 API 回應逾時"` 而非完整的 HTTP 錯誤回應內容）

### 5.6 `checkedCount` / `successCount` / `failedCount` 預設值

- 三者預設值皆為 `0`（`integer(...).notNull().default(0)`），執行開始時建立記錄為 `0/0/0`，執行過程中遞增更新，執行結束時應滿足 `checkedCount >= successCount + failedCount`（是否要用 check constraint 強制此關係待 Step 7D-2A 評估，非 MVP 必須）

### 5.7 Log 保留期限

- **MVP 階段不做保留期限機制**——不設計自動清除/封存邏輯，所有 run log 永久保留於資料庫
- 理由：
  - 延續 [[order-step7d-agent-auth-token-decision|Step 7D-1B 第 6.2 章]]「只做最小寫入版本，查詢/統計/UI 留到 Step 7F」的決策精神，保留期限機制屬於「治理/維運」層面的功能，不影響 MVP 核心功能可用性
  - 過早設計清除邏輯有「資料遺失」風險，且目前完全沒有實際資料量的觀察依據
- 成長量觀察與是否需要保留期限機制，留待 Step 7F 依實際資料累積情況評估（已記錄於第 14 章風險）

---

## 6. 是否需要 `seller_agents` 表

**結論：MVP 不新增 `seller_agents` 表。**

- 先以 `seller_agent_tokens` 代表「啟用一組 Agent 存取能力」——「一把 token 即代表一個 Agent」的模型已足夠滿足 Step 7D-0 規格中「每個賣家自己的 Agent」的核心需求
- Seller Agent Workspace 進入 Step 7E 規劃階段時，再依實際 UI/UX 需求重新評估是否需要在 token 之上抽象出獨立的「Agent」實體（例如一個賣家管理多個具名 Agent、每個 Agent 綁定多把 token 等情境）
- **不要過早抽象化**——延續 [[order-step7d-agent-auth-token-decision|Step 7D-1B 第 6.4 章]]的判斷：在還沒有實際多 Agent 管理需求的證據之前就建表，容易導致表結構與實際使用情境不符，之後還要再改一輪

---

## 7. 是否需要 `agent_audit_logs` 表

**結論：MVP 不新增完整 `agent_audit_logs` 表。**

- `agent_run_logs`（第 5 章）先以最小版本記錄「每輪執行的基本執行紀錄」，提供 MVP 階段所需的最低限度可觀測性
- 完整稽核軌跡（記錄每一次 API 呼叫的詳細資訊：來源 IP、請求/回應內容、操作前後差異等）屬於「高風險寫入需要完整追溯」的進階需求，留待 **Step 7F** 依 [[order-step7d-agent-auth-token-decision|Step 7D-1B 第 6.3 章]] 規劃的草案欄位再行設計
- Step 7D 階段，可在 API 測試計畫（第 13 章）中保留 **TODO 標記**，註明「完整 audit log 待 Step 7F 補上」，避免 Step 7D 的測試規劃誤以為此功能已涵蓋

---

## 8. Idempotency Key 規格

1. **目前狀態**：`shipment_tracking_events` 表（即 `shipmentTrackingEventsTable`，定義於 `lib/db/src/schema/shipmentTrackingEvents.ts`）**目前沒有 `idempotencyKey` 欄位**——已透過 `grep -n "idempotencyKey|idempotency" -ri lib/db/src/schema` 確認 0 筆結果，現有欄位為 `id`、`shipmentTrackingId`、`eventCode`、`eventStatus`、`eventDescription`、`eventLocation`、`occurredAt`、`rawData`、`createdAt`
2. **Step 7D-2 應如何使用**：
   - 需在 `shipmentTrackingEventsTable` 新增欄位 `idempotencyKey`（建議 DB 欄位名 `idempotency_key`，型別 `text`，**nullable**——理由：並非每個事件來源都一定能提供 idempotency key，例如系統內部產生的事件可能不需要）
   - 此欄位新增屬於 **Step 7D-2 的 schema 異動範疇**，本文件只規劃欄位規格，不在本階段新增或產生 migration
3. **是否需要本階段補 schema**：**不需要**——本文件範圍明確排除任何 DB schema 實作與 migration；欄位新增與 migration 留待 Step 7D-2 執行
4. **MVP 防重決策（重申 [[order-step7d-agent-auth-token-decision|Step 7D-1B 第 7 章]]）**：
   - 應用層先以 `shipmentTrackingId` + `idempotencyKey` 組合查詢防重——寫入前先查詢「是否已存在相同 `shipmentTrackingId` + `idempotencyKey` 的事件」，若存在則回傳既有結果（或視為成功但不重複寫入），不再新增一筆
   - **不強制要求 DB 層唯一索引**——新增唯一索引涉及 schema migration，本文件與 Step 7D MVP 範圍皆不涉及任何 migration 動作
5. **Step 7F 補強**：再補上 `(shipment_tracking_id, idempotency_key)` 的唯一索引（在 `idempotencyKey` 不為 null 時），作為資料庫層級的最後防線，防止併發請求競態下查詢防重失效導致的重複寫入
6. **不可依賴 Agent 自律**——平台必須在伺服器端主動防範重複寫入，不能假設「Agent 寫得好、不會重複送同一事件」，因為 Agent 端可能因網路重試、逾時重送等正常情境產生重複請求，且平台無法控制或信任外部 Agent 的實作品質，資料正確性是平台的責任

---

## 9. RawPayload 清洗與 Run Log 關係

1. **清洗時機**：`rawPayload` / `rawData` 的清洗必須在 API 將資料寫入 `shipment_tracking_events.rawData` **之前**完成——即清洗發生在「接收 Agent 請求 → 驗證 → **清洗** → 寫入資料庫」流程中的清洗步驟，不可先寫入未清洗資料、事後再清洗（事後清洗無法防止清洗前的瞬間資料外洩風險）
2. **`agent_run_logs.errorMessage` 只存清洗後摘要**——
   - 不直接存放原始錯誤物件、原始 API 回應內容
   - 只存放「足以讓開發者定位問題類型的簡要文字摘要」
3. **不保存 stack trace**——任何包含程式檔案路徑、行號、函式呼叫鏈的內容，一律不得進入 `errorMessage` 或任何 run log 欄位
4. **不保存以下類型的敏感資訊**（與第 8 章 `rawPayload` 清洗規則一致）：
   - Authorization / Cookie 標頭內容
   - token / API key / password
   - 付款資訊（payment）
   - 買家個資：電話號碼（phone）、地址（address）、電子郵件（email）
5. **買家公開頁不可讀 `agent_run_logs`**——`agent_run_logs` 屬於賣家/平台維運用途的內部執行紀錄，買家端 `publicToken` 查詢頁的資料來源僅限於 `shipment_tracking_events` 中經過清洗的白名單欄位（`eventStatus`、`eventLabel`/`eventDescription`、`location`、`occurredAt`），**不應該**、也**不需要**對 `agent_run_logs` 有任何讀取路徑

---

## 10. Index / Constraint 規劃

### 10.1 `seller_agent_tokens`

| Index / Constraint | 內容 | MVP 必須 / 可延後 |
|---|---|---|
| `tokenHash` unique | `unique("seller_agent_tokens_token_hash_unique").on(t.tokenHash)` | **MVP 必須**——驗證查詢與唯一性保證的基礎 |
| `tokenPrefix` index | `index("seller_agent_tokens_token_prefix_idx").on(t.tokenPrefix)`（一般 index，非 unique，理由見 4.5） | **MVP 必須**——介面辨識/搜尋 token 時的查詢效率基礎 |
| `storeId` index | `index("seller_agent_tokens_store_id_idx").on(t.storeId)` | **MVP 必須**——依店鋪查詢/管理 token 列表的基礎 |
| `merchantId` + `storeId` 複合 index | `index("seller_agent_tokens_merchant_store_idx").on(t.merchantId, t.storeId)` | **MVP 必須**——驗證 middleware 檢查 scope 歸屬時的核心查詢路徑 |
| `status` index | `index("seller_agent_tokens_status_idx").on(t.status)` | 可延後——MVP 資料量小，全表掃描成本可接受；資料量成長後再評估是否需要 |
| `expiresAt` index | `index("seller_agent_tokens_expires_at_idx").on(t.expiresAt)` | 可延後——僅在需要「批次掃描即將過期 token」等排程功能時才有必要，MVP 無此需求 |

### 10.2 `agent_run_logs`

| Index / Constraint | 內容 | MVP 必須 / 可延後 |
|---|---|---|
| `tokenId` index | `index("agent_run_logs_token_id_idx").on(t.tokenId)` | **MVP 必須**——依 token 查詢其執行歷史的基礎 |
| `storeId` index | `index("agent_run_logs_store_id_idx").on(t.storeId)` | **MVP 必須**——依店鋪查詢執行紀錄的基礎 |
| `merchantId` + `storeId` 複合 index | `index("agent_run_logs_merchant_store_idx").on(t.merchantId, t.storeId)` | **MVP 必須**——與 `seller_agent_tokens` 一致的隔離查詢路徑 |
| `status` index | `index("agent_run_logs_status_idx").on(t.status)` | 可延後——主要用於統計/篩選介面，Step 7F 查詢 UI 階段再評估 |
| `startedAt` index | `index("agent_run_logs_started_at_idx").on(t.startedAt)` | 可延後——比照 `shipmentTrackingEvents.occurredAt` 的 index 模式，但 MVP 階段「只寫入、不做查詢介面」，暫不需要 |
| `createdAt` index | `index("agent_run_logs_created_at_idx").on(t.createdAt)` | 可延後——同上，留待 Step 7F 查詢/統計功能設計時依實際查詢模式決定 |

> 整體原則：MVP 必須的 index 集中在「驗證流程」與「資料隔離（merchantId+storeId scope）」兩條核心路徑；統計/篩選/排程類查詢的 index 留到對應功能（Step 7F）實際設計時再依查詢模式決定，避免預先建立用不到的 index 增加寫入負擔。

---

## 11. Drizzle Schema 實作注意事項（供 Step 7D-2 參考）

> 本節僅整理「實作時應參照的現有風格與寫法慣例」，**不在本文件階段撰寫任何 schema 程式碼**。

- **檔案名稱建議**：
  - `lib/db/src/schema/sellerAgentTokens.ts`
  - `lib/db/src/schema/agentRunLogs.ts`
  - 比照現有檔案命名風格（如 `shipmentTrackings.ts`、`shipmentTrackingEvents.ts`），檔名採 camelCase，table 變數採 `xxxTable` 後綴（如 `sellerAgentTokensTable`、`agentRunLogsTable`）
- **`index.ts` export**：在 `lib/db/src/schema/index.ts` 新增對應的 `export * from "./sellerAgentTokens.ts"`、`export * from "./agentRunLogs.ts"`，比照現有 7 個 export 的排列方式（建議放在 `shipmentTrackingEvents.ts` 之後，維持「依建立順序排列」的現有慣例）
- **`text` / `integer` / `timestamp` / `jsonb` 使用方式**：完全比照現有寫法——
  - `text("column_name")`（如 `merchantId: text("merchant_id")`）
  - `integer("column_name")`（如 `storeId: integer("store_id")`）
  - `timestamp("column_name", { withTimezone: true })`（所有時間欄位一律帶時區，比照 `shipmentTrackingsTable`）
  - `jsonb("column_name")`（如 `scopes: jsonb("scopes")`，比照 `shipmentTrackingEventsTable.rawData`、`ordersTable.specValues`）
- **`references` 寫法**：比照 `shipmentTrackingsTable.orderId`、`shipmentTrackingEventsTable.shipmentTrackingId` 的寫法——`integer("xxx_id").notNull().references(() => xxxTable.id, { onDelete: "cascade" })`，並注意 import 對應的 table（`storesTable`、`sellerAgentTokensTable`）避免循環引用
- **`onDelete` 策略**：
  - `seller_agent_tokens.storeId` → `stores.id`：建議 `"cascade"`（理由見 4.2）
  - `agent_run_logs.storeId` → `stores.id`：建議 `"cascade"`（與上同理）
  - `agent_run_logs.tokenId` → `seller_agent_tokens.id`：建議方向為 `"set null"`（理由見 5.2），但**最終策略待 Step 7D-2A 確認**
- **是否需要 check constraint**：
  - 比照 `ordersTable` 的 `check("orders_status_valid", sql\`...\`)` 與 `productsTable` 的 `check("inventory_non_negative", ...)` 寫法
  - 候選項目：`status` 白名單 check（`seller_agent_tokens.status IN ('active','revoked','expired','disabled')`、`agent_run_logs.status IN ('running','completed','failed','partial')`）、`runType` 白名單 check、`revokedAt`/`status` 一致性 check（見 4.9）
  - 是否在 MVP 階段就導入這些 check constraint，或先以應用層驗證為主、DB check 留待後續補強，**待第 12 章確認**
- **是否需要 enum helper**：
  - 比照 `shipmentTrackingEvents.ts` 中 `shipmentTrackingEventStatusEnum`（`as const` 陣列 + 對應型別）的寫法，為 `status`、`runType`、`scopes`（如有固定範圍）建立對應的 `as const` 陣列與型別匯出，方便 API 層與前端共用同一份白名單定義，避免字串散落各處
  - 不建議使用 Postgres 原生 `pgEnum`——現有 schema 全數採用 `text` + `as const` 陣列 + `check` constraint 的組合（參照 `orderStatusEnum`、`shipmentTrackingStatusEnum`、`shipmentTrackingEventStatusEnum`），為保持風格一致，新表應沿用相同模式

---

## 12. Step 7D-2A 施工前檢查清單

在進入 Step 7D-2A（schema 實作前檢查）時，建議至少逐項確認以下事項，確認結果應明確記錄（同意 / 調整為 X / 延後處理），作為 Step 7D-2B 撰寫實際 schema 的依據：

1. **確認 token hash 演算法**——MVP 採用何種雜湊演算法（例如 SHA-256、bcrypt、argon2 等），需考量「驗證效能」與「安全強度」的權衡（token 驗證屬於高頻操作，過重的雜湊演算法可能造成效能瓶頸）
2. **確認 `scopes` 欄位格式**——`jsonb` 內容的具體結構（純字串陣列 / 物件陣列 / 巢狀結構）、命名規則（是否採 `resource:action` 格式）、MVP 階段是否真的只需要單一固定範圍
3. **確認 `expiresAt` 是否必填**——是否要在 MVP 階段就強制要求或建議預設過期時間
4. **確認 `status` 白名單**——本文件提出 `active`/`revoked`/`expired`/`disabled` 四種，是否需要增減、各狀態間的轉換規則是否需要明確定義
5. **確認 `runType` 白名單**——本文件提出 `manual`/`scheduled`/`webhook`/`csv_after_import`/`test` 五種，`test` 類型是否允許出現在正式環境資料中
6. **確認 run log 保留期限**——MVP 階段確認不做保留期限機制是否仍然合理，或是否需要先預留設計空間
7. **確認是否本階段補 `idempotencyKey`**——重申本文件第 8 章結論：**不在 Step 7D-1C 階段新增**，新增動作與 migration 留給 Step 7D-2 執行；此項列入檢查清單是為了在 Step 7D-2A 階段正式確認「由哪一個子階段（7D-2A 或 7D-2B）實際新增此欄位」
8. **確認是否要修正 Step 7D-0 `sellerId` 用語**——[[order-step7d-agent-write-api-implementation-audit|Step 7D-1A]]、[[order-step7d-agent-auth-token-decision|Step 7D-1B]] 皆已記錄此待確認項目，是否要回頭發一個 commit 修正 `docs/order-step7d-agent-write-api-spec.md` 中約 14 處 `sellerId` 用語為 `merchantId`/`storeId`，避免後續文件與規格之間的用語落差持續累積
9. **確認是否需要 DB backup 再 push**——任何牽涉 `drizzle-kit push` 或 migration 的操作前，是否需要先對現有資料庫做備份（即使是新增表、理論上不影響既有資料，仍建議遵循「異動前備份」的維運慣例）

> 上述 9 項皆延續自本文件第 14 章「風險與待確認」，在此整理為可逐項勾選確認的檢查清單格式，便於 Step 7D-2A 執行時逐一過一遍。

---

## 13. 測試計畫

> 以下為**測試規劃草案**，本文件階段**未執行**任何測試。實際測試將在 Step 7D-2 schema 實作完成、API route 開發完成後分階段執行。

1. **schema typecheck**——`sellerAgentTokens.ts`、`agentRunLogs.ts` 的 TypeScript 型別檢查（`drizzle-zod` 推導型別、FK 參照型別等），確保撰寫完成後可正確編譯
2. **DB push 前備份**——執行 `drizzle-kit push` 前，確認資料庫已有可還原的備份點
3. **`seller_agent_tokens` 建表驗證**——確認 migration 執行後，資料表結構（欄位、型別、index、constraint）與規格相符
4. **`agent_run_logs` 建表驗證**——同上，針對 `agent_run_logs` 表
5. **FK 驗證**——確認 `seller_agent_tokens.storeId → stores.id`、`agent_run_logs.tokenId → seller_agent_tokens.id`、`agent_run_logs.storeId → stores.id` 三個外鍵關聯正確建立，且 `onDelete` 行為符合預期（例如刪除店鋪後，相關 token 是否如預期被 cascade 刪除）
6. **`tokenHash` unique 驗證**——嘗試插入兩筆相同 `tokenHash` 的記錄，確認 DB 層級拒絕（違反 unique constraint）
7. **revoked token 不可用**——將某 token 的 `status` 設為 `revoked`，確認用該 token 發出的 Agent API 請求被拒絕（回傳適當的認證失敗錯誤）
8. **expired token 不可用**——將某 token 的 `expiresAt` 設為過去時間，確認用該 token 發出的請求被拒絕
9. **`storeId` scope mismatch**——使用 token A（綁定 store X）嘗試存取/操作 store Y 的資源，確認請求被拒絕（驗證 scope 隔離正確生效，不會發生跨店資料外洩）
10. **run log 寫入**——觸發一次 Agent 執行流程，確認對應的 `agent_run_logs` 記錄被正確建立，且 `checkedCount`/`successCount`/`failedCount`/`status`/`startedAt`/`finishedAt` 等欄位內容與實際執行結果相符
11. **`errorMessage` 清洗**——刻意觸發一個包含敏感資訊（如完整錯誤堆疊、Authorization 標頭）的錯誤情境，確認寫入 `agent_run_logs.errorMessage` 的內容已被正確清洗，不含任何敏感資訊或 stack trace
12. **public API 不讀 run log**——確認買家端 `publicToken` 查詢頁的 API 路徑完全不存在任何讀取 `agent_run_logs`（或 `seller_agent_tokens`）的程式路徑

---

## 14. 風險與待確認

| # | 項目 | 說明 |
|---|---|---|
| 1 | **token hash 演算法未定** | SHA-256 / bcrypt / argon2 等演算法的選擇直接影響驗證效能與安全強度，需要在 Step 7D-2A 明確決定 |
| 2 | **`tokenPrefix` 長度未定** | 前綴片段需要「足以辨識」與「不洩漏完整 token 結構資訊」之間取得平衡，具體長度待確認 |
| 3 | **`scopes` 格式未定** | `jsonb` 內容的具體結構與命名規則尚未定案，本文件僅提出 MVP 建議方向（固定單一範圍陣列） |
| 4 | **`expiresAt` 是否必填未定** | 本文件建議 MVP 階段不強制必填，但「是否要在 UI 引導賣家設定」屬於後續可調整的政策層面決定 |
| 5 | **是否本階段補 `idempotencyKey` 未定** | 本文件已明確結論「不在 Step 7D-1C 新增」，但「由 Step 7D-2 的哪一個子步驟實際新增」仍待 Step 7D-2A 確認分工 |
| 6 | **`merchantId` + `storeId` 是否支援未來多店** | 目前一把 token 綁定單一 `storeId`；若未來賣家需要「一把 token 同時管理多家店鋪」的情境，現有設計需要擴充（例如 `storeId` 改為陣列或新增關聯表），這屬於設計擴充性的長期考量 |
| 7 | **`agent_run_logs` 成長量與保留期限** | MVP 階段不設保留期限機制，但長期而言此表會隨 Agent 執行頻率持續累積資料，需要在 Step 7F 依實際成長速度評估是否需要封存/清除機制 |
| 8 | **是否需要 audit log 提前** | 本文件結論為「MVP 不需要，留待 Step 7F」，但若 Step 7D-2 上線後發現 `agent_run_logs` 最小版本不足以支撐安全稽核需求，可能需要提前評估是否將部分 audit 能力前移 |
| 9 | **是否需要修正 Step 7D-0 `sellerId` 用語** | [[order-step7d-agent-write-api-implementation-audit|Step 7D-1A]]、[[order-step7d-agent-auth-token-decision|Step 7D-1B]] 皆已記錄此項，本文件再次列為待確認，由使用者決定是否要回頭發一個 commit 修正用語 |

---

## 15. 下一步建議

- **下一步是 Step 7D-2A：schema 實作前檢查**——依本文件第 12 章檢查清單，逐項確認待確認事項（token hash 演算法、`scopes` 格式、`expiresAt` 必填與否、白名單定案、保留期限、`idempotencyKey` 新增分工、`sellerId` 用語修正、DB backup 規劃等），作為實作前最後把關
- **接著才是 Step 7D-2B：新增 `sellerAgentTokens` / `agentRunLogs` schema**——依本文件規格與 Step 7D-2A 的確認結果，正式撰寫 schema 程式碼並執行 migration
- **不建議直接寫 API route**——驗證 middleware 與 token 機制的資料層基礎尚未建立，過早開始 API route 實作會缺乏可依賴的資料結構
- **不建議直接寫 worker**——同理，worker 需要依賴已建立的 `seller_agent_tokens`/`agent_run_logs` 表結構與 API 認證機制
- **不建議進 Step 7E**——Seller Agent Workspace UI 規劃需要建立在「Agent token 機制已可運作」的基礎上，過早進入會缺乏實際可串接的後端能力

---

*本文件為 Step 7D-1C 產出，後續實作請依序參考 [[order-step7d-agent-write-api-implementation-audit|Step 7D-1A 施工前盤點]]、[[order-step7d-agent-auth-token-decision|Step 7D-1B 決策文件]] 與本文件，避免略過前置決策直接進入實作。*
