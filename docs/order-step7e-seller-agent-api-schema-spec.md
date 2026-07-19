# Step 7E-2 Seller Agent Settings / Token 管理 API 規格

> 文件類型：API / Schema 規格（非施工文件）
> 建立日期：2026-06-08
> 對應分支：qa/step6f-cvs-store-selection-browser-mobile
> 前置步驟：Step 7E-0（規劃文件）、Step 7E-1（施工前盤點）

---

## 1. 背景與目標

### 1.1 背景

Step 7D 已完成 Agent 寫入 API 與底層資料表（`seller_agent_tokens`、`agent_run_logs`）。

Step 7E-0 完成了 Seller Agent Workspace 的 UX / Product 規劃。

Step 7E-1 完成了施工前盤點，整理了 10 項待決策問題並給出 MVP 建議。

### 1.2 本次目標

本文件（Step 7E-2）將 Step 7E-1 的決策收斂成可交付後續施工的規格：

- `seller_agent_settings` schema 欄位規格
- Seller UI API（8 個 endpoint）請求 / 回應規格
- token 安全規格
- run logs 安全顯示規格
- 權限與資料隔離規範

**本文件只做規格，不施工任何 schema / migration / API / UI。**

### 1.3 已知命名慣例

根據現有 `stores` 表與 `orders` 表：

| 欄位                | 型別             | 說明                                         |
| ------------------- | ---------------- | -------------------------------------------- |
| `stores.id`         | serial (integer) | store 主鍵                                   |
| `stores.merchantId` | text             | 賣家 / 店主識別碼（Clerk userId 或同等識別） |
| `orders.storeId`    | integer          | FK → stores.id                               |

`seller_agent_settings` 應採用相同命名：`storeId`（integer FK）。

---

## 2. 已採用的 MVP 決策

以下決策為 Step 7E-2 規格的基礎，不再重新討論：

| #   | 決策項目           | 定案                                                        |
| --- | ------------------ | ----------------------------------------------------------- |
| 1   | schema 名稱        | 使用 `seller_agent_settings`，不建 `seller_agents` 獨立實體 |
| 2   | 多 Agent per store | 不支援，一個 store 只能有一列 `seller_agent_settings`       |
| 3   | 查詢頻率           | 只允許白名單 enum，不開放自由 cron 輸入                     |
| 4   | 物流來源           | 白名單 enum，不開放自由 provider code 輸入                  |
| 5   | test-run           | MVP 為 dry-run validation，不觸發外部 Agent / 物流查詢      |
| 6   | webhook_secret     | schema 預留 nullable 欄位，MVP 不施工簽名驗證邏輯           |
| 7   | BYOK               | 不進 MVP                                                    |
| 8   | 平台代管 Agent     | 不進 MVP 第一階段                                           |
| 9   | token UX           | 建立後 Modal 顯示原文一次，有「我已複製」確認機制           |
| 10  | run logs 範圍      | 只回摘要欄位，後端 whitelist 強制排除個資 / rawPayload      |

---

## 3. seller_agent_settings Schema 規格

**本節只寫規格，不修改 DB schema，不新增 migration，不執行 DB push。**

### 3.1 資料表規格

資料表名稱：`seller_agent_settings`

**唯一性約束：`storeId` 必須唯一**（UNIQUE constraint），一個 store 只能有一列設定。

### 3.2 欄位規格

| 欄位名稱                    | 型別                    | Nullable | Default            | 說明                                                                     |
| --------------------------- | ----------------------- | -------- | ------------------ | ------------------------------------------------------------------------ |
| `id`                        | serial (integer)        | NOT NULL | AUTO               | 主鍵                                                                     |
| `storeId`                   | integer                 | NOT NULL | —                  | FK → stores.id，UNIQUE，一個 store 一列                                  |
| `merchantId`                | text                    | NOT NULL | —                  | 對應 stores.merchantId，冗餘保存供稽核使用                               |
| `agentStatus`               | text (enum)             | NOT NULL | `'disabled'`       | Agent 啟用狀態                                                           |
| `agentMode`                 | text (enum)             | NOT NULL | `'external_agent'` | Agent 工作模式                                                           |
| `enabledLogistics`          | text[] (enum array)     | NOT NULL | `'{}'`             | 啟用的物流來源白名單                                                     |
| `queryMethods`              | text[] (enum array)     | NOT NULL | `'{manual}'`       | 查詢方式白名單                                                           |
| `queryFrequency`            | text (enum)             | NOT NULL | `'manual'`         | 查詢頻率                                                                 |
| `notifyOnUnknown`           | boolean                 | NOT NULL | `false`            | 貨態未知時是否通知賣家                                                   |
| `requireConfirmOnException` | boolean                 | NOT NULL | `true`             | 例外狀況是否需要賣家確認                                                 |
| `requireConfirmOnReturned`  | boolean                 | NOT NULL | `true`             | 退件時是否需要賣家確認                                                   |
| `requireConfirmOnDelivered` | boolean                 | NOT NULL | `false`            | 到達時是否需要賣家確認                                                   |
| `hideErrorDetailsFromBuyer` | boolean                 | NOT NULL | `true`             | 是否隱藏錯誤詳情不顯示給買家                                             |
| `webhookEnabled`            | boolean                 | NOT NULL | `false`            | 是否啟用 webhook 接收                                                    |
| `webhookUrl`                | text                    | NULL     | —                  | Webhook 接收端 URL（賣家填入）                                           |
| `webhookSecretHash`         | text                    | NULL     | —                  | Webhook secret 的雜湊值（不儲存明文；後續 webhook 驗證 Step 才施工邏輯） |
| `lastTestRunAt`             | timestamp with timezone | NULL     | —                  | 上次 test-run 時間                                                       |
| `lastRunAt`                 | timestamp with timezone | NULL     | —                  | 上次 Agent 實際執行時間（由 run-log 同步）                               |
| `createdAt`                 | timestamp with timezone | NOT NULL | NOW()              | 建立時間                                                                 |
| `updatedAt`                 | timestamp with timezone | NOT NULL | NOW()              | 最後更新時間（$onUpdate）                                                |

### 3.3 Enum 規格

#### agentStatus

```
disabled          ← 預設，Token 允許存在但 Agent 不執行寫入
enabled           ← Agent 可執行寫入，token 驗證有效
```

#### agentMode

```
external_agent         ← 賣家自帶 Agent / n8n / OpenClaw（MVP 主要模式）
rule_worker            ← 純規則 worker，不使用 AI（MVP 可用）
self_hosted_webhook    ← 賣家自架 webhook 接收推送
platform_managed_reserved   ← 保留值，不代表 MVP 啟用平台代管 AI Agent
```

> **注意**：`platform_managed_reserved` 只是 schema 預留，**MVP 不開放此模式**。任何嘗試將 `agentMode` 設為 `platform_managed_reserved` 的 PATCH 請求，API 必須回 400 Bad Request，訊息：`"platform_managed is not available in this plan"`。

#### queryFrequency

```
manual                 ← 賣家手動觸發（預設）
daily                  ← 每日執行
every_6_hours          ← 每 6 小時
every_2_hours_high_tier ← 每 2 小時（高方案限定，MVP 可保留 enum 但需方案確認後才開放）
```

> **注意**：`every_2_hours_high_tier` 保留語意為高方案限定，MVP 是否開放須另行確認；API PATCH 可暫接受此值但應記錄 plan check TODO。

#### enabledLogistics（陣列，每個元素為以下其中一個）

```
seven_eleven       ← 7-ELEVEN 物流
family_mart        ← 全家物流
home_delivery      ← 宅配
other              ← 其他（保留彈性）
webhook            ← 透過 webhook 接收物流資訊
```

#### queryMethods（陣列）

```
manual             ← 手動查詢
csv_import         ← CSV 匯入
webhook            ← webhook 推送
scheduled          ← 排程自動查詢
```

### 3.4 資料隔離規則

- `storeId` 在 `seller_agent_settings` 中為 UNIQUE constraint
- 所有 Seller UI API 查詢必須先 `verifyStoreOwner(session, storeId)` 驗證
- 不可信任 request body 中的 `storeId` / `merchantId`；必須從 session 中取得
- Seller UI API 使用 seller session auth，**不使用** Agent Bearer token
- Agent token 只用於 `/api/internal/agent/*` 或 `/api/agent/*`，不可混用

---

## 4. seller_agent_tokens 使用方式

### 4.1 資料表現況

`seller_agent_tokens` 表已在 Step 7D 完成，含 `storeId` 隔離。本節規劃 Seller UI 如何透過 API 管理 token，不修改 schema。

### 4.2 Token 安全規則

| 規則                 | 說明                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| token 原文只顯示一次 | 建立成功後的 `POST /api/seller/agent/tokens` response 才回傳 token 原文；之後不可再取得                     |
| DB 只保存 hash       | 後端儲存 `tokenHash`（bcrypt 或 SHA-256 + salt），不儲存明文                                                |
| 保存 tokenPrefix     | 儲存前 8 位作為 `tokenPrefix`，供列表顯示識別                                                               |
| 列表不回完整 token   | `GET /api/seller/agent/tokens` 只回 `tokenPrefix / status / createdAt / lastUsedAt / expiresAt / revokedAt` |
| 不回 tokenHash       | `tokenHash` 僅內部比對用，任何 API 回應不得包含此欄位                                                       |
| revoke 不物理刪除    | 停用操作設定 `revokedAt` 與 `status = revoked`，保留記錄供稽核                                              |
| token scope          | 每個 token 綁定 `storeId`，只可呼叫對應 store 的 Agent API                                                  |
| 使用範圍             | token 只可用於 `/api/internal/agent/*` 或 `/api/agent/*`，不可用於 Seller UI API                            |

### 4.3 Token 前端 UX 規格

1. 賣家在 Token 管理區點擊「建立 Token」
2. 填入 token 名稱（name）
3. 呼叫 `POST /api/seller/agent/tokens`
4. **成功後彈出 Modal**，顯示完整 token 原文
5. Modal 包含「我已複製 token，關閉此視窗」確認按鈕
6. 未確認前，不允許直接關閉 Modal（或加二次確認提示）
7. Modal 關閉後，**token 原文永久不可再取得**
8. Token 清單只顯示 `name / tokenPrefix / status / createdAt / lastUsedAt / expiresAt / revokedAt`

### 4.4 Token API 規格摘要

| API                                         | 說明                                   |
| ------------------------------------------- | -------------------------------------- |
| `POST /api/seller/agent/tokens`             | 建立 token，回傳一次性 token 原文      |
| `GET /api/seller/agent/tokens`              | 取得列表（不含原文 / hash）            |
| `PATCH /api/seller/agent/tokens/:id/revoke` | 撤銷 token（設 revokedAt，不物理刪除） |

> **選用說明**：選用 `PATCH /revoke` 而非 `DELETE`，因為 DELETE 語意為物理刪除，但 revoke 是邏輯停用。若採 DELETE，必須在文件與程式碼中明確標示「實際為 revoke，不物理刪除」。

---

## 5. agent_run_logs 顯示規格

### 5.1 資料表現況

`agent_run_logs` 表已在 Step 7D 完成。本節規劃 Seller UI 如何安全顯示執行紀錄摘要。

### 5.2 允許顯示欄位（Whitelist）

以下欄位允許在 `GET /api/seller/agent/run-logs` 回傳：

| 欄位           | 說明                                                                                                                                                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | 執行紀錄 ID                                                                                                                                                                                                                                                                                                          |
| `startedAt`    | 執行開始時間                                                                                                                                                                                                                                                                                                         |
| `finishedAt`   | 執行結束時間                                                                                                                                                                                                                                                                                                         |
| `status`       | 執行狀態。**底層 `agent_run_logs.status` 實際 enum 為 `running / completed / failed / partial`**（非 success / failure），Seller UI 顯示時可映射為：`running`→「執行中」、`completed`→「完成」、`failed`→「失敗」、`partial`→「部分成功」                                                                            |
| `jobCount`     | 本次查詢的訂單數。**`agent_run_logs` 底層沒有 `jobCount` 欄位**，此為 API response 顯示別名，實際資料來源為 DB 欄位 `checkedCount`，實作時不可假設 DB 存在 `jobCount` 欄位                                                                                                                                           |
| `successCount` | 成功更新數量（對應 DB `success_count`）                                                                                                                                                                                                                                                                              |
| `failedCount`  | 失敗數量（對應 DB `failed_count`）                                                                                                                                                                                                                                                                                   |
| `errorSummary` | 錯誤摘要。**`agent_run_logs` 底層沒有單一 `errorSummary` 欄位**，此為 API response 組合而成的顯示欄位，來源為 DB 的 `errorCode`（≤120字）與 `errorMessage`（≤500字，僅安全摘要，不含 token / stack trace）兩個獨立欄位，實作時需明確定義組合規則（例如僅顯示 `errorCode`，或 `errorCode` + `errorMessage` 摘要併陳） |
| `tokenPrefix`  | 觸發此次執行的 token 前綴（識別用）。**`agent_run_logs` 本身沒有 `tokenPrefix` 欄位**，僅有 `tokenId`（FK → `seller_agent_tokens.id`）；若要顯示 `tokenPrefix` 需要 JOIN `seller_agent_tokens` 表取得。MVP 階段若不做 JOIN，可先不顯示 token 識別資訊，或僅顯示 `tokenId` 的安全別名                                 |
| `createdAt`    | 記錄建立時間                                                                                                                                                                                                                                                                                                         |

### 5.3 嚴格禁止回傳欄位

以下欄位**任何情況下都不可**出現在 Seller UI API 回應中：

| 禁止欄位                      | 原因                                                                                                                                                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rawPayload` / `rawData`      | **`agent_run_logs` 本身沒有此欄位**——run logs API 不應回傳任何 raw external response / 完整 stack trace / secret；此規則真正的適用對象是 `shipment_tracking_events.rawData`（外部物流 API 原始回應），列在此處是提醒「run logs 顯示邏輯若未來需要關聯查詢物流事件，也不可外洩這類欄位」 |
| `rawExternalResponse`         | 外部 API 原始回應（同上，屬 `shipment_tracking_events` 等關聯表的欄位，非 `agent_run_logs` 自身欄位）                                                                                                                                                                                   |
| `buyerPhone`                  | 買家個資                                                                                                                                                                                                                                                                                |
| `buyerAddress`                | 買家個資                                                                                                                                                                                                                                                                                |
| `tokenHash`                   | 內部安全欄位                                                                                                                                                                                                                                                                            |
| `fullToken` / 完整 token      | 不可再取得                                                                                                                                                                                                                                                                              |
| `internalStackTrace`          | 內部錯誤資訊                                                                                                                                                                                                                                                                            |
| `DATABASE_URL` / 任何 secrets | 嚴格禁止                                                                                                                                                                                                                                                                                |

### 5.4 API 規格摘要

```
GET /api/seller/agent/run-logs
  查詢參數：
    - page (integer, default: 1)
    - limit (integer, default: 20, max: 100)
    - status (enum: running | completed | failed | partial，可選 — 對應 agent_run_logs.status 底層實際 enum，Seller UI 顯示文案另見 5.2 映射規則)
    - startDate (ISO 8601 date string，可選)
    - endDate (ISO 8601 date string，可選)

  回應：
    - data: RunLogSummary[] (whitelist 欄位)
    - pagination: { page, limit, total, totalPages }

  限制：
    - limit 上限為 100
    - 每個請求必須 verifyStoreOwner
    - 欄位必須用 select whitelist，不可 select *
```

---

## 6. Seller UI API 規格

**本節只寫規格，不實作。** 所有 endpoint 均需 seller session auth。

---

### 6.1 GET /api/seller/agent/settings

**用途**：取得目前 store 的 Agent 設定

**Auth**：Seller session auth（不接受 Agent Bearer token）

**驗證**：`verifyStoreOwner(session, storeId)`

**回應格式**：

```typescript
{
  id: number;
  storeId: number;
  agentStatus: AgentStatus;
  agentMode: AgentMode;
  enabledLogistics: LogisticsProvider[];
  queryMethods: QueryMethod[];
  queryFrequency: QueryFrequency;
  notifyOnUnknown: boolean;
  requireConfirmOnException: boolean;
  requireConfirmOnReturned: boolean;
  requireConfirmOnDelivered: boolean;
  hideErrorDetailsFromBuyer: boolean;
  webhookEnabled: boolean;
  webhookUrl: string | null;
  webhookConfigured: boolean;  // true if webhookSecretHash is set, 不回傳 secret 本身
  lastTestRunAt: string | null;  // ISO 8601
  lastRunAt: string | null;      // ISO 8601
  createdAt: string;
  updatedAt: string;
}
```

**嚴格不回傳**：

- `webhookSecretHash` / `webhookSecret` 完整值
- `merchantId`（不對前端暴露）
- 任何 token 相關欄位
- 任何 rawPayload / 個資

**若 settings 不存在**：回傳 404 或自動以預設值建立（由施工 Step 決定，此規格不強制）

---

### 6.2 PATCH /api/seller/agent/settings

**用途**：部分更新 Agent 設定

**Auth**：Seller session auth

**驗證**：`verifyStoreOwner(session, storeId)`

**允許更新欄位（Whitelist）**：

```typescript
{
  agentStatus?: AgentStatus;
  agentMode?: AgentMode;          // 不接受 platform_managed_reserved
  enabledLogistics?: LogisticsProvider[];
  queryMethods?: QueryMethod[];
  queryFrequency?: QueryFrequency;
  notifyOnUnknown?: boolean;
  requireConfirmOnException?: boolean;
  requireConfirmOnReturned?: boolean;
  requireConfirmOnDelivered?: boolean;
  hideErrorDetailsFromBuyer?: boolean;
  webhookEnabled?: boolean;
  webhookUrl?: string | null;
}
```

**驗證規則**：

| 欄位               | 驗證                                                     |
| ------------------ | -------------------------------------------------------- |
| `agentMode`        | 必須是白名單 enum；`platform_managed_reserved` 回 400    |
| `queryFrequency`   | 必須是白名單 enum；不接受任意 cron string                |
| `enabledLogistics` | 每個元素必須是白名單 enum；不接受自由 provider code      |
| `queryMethods`     | 每個元素必須是白名單 enum                                |
| `webhookUrl`       | 若提供，必須是有效 HTTPS URL（不接受 http:// 避免 SSRF） |
| 所有欄位           | 不接受 prompt 字串 / 自由文字 AI 指令                    |

**不接受**：

- `storeId` / `merchantId`（從 session 取，不信任 body）
- `tokenHash` / `webhookSecretHash`（不可由 PATCH 設定）
- `lastRunAt` / `lastTestRunAt`（系統自動更新）
- `createdAt` / `updatedAt`（系統欄位）
- `agentMode: platform_managed_reserved`（方案 / 額度未完成前不開放）

**成功回應**：更新後的 settings 物件（同 GET 格式）

---

### 6.3 POST /api/seller/agent/tokens

**用途**：建立 Agent token

**Auth**：Seller session auth

**驗證**：`verifyStoreOwner(session, storeId)`

**請求格式**：

```typescript
{
  name: string;          // token 名稱，最長 100 字
  expiresAt?: string;    // 可選，ISO 8601 過期時間
}
```

**處理流程（規格，不施工）**：

1. 驗證 storeId ownership
2. 產生 token 原文（安全隨機，建議前綴 `sagt_`，共 32+ 位）
3. 計算 tokenHash（bcrypt 或 SHA-256 + salt）
4. 保存 tokenPrefix（前 8 位）
5. 寫入 DB（不存原文）
6. 回傳一次性 response（含原文）

**回應格式（唯一一次含原文）**：

```typescript
{
  id: number;
  name: string;
  tokenPrefix: string; // 前 8 位，供識別
  token: string; // 完整 token 原文，只在此回傳一次
  createdAt: string;
  expiresAt: string | null;
  status: "active";
}
```

**嚴格不回傳**：`tokenHash`

> **重要**：`token` 欄位只出現在此 endpoint 的 response 中。`GET /api/seller/agent/tokens` 不可包含此欄位。

---

### 6.4 GET /api/seller/agent/tokens

**用途**：顯示 token 列表

**Auth**：Seller session auth

**驗證**：`verifyStoreOwner(session, storeId)`

**回應格式**：

```typescript
{
  data: Array<{
    id: number;
    name: string;
    tokenPrefix: string;
    status: "active" | "revoked" | "expired";
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
  }>;
}
```

**嚴格不回傳**：

- `token`（完整原文）
- `tokenHash`
- 任何買家個資

---

### 6.5 PATCH /api/seller/agent/tokens/:id/revoke

**用途**：撤銷（停用）指定 token

**Auth**：Seller session auth

**驗證**：

1. `verifyStoreOwner(session, storeId)`
2. 確認 token 屬於該 store（`token.storeId === session.storeId`）
3. 確認 token 尚未 revoked

**處理（規格，不施工）**：

- 設定 `revokedAt = now()`
- 設定 `status = revoked`
- **不物理刪除**（保留記錄供稽核）
- Agent 後續使用此 token 回 401

**成功回應**：

```typescript
{
  id: number;
  status: "revoked";
  revokedAt: string;
}
```

**錯誤情境**：

- token 不屬於該 store：404
- token 已是 revoked：409 Conflict

---

### 6.6 GET /api/seller/agent/run-logs

**用途**：顯示 Agent 執行紀錄摘要

**Auth**：Seller session auth

**驗證**：`verifyStoreOwner(session, storeId)`

**查詢參數**：

| 參數        | 型別     | 說明                                                                                                                                                                      |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`      | integer  | 頁碼，預設 1                                                                                                                                                              |
| `limit`     | integer  | 每頁筆數，預設 20，最大 100                                                                                                                                               |
| `status`    | string   | 過濾：`running` / `completed` / `failed` / `partial`（對應 `agent_run_logs.status` 底層實際 enum；**不是** `success` / `failure`，Seller UI 顯示文案請參考 5.2 映射規則） |
| `startDate` | ISO 8601 | 開始時間過濾                                                                                                                                                              |
| `endDate`   | ISO 8601 | 結束時間過濾                                                                                                                                                              |

**回應格式**：

```typescript
{
  data: Array<{
    id: number;
    startedAt: string;
    finishedAt: string | null;
    status: "running" | "completed" | "failed" | "partial"; // 底層 enum 原值；前端顯示文案另行映射（見 5.2）
    jobCount: number; // 顯示別名，後端對應 DB 欄位 checkedCount（agent_run_logs 無 jobCount 欄位）
    successCount: number;
    failedCount: number;
    errorSummary: string | null; // 後端組合欄位，來源為 errorCode + errorMessage（agent_run_logs 無單一 errorSummary 欄位，組合規則需另行明定）
    tokenPrefix: string | null; // 需 JOIN seller_agent_tokens 取得（agent_run_logs 本身僅有 tokenId）；MVP 不 JOIN 時可省略此欄位
    createdAt: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }
}
```

**實作要求**：

- 必須使用 `SELECT` 欄位 whitelist（不可 `select *`）
- `limit` 不可超過 100
- 必須以 `storeId` 過濾，不可回傳其他 store 的 log
- `jobCount` / `errorSummary` / `tokenPrefix` 為顯示層欄位，與 `agent_run_logs` 底層欄位命名不同，實作時請依 5.2 的對照說明做欄位映射，不可直接 `select` 同名欄位

---

### 6.7 POST /api/seller/agent/test-run

**用途**：MVP dry-run validation（設定格式驗證，非真實 Agent 執行）

**Auth**：Seller session auth

**驗證**：`verifyStoreOwner(session, storeId)`

**MVP 語意**：

- **不觸發**外部物流 API 查詢
- **不觸發**平台代管 AI Agent
- **不觸發**外部 webhook
- 只做：
  1. 驗證 settings 是否完整（agentStatus, enabledLogistics, queryFrequency 等是否合法）
  2. 驗證至少有一個 active token
  3. 可接受可選的 `orderId` 參數，驗證 order 屬於該 store（ownership check），不做任何寫入

**請求格式（可選）**：

```typescript
{
  orderId?: number;   // 若提供，驗證 order 屬於該 store（不做任何修改）
}
```

**回應格式**：

```typescript
{
  mode: "dry_run";            // 固定為 dry_run，明確標示非真實執行
  settingsValid: boolean;
  hasActiveToken: boolean;
  orderOwnershipValid: boolean | null;   // null 若未提供 orderId
  issues: string[];           // 設定問題清單，空陣列代表通過
  testedAt: string;           // ISO 8601
}
```

**嚴格不回傳**：任何敏感資料（rawPayload / 個資 / token hash）

---

### 6.8 GET /api/seller/agent/webhook-info

**用途**：顯示 Agent webhook / API 設定資訊（供賣家設定 n8n / OpenClaw）

**Auth**：Seller session auth

**驗證**：`verifyStoreOwner(session, storeId)`

**回應格式**：

```typescript
{
  agentApiBaseUrl: string;         // 平台 Agent API base URL（如 https://api.example.com/api/agent）
  availableEndpoints: Array<{
    method: string;
    path: string;
    description: string;
  }>;
  webhookSecretConfigured: boolean;  // 是否已設定 webhook secret（只回 boolean，不回值）
  docsUrl?: string;                  // 可選：Agent API 文件連結
}
```

**嚴格不回傳**：

- `webhookSecret` 完整值
- `webhookSecretHash`
- 任何 token 完整值 / hash
- 任何 rawPayload / 個資

---

## 7. 權限與資料隔離

### 7.1 Auth 層分離

```
Seller UI API（/api/seller/agent/...）
  → 使用 seller session auth（cookie / session token）
  → 不接受 Agent Bearer token

Agent API（/api/internal/agent/* 或 /api/agent/*）
  → 使用 Agent Bearer token
  → 不接受 seller session

兩者嚴格分離，不可混用
```

### 7.2 storeId 隔離規則

- 所有 Seller UI API 必須從 session 取得 `storeId`，不可信任 request body / query string 的 `storeId`
- 所有 DB 查詢必須加 `WHERE store_id = :sessionStoreId`
- `verifyStoreOwner(session, resourceStoreId)` 必須在每個 handler 的最前面執行

### 7.3 Token 操作必須驗證歸屬

- revoke token 前，必須確認 `token.storeId === session.storeId`
- 不可透過 token `id` 操作其他 store 的 token

### 7.4 資料修改稽核

- settings 更新時，`updatedAt` 必須自動更新
- token 建立 / 撤銷時，建議記錄 `actorId`（session userId）到稽核欄位（可先用 log，後續正式施工 audit_logs）
- `seller_agent_settings.merchantId` 為冗餘欄位，保留稽核使用，不對前端暴露

### 7.5 隱私邊界

- public tracking 隱私邊界（publicToken、trackingCode、買家電話 / 地址）不可因 Seller Agent Workspace 功能而改變
- `publicToken` ≠ `trackingCode`，不可混淆
- Agent API 回傳的 tracking jobs 只含 `publicToken`，不含買家個資；Seller UI 也遵守同樣限制

---

## 8. Token / Webhook 安全規格

### 8.1 Token 安全要求

| 要求             | 說明                                                            |
| ---------------- | --------------------------------------------------------------- |
| token 只顯示一次 | POST 建立時回傳原文，之後永不回傳                               |
| DB 不存明文      | 只存 `tokenHash`（bcrypt rounds ≥ 10 或 SHA-256 + random salt） |
| tokenPrefix 識別 | 保存前 8 位供 UI 識別                                           |
| revoke 不刪除    | 保留 `revokedAt` 供稽核                                         |
| token 格式建議   | 前綴 `sagt_` + 32 位隨機字元（crypto.randomBytes）              |
| scope 限制       | 每個 token 只能用於對應 storeId 的 Agent API                    |

### 8.2 Webhook Secret 安全要求

> **MVP 注意**：webhook secret 只規劃 schema 欄位，MVP 不施工驗證邏輯。

| 要求                          | 說明                                                  |
| ----------------------------- | ----------------------------------------------------- |
| 不儲存明文                    | `webhookSecretHash` 欄位存 hash / encrypted，不存明文 |
| API 不回傳完整 secret         | 任何 API 只可回傳 `webhookSecretConfigured: boolean`  |
| 前端只顯示「已設定 / 未設定」 | 不顯示 secret 值                                      |
| 後續施工要求                  | webhook 驗證邏輯需實作 HMAC-SHA256 簽名驗證           |

### 8.3 API 回應安全要求

以下欄位在任何 Seller UI API 回應中均嚴格禁止：

```
tokenHash
webhookSecretHash / webhookSecret
rawPayload
buyerPhone / buyerAddress / buyerEmail
internalStackTrace
DATABASE_URL / 任何 env 變數
secrets / credentials / API keys
```

---

## 9. 錯誤碼與錯誤顯示

### 9.1 標準錯誤格式

```typescript
{
  error: {
    code: string;       // 固定 error code
    message: string;    // 人類可讀訊息（不含 stack trace / DB 錯誤）
    field?: string;     // 若為驗證錯誤，標示欄位名稱
  }
}
```

### 9.2 常用錯誤碼

| HTTP Status | error.code                       | 情境                                              |
| ----------- | -------------------------------- | ------------------------------------------------- |
| 400         | `INVALID_ENUM_VALUE`             | enum 欄位值不在白名單                             |
| 400         | `INVALID_WEBHOOK_URL`            | webhookUrl 非合法 HTTPS URL                       |
| 400         | `PLATFORM_MANAGED_NOT_AVAILABLE` | agentMode = platform_managed_reserved（方案限制） |
| 400         | `ARBITRARY_CRON_NOT_ALLOWED`     | queryFrequency 非白名單值                         |
| 401         | `UNAUTHORIZED`                   | 未登入 / session 過期                             |
| 403         | `STORE_OWNERSHIP_REQUIRED`       | 操作的 store 不屬於目前 session                   |
| 404         | `SETTINGS_NOT_FOUND`             | seller_agent_settings 不存在                      |
| 404         | `TOKEN_NOT_FOUND`                | token 不存在或不屬於該 store                      |
| 409         | `TOKEN_ALREADY_REVOKED`          | 嘗試 revoke 已是 revoked 的 token                 |
| 500         | `INTERNAL_ERROR`                 | 內部錯誤（不回 stack trace）                      |

### 9.3 錯誤顯示規則

- 500 錯誤只顯示 `INTERNAL_ERROR`，不顯示 DB 錯誤訊息 / stack trace / 路徑
- 驗證錯誤需指明 `field`，讓前端可以 highlight 對應輸入框
- 不回傳任何敏感值（即使是錯誤 response）

---

## 10. 非目標

本次規格文件（Step 7E-2）及後續施工均明確排除：

**本次（只做規格，不施工）**：

- DB schema 修改
- Migration 建立
- drizzle-kit push / DB push
- API route 實作
- UI component / 頁面
- token 產生邏輯實作
- webhook 驗證邏輯實作
- run logs API 實作

**後續 Step 亦不納入（除非另有規格）**：

- Webhook 簽名驗證邏輯（schema 預留，邏輯不進 MVP）
- BYOK（Bring Your Own Key）
- 平台代管 AI Agent 正式功能
- `agent_usage_counters` 資料表
- `agent_audit_logs` 資料表
- IP 白名單功能
- Token 有效期自動停用
- 靜默時段設定
- 物流來源外部 API 串接
- Worker / 排程任務
- 方案 / 計費 / 用量管理
- public tracking 隱私邊界修改

---

## 11. 驗收標準

### 11.1 本次規格文件驗收

- [x] 已採用 MVP 決策：`seller_agent_settings` 單表
- [x] 已採用 MVP 決策：不支援多 Agent per store
- [x] 已定義 `queryFrequency` enum 白名單
- [x] 已定義 `enabledLogistics` enum 白名單
- [x] 已定義 `agentStatus` / `agentMode` / `queryMethods` enum
- [x] 已說明 `platform_managed_reserved` 為保留值，MVP 不開放
- [x] 已規格 8 個 Seller UI API（含請求 / 回應格式）
- [x] 已規格 token 安全要求（一次性回傳、DB 只存 hash、revoke 不刪除）
- [x] 已規格 run logs 欄位 whitelist 與禁止欄位
- [x] 已規格 webhook secret 安全要求（不回傳完整值）
- [x] 已規格 storeId 資料隔離規則
- [x] 已規格 Auth 層分離（seller session vs agent token）
- [x] 已規格 test-run 為 dry-run，不觸發外部 Agent
- [x] 已列出完整錯誤碼清單
- [x] 已明確列出非目標

### 11.2 Step 7E-1a（schema + migration）可開工條件

進入 Step 7E-1a 前，以下規格已在本文件定案：

- [x] 資料表名稱：`seller_agent_settings`
- [x] `storeId` UNIQUE constraint（一個 store 一列）
- [x] 所有 enum 值已定義
- [x] `webhookSecretHash`（nullable，不存明文）
- [x] `merchantId` 冗餘欄位（稽核用，不對前端暴露）
- [x] `lastTestRunAt` / `lastRunAt` 時間欄位
- [x] BYOK 欄位不納入（`external_api_key` 不進 schema）

---

## 12. 後續施工順序

### 12.1 施工路徑

```
Step 7E-2（本次）：規格文件 ← 當前位置

Step 7E-1a：seller_agent_settings schema + migration
  → 依本文件 §3 欄位規格建立 Drizzle schema
  → 新增 migration
  → 不執行 DB push（在此 Step 確認後再 push）
  → 可包含 DB push（視施工 Step 決定）

Step 7E-1b：GET/PATCH /api/seller/agent/settings + POST /api/seller/agent/test-run
  → 依本文件 §6.1、§6.2、§6.7 實作
  → 包含 Zod validation（enum 白名單）
  → 包含 verifyStoreOwner
  → 不回傳 webhookSecretHash / 個資

Step 7E-1c：POST + GET + PATCH /api/seller/agent/tokens
  → 依本文件 §4、§6.3、§6.4、§6.5 實作
  → 一次性 token 回傳
  → DB 只存 hash
  → revoke 不刪除

Step 7E-1d：GET /api/seller/agent/run-logs + GET /api/seller/agent/webhook-info
  → 依本文件 §5、§6.6、§6.8 實作
  → 欄位 whitelist（select 指定欄位）
  → 不回傳 rawPayload / 個資

Step 7E-1e：Seller Agent Workspace UI 頁面
  → 設定面板（enum 下拉選單 / multiselect）
  → Token 管理（建立 Modal、清單、revoke）
  → Run logs 表格（分頁、過濾）
  → Agent 狀態區
```

### 12.2 各 Step 相依關係

```
Step 7E-1a（schema）
  ↓ 完成後
Step 7E-1b（settings + test-run API）
  ↓ 完成後
Step 7E-1c（token API）  ←  可與 7E-1b 並行，但依賴 7E-1a
  ↓
Step 7E-1d（run-logs + webhook-info API）  ←  依賴既有 agent_run_logs 表（Step 7D）
  ↓ 所有 API 完成後
Step 7E-1e（UI）
```

---

_此文件為 Step 7E-2 規格文件，非施工文件。所有 API 規格為設計稿，後續施工需遵照本文件定義，若有出入應更新本文件並說明原因。_
