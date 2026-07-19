# Step 7E-1b-API-PREFLIGHT seller_agent_settings API 施工前盤點

## 1. 任務背景

- 任務名稱：Step 7E-1b-API-PREFLIGHT
- 執行時間：2026-06-09
- Worker：Claude B
- 目標：盤點 `GET/PATCH /stores/:storeId/agent/settings` API 的施工前條件
- 前置任務已完成：CODE-RESTORE-SAVE / CODE-RESTORE-VERIFY / TYPECHECK

## 2. Worktree / Branch / Commit 狀態

| 項目          | 狀態                                                       |
| ------------- | ---------------------------------------------------------- |
| worktree      | `/home/runner/workspace/.worktrees/step7e-code-restore`    |
| branch        | `qa/step7e-seller-agent-settings-code-restore`             |
| 起始 commit   | `626b399`（`feat-db-step7e-seller-agent-settings-schema`） |
| 上一個 commit | `437d7e9`（`docs-step7e-seller-agent-settings-typecheck`） |
| branch 乾淨   | ✓（無 staged / modified files）                            |

## 3. 已確認 Schema / Typecheck 狀態

| 項目                                               | 狀態                                         |
| -------------------------------------------------- | -------------------------------------------- |
| `lib/db/src/schema/sellerAgentSettings.ts`         | ✓ commit 626b399 保存                        |
| `lib/db/migrations/0001_seller_agent_settings.sql` | ✓ commit 626b399 保存                        |
| `lib/db/src/schema/index.ts` export                | ✓ `export * from "./sellerAgentSettings.ts"` |
| TypeScript typecheck                               | ✓ tsc 5.9.3 通過，exit code 0                |
| DB push / migrate                                  | ✗ 尚未執行                                   |

## 4. 既有 API Route 結構

### API Server 入口

- `artifacts/api-server/src/app.ts`：Express app，所有路由掛載在 `/api`
- `artifacts/api-server/src/routes/index.ts`：路由聚合入口

### 既有路由清單

| 路由模組        | URL 前綴                                                      |
| --------------- | ------------------------------------------------------------- |
| `stores.ts`     | `/me/store`, `/stores/:storeId/*`                             |
| `orders.ts`     | `/stores/:storeId/orders`, `/stores/:storeId/orders/:orderId` |
| `cvs.ts`        | `/cvs/*`                                                      |
| `products.ts`   | `/stores/:storeId/products/*`                                 |
| `categories.ts` | `/categories/*`                                               |
| `upload.ts`     | `/upload/*`                                                   |
| `public.ts`     | `/p/:token` 等公開路由                                        |
| `agent.ts`      | `/internal/agent/*`（Agent Bearer token）                     |
| `devHandoff.ts` | `/dev/handoff`（非 production）                               |

### URL 命名模式

- 店家資源：`/stores/:storeId/<resource>`
- 自家店：`/me/store`
- Agent（外部系統）：`/internal/agent/<resource>`

## 5. Seller Session Auth 盤點

### Middleware：`requireAuth`（`middlewares/auth.ts`）

```typescript
import { getAuth } from "@clerk/express";

export const requireAuth = (req, res, next) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
};
```

- 使用 Clerk session 驗證
- 設定 `req.userId`（Clerk user ID = `merchantId`）
- 所有 seller 路由均使用此 middleware

### 嚴格禁止：不可混用 Agent Bearer token

Agent Bearer token auth（`agentAuth.ts`）是給外部 agent 系統用的：

- 使用 `Authorization: Bearer <token>` header
- 只能掛載在 `/internal/agent/*` 路由
- `sellerAgentSettings` 是 seller 管理自己的設定，**不是** agent 讀取設定

`GET/PATCH /stores/:storeId/agent/settings` **必須** 使用 `requireAuth`（Clerk session），絕不可用 `agentTokenAuth`。

## 6. Store Ownership 驗證方式

### Helper：`verifyStoreOwner`（`middlewares/auth.ts`）

```typescript
export const verifyStoreOwner = async (req, res, storeId): Promise<boolean> => {
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

- 已被 `orders.ts` / `cvs.ts` / `stores.ts` 廣泛使用
- 回傳 `false` 時已自行 send 回應，呼叫端直接 `return` 即可

### 使用模式（參考 orders.ts）

```typescript
router.get("/stores/:storeId/agent/settings", requireAuth, async (req, res) => {
  const storeId = parseInt(req.params.storeId);
  if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });
  if (!(await verifyStoreOwner(req, res, storeId))) return;
  // ... 繼續處理
});
```

### merchantId 取得方式

`verifyStoreOwner` 通過後，`merchantId = req.userId`（因為 Clerk userId 即 merchantId）。

不需要另外 query store row 取 merchantId，直接用 `req.userId` 即可。

## 7. 建議 API URL

### 選定

```
GET  /stores/:storeId/agent/settings
PATCH /stores/:storeId/agent/settings
```

### 理由

- 符合現有 `/stores/:storeId/*` 命名慣例
- `seller_agent_settings` 是每個 store 的 singleton 資源（UNIQUE store_id 約束）
- 不使用 `/me/store/agent/settings`，因現有 `/me/store` 只作 store 資料查詢，不做子資源管理
- 不使用 `/internal/agent/settings`，那是 Agent Bearer token 的路由前綴

### 路由加入 index.ts 方式

```typescript
// routes/index.ts 需新增：
import sellerAgentRouter from "./sellerAgent";
router.use(sellerAgentRouter);

// 或直接加入 stores.ts（若路由少）
```

建議新建 `routes/sellerAgent.ts`，與 `stores.ts` 分離，避免 stores.ts 過長。

## 8. GET 行為建議

### 情境：row 不存在

- **回傳 in-memory default config，不建立 DB row**
- 理由：GET 不應有副作用，第一次 GET 不應觸發 INSERT
- Default config 應從 schema default 值衍生

```typescript
const DEFAULT_SETTINGS = {
  storeId,
  merchantId: req.userId,
  agentStatus: "disabled",
  agentMode: "rule_worker",
  enabledLogistics: [],
  queryMethods: ["manual"],
  queryFrequency: "manual",
  notifyOnUnknown: true,
  requireConfirmOnException: true,
  requireConfirmOnReturned: false,
  requireConfirmOnDelivered: false,
  hideErrorDetailsFromBuyer: true,
  webhookEnabled: false,
  webhookUrl: null,
  hasWebhookSecret: false,
  lastTestRunAt: null,
  lastRunAt: null,
};
```

### 情境：row 存在

- 回傳 DB row 中的設定
- **不回傳 `webhookSecretHash`**（永遠 omit）
- 回傳 `hasWebhookSecret: boolean`（`webhookSecretHash !== null`）

### GET response shape

```typescript
{
  storeId: number,
  merchantId: string,
  agentStatus: "disabled" | "enabled",
  agentMode: "self_hosted_webhook" | "external_agent" | "rule_worker" | "platform_managed_reserved",
  enabledLogistics: string[],
  queryMethods: string[],
  queryFrequency: "manual" | "daily" | "every_6_hours" | "every_2_hours_high_tier",
  notifyOnUnknown: boolean,
  requireConfirmOnException: boolean,
  requireConfirmOnReturned: boolean,
  requireConfirmOnDelivered: boolean,
  hideErrorDetailsFromBuyer: boolean,
  webhookEnabled: boolean,
  webhookUrl: string | null,
  hasWebhookSecret: boolean,  // 取代 webhookSecretHash
  lastTestRunAt: string | null,
  lastRunAt: string | null,
  createdAt?: string,
  updatedAt?: string,
}
```

## 9. PATCH 行為建議

### Upsert 策略

使用 **upsert**（INSERT ... ON CONFLICT DO UPDATE SET）：

```typescript
await db
  .insert(sellerAgentSettingsTable)
  .values({ storeId, merchantId: req.userId, ...patch })
  .onConflictDoUpdate({
    target: sellerAgentSettingsTable.storeId,
    set: { ...patch, updatedAt: new Date() },
  });
```

- 理由：schema 有 `UNIQUE("store_id")`，可安全 upsert
- 避免 race condition（insert 失敗就 update）

### 不可 PATCH 的欄位

- `storeId`：身份欄位，不可改
- `merchantId`：身份欄位，不可改
- `id`：PK，不可改
- `createdAt`：不可改
- `updatedAt`：server 自動更新
- `webhookSecretHash`：不可直接傳 hash，需傳明文由 server hash

### webhookSecret 處理

PATCH 可接受 `webhookSecret`（明文），server 端做：

```typescript
import { createHash } from "node:crypto";
const webhookSecretHash = createHash("sha256")
  .update(webhookSecret)
  .digest("hex");
```

與 `agentAuth.ts` 中 token hash 方式一致（SHA-256）。

### PATCH request body（建議 zod schema）

```typescript
const PatchSellerAgentSettingsBody = z.object({
  agentStatus: z.enum(["disabled", "enabled"]).optional(),
  agentMode: z
    .enum([
      "self_hosted_webhook",
      "external_agent",
      "rule_worker",
      "platform_managed_reserved",
    ])
    .optional(),
  enabledLogistics: z
    .array(
      z.enum([
        "seven_eleven",
        "family_mart",
        "home_delivery",
        "other",
        "webhook",
      ]),
    )
    .optional(),
  queryMethods: z
    .array(z.enum(["manual", "csv_import", "webhook", "scheduled"]))
    .optional(),
  queryFrequency: z
    .enum(["manual", "daily", "every_6_hours", "every_2_hours_high_tier"])
    .optional(),
  notifyOnUnknown: z.boolean().optional(),
  requireConfirmOnException: z.boolean().optional(),
  requireConfirmOnReturned: z.boolean().optional(),
  requireConfirmOnDelivered: z.boolean().optional(),
  hideErrorDetailsFromBuyer: z.boolean().optional(),
  webhookEnabled: z.boolean().optional(),
  webhookUrl: z.string().url().nullable().optional(),
  webhookSecret: z.string().min(16).max(256).nullable().optional(), // 明文，server hash
});
```

### PATCH response

同 GET response shape（upsert 後 returning() 一筆，再過濾 webhookSecretHash）。

## 10. Request Validation 建議

- PATCH body 使用 zod `.safeParse()`，失敗回 400
- `enabledLogistics` / `queryMethods` 在 zod schema 中使用 `z.enum()` 白名單
- 不在 DB 層做白名單（JSONB 欄位 DB 無 CHECK constraint）
- `webhookUrl` 使用 `z.string().url()` 驗證格式
- `webhookSecret` 長度限制（避免過短/過長）

## 11. Response Shape 建議

- `webhookSecretHash` 永遠不進 response（omit 或 select 時不選）
- `hasWebhookSecret` 替代：`hasWebhookSecret: row.webhookSecretHash !== null`
- 使用 Drizzle `db.select({ ... }).from(sellerAgentSettingsTable)` 明確 select 欄位，排除 `webhookSecretHash`

## 12. 不可混用 Agent Bearer Token 的說明

| API                                         | Auth 方式                      | 理由                      |
| ------------------------------------------- | ------------------------------ | ------------------------- |
| `GET/PATCH /stores/:storeId/agent/settings` | `requireAuth`（Clerk session） | seller 本人管理自己的設定 |
| `GET /internal/agent/orders/tracking-jobs`  | `agentTokenAuth`（Bearer）     | 外部 agent 系統讀取任務   |
| `POST /internal/agent/shipment-events`      | `agentTokenAuth`（Bearer）     | 外部 agent 系統寫入事件   |

Seller agent settings 是 seller 的設定頁面，用 Clerk session 驗證使用者身份。外部 agent（自動化腳本）不應能存取 seller 的設定 API。

## 13. DB Push / Migration 前提

| 前提條件                                    | 狀態                                  |
| ------------------------------------------- | ------------------------------------- |
| schema TypeScript 通過                      | ✓                                     |
| migration SQL 已 commit                     | ✓（`0001_seller_agent_settings.sql`） |
| `seller_agent_settings` table 是否存在於 DB | ✗ 尚未 push / migrate                 |

**API 施工可以先開始**（route handler 可先寫），但：

- 任何需要 DB 的測試都無法跑
- Server 啟動時若 DB 無此 table，GET/PATCH 請求會拋 DB error

建議在 API 寫完後，在 step7e worktree 執行 `pnpm --filter @workspace/db push` 建立 table，再做 integration test。

## 14. 可執行測試 vs. 不可執行測試

### 現在可執行

| 測試類型              | 說明                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| TypeScript typecheck  | ✓ 已通過                                                                   |
| zod schema unit test  | 可測試 `PatchSellerAgentSettingsBody.safeParse()` 的行為（純 JS，不需 DB） |
| Mock-based route test | 用 `supertest` + `vi.mock("@workspace/db")` 模擬 DB                        |

### 需要 DB 才能執行

| 測試類型                | 說明                               |
| ----------------------- | ---------------------------------- |
| Integration test        | 需要 `seller_agent_settings` table |
| E2E API test            | 需要真實 DB + server               |
| DB upsert / select 驗證 | 需要 table 存在                    |

## 15. 風險與待確認

1. **DB push 前提**：`seller_agent_settings` table 尚未建立，API 寫完後需要決定何時執行 DB push。
2. **migration 策略**：`0001_seller_agent_settings.sql` 是手寫 DDL，可能與 drizzle-kit generate 的 journal 衝突，需確認 DB push 方式。
3. **routes/index.ts 修改需 commit**：加入新的 sellerAgent router 需修改 `routes/index.ts`，需留意 commit 範圍。
4. **JSONB 白名單**：`enabledLogistics` / `queryMethods` 的白名單僅在 zod 驗證層，DB 無 CHECK constraint，需確保 API 層嚴格驗證。
5. **webhookSecret 安全**：明文只在 request body 傳輸一次，server 端立即 hash，永遠不 log 明文。
6. **`platform_managed_reserved` mode**：schema 定義為保留值，建議 PATCH 時拒絕此值（或允許後端保留）。

## 16. 下一步施工建議

### Step 7E-1b-API-IMPL 施工順序

1. 建立 `artifacts/api-server/src/routes/sellerAgent.ts`
2. 定義 `PatchSellerAgentSettingsBody` zod schema（可放在 route 檔案內或 api-zod）
3. 實作 `GET /stores/:storeId/agent/settings`（含 default fallback）
4. 實作 `PATCH /stores/:storeId/agent/settings`（含 upsert + webhookSecret hash）
5. 更新 `routes/index.ts` 引入 `sellerAgentRouter`
6. 執行 DB push（`pnpm --filter @workspace/db push`）
7. 手動 API 測試（curl / supertest）

### 新增的檔案清單

| 檔案                                             | 操作                      |
| ------------------------------------------------ | ------------------------- |
| `artifacts/api-server/src/routes/sellerAgent.ts` | 新增                      |
| `artifacts/api-server/src/routes/index.ts`       | 修改（新增 import + use） |

### 不需修改的檔案

- `lib/db/src/schema/sellerAgentSettings.ts`（schema 不需改）
- `lib/db/migrations/0001_seller_agent_settings.sql`（migration 不需改）
- `middlewares/auth.ts`（`requireAuth` / `verifyStoreOwner` 直接用）

---

## 附記：本次未執行項目

- **本次未施工 API**（route 檔案未修改）
- **本次未 DB push**
- **本次未 migrate**
- **本次未施工 UI**
- **本次未修改 schema / migration**
- **本次未 push**
