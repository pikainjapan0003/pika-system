# Step 7E Seller Agent Workspace UI 規劃

> 文件類型：UX / Product Planning（規劃文件，非施工文件）
> 建立日期：2026-06-08
> 對應分支：qa/step6f-cvs-store-selection-browser-mobile
> 前置步驟：Step 7D Agent 寫入 API（已完成，main = 13c1904）

---

## 1. 背景與定案

### 1.1 定案聲明

**每個賣家有自己的 Agent Workspace，賣家自己設定與管理，Agent 只能透過平台 API 存取自己的資料。**

### 1.2 現況

Step 7D 已完成 Agent 寫入 API，包含：

- `POST /api/agent/shipment-events`：Agent 寫入物流事件
- `PATCH /api/agent/shipment-status`：Agent 更新訂單物流狀態
- `POST /api/agent/run-log`：Agent 回報執行紀錄
- `GET /api/agent/tracking-jobs`：Agent 查詢待追蹤清單

Agent token 以 `seller_agent_tokens` 表管理，隔離單位為 `storeId`，已通過 78 mock 測試、19 真實 DB E2E 測試。

### 1.3 本次範圍

Step 7E-0 只做 UX / Product planning 文件，**不施工任何 UI / API / DB**。

---

## 2. MVP 頁面定位

### 2.1 頁面名稱

| 用途                      | 名稱                   |
| ------------------------- | ---------------------- |
| 賣家菜單入口              | 我的貨態 Agent         |
| 頁面標題 / workspace 概念 | Seller Agent Workspace |

### 2.2 定位原則

- 賣家自行管理自己的 Agent 設定，平台不代為操作
- 不給賣家自由 prompt 大框，採用**簡單設定面板**
- Agent 不能直接改 DB，只能透過平台安全 API 寫回貨態
- Seller UI 使用 **seller session auth**，不使用 Agent token
- Token 原文只在建立當下顯示一次
- 不顯示 tokenHash、不顯示完整 token、不顯示 rawPayload

### 2.3 訪問層設計

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

---

## 3. MVP 區塊設計

以下為 Seller Agent Workspace 的 MVP 區塊規劃。**本節只做信息架構，不新增任何 component。**

### 3.1 Agent 狀態

| 欄位           | 說明                                       |
| -------------- | ------------------------------------------ |
| Agent 啟用狀態 | 啟用 / 停用，控制 Agent token 是否允許寫入 |
| 上次執行時間   | 最後一筆 agent_run_logs 的 `created_at`    |
| 執行成功率     | 近 N 筆 run-log success / total            |

### 3.2 物流來源

| 設定項目       | 說明                                    |
| -------------- | --------------------------------------- |
| 物流服務商     | 待確認：是否由賣家選擇或 Agent 自動偵測 |
| 啟用的物流來源 | 待確認：multiselect 或 checkbox         |
| 預設追蹤方式   | polling / webhook（待確認）             |

### 3.3 查詢方式

| 設定項目     | 說明                                        |
| ------------ | ------------------------------------------- |
| 查詢模式     | polling（定期輪詢）/ webhook（即時推送）    |
| webhook URL  | 若 Agent 支援 webhook，填入接收端           |
| 查詢觸發條件 | 待確認：訂單建立後 N 小時開始，還是一律輪詢 |

### 3.4 查詢頻率

| 設定項目 | 說明                                            |
| -------- | ----------------------------------------------- |
| 查詢間隔 | 待確認：每 N 分鐘 / 每 N 小時，是否開放賣家自設 |
| 每日上限 | 待確認：平台是否設 rate limit                   |
| 靜默時段 | 待確認：是否允許設定不執行的時間段              |

### 3.5 安全設定

| 設定項目     | 說明                                |
| ------------ | ----------------------------------- |
| IP 白名單    | 待確認：是否支援 Agent 來源 IP 限制 |
| Token 有效期 | 待確認：是否支援過期自動停用        |
| Token 撤銷   | 賣家可一鍵撤銷 token，立即失效      |

### 3.6 測試與管理

| 功能                    | 說明                                                      |
| ----------------------- | --------------------------------------------------------- |
| 執行測試                | 手動觸發一次 Agent 測試執行，檢查結果                     |
| 查看 tracking-jobs 清單 | 顯示目前待追蹤訂單（隱藏買家個資）                        |
| Token 管理              | 建立 / 撤銷 / 檢視 token 清單（不顯示 hash / 完整 token） |

### 3.7 執行紀錄

| 欄位     | 說明                                           |
| -------- | ---------------------------------------------- |
| 執行時間 | agent_run_logs.created_at                      |
| 執行結果 | success / failure                              |
| 錯誤類型 | error_code（不顯示完整 rawPayload）            |
| 訂單參考 | 只顯示訂單 public_token，不顯示買家電話 / 地址 |

### 3.8 Token / Webhook 區

| 項目         | 說明                                                   |
| ------------ | ------------------------------------------------------ |
| 建立 Token   | 賣家填入名稱，平台產生 token，**原文只顯示一次**       |
| Token 清單   | 顯示名稱、`token_prefix`、建立時間、最後使用時間、狀態 |
| Revoke       | 撤銷後立即失效，不可恢復                               |
| Webhook 資訊 | 平台 Agent API base URL，供賣家貼入 n8n / OpenClaw     |
| 不顯示       | tokenHash、完整 token、rawPayload                      |

---

## 4. Seller UI API 規劃

**本節只做規劃，不實作。** 所有 endpoint 均需 seller session auth，不接受 Agent token。

### 4.1 取得 Agent 設定

```
GET /api/seller/agent/settings
```

- 回傳：Agent 啟用狀態、物流來源、查詢頻率、查詢方式等設定
- 需要：seller session 中的 storeId

### 4.2 更新 Agent 設定

```
PATCH /api/seller/agent/settings
```

- 請求：部分更新設定欄位
- 不允許：賣家自行修改 token / storeId / 系統欄位

### 4.3 建立 Token

```
POST /api/seller/agent/tokens
```

- 請求：`{ name: string }`
- 回傳：`{ id, name, token_prefix, token }` — **token 原文只在此回傳一次**
- 不回傳：tokenHash

### 4.4 撤銷 Token

```
DELETE /api/seller/agent/tokens/:id
```

或

```
PATCH /api/seller/agent/tokens/:id/revoke
```

- 立即將 token 狀態設為 revoked
- 後續 Agent 使用此 token 會得到 401

### 4.5 查詢執行紀錄

```
GET /api/seller/agent/run-logs
```

- 分頁回傳 agent_run_logs
- 過濾：`?status=success|failure&startDate=...&endDate=...`
- 不回傳：rawPayload、買家個資

### 4.6 手動測試執行

```
POST /api/seller/agent/test-run
```

- 觸發一次測試性 Agent 執行（待確認：是否實際呼叫 Agent 或只做 mock）
- 回傳：執行結果摘要

### 4.7 Webhook 資訊

```
GET /api/seller/agent/webhook-info
```

- 回傳：Agent API base URL、可用 endpoint 清單（供賣家設定 n8n / OpenClaw）
- 不含任何 token 原文

---

## 5. 資料表與後續 Schema 規劃

### 5.1 已有資料表

| 資料表                | 用途                              | 狀態              |
| --------------------- | --------------------------------- | ----------------- |
| `seller_agent_tokens` | Agent token 管理，含 storeId 隔離 | 已完成（Step 7D） |
| `agent_run_logs`      | Agent 執行紀錄                    | 已完成（Step 7D） |

### 5.2 後續可能需要的資料表

**以下為規劃項目，本次不實作。**

| 資料表                                     | 用途                                              | 優先級                         |
| ------------------------------------------ | ------------------------------------------------- | ------------------------------ |
| `seller_agent_settings` 或 `seller_agents` | 賣家 Agent 設定（啟用狀態、物流來源、查詢頻率等） | 高，Step 7E-1 施工前需確認     |
| `seller_agent_webhooks`                    | 賣家設定的 webhook 接收端 URL                     | 中，視需求決定                 |
| `agent_usage_counters`                     | 平台代管 Agent 用量統計（rate limit、每日用量）   | 中，有平台代管 Agent 時才需要  |
| `agent_audit_logs`                         | 高敏感操作稽核紀錄（建立/撤銷 token 等）          | 低，可先用 agent_run_logs 替代 |

### 5.3 Schema 設計前置確認項（待確認）

- `seller_agent_settings` vs `seller_agents`：單表設定或 Agent 為獨立實體
- 是否需要多個 Agent per store（一個賣家可建立多個 Agent 設定）
- webhook URL 是否需要簽名驗證欄位（`webhook_secret`）
- `agent_usage_counters` 的計費粒度（日 / 月 / 方案）

---

## 6. 成本、額度與 Token 策略

### 6.1 賣家自帶 Agent（預設方向）

- 賣家自己的 Agent / OpenClaw / n8n / webhook
- **不吃平台 AI token**
- 平台只提供安全 API，Agent 自行呼叫 AI 服務
- 無需平台代管、無需額度管理

### 6.2 平台代管 Agent（進階功能，待規劃）

- 平台幫賣家代跑 AI Agent
- **會吃平台 AI token，必須有以下機制：**
  - 方案設計（免費額度 / 付費方案）
  - 每日 / 每月用量上限
  - Rate limit（每分鐘 / 每小時呼叫次數）
  - 用量統計（`agent_usage_counters`）
  - 超額通知機制
- **本次不實作**，待定價模型確認後進行

### 6.3 純規則 Worker（MVP 優先）

- 不使用 AI，純規則執行（如：每 N 分鐘輪詢物流 API，寫回貨態）
- **MVP 可優先採用**，不吃 AI token，成本可控
- 賣家只需設定規則，無需 AI 知識

### 6.4 BYOK（Bring Your Own Key，進階版）

- 賣家填入自己的 OpenAI / Anthropic API key，平台代用
- **key 必須加密保存**（待確認加密方案），不可出現在前端
- 不在 MVP 範圍

---

## 7. 安全邊界

### 7.1 Agent 不可以

| 禁止行為               | 說明                                           |
| ---------------------- | ---------------------------------------------- |
| 直接改 DB              | Agent 只能透過平台 API 寫入，不得直連資料庫    |
| 直接改訂單金額         | 非 Agent 職責範圍，需走訂單 API 並有獨立權限   |
| 直接改商品             | 非 Agent 職責範圍                              |
| 看其他賣家的訂單       | token 綁定 storeId，API 強制隔離               |
| 讀完整客戶個資         | Agent API 不回傳買家電話 / 地址 / email        |
| 輸出 rawPayload 給買家 | rawPayload 只留在 DB，不可出現在任何前端回應   |
| 使用管理員 token       | Agent token 與管理員 token 為不同 scope        |
| 繞過 storeId 隔離      | API 層強制以 token 對應的 storeId 過濾所有查詢 |

### 7.2 Seller UI 不可以

| 禁止行為                         | 說明                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------- |
| 顯示 tokenHash                   | tokenHash 為內部比對用，不出現在任何 API 回應                                   |
| 顯示完整 token（建立後）         | token 原文只在 `POST /api/seller/agent/tokens` 回應中顯示一次，建立後不可再取得 |
| 顯示 rawPayload                  | rawPayload 為物流 API 原始回應，含敏感格式，不出現在前端                        |
| 顯示買家電話 / 地址              | Seller UI 不顯示完整買家個資                                                    |
| 讓賣家輸入自由 prompt 控制 Agent | 只提供簡單設定面板，不開放自由 prompt 欄位                                      |
| 顯示內部錯誤訊息                 | 錯誤只顯示 error_code，不顯示 stack trace / DB 錯誤                             |

---

## 8. 非目標（本次不施工）

- Seller UI 頁面 component
- 任何 Next.js / React 頁面
- Seller UI API route（/api/seller/agent/...）
- 新 DB schema / migration
- Agent token 產生邏輯
- Webhook 實作
- 物流來源串接
- Step 7E-1 及後續施工
- 平台代管 Agent
- BYOK 功能

---

## 9. 驗收標準

### 9.1 文件驗收

- [x] 文件已建立：`docs/order-step7e-seller-agent-workspace-ui-plan.md`
- [x] 定案聲明已寫入
- [x] MVP 頁面名稱已定義
- [x] 8 個 MVP 區塊已規劃
- [x] 7 個 Seller UI API 已規劃（僅規劃，未實作）
- [x] 資料表後續規劃已列出
- [x] 成本與 token 策略已說明
- [x] 安全邊界（Agent 不可以 / Seller UI 不可以）已明確列出

### 9.2 實作邊界驗收

- [x] 未施工 UI
- [x] 未施工 API
- [x] 未修改 DB schema
- [x] 未執行 DB push / drizzle-kit push
- [x] 未新增 migration
- [x] 未修改禁止範圍檔案
- [x] 未 commit / push

---

## 10. 後續 Step 7E-1 建議

### Step 7E-1 施工前提條件

完成本文件確認後，Step 7E-1 可依以下優先序施工：

1. **確認 `seller_agent_settings` schema 設計**（與 Step 7C/7D schema 整合）
2. **實作 Seller UI API**（`/api/seller/agent/...`，使用 seller session auth）
3. **實作 Seller UI 頁面**（Seller Agent Workspace，採簡單設定面板）
4. **整合 token 建立與撤銷流程**（原文一次顯示，不留在 session）
5. **整合 run-logs 顯示**（分頁、過濾、不顯示個資）

### Step 7E-1 優先推薦施工路徑

```
Step 7E-1a：seller_agent_settings schema + migration
Step 7E-1b：GET/PATCH /api/seller/agent/settings（API + 測試）
Step 7E-1c：POST/DELETE/GET /api/seller/agent/tokens（API + 測試）
Step 7E-1d：GET /api/seller/agent/run-logs（API + 測試）
Step 7E-1e：Seller Agent Workspace UI 頁面
```

### 待確認事項（進 Step 7E-1 前需確認）

| 項目                                   | 說明                              |
| -------------------------------------- | --------------------------------- |
| seller_agent_settings vs seller_agents | 單表設定或 Agent 獨立實體         |
| 多 Agent per store                     | 一個賣家是否可建立多個 Agent 設定 |
| 查詢頻率是否開放賣家自設               | 或只能選預設值                    |
| 物流來源設定範圍                       | 賣家可自選哪些物流商              |
| test-run 是否實際呼叫 Agent            | 或只做 mock 驗證                  |
| webhook_secret 是否需要                | webhook 簽名驗證機制              |
| BYOK 是否進 MVP                        | 進階功能時間線                    |

---

_此文件為 Step 7E-0 規劃文件，非最終施工規格。所有標記「待確認」的項目需在 Step 7E-1 施工前確認。_
