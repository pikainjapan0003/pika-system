# Step 7D-1B：Agent Auth/Token 與資料表決策文件

> **文件性質聲明**：本文件是 **Step 7D-1B 決策文件**，目的是針對 Step 7D-1A 盤點稽核中發現的兩個阻塞點（`sellerId` 用語落差、Agent token 機制空白）做出**明確決策**，並規劃 Step 7D-2 實作前需要的資料表草案、idempotency 策略、rawPayload 清洗 MVP 規則。
>
> **本文件不包含任何 API 實作、不修改任何程式碼、不建立任何資料表、不產生 migration、不執行 drizzle-kit push、不做 worker、不做 Seller Agent Workspace UI**。所有「資料表草案」均為**規劃**，實際 schema 撰寫與 migration 屬於 Step 7D-2 / 後續階段範疇。

---

## 1. Step 7D-1B 定位

```
Step 7D-0  → 規格文件（已完成，commit df8a78a，已 push）
Step 7D-1A → 施工前盤點稽核（已完成，commit f555121，已 push）
Step 7D-1B → 本文件：Agent auth/token 與資料表「決策」（只決策、不實作）
Step 7D-2  → （待後續）API route 實作
Step 7E~7H → （待後續）Seller Agent Workspace UI、Agent worker 實作、上線、監控
```

本文件**做什麼**：

- 對 `sellerId` 用語落差做出**明確決策**（不是再列選項，而是定案）
- 對 Agent token 方案做出**明確選定**（從 Step 7D-1A 列出的 4 個選項中選定 MVP 方向）
- 規劃需要新增的資料表草案（欄位、用途、MVP 範圍）
- 對 idempotency key、rawPayload 清洗訂出 MVP 最小規則
- 列出 Step 7D-2 API 實作的前置條件與建議順序

本文件**不做什麼**（與第 0 章「重要前提」及任務範圍一致）：

- 不寫 API route 程式碼
- 不修改 `lib/db/src/schema/` 下任何 schema 檔案
- 不產生 SQL migration
- 不執行 `drizzle-kit push` 或任何 DB 異動指令
- 不做 Agent worker
- 不做 Seller Agent Workspace UI（留到 Step 7E）

---

## 2. 與 Step 7D-0 / Step 7D-1A 的關係

| 階段                     | 產出                                                                                                                                                                                     | 與本文件的關係                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Step 7D-0**            | `docs/order-step7d-agent-write-api-spec.md`（commit `df8a78a`）——定義 Agent 寫入 API 的整體規格、4 個端點草案、權限隔離精神、白名單、清洗策略、成本策略                                  | 本文件**承接**其精神（每個賣家自己的 Agent、嚴格隔離、BYOA 預設策略），但**修正**其中與現有架構不符的用語（見第 3 章） |
| **Step 7D-1A**           | `docs/order-step7d-agent-write-api-implementation-audit.md`（commit `f555121`）——盤點現有架構，發現兩個關鍵阻塞點：(1) `sellerId` 不存在於現有程式碼/schema (2) Agent token 機制完全空白 | 本文件**直接針對這兩個阻塞點做出決策**：第 3 章解決 `sellerId` 落差，第 4-5 章解決 Agent token 方案選定                |
| **本文件（Step 7D-1B）** | Agent auth/token 與資料表決策文件                                                                                                                                                        | 把 7D-1A 列出的「待決策項」逐一定案，產出 Step 7D-2 實作前需要的明確規格依據                                           |
| **Step 7D-2（待後續）**  | API route 實作                                                                                                                                                                           | 依本文件第 6 章「資料表草案」與第 9 章「API 實作範圍建議」開始撰寫 schema 與 route 程式碼                              |

簡言之：**7D-0 定義了「要做什麼」，7D-1A 發現了「現況跟規格對不上的地方」，7D-1B（本文件）把對不上的地方「拍板定案」，7D-2 才能在穩固的地基上「動工」**。

---

## 3. `sellerId` 用語決策

### 3.1 決策結論（定案，非選項）

> **現有系統沒有 `sellerId` 欄位或 schema。Step 7D 之後的所有文件與程式，一律以 `merchantId` + `storeId` 作為實作語言。`sellerId` 只保留作為「產品語意」上代表「賣家」這個角色的口語化說法，技術實作層面不得新增一個未定義的 `sellerId` 概念或欄位。**

### 3.2 決策依據

Step 7D-1A 已透過 `grep -Rn "sellerId"` 確認整個 codebase（程式碼 + schema）中 **0 個結果**。本次決策階段重新核對，再次確認：

```
grep -R "sellerId" docs/order-step7d-agent-write-api-spec.md
→ 規格文件中出現約 14 處 sellerId（多用於描述 token scope、隔離邏輯、403 錯誤情境）

grep -R "sellerId" artifacts/api-server/src lib/db/src/schema
→ 0 個結果（程式碼與 schema 中完全不存在）
```

而現有程式碼中實際代表「賣家」概念的，是：

| 概念角色                       | 實際欄位     | 型別 / 位置                                                                     | 權限比對方式                                                                                |
| ------------------------------ | ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 「賣家」（產品語意上的角色）   | `merchantId` | `text`，`storesTable.merchantId`，值為 Clerk user ID                            | `verifyStoreOwner`：`store.merchantId === req.userId`（字串比對，見 `middlewares/auth.ts`） |
| 「商店」（賣家底下的商店單位） | `storeId`    | `integer`，FK，散見於 `ordersTable`/`productsTable`/`productCategoriesTable` 等 | 透過 `verifyStoreOwner(req, res, storeId)` 先查出 store 再比對 merchantId                   |

換言之，**「賣家」在這個系統裡，就是「商店的 Clerk 擁有者（merchant）」**，沒有獨立的 `sellers` 表，一個 merchant 目前對應一間商店（一對一，依現有 `routes/stores.ts` 的建立邏輯）。

### 3.3 對 Agent 權限模型的具體規範（決策後的實作準則）

1. **Agent 權限 scope 必須綁定 `merchantId` + `storeId` 雙層**——不是單一欄位，而是「這個 token 屬於哪個 merchant，且只能操作哪個（或哪些）storeId」的組合範圍
2. **API request / response 對外可以使用 `storeId`** 作為資源識別（例如 `GET /agent/tracking-jobs?storeId=123`），這是買賣家都能理解的概念，沒有問題
3. **但內部查詢邏輯必須多一層確認**：「這個 `storeId` 是否真的屬於這個 token 所對應的 `merchantId`」——這正是現有 `verifyStoreOwner` 在做的事，Agent API 應該複用同一精神（甚至可考慮複用或包一層 `verifyStoreOwner` 邏輯，具體做法留給 Step 7D-2 決定）
4. **嚴禁在資料表或 API 介面中新增一個叫 `sellerId` 的欄位**——如果未來真的需要一個「賣家」實體（例如一個 merchant 名下有多間店、需要在賣家層級而非商店層級管理 Agent），那應該是一個全新的、有明確定義的欄位（如 `merchantId` 本身已經承擔了這個角色），而不是憑空生出一個跟 `merchantId` 意義重疊但命名不同的 `sellerId`

### 3.4 對 Step 7D-0 規格文件的處理建議

Step 7D-0 規格文件（`df8a78a`）中約 14 處使用 `sellerId`。**本文件不直接修改該文件**（因為修改已 push 到共用 remote 的 commit 屬於規格變更，應該是另一個明確任務），但建議：

- 後續若有人要依照 Step 7D-0 規格實作，**閱讀規格時請自動將「`sellerId`」替換理解為「`merchantId` + `storeId` 的組合範圍」**
- 是否要回頭發一個 commit 修正 Step 7D-0 規格文件用語，留待 Step 7D-1B 之後、進入 Step 7D-2 之前由使用者決定是否需要（已記錄於第 12 章「待確認」）

---

## 4. Agent Token 方案比較

> 延續 Step 7D-1A 列出的 4 個選項，本章針對任務指定的 7 個比較維度逐一評估，**這次要做出選定，不是停在「列選項」**。

| 維度 \ 方案                       | A. 沿用 Clerk session auth                                                                                | B. 新增 agent token table                                                                      | C. 環境變數 shared internal token                                              | D. seller-scoped API key                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 是否符合「每個賣家自己的 Agent」  | ❌ 否——session 屬於登入的人類使用者，無法代表「賣家的 Agent」這個獨立身分                                 | ✅ 是——每個 token 可獨立對應一個 merchant/store，天生符合「每個賣家自己的 Agent」              | ❌ 否——所有賣家共用同一組憑證，完全無法區分「這是哪個賣家的 Agent」            | ✅ 是——每把 key 對應特定賣家範圍                        |
| 是否支援 storeId scope            | ⚠️ 間接支援（透過 session 背後的 merchantId 查出其 store），但無法做到「只授權特定 store 子集」的精細控制 | ✅ 是——可在 token 表中直接設計 `storeId` 欄位做精確範圍控制                                    | ❌ 否——共用 token 無法承載任何 scope 概念                                      | ✅ 是——同 B，可在欄位中設計 scope                       |
| 是否可 revoke（撤銷）             | ⚠️ 只能透過 Clerk 登出/停用整個帳號，無法單獨撤銷「Agent 用途」而不影響賣家本人登入                       | ✅ 是——獨立資料列，可單獨設定 `status=revoked` 或寫入 `revokedAt`                              | ❌ 否——撤銷等於要全系統換一組新 token，影響所有賣家                            | ✅ 是——同 B                                             |
| 是否可 rotation（輪替）           | ❌ 不適用——session 由 Clerk 框架管理生命週期，不是給人手動輪替的設計                                      | ✅ 是——可發新 token、設定舊 token `expiresAt`，平滑過渡                                        | ❌ 否——輪替等於牽動全系統                                                      | ✅ 是——同 B                                             |
| 是否適合 webhook / n8n / OpenClaw | ❌ 不適合——這些工具是長期執行的自動化程式或外部服務，不應該、也很難維持一個瀏覽器 session 的存活週期      | ✅ 適合——這正是 API key / token 機制存在的目的：給長期執行的自動化程式用，業界標準做法         | ⚠️ 技術上「能用」，但因為共用憑證，外洩或誤用時無法歸責到特定賣家，風險不可控  | ✅ 適合——同 B                                           |
| MVP 開發成本                      | 低（不用新增任何東西），但**結構性不適配**，後續一定要重做                                                | 中——需要新增一張表、設計 token 產生/雜湊/驗證 middleware，但是一次性投入，且是正確方向上的投入 | 最低（一個環境變數就能跑），但是**正式方案角度的成本陷阱**——之後勢必要砍掉重練 | 中——與 B 接近，若獨立設計表結構，成本相當               |
| 安全風險                          | 中——Agent 與賣家本人共用同一信任層級，token/session 外洩等同帳號全權限外洩                                | 低——可獨立管理、scope 可控、可撤銷，外洩影響範圍可控制在單一賣家、單一用途                     | **高**——共用憑證一旦外洩，影響全系統所有賣家，且無法單獨撤銷或追責             | 低——同 B                                                |
| **是否建議採用**                  | ❌ 不建議                                                                                                 | ✅ **建議採用（MVP 方向）**                                                                    | ❌ **強烈不建議**（即使作為過渡方案也不建議，見下方說明）                      | ✅ 可採用，但建議併入方案 B 的表結構設計（見 4.1 說明） |

### 4.1 為什麼選項 B 與 D 在本決策中收斂為同一方向

選項 D（seller-scoped API key）與選項 B（新增 agent token table）在「需要新增一張可承載 scope、可撤銷、可輪替的資料表」這個核心需求上**沒有本質差異**——差別只在於命名與細部欄位設計傾向。與其把它們當成兩條平行路線各自評估，不如直接定案：**「seller-scoped」是這個 token 機制必須具備的「特性」（一個賣家對應一個或多個 token，且 scope 綁定 merchantId+storeId），而「新增 agent token table」是承載這個特性的「實作手段」**。因此本決策直接將兩者合併為單一方向來推進，避免日後重複造輪子。

---

## 5. MVP Token 決策

### 5.1 決策結論

> **MVP 採用「新增 Agent token 資料表（`seller_agent_tokens`）」方向，即 Step 7D-1A 選項 B（與選項 D 合併後的方向）。**

具體規則如下（皆為**定案**，非討論）：

1. **避免使用 shared internal token（選項 C）作為正式方案**——因為它從根本上無法做到「每個賣家隔離」，這與 Step 7D-0 規格的核心精神（每個賣家自己的 Agent）直接衝突，即使作為過渡也不建議採用，因為一旦有賣家開始使用，要再切換到正式方案就會牽涉到既有資料遷移與信任重建成本
2. **不建議沿用 Clerk session 作為 Agent token（選項 A）**——因為 Agent / webhook / n8n / OpenClaw 等都是長期執行的自動化程式或外部服務整合，不適合依賴設計給「人類瀏覽器登入」用的 session 機制
3. **token 原文只顯示一次**——產生 token 當下回傳明文給使用者，之後系統不再保存、也無法再次顯示明文（這是業界標準做法，例如 GitHub Personal Access Token、Stripe API key 皆採此模式）
4. **DB 只存 token hash，不存 token 明文**——比對時對輸入做 hash 後與儲存值比對，即使資料庫外洩也不會直接洩漏可用憑證
5. **token scope 綁定 `merchantId` + `storeId`**——延續第 3 章的決策，不引入 `sellerId`
6. **token 可停用 / revoke**——透過 `status` 欄位與/或 `revokedAt` 時間戳記實現，撤銷後立即生效、不可逆
7. **token 須支援 `name`、`lastUsedAt`、`expiresAt`**——`name` 方便賣家自己辨識用途（例如「我的出貨機器人」）、`lastUsedAt` 提供基本可觀測性與「這個 token 是否還在用」的判斷依據、`expiresAt` 提供生命週期管理的彈性（MVP 階段可允許為 null 代表不過期，但欄位本身要存在）

---

## 6. 建議新增資料表

> 以下為**規劃草案**，具體型別、索引、約束等細節仍由 Step 7D-2 撰寫 schema 時定案；本文件只負責定出「需要哪些表、欄位大致是什麼、為什麼需要、放在 7D 還是 7F」。

### 6.1 `seller_agent_tokens`（MVP 必須）

| 項目             | 內容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **用途**         | 儲存賣家為自己的 Agent 產生的 token（雜湊後），作為 Agent API 的認證與授權範圍依據                                                                                                                                                                                                                                                                                                                                                                                                             |
| **MVP 是否需要** | ✅ 需要——是整個 Agent Write API 認證機制的基礎，沒有它 Step 7D-2 無法開始                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **建議欄位**     | `id`、`merchantId`（text, Clerk user ID, 對應 `storesTable.merchantId`）、`storeId`（integer FK → `stores.id`）、`name`（text，賣家自訂名稱）、`tokenHash`（text，雜湊後存放，**不存明文**）、`status`（text，如 `active`/`revoked`/`expired`）、`scopes`（jsonb 或 text[]，MVP 可先固定為單一範圍如 `["shipment:write"]`，格式細節待確認，見第 12 章）、`lastUsedAt`（timestamp, nullable）、`expiresAt`（timestamp, nullable）、`revokedAt`（timestamp, nullable）、`createdAt`、`updatedAt` |
| **關聯**         | `merchantId` 對應 `storesTable.merchantId`；`storeId` FK → `storesTable.id`（cascade 規則待 Step 7D-2 設計時決定，建議比照 `shipmentTrackingsTable.orderId` 的 `onDelete: "cascade"` 模式評估）                                                                                                                                                                                                                                                                                                |
| **風險**         | token 雜湊演算法選擇、`scopes` 欄位格式設計皆待確認（見第 12 章）；若 `merchantId`/`storeId` 範圍設計有誤，將直接導致跨店資料外洩——這是整張表設計中風險最高的部分                                                                                                                                                                                                                                                                                                                              |
| **建議放置階段** | **Step 7D**（MVP 必須，是 Step 7D-2 的前置依賴）                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### 6.2 `agent_run_logs`（MVP 必須，最小版本）

| 項目             | 內容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **用途**         | 記錄每次 Agent 執行（一輪查詢/回報）的基本執行紀錄，提供最低限度的可觀測性與除錯依據                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **MVP 是否需要** | ✅ 需要，但**只做最小版本**——只寫入、不做查詢介面或統計分析（查詢 UI 屬於 Step 7F 範疇，見第 10 章）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **建議欄位**     | `id`、`tokenId`（integer FK → `seller_agent_tokens.id`）、`merchantId`（text，冗余存放以利直接查詢，避免每次都要 join token 表）、`storeId`（integer，同樣冗余存放）、`runType`（text，如 `tracking_check`/`event_report`/`status_update`）、`status`（text，如 `success`/`partial`/`failed`）、`startedAt`（timestamp）、`finishedAt`（timestamp, nullable）、`checkedCount`（integer，本輪檢查的任務數）、`successCount`（integer）、`failedCount`（integer）、`errorCode`（text, nullable）、`errorMessage`（text, nullable，**注意**：此欄位需遵循第 8 章 rawPayload 清洗規則，不可直接存放未清洗的原始錯誤堆疊）、`createdAt` |
| **關聯**         | `tokenId` FK → `seller_agent_tokens.id`（建議 `onDelete: "cascade"` 或 `"set null"`，待 Step 7D-2 決定）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **風險**         | `errorMessage` 若未清洗可能間接記錄到敏感資訊（見第 8 章）；寫入失敗不應阻斷主流程（已在 Step 7D-1A 測試計畫中提及）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **建議放置階段** | **Step 7D**（MVP 必須，但僅做最小寫入版本；查詢/統計/UI 留到 Step 7F）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### 6.3 `agent_audit_logs`（可選，建議延後）

| 項目                                 | 內容                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **用途**                             | 完整的稽核軌跡——記錄每一次 Agent API 呼叫的詳細資訊（時間、來源 IP、操作類型、操作結果、變更前後內容等），供安全稽核與爭議排查使用                                       |
| **MVP 是否需要**                     | ❌ 不需要——這是「完整 audit log」的資料層基礎，而完整 audit log（含查詢 UI）已在 Step 7D-1A 中被列為 B 組延後項目                                                        |
| **建議欄位（草案，供 7F 設計參考）** | `id`、`tokenId`、`merchantId`、`storeId`、`action`（如 `create_event`/`update_status`）、`requestSummary`（jsonb，已清洗版本）、`resultStatus`、`ipAddress`、`createdAt` |
| **關聯**                             | 同 `agent_run_logs`，FK → `seller_agent_tokens`                                                                                                                          |
| **風險**                             | 若提早設計，容易因為「還不確定要稽核什麼粒度」而過度設計或設計不足；建議等 MVP 上線、有實際運作數據後再決定真正需要稽核的維度                                            |
| **建議放置階段**                     | **Step 7F**（MVP 階段可以用 `agent_run_logs` 的最小版本暫代基本可觀測性需求）                                                                                            |

### 6.4 `seller_agents`（可選，建議延後，甚至重新評估是否需要）

| 項目                               | 內容                                                                                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **用途**                           | 若未來需要在「token」之上再抽象出一層「Agent」實體（例如一個賣家可以設定多個具名 Agent，每個 Agent 可以有自己的設定、多把 token、啟用狀態等），這張表會是該抽象的載體                                                                                 |
| **MVP 是否需要**                   | ❌ 不需要——MVP 階段「一個 token 即代表一個 Agent」已經足夠滿足「每個賣家自己的 Agent」的核心需求，不需要額外抽象層                                                                                                                                    |
| **建議欄位（草案，僅供未來參考）** | `id`、`merchantId`、`storeId`、`name`、`status`、`createdAt`、`updatedAt`                                                                                                                                                                             |
| **關聯**                           | 若真的建立此表，`seller_agent_tokens` 應改為關聯到 `seller_agents.id` 而非直接掛在 merchant/store 下                                                                                                                                                  |
| **風險**                           | **過早抽象的風險**——在還沒有實際多 Agent 需求的證據之前就建表，容易導致表結構與實際使用情境不符，之後還要再改一輪；建議先用 MVP 的「token = Agent」模型上線運作，等真的出現「一個賣家想要管理多個獨立 Agent」的明確需求時，再評估是否要補上這一層抽象 |
| **建議放置階段**                   | **Step 7F 之後（甚至可能不需要）**——是否需要這張表本身就是一個待確認問題（見第 12 章）                                                                                                                                                                |

---

## 7. Idempotency Key 決策

### 7.1 決策結論

> **MVP 階段，idempotency key 初版直接存在 `shipment_tracking_events.idempotencyKey` 欄位上**（即在 Step 7C 已建立的 `shipmentTrackingEventsTable` 上新增一個欄位，具體 schema 異動屬於 Step 7D-2 範疇，本文件只決策放置位置與防重邏輯）。

具體規則：

1. **新增欄位**：`shipmentTrackingEventsTable.idempotencyKey`（建議型別 `text`, nullable——並非每個事件來源都一定能提供 idempotency key，例如系統內部產生的事件可能不需要）
2. **防重邏輯**：同一 `shipmentTrackingId` + `idempotencyKey` 的組合，應該避免重複寫入。具體判斷方式：寫入前先查詢「是否已存在相同 `shipmentTrackingId` + `idempotencyKey` 的事件」，若存在則回傳既有結果（或視為成功但不重複寫入），不再新增一筆
3. **MVP 階段可以先用查詢防重**：即在應用層（API route handler）做「先查後寫」的邏輯，**不強制要求 DB 層唯一索引**。這是因為：
   - 新增唯一索引涉及 schema migration，本文件範圍不涉及任何 migration
   - 應用層查詢防重已經能涵蓋絕大多數正常情境下的重複請求
4. **Step 7F 再補上 DB 唯一索引**：作為「資料庫層級的最後防線」，補上 `(shipment_tracking_id, idempotency_key)` 的唯一索引（在 `idempotencyKey` 不為 null 時），防止極端情境下（如併發請求競態）查詢防重失效導致的重複寫入。這屬於第 10 章 B 組（DB unique index 強化）的範疇
5. **不可只依賴 Agent 自律避免重複**——即不能假設「Agent 寫得好、不會重複送同一事件」，平台必須在伺服器端主動防範，因為：
   - Agent 端可能因網路重試、逾時重送等正常情境產生重複請求
   - 平台無法控制或信任外部 Agent 的實作品質
   - 資料正確性是平台的責任，不應該轉嫁給呼叫方

---

## 8. RawPayload 清洗 MVP 決策

### 8.1 決策結論（定案規則）

> **`rawPayload` / `rawData` 不可直接提供給買家。Step 7D MVP 在寫入前，至少必須移除或遮蔽以下類型的內容：電話號碼（phone）、地址（address）、電子郵件（email）、付款資訊（payment）、token、密碼（password）、authorization 標頭內容、cookie、程式錯誤堆疊（stack trace）。原始錯誤 stack 一律不得進入公開時間軸（public timeline）。公開頁（買家端 `publicToken` 查詢頁）只顯示經過清洗的安全欄位：`eventStatus`、`eventLabel`（或 `eventDescription`）、`description`、`location`、`occurredAt` 等。**

### 8.2 決策依據

這個規則直接延續了 Step 7D-1A 已盤點到的**既有先例**——`artifacts/api-server/src/routes/public.ts` 的 `/orders/track/:publicToken` 路由中，已經有一個明確的「私有欄位排除清單」（`internalNote`、`paymentNote`、`paidAmount`、`recipientPhone`、`recipientAddress`、`shippingNote`、`recipientName`、`paymentMethod`、`paymentStatus`、`remainingAmount`），證明這個系統已經有「對外暴露最小資訊集合」的設計慣例。本決策只是把同一套精神套用到「Agent 寫入的 `rawData`」這個全新、且內容更不可控的資料來源上。

### 8.3 MVP 範圍與延後說明

- **MVP 必須做到**：上述列舉的類別（電話、地址、email、付款、token、密碼、authorization、cookie、stack trace）的基礎過濾或遮蔽，以及「公開頁只顯示白名單欄位」的硬性限制（這部分是「介面層」的限制，相對容易做到——只要 public 路由的回應結構本身就不包含 `rawData`/`rawPayload` 欄位即可）
- **完整清洗策略可留到 Step 7F 強化**：例如更精細的正則規則、結構化資料的遞迴掃描、對未知欄位的保守預設策略（白名單優於黑名單）、自動化的內容分類與評分機制等。MVP 階段的清洗規則可以是「相對保守、寧可過度遮蔽也不要洩漏」的簡化版本

---

## 9. Step 7D-2 API 實作範圍建議（MVP 順序）

> 以下為建議的實作順序與每個端點的依賴說明，供 Step 7D-2 規劃時參考。**本文件不撰寫任何程式碼**。

| 順序 | 項目                                     | 依賴的資料表                                                                                                             | 主要檢查項目                                                                                                                                                                                                                               |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | **Token middleware**（Agent 認證中介層） | `seller_agent_tokens`                                                                                                    | 驗證 token 是否存在、`status=active`、未過期（`expiresAt`）、未撤銷（`revokedAt`）；驗證成功後將 `merchantId`/`storeId` 注入 request context；更新 `lastUsedAt`                                                                            |
| 2    | **`GET /agent/tracking-jobs`**           | `seller_agent_tokens`（驗證範圍）+ `shipmentTrackingsTable`（讀取任務）                                                  | 確認 token 的 `merchantId`+`storeId` 範圍；依 `isActive`+`nextCheckAt` 篩選（複用既有索引）；確保不洩漏其他賣家的任務                                                                                                                      |
| 3    | **`POST /agent/shipment-events`**        | `seller_agent_tokens` + `shipmentTrackingsTable`（驗證歸屬）+ `shipmentTrackingEventsTable`（寫入，含 `idempotencyKey`） | 驗證 `shipmentTrackingId` 歸屬於該 token 範圍；驗證 `eventStatus` 在白名單內（複用 `shipmentTrackingEventStatusEnum`）；依第 7 章規則防止重複寫入；依第 8 章規則清洗 `rawData`；連動更新 `shipmentTrackingsTable.latestEventStatus` 等欄位 |
| 4    | **`PATCH /agent/shipment-status`**       | `seller_agent_tokens` + `shipmentTrackingsTable`（驗證歸屬與更新）                                                       | 驗證歸屬權；驗證 `trackingStatus` 在白名單內（複用 `shipmentTrackingStatusEnum`）；驗證狀態轉換合法性（可參考但不可修改 `lib/orderStatusMachine.ts` 的設計精神）                                                                           |
| 5    | **`POST /agent/run-log`**                | `seller_agent_tokens` + `agent_run_logs`（寫入最小版本）                                                                 | 寫入最小欄位集合；確保寫入失敗不阻斷主流程（log 是輔助功能，不應影響核心資料寫入）                                                                                                                                                         |

**關鍵提醒**：第 1 項（token middleware）是所有後續端點的**前置依賴**——沒有它，後面 4 個端點都無法做權限檢查。這也是為什麼第 6 章把 `seller_agent_tokens` 列為「MVP 必須」且排在最優先的原因。

---

## 10. Step 7F 延後項目

延續 Step 7D-1A 已列出的 B 組項目，本文件重新確認以下項目應延後到 Step 7F（或更後）處理，**不在 Step 7D-2 的 MVP 範圍內**：

- token rotation UI（token 輪替介面）
- token 管理 UI（賣家自助管理 token 的後台介面）
- full audit log UI（完整稽核軌跡查詢介面，依賴 `agent_audit_logs` 表）
- advanced rate limit（進階速率限制，如依賣家分級、依 API 類型分級的限速策略）
- kill switch UI（後台一鍵停用特定 Agent/token 的管理介面）
- BYOK credential encryption（賣家自帶金鑰的加密儲存機制）
- prompt injection risk scoring（自動化的提示注入風險評分機制）
- DB unique index 強化（`(shipment_tracking_id, idempotency_key)` 唯一索引等資料庫層防護）
- 更完整的 rawPayload DLP（資料外洩防護，更精細的內容掃描與分類規則）

---

## 11. 測試計畫

> 延續 Step 7D-1A 已規劃的測試框架（Node.js 內建 test runner + `mock.module` 模擬 `@clerk/express` + 真實 DB 整合測試），本章列出 Agent auth/token 相關的具體測試案例，供 Step 7D-2 落地時轉換為實際測試程式碼。

| 測試案例                                       | 預期行為                                                                                                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **token missing**                              | 請求未帶 token，應回傳 401 Unauthorized                                                                                                                                                                                      |
| **token invalid**                              | 帶入格式錯誤或不存在的 token，應回傳 401 Unauthorized                                                                                                                                                                        |
| **token revoked**                              | 帶入已被撤銷（`status=revoked` 或 `revokedAt` 已設定）的 token，應回傳 401/403，且不應通過任何後續檢查                                                                                                                       |
| **token expired**                              | 帶入已超過 `expiresAt` 的 token，應回傳 401/403                                                                                                                                                                              |
| **token storeId scope mismatch**               | token 的 `storeId` 範圍與請求操作的資源所屬 `storeId` 不符，應回傳 403 Forbidden                                                                                                                                             |
| **merchantId + storeId 越權**                  | 嘗試存取/修改不屬於自己 `merchantId`+`storeId` 範圍的資料（如其他賣家的 `shipmentTrackingId`），應回傳 403/404，且不洩漏該資料是否存在的線索                                                                                 |
| **eventStatus 白名單**                         | `POST shipment-events` 帶入白名單外的 `eventStatus` 值，應回傳 400/422，且不寫入 DB                                                                                                                                          |
| **trackingStatus 白名單**                      | `PATCH shipment-status` 帶入白名單外的 `trackingStatus` 值，應回傳 400/422，且不寫入 DB                                                                                                                                      |
| **idempotency key 重複**                       | 同一 `shipmentTrackingId`+`idempotencyKey` 重複送出兩次，DB 中不應產生重複紀錄，第二次請求應回傳與第一次一致的結果（或明確的「已處理過」回應）                                                                               |
| **rawPayload 清洗**                            | 帶入含 phone/address/email/payment/token/password/authorization/cookie/stack trace 等內容的 `rawData`，驗證寫入後的內容已被正確移除或遮蔽                                                                                    |
| **public API 不洩漏 rawPayload / error stack** | 透過買家端 `GET /orders/track/:publicToken` 查詢，驗證回應中**完全不包含** `rawData`/`rawPayload` 欄位、也不包含任何形式的原始錯誤堆疊，只包含白名單欄位（`eventStatus`/`eventLabel`/`description`/`location`/`occurredAt`） |
| **run log 寫入**                               | `POST run-log` 正常情境下應成功寫入最小欄位集合；寫入失敗時不應導致呼叫方收到整體失敗的錯誤（log 失敗應被妥善吞掉或降級處理，不阻斷主流程）                                                                                  |
| **agent token lastUsedAt 更新**                | 每次 token 通過驗證並成功呼叫 API 後，`seller_agent_tokens.lastUsedAt` 應被更新為最新時間                                                                                                                                    |

---

## 12. 風險與待確認

| 項目                                              | 等級 | 說明                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **token hash 演算法尚未選定**                     | 中   | 第 5 章已決策「DB 只存 hash、不存明文」，但具體採用何種演算法（如 SHA-256、bcrypt、argon2 等）尚未選定，需要 Step 7D-2 撰寫 schema/middleware 時依現有依賴與效能需求決定                                                                                                                                                                                      |
| **token 前綴格式尚未決定**                        | 低   | 業界常見做法是給 token 加上可辨識的前綴（如 `sk_live_...`、`agent_...`），方便快速識別 token 類型與環境，本文件不決定具體格式，留給 Step 7D-2                                                                                                                                                                                                                 |
| **`scopes` 欄位格式尚未定案**                     | 中   | 第 6.1 節建議用 `jsonb` 或 `text[]`，MVP 可先固定為單一範圍，但具體儲存格式（陣列 vs JSON 物件 vs 逗號分隔字串）與未來擴充性的權衡，留給 Step 7D-2 撰寫 schema 時決定                                                                                                                                                                                         |
| **`expiresAt` 是否必填尚未定案**                  | 低   | 本文件建議允許 nullable（代表不過期），但是否要在 MVP 階段就強制要求賣家設定過期時間（基於安全考量），是一個產品政策層面的問題，建議 Step 7D-2 之前由產品角度再確認一次                                                                                                                                                                                       |
| **`merchantId` + `storeId` 是否足以代表賣家隔離** | 中   | 目前觀察到的現有模型是「一個 merchant 對應一間商店」（一對一），`merchantId`+`storeId` 雙層範圍在現況下是足夠的。但**若未來產品方向轉變為「一個賣家可以開多間店」**，現有的 `verifyStoreOwner` 與本文件建議的 token scope 設計都需要重新評估是否要改為「以 merchantId 為主、storeId 為子範圍清單」的模型。這是一個建議在 Step 7D-2 開工前向產品再次確認的問題 |
| **是否需要 `seller_agents` 表**                   | 低   | 第 6.4 節已建議延後甚至重新評估，本文件傾向認為 MVP 階段不需要（「token = Agent」已足夠），但若使用者已經有「一個賣家要管理多個獨立具名 Agent」的明確需求藍圖，則需要提前規劃此表，建議在 Step 7D-2 之前向使用者確認是否有此需求                                                                                                                              |
| **是否需要 `agent_audit_logs` 表**                | 低   | 第 6.3 節已建議延後到 Step 7F；若使用者對「完整稽核軌跡」有合規或法務層面的急迫需求（例如未來可能面臨的金流或個資稽核要求），則時程可能需要提前，建議向使用者確認急迫性                                                                                                                                                                                       |
| **rate limit 儲存位置尚未決定**                   | 中   | Step 7D-1A 已指出現有 rate limit（如 `trackOrderLimiter`）是程式內寫死的 middleware，沒有獨立的設定資料表。Agent API 的 rate limit MVP 階段可以沿用相同的「程式內固定規則」模式（屬於 MVP 可接受範圍），但若要做到「依賣家分級限速」（已列在 Step 7F），勢必需要某種形式的設定儲存（資料表或設定檔），儲存位置與設計留給 Step 7F 評估                         |
| **DB unique index 是否放 Step 7D 還是 Step 7F**   | 中   | 第 7 章已決策「Step 7D MVP 用應用層查詢防重，Step 7F 補 DB 唯一索引」。但如果使用者認為「資料正確性的最後防線」優先級應該提高，也可以考慮把 unique index 提前到 Step 7D 一併處理（會牽涉到 migration，超出本文件範圍，需另外規劃）。本文件記錄此為待確認的時程權衡問題                                                                                        |
| **是否需要回頭修正 Step 7D-0 `sellerId` 用語**    | 中   | 第 3.4 節已說明本文件不直接修改已 push 的 Step 7D-0 規格文件。是否要另外發一個 commit 修正其中約 14 處 `sellerId` 用語（改為 `merchantId`+`storeId`），或是僅以本文件第 3 章作為「正式對應關係的權威定義」、不動原規格文件，這是一個文件治理層面的決定，留待使用者裁示                                                                                        |

---

## 13. 下一步建議

本文件已完成 Step 7D-1B 的核心任務：把 Step 7D-1A 發現的兩個阻塞點（`sellerId` 用語、Agent token 機制）做出明確決策，並規劃了資料表草案、idempotency 策略、rawPayload 清洗 MVP 規則、API 實作建議順序。

**但本文件仍是「決策」層級的產出，尚未到達可以直接動工寫程式碼的「規格」精細度**——例如 `seller_agent_tokens`/`agent_run_logs` 的精確欄位型別、索引設計、約束條件、token 雜湊演算法選型等，都還需要進一步轉換為可執行的 schema 規格。

**因此明確建議下一步是：**

> **Step 7D-1C：撰寫 agent token / run log 的 schema 規格文件，或直接進入 Step 7D-2A：schema 實作前檢查（把本文件第 6 章的資料表草案，轉換為精確到欄位型別、索引、約束的 schema 規格，作為撰寫 migration 前的最後一道檢查關卡）。**

具體不建議事項（與本任務範圍要求一致）：

- **不建議直接寫 API route**——因為 token middleware 與資料表 schema 都還沒有精確定案，過早寫 route 程式碼容易因為底層依賴變動而大量返工
- **不建議直接寫 worker**——Agent worker 的實作必須建立在穩定的 API 介面之上，目前 API 介面尚未實作，寫 worker 為時過早
- **不建議進 Step 7E Seller Agent Workspace**——UI 層的工作必須建立在後端 API 與資料模型穩定之後，目前才剛完成「決策」階段，距離 UI 開發還有 Step 7D-2（API 實作）與相關測試驗證需要先完成

---

## 附錄：本次決策涉及的檔案清單

**已讀取 / 參考的文件與程式碼**：

```
docs/order-step7d-agent-write-api-spec.md（節錄重新核對 sellerId 出現位置）
docs/order-step7d-agent-write-api-implementation-audit.md（節錄重新核對盤點結論）
artifacts/api-server/src/middlewares/auth.ts（重新核對 verifyStoreOwner 邏輯）
artifacts/api-server/src/routes/stores.ts（核對 merchantId 使用方式）
artifacts/api-server/src/routes/categories.ts（核對 storeId scope 檢查模式）
artifacts/api-server/src/routes/cvs.ts（核對 storeId 使用情境）
artifacts/api-server/src/routes/public.ts（核對隱私欄位排除模式與 publicToken 機制）
lib/db/src/schema/stores.ts（核對 merchantId 欄位定義）
lib/db/src/schema/shipmentTrackings.ts（核對既有欄位與「Step 7D worker 寫入」註解）
lib/db/src/schema/shipmentTrackingEvents.ts（核對 eventStatus 白名單與 rawData 欄位）
```

**已執行的核對指令**：

```
grep -R "sellerId" docs/order-step7d-agent-write-api-spec.md → 約 14 處（規格文件中存在）
grep -R "sellerId" artifacts/api-server/src lib/db/src/schema → 0 個結果（程式碼/schema 中不存在，與 7D-1A 結論一致）
grep -R "merchantId|storeId|publicToken|trackingCode|trackingProvider|requireAuth|verifyStoreOwner" -n artifacts/api-server/src lib/db/src/schema → 確認既有 merchantId/storeId/verifyStoreOwner 使用模式
grep -R "idempotency|idempotencyKey" -ri lib/db/src/schema artifacts/api-server/src → 0 個結果（idempotency 欄位完全不存在，確認需要新增）
```

本文件未修改、未新增、未刪除上述任何檔案；僅讀取與分析，並基於分析結果做出決策記錄。
