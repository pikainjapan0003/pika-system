# Step 7E-1 Seller Agent Workspace UI 施工前盤點

> 文件類型：施工前盤點 / 決策清單（非施工文件）
> 建立日期：2026-06-08
> 對應分支：qa/step6f-cvs-store-selection-browser-mobile
> 前置步驟：Step 7E-0（規劃文件已完成）、Step 7D（Agent API 已完成）

---

## 1. 前置狀態確認

### 1.1 Git 狀態

| 項目 | 狀態 |
|---|---|
| 目前分支 | `qa/step6f-cvs-store-selection-browser-mobile` |
| Step 7E-0 規劃文件 | `docs/order-step7e-seller-agent-workspace-ui-plan.md` — 存在（untracked，未 stage）|
| Stage 狀態 | 無 staged changes |
| Claude B handoff | `dev-handoff/latest-B.json` / `dev-handoff/latest-B.md` — Step 7E-0 已更新，status: completed |
| `.replit` 修改 | 既有殘留，與本次任務無關 |
| `docs/order-step7c-schema-migration-implementation-audit.md` | 既有未 commit 文件，與本次任務無關 |

### 1.2 既有資料表（Step 7D 已完成）

| 資料表 | 用途 | 狀態 |
|---|---|---|
| `seller_agent_tokens` | Agent token 管理，含 storeId 隔離 | 已完成 |
| `agent_run_logs` | Agent 執行紀錄 | 已完成 |

### 1.3 既有 Agent API（Step 7D 已完成）

| Endpoint | 用途 |
|---|---|
| `POST /api/agent/shipment-events` | Agent 寫入物流事件 |
| `PATCH /api/agent/shipment-status` | Agent 更新訂單物流狀態 |
| `POST /api/agent/run-log` | Agent 回報執行紀錄 |
| `GET /api/agent/tracking-jobs` | Agent 查詢待追蹤清單 |

---

## 2. Step 7E-0 文件摘要

### 2.1 定案聲明

**每個賣家有自己的 Agent Workspace，賣家自己設定與管理，Agent 只能透過平台 API 存取自己的資料。**

### 2.2 訪問層架構

```
賣家瀏覽器
  ↓ (seller session auth)
Seller UI API（/api/seller/agent/...）
  ↓ (storeId 隔離)
平台資料庫（seller_agent_tokens, agent_run_logs, etc.）

Agent（外部 worker）
  ↓ (Bearer token auth)
Agent API（/api/agent/...）
  ↓ (token → storeId 隔離)
平台資料庫
```

### 2.3 MVP 區塊（8 個，僅信息架構）

| 區塊 | 核心內容 |
|---|---|
| Agent 狀態 | 啟用狀態、上次執行時間、執行成功率 |
| 物流來源 | 物流服務商選擇、啟用來源（待確認） |
| 查詢方式 | polling / webhook、webhook URL |
| 查詢頻率 | 查詢間隔、每日上限（待確認） |
| 安全設定 | IP 白名單、Token 有效期、Token 撤銷 |
| 測試與管理 | 手動測試執行、tracking-jobs 清單、Token 管理 |
| 執行紀錄 | run logs 分頁，不顯示個資 / rawPayload |
| Token / Webhook 區 | 建立 / 撤銷 / 清單，token 原文只顯示一次 |

### 2.4 Seller UI API（7 個，僅規劃）

| Endpoint | 用途 |
|---|---|
| `GET /api/seller/agent/settings` | 取得 Agent 設定 |
| `PATCH /api/seller/agent/settings` | 更新 Agent 設定 |
| `POST /api/seller/agent/tokens` | 建立 Token（原文一次性回傳）|
| `DELETE /api/seller/agent/tokens/:id` | 撤銷 Token |
| `GET /api/seller/agent/run-logs` | 查詢執行紀錄（不含個資）|
| `POST /api/seller/agent/test-run` | 手動測試執行（待確認 mock / 實際）|
| `GET /api/seller/agent/webhook-info` | 取得 webhook 資訊 |

### 2.5 Step 7E-0 標記「待確認」清單

Step 7E-0 文件共標記 7 項待確認（第 10 節），加上文件內文中的隱含待確認，本次整理為 10 項決策項目，詳見第 3 節。

---

## 3. 施工前待決策項目

---

## 決策項目：seller_agent_settings vs seller_agents

* 問題：應建立單表 `seller_agent_settings`（每個 store 一列設定），還是建立 `seller_agents`（Agent 為獨立實體，一個 store 可有多個 Agent）？
* 建議 MVP 決策：使用 `seller_agent_settings`，每個 store 對應一列設定記錄。
* 原因：MVP 場景下一個賣家只需要一組 Agent 設定；單表結構更簡單，權限模型清楚（一對一隔離），UI 較易實作，後續若需多 Agent 可升級為 `seller_agents` 或加 agent profile。
* 影響範圍：DB schema 設計（Step 7E-1a）、`GET/PATCH /api/seller/agent/settings` 設計（Step 7E-1b）、UI 設定面板邏輯。
* 若不決策的風險：schema 設計模糊，Step 7E-1a 無法開工；若施工後再改實體設計，需補 migration 且影響已存在的 API 測試。
* 後續施工 Step：Step 7E-1a（schema + migration）

---

## 決策項目：多 Agent per store

* 問題：一個賣家（一個 storeId）是否可以建立多個 Agent 設定？
* 建議 MVP 決策：不支援。MVP 限定一個 store 一組設定，一組主要 token 管理區。
* 原因：多 Agent 增加 UI 複雜度（需要 Agent 切換 / 列表），權限隔離更複雜，MVP 不需要；後續若有需求，可再擴充多 Agent profile。
* 影響範圍：`seller_agent_settings` schema 設計（不需要 agent_name / agent_index）、Token 管理 UI（無需多 Agent 切換）、settings API（不需要 agentId 參數）。
* 若不決策的風險：若 schema 預留多 Agent 欄位但 UI 不支援，會產生資料模型與前端不一致；若 schema 不預留，後續擴充需 migration。
* 後續施工 Step：Step 7E-1a（schema 確認）、Step 7E-1e（UI）

---

## 決策項目：查詢頻率賣家自設

* 問題：查詢頻率是否開放賣家輸入任意數值（如 cron expression），或只能從預設選項中選擇？
* 建議 MVP 決策：只允許選擇預設選項，白名單 enum：`manual`、`daily`、`every_6_hours`、`every_2_hours_high_tier`（可視方案調整）。
* 原因：任意 cron 輸入增加驗證難度，且不同頻率對平台基礎設施（DB 查詢、物流 API 呼叫）影響差異大；預設選項可搭配方案分級，防止低方案賣家設定過高頻率。
* 影響範圍：`seller_agent_settings.query_frequency` 欄位型別（enum 而非 cron string）、settings API 驗證邏輯、UI 頻率選擇器（下拉選單而非文字輸入）。
* 若不決策的風險：若前端實作自由輸入，後端無法簡單 enum 驗證；若後端用 enum 但前端用自由輸入，整合測試會失敗。
* 後續施工 Step：Step 7E-1a（enum 定義）、Step 7E-1b（settings PATCH 驗證）、Step 7E-1e（UI 選擇器）

---

## 決策項目：物流來源設定範圍

* 問題：賣家可自選哪些物流商？是自由輸入還是白名單選擇？
* 建議 MVP 決策：使用白名單 enum：`seven_eleven`、`family_mart`、`home_delivery`、`other`、`webhook`。不允許賣家自由輸入物流商代碼。
* 原因：物流商名稱若自由輸入，Agent 無法對應正確的查詢邏輯；白名單 enum 可確保 Agent 只處理已知物流商，降低整合風險。`other` 與 `webhook` 保留彈性。
* 影響範圍：`seller_agent_settings.enabled_logistics` 欄位型別（enum array）、settings API 驗證邏輯、UI multiselect 選項清單。
* 若不決策的風險：自由輸入可能導致 Agent 收到無法識別的 provider code，造成 silent failure；白名單範圍不確定也無法寫 UI multiselect。
* 後續施工 Step：Step 7E-1a（enum 定義）、Step 7E-1b（settings 驗證）、Step 7E-1e（UI）

---

## 決策項目：test-run 是否實際呼叫 Agent

* 問題：`POST /api/seller/agent/test-run` 是實際觸發外部 Agent / 物流查詢，還是 MVP 先做 mock / dry-run 驗證？
* 建議 MVP 決策：MVP 先做 mock / dry-run 驗證，只驗證 token 是否有效、設定格式是否正確，不實際呼叫外部 Agent 或物流 API。
* 原因：實際呼叫 Agent 需要外部服務正常運作，會增加 MVP 測試複雜度；mock 驗證已能驗證 Seller UI → 平台 API 整合是否正常，外部 Agent 驗證可留到整合測試階段。
* 影響範圍：`POST /api/seller/agent/test-run` 實作邏輯（只做 token 驗證 + 設定格式驗證）、回應格式設計（需清楚標示這是 dry-run 結果）。
* 若不決策的風險：若 API 預設做真實呼叫，MVP 開發環境沒有真實 Agent，所有 test-run 都會失敗，無法驗收。
* 後續施工 Step：Step 7E-1b/1c（test-run API）、後續整合測試 Step

---

## 決策項目：webhook_secret 是否需要

* 問題：webhook URL 是否需要搭配 `webhook_secret`（HMAC 簽名驗證），讓平台可以驗證 webhook 來源？
* 建議 MVP 決策：規劃欄位，但 MVP 階段不強制施工 webhook 簽名驗證邏輯；schema 預留 `webhook_secret` 欄位（nullable），待 webhook 功能進入施工 Step 時再補完。
* 原因：webhook 功能本身在 MVP 不是主要路徑（polling 優先）；但若 schema 不預留欄位，後續補 migration 成本較高；預留欄位不影響當前功能。
* 影響範圍：`seller_agent_settings` schema（nullable `webhook_secret` 欄位）、webhook 功能 Step（簽名驗證邏輯）。
* 若不決策的風險：若完全不規劃，後續 webhook 功能上線前需補 schema migration，且容易遺忘安全要求。
* 後續施工 Step：Step 7E-1a（欄位預留）、webhook 功能 Step（驗證邏輯）

---

## 決策項目：BYOK 是否進 MVP

* 問題：是否在 MVP 支援 BYOK（Bring Your Own Key），讓賣家填入自己的 OpenAI / Anthropic API key 由平台代用？
* 建議 MVP 決策：不進 MVP。BYOK 列為進階版 / 後續項目。
* 原因：BYOK 需要：key 加密保存（AES-256 + KMS 或等效方案）、前端輸入遮蔽、key 輪替機制、洩露風險管理、權限隔離；這些複雜度遠超 MVP 需求，且賣家自帶 Agent 的預設模式不需要 BYOK。
* 影響範圍：`seller_agent_settings` schema（不需要 `external_api_key` 欄位）、安全規格文件（記錄 BYOK 為 deferred）。
* 若不決策的風險：若 schema 誤預留加密 key 欄位但未實作加密，會產生安全漏洞；明確不進 MVP 可避免欄位誤用。
* 後續施工 Step：進階版 / 後續方案確認後再規劃

---

## 決策項目：平台代管 Agent 是否進 MVP

* 問題：平台是否在 MVP 提供「代管 AI Agent」功能（平台幫賣家代跑 AI，吃平台 AI token）？
* 建議 MVP 決策：不開放完整平台代管 AI Agent。MVP 方向為「純規則 worker / 手動查詢 / webhook」，賣家自帶 Agent。
* 原因：平台代管 Agent 需要 rate limit、usage counters、quota 管理、kill switch、方案分級，這些都是平台基礎建設，MVP 不應承擔此複雜度；賣家自帶 Agent 模型不吃平台 AI token，成本可控。
* 影響範圍：`agent_usage_counters` 資料表（MVP 不需要）、方案設計（MVP 不需要）、billing 邏輯（MVP 不需要）。
* 若不決策的風險：若 MVP 誤開放平台代管，沒有 rate limit 保護，賣家可能消耗大量平台 AI token 無法控制。
* 後續施工 Step：進階版 / 方案定價確認後再規劃

---

## 決策項目：token 原文只顯示一次的 UX 處理

* 問題：token 原文在建立後只能顯示一次，前端需要如何設計 UX 讓賣家不會遺漏？
* 建議 MVP 決策：前端在 `POST /api/seller/agent/tokens` 成功後，彈出 Modal 顯示 token 原文，Modal 關閉前有「我已複製」確認機制；Modal 關閉後不可再取得原文。token 清單頁只顯示 `token_prefix`、`created_at`、`last_used_at`、`expires_at`、`status`。
* 原因：token 原文不應儲存在前端 state / localStorage；一次性顯示是標準安全做法（GitHub PAT、Stripe API Key 均採相同 UX）；確認機制可降低賣家意外關閉 Modal 的風險。
* 影響範圍：Token 建立 UI（Modal 設計）、Token 清單 API 回應格式（不含完整 token）、`POST /api/seller/agent/tokens` 回應格式確認（只在此回傳原文一次）。
* 若不決策的風險：若前端誤將 token 存入 state 或 localStorage，會產生安全漏洞；若沒有確認機制，賣家誤關 Modal 後無法取得 token，需重新建立。
* 後續施工 Step：Step 7E-1c（Token API）、Step 7E-1e（Token Modal UI）

---

## 決策項目：run logs 顯示範圍避免個資外洩

* 問題：`GET /api/seller/agent/run-logs` 的回應欄位範圍如何確保不洩露 rawPayload 與買家個資？
* 建議 MVP 決策：run logs 只顯示以下摘要欄位：最近執行時間（`created_at`）、查詢數量（`queried_count`）、成功數量（`success_count`）、失敗數量（`failure_count`）、錯誤摘要（`error_code`）、執行狀態（`status`）。嚴格禁止回傳：`rawPayload`、買家電話、買家地址、token hash、外部物流 API 原始回應、內部 stack trace。
* 原因：`rawPayload` 含物流 API 原始格式，可能包含個資；買家電話 / 地址為敏感個資，不應出現在 Agent 管理介面；error_code 取代完整錯誤訊息，足以讓賣家判斷問題類型；stack trace 不應出現在任何前端回應。
* 影響範圍：`GET /api/seller/agent/run-logs` API 欄位 whitelist（用 select + exclude 確保不洩露）、前端 run logs 表格欄位設計。
* 若不決策的風險：若 API 回傳 `select *`，前端誤顯示 rawPayload / 個資，產生合規問題；後端必須明確 whitelist 而非依賴前端隱藏欄位。
* 後續施工 Step：Step 7E-1d（run-logs API + whitelist）、Step 7E-1e（run logs UI 表格）

---

## 4. 建議決策

以下為本次盤點的 10 項建議決策匯總，依保守 MVP 原則：

| # | 決策項目 | 建議決策 |
|---|---|---|
| 1 | schema 設計 | 使用 `seller_agent_settings`（單表），不建 `seller_agents` 獨立實體 |
| 2 | 多 Agent per store | 不支援，MVP 一個 store 一組設定 |
| 3 | 查詢頻率 | 預設 enum 選項，不開放自由 cron 輸入 |
| 4 | 物流來源 | 白名單 enum，不開放自由輸入 |
| 5 | test-run | MVP 做 mock / dry-run，不實際呼叫外部 Agent |
| 6 | webhook_secret | schema 預留欄位（nullable），MVP 不施工驗證邏輯 |
| 7 | BYOK | 不進 MVP |
| 8 | 平台代管 Agent | 不進 MVP |
| 9 | token UX | 建立後 Modal 顯示原文一次，有「我已複製」確認機制 |
| 10 | run logs 範圍 | 只回傳摘要欄位，後端 whitelist 強制排除個資 / rawPayload |

---

## 5. MVP 最小施工切分

### 5.1 建議施工順序

```
Step 7E-1a：seller_agent_settings schema + migration
  → 確認 enum 欄位（query_frequency, enabled_logistics）
  → 確認 webhook_secret 欄位（nullable）
  → 不包含 BYOK / usage_counters

Step 7E-1b：GET/PATCH /api/seller/agent/settings（API + 測試）
  → seller session auth 驗證
  → 欄位 whitelist（不回傳 webhook_secret 原文）
  → PATCH 欄位驗證（enum 驗證 query_frequency, enabled_logistics）
  → test-run：mock / dry-run 驗證（可合併在此 Step 或獨立）

Step 7E-1c：POST/DELETE/GET /api/seller/agent/tokens（API + 測試）
  → token 建立：原文一次性回傳（不儲存在 response session）
  → token 清單：只回傳 token_prefix, created_at, last_used_at, expires_at, status
  → token 撤銷：立即設 revoked，後續 401
  → 不回傳：tokenHash、完整 token

Step 7E-1d：GET /api/seller/agent/run-logs（API + 測試）
  → 分頁回傳
  → 欄位 whitelist（排除 rawPayload, 個資）
  → 支援過濾：status, startDate, endDate

Step 7E-1e：Seller Agent Workspace UI 頁面
  → 設定面板（query_frequency, enabled_logistics, webhook URL）
  → Token 管理區（建立 Modal、清單、撤銷）
  → Run logs 表格（分頁、過濾）
  → Agent 狀態區（啟用狀態、上次執行時間、成功率）
```

### 5.2 切分原則

- API 測試先於 UI 施工
- schema migration 先於 API 施工
- 每個 Step 獨立可測試，不依賴未完成的後續 Step
- MVP 不施工 webhook 驗證邏輯、BYOK、平台代管 Agent

---

## 6. API / Schema / UI 相依關係

```
seller_agent_settings (schema)
  ↓
GET/PATCH /api/seller/agent/settings (API)
  ↓
Settings Panel UI
  └── query_frequency 選擇器
  └── enabled_logistics multiselect
  └── webhook URL 輸入

seller_agent_tokens (既有 schema, Step 7D)
  ↓
POST/DELETE/GET /api/seller/agent/tokens (API, Step 7E-1c)
  ↓
Token 管理 UI (Modal + 清單 + 撤銷按鈕)

agent_run_logs (既有 schema, Step 7D)
  ↓
GET /api/seller/agent/run-logs (API, Step 7E-1d)
  ↓
Run Logs 表格 UI

Agent API (既有, Step 7D)
  ↓ (test-run mock 呼叫)
POST /api/seller/agent/test-run (API, Step 7E-1b)
  ↓
測試執行按鈕 UI
```

### 6.1 關鍵相依說明

| 相依 | 說明 |
|---|---|
| Step 7E-1a → 7E-1b | settings API 必須在 schema migration 完成後才能施工 |
| Step 7E-1c → 7E-1e | Token UI 需要 token API 完成才能整合 |
| Step 7D (既有) → 7E-1d | run-logs API 使用既有 `agent_run_logs` 表，不需新 schema |
| Step 7D (既有) → 7E-1c | token 撤銷影響既有 `seller_agent_tokens` 表 |

---

## 7. 風險與防呆

### 7.1 Schema 風險

| 風險 | 防呆措施 |
|---|---|
| `seller_agent_settings` 欄位設計模糊，後續需多次 migration | Step 7E-1a 施工前用本文件決策結論確認欄位清單 |
| enum 值後續需擴充（如新增物流商） | enum 定義在 schema comment 中保留擴充說明，不要 hardcode 為 NOT NULL without default |
| `webhook_secret` 誤存明文 | schema 使用 nullable TEXT，實際儲存時需 hashed 或預留 encryption 欄位 |

### 7.2 API 風險

| 風險 | 防呆措施 |
|---|---|
| Seller UI API 誤用 Agent token auth | 所有 `/api/seller/agent/...` 必須用 seller session auth middleware，不接受 Bearer token |
| settings PATCH 誤允許賣家修改 `storeId` / token | PATCH handler 只允許指定白名單欄位 |
| run-logs 回傳 rawPayload | API handler 用 select 欄位白名單，不用 `select *` |
| token 建立後可再次查詢原文 | `GET /api/seller/agent/tokens` 不回傳 token 欄位，只回傳 token_prefix |

### 7.3 UI 風險

| 風險 | 防呆措施 |
|---|---|
| Token Modal 被使用者關閉前未複製 | Modal 加「我已複製」確認按鈕，未確認前不允許關閉（或加二次確認） |
| run logs 前端誤顯示 tokenHash / rawPayload | API 已 whitelist，前端不能依賴「後端有過濾就不管」，Table column 設計明確列出允許欄位 |
| 物流來源 multiselect 送出非 enum 值 | 前後端都需驗證；前端下拉選單只顯示 enum 選項，後端再次驗證 |

### 7.4 安全邊界

- Agent 不可以直接改 DB
- Agent token 與 Seller session 為不同 scope，不可混用
- Seller UI 不可顯示 tokenHash / 完整 token / rawPayload / 買家個資
- 內部錯誤只顯示 error_code，不顯示 stack trace / DB 錯誤訊息

---

## 8. 非目標

本次（Step 7E-1 盤點文件）及後續 MVP 施工均明確排除：

- DB schema 修改（本次文件不施工）
- Migration（本次文件不施工）
- API route 實作（本次文件不施工）
- UI component / 頁面（本次文件不施工）
- Worker / 排程任務
- 物流來源串接（呼叫外部物流 API）
- Webhook 簽名驗證邏輯（schema 預留欄位，邏輯不進 MVP）
- BYOK（Bring Your Own Key）
- 平台代管 AI Agent
- `agent_usage_counters` 資料表
- `agent_audit_logs` 資料表
- `seller_agent_webhooks` 資料表（webhook URL 存在 `seller_agent_settings`，不獨立表）
- 方案 / 計費 / 用量管理
- IP 白名單功能（設計已提及，不進 MVP）
- Token 有效期自動停用（設計已提及，不進 MVP）
- 靜默時段設定
- 平台 AI token 額度管理

---

## 9. 驗收標準

### 9.1 本次盤點文件驗收

- [x] 前置狀態已確認（Step 7E-0 文件存在、Git 狀態清楚）
- [x] Step 7E-0 文件摘要已整理
- [x] 10 項決策問題已逐一整理並給出建議
- [x] MVP 建議決策匯總表已提供
- [x] MVP 最小施工切分（5 個 Step）已定義
- [x] API / schema / UI 相依關係已圖示
- [x] 風險與防呆已列出
- [x] 非目標已明確列出

### 9.2 Step 7E-1a 可開工驗收條件

進入 Step 7E-1a（schema + migration）施工前，必須確認：

- [ ] 決策 1：`seller_agent_settings` 確認為 MVP schema 名稱
- [ ] 決策 2：多 Agent per store 確認不支援
- [ ] 決策 3：`query_frequency` enum 值清單確認（manual / daily / every_6_hours / every_2_hours_high_tier）
- [ ] 決策 4：`enabled_logistics` enum 值清單確認（seven_eleven / family_mart / home_delivery / other / webhook）
- [ ] 決策 6：`webhook_secret` 欄位確認為 nullable TEXT（預留，不施工驗證邏輯）

---

## 10. 下一步 Step 7E-2 建議

### 10.1 Step 7E-2 建議定位

**Step 7E-2：seller_agent_settings schema 規格確認 + migration 草稿**

Step 7E-2 的目標是根據本文件決策，輸出明確的 schema 欄位規格，並產生 migration 草稿供 Step 7E-1a 直接施工，**不執行 DB push**。

### 10.2 Step 7E-2 建議輸出

| 產出 | 說明 |
|---|---|
| `seller_agent_settings` 欄位清單 | 含欄位名稱、型別、nullable、default、constraint |
| enum 值清單 | `query_frequency`、`enabled_logistics` |
| migration 草稿 | 供 Step 7E-1a 施工時使用 |
| `seller_agent_tokens` 欄位確認 | 確認既有 Step 7D 欄位是否需要補充 |
| API 規格草稿 | `GET/PATCH /api/seller/agent/settings` 請求 / 回應格式 |

### 10.3 Step 7E-2 施工前提條件

- 本文件（Step 7E-1 盤點）已確認
- 第 9.2 節「Step 7E-1a 可開工驗收條件」5 項已確認
- 未有新的 blocker 出現

### 10.4 建議路徑總覽

```
Step 7E-0（完成）：規劃文件
Step 7E-1（本次）：施工前盤點 / 決策整理
Step 7E-2（下一步）：schema 規格確認 + migration 草稿
Step 7E-1a：seller_agent_settings schema + migration 施工
Step 7E-1b：GET/PATCH settings API + test-run mock API
Step 7E-1c：Token 建立 / 撤銷 / 清單 API
Step 7E-1d：run-logs API（whitelist 欄位）
Step 7E-1e：Seller Agent Workspace UI 頁面
```

---

*此文件為 Step 7E-1 施工前盤點，非施工文件。所有標記待確認的驗收條件需在 Step 7E-1a 開工前完成確認。*
