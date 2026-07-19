# Step 7C-1：Schema / Migration 施工前盤點

_文件版本：Step 7C-1 Audit v1.0_
_盤點時間：2026-06-07_
_依據規格：docs/order-step7c-shipment-tracking-model-spec.md（Step 7C Spec v1.1）_

---

## 1. 盤點目的

本文件在真正施工 DB schema / migration 之前，確認：

1. 目前專案的 DB 技術棧與工具鏈
2. 現有 schema 檔案位置與結構
3. Migration 產生與套用方式
4. orders 表目前的 tracking 相關欄位現況
5. 測試檔案位置與執行指令
6. Step 7C schema 施工的具體步驟建議與風險

本文件**不施工**：不新增 schema 檔案、不執行 push、不改 API。

---

## 2. DB 技術棧

| 項目             | 值                                                            |
| ---------------- | ------------------------------------------------------------- |
| ORM              | Drizzle ORM (`drizzle-orm@0.45.x`)                            |
| DB               | PostgreSQL                                                    |
| Drizzle Kit 版本 | `drizzle-kit@^0.31.10`                                        |
| Schema 語言      | TypeScript（`lib/db/src/schema/`）                            |
| Migration 策略   | **`drizzle-kit push`**（直接同步，不產生 SQL migration 檔案） |
| Drizzle Config   | `lib/db/drizzle.config.ts`                                    |
| DB 連線          | `DATABASE_URL` 環境變數（`lib/db/src/index.ts`）              |

---

## 3. Schema 檔案位置

### 3.1 Schema 目錄結構

```
lib/db/
├── drizzle.config.ts          ← Drizzle 設定（指向 src/schema/index.ts）
├── package.json               ← 包含 push / push-force / seed script
└── src/
    ├── index.ts               ← db 連線 + re-export schema
    └── schema/
        ├── index.ts           ← re-export 所有 table（新增 table 需在此加 export）
        ├── stores.ts          ← stores 表
        ├── productCategories.ts ← product_categories 表
        ├── products.ts        ← products 表
        ├── orders.ts          ← orders 表（含 tracking 相關欄位）
        └── cvsStores.ts       ← cvs_stores 表
```

### 3.2 `lib/db/src/schema/index.ts` 現況

```typescript
export * from "./stores.ts";
export * from "./productCategories.ts";
export * from "./products.ts";
export * from "./orders.ts";
export * from "./cvsStores.ts";
```

**Step 7C 施工後需新增**：

```typescript
export * from "./shipmentTrackings.ts";
export * from "./shipmentTrackingEvents.ts";
```

---

## 4. Migration 策略說明

本專案使用 **`drizzle-kit push`** 策略，而非 `drizzle-kit generate` + `drizzle-kit migrate`。

| 項目           | 說明                                                                                |
| -------------- | ----------------------------------------------------------------------------------- |
| 指令           | `pnpm --filter @workspace/db push`                                                  |
| 強制指令       | `pnpm --filter @workspace/db push-force`（跳過安全確認）                            |
| 運作方式       | drizzle-kit 讀取 schema TypeScript 定義，與目前 DB 比對差異，自動產生並執行 DDL SQL |
| Migration 檔案 | **不存在**（push 策略不產生版控 SQL 檔案）                                          |
| Rollback 機制  | **無自動 rollback**（push 策略沒有 down migration，需手動補救）                     |
| Schema 版控    | 由 schema TypeScript 原始碼版控，DDL 是衍生物                                       |

### 注意事項

- **沒有 SQL migration 檔案**：所有 schema 變更都直接 push 到 DB，不會留下 `.sql` 歷史記錄
- **不可 push-force 到生產環境**：push-force 會跳過破壞性變更的確認，生產環境應只用 `push`（會互動確認）
- **Push 前必須備份**：`drizzle-kit push` 沒有 rollback，push 後若有問題需手動修復或 restore 備份

---

## 5. orders 表 tracking 相關欄位現況

`lib/db/src/schema/orders.ts` 目前已有以下 tracking 相關欄位：

| 欄位（TypeScript 名） | DB 欄位名           | 型別          | 預設值          | 說明                                   |
| --------------------- | ------------------- | ------------- | --------------- | -------------------------------------- |
| `shippingMethod`      | `shipping_method`   | text          | NULL            | 物流方式（如 convenience_store）       |
| `shippingStatus`      | `shipping_status`   | text NOT NULL | `'not_shipped'` | 訂單層級物流狀態                       |
| `trackingCode`        | `tracking_code`     | text          | NULL            | 物流追蹤碼（人工填入，Step 7B 已支援） |
| `trackingProvider`    | `tracking_provider` | text          | NULL            | 物流商代碼（人工填入，Step 7B 已支援） |
| `shippingNote`        | `shipping_note`     | text          | NULL            | 物流備註                               |
| `recipientName`       | `recipient_name`    | text          | NULL            | 收件人姓名                             |
| `recipientPhone`      | `recipient_phone`   | text          | NULL            | 收件人電話                             |
| `recipientAddress`    | `recipient_address` | text          | NULL            | 收件人地址                             |

### 目前不存在（Step 7C 要新增的）

| 表名                       | 狀態               |
| -------------------------- | ------------------ |
| `shipment_trackings`       | **不存在**，需新增 |
| `shipment_tracking_events` | **不存在**，需新增 |

---

## 6. 目前測試檔案與執行指令

### 6.1 API 整合測試檔案

| 檔案                                                    | Step       | 測試對象                                                        | 行數 |
| ------------------------------------------------------- | ---------- | --------------------------------------------------------------- | ---- |
| `artifacts/api-server/src/routes/orders.route.test.mjs` | Step 4B–6D | PATCH orders、bulk、picking/shipping list、public tracking 隱私 | 1464 |
| `artifacts/api-server/src/routes/public.route.test.mjs` | Step 6E-B  | POST /p/:shareToken/orders、GET /orders/track/:publicToken      | 360  |
| `artifacts/api-server/src/routes/cvs.route.test.mjs`    | Step 6C–6D | CVS store picker                                                | —    |

### 6.2 測試執行指令

測試使用 Node.js v24 內建 `node:test` runner，需有 `DATABASE_URL` 環境變數（real DB）。

**orders 整合測試：**

```bash
cd artifacts/api-server
node --experimental-test-module-mocks --import tsx/esm --test src/routes/orders.route.test.mjs
```

**public route 整合測試：**

```bash
cd artifacts/api-server
node --experimental-test-module-mocks --import tsx/esm --test src/routes/public.route.test.mjs
```

**TypeScript 型別檢查：**

```bash
# API server
npx tsc -p artifacts/api-server/tsconfig.json --noEmit

# 全專案
pnpm run typecheck
```

### 6.3 目前 tracking 相關測試覆蓋現況

| 場景                                                | 現有測試                           | 狀態      |
| --------------------------------------------------- | ---------------------------------- | --------- |
| PATCH orders — 更新 trackingCode / trackingProvider | orders.route.test.mjs line 421–430 | ✅ 已覆蓋 |
| public tracking 隱私防護（不洩露 internalNote 等）  | orders.route.test.mjs line 520–598 | ✅ 已覆蓋 |
| GET /orders/track — 回傳 trackingCode 欄位          | public.route.test.mjs line 301     | ✅ 已覆蓋 |
| shipment_trackings CRUD                             | **無**                             | ❌ 需新增 |
| shipment_tracking_events 讀取                       | **無**                             | ❌ 需新增 |

---

## 7. Step 7C Schema 施工建議步驟

以下為建議施工順序。**本文件不施工，以下僅作為下一步參考。**

### Step 7C-1A：新增 Drizzle Schema 檔案

1. 新增 `lib/db/src/schema/shipmentTrackings.ts`（依 Step 7C Spec 5.1 節）
2. 新增 `lib/db/src/schema/shipmentTrackingEvents.ts`（依 Step 7C Spec 5.2 節）
3. 更新 `lib/db/src/schema/index.ts`：
   ```typescript
   export * from "./shipmentTrackings.ts";
   export * from "./shipmentTrackingEvents.ts";
   ```

### Step 7C-1B：TypeScript 型別驗證

```bash
pnpm run typecheck
```

確認無型別錯誤後才執行 push。

### Step 7C-1C：Push 到 DB

```bash
# 開發環境（有互動確認）
pnpm --filter @workspace/db push

# 若需跳過確認（非生產環境）
pnpm --filter @workspace/db push-force
```

### Step 7C-1D：驗證 DB 狀態

Push 後可透過 psql 或 drizzle studio 確認兩張新表存在且欄位正確。

### Step 7C-1E：（非 Step 7C 範圍）後續步驟

- Step 7C-2：新增 API endpoint（讀取 shipment_trackings）
- Step 7C-3：新增對應整合測試
- Step 7D：OpenClaw worker 自動查詢物流貨態（依賴業者 API）

---

## 8. 施工風險評估

| 風險                                    | 等級 | 說明                                                                                 | 緩解措施                                                                   |
| --------------------------------------- | ---- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Push 無 rollback                        | 中   | `drizzle-kit push` 沒有 down migration，push 失敗或 schema 錯誤需手動修復            | Push 前備份 DB；先在開發環境驗證                                           |
| orders 與 shipment_trackings 資料一致性 | 低   | orders.trackingCode / trackingProvider 是 source of truth，shipment_trackings 是衍生 | Step 7C 施工時明確定義同步時機（目前 Step 7D 負責），不在 Step 7C 自動建立 |
| TypeScript 型別錯誤                     | 低   | 新 schema 若 import 路徑有誤，api-server 或 lib/db build 會失敗                      | TypeScript typecheck 在 push 前執行                                        |
| schema/index.ts 漏 export               | 低   | 若忘記在 index.ts 新增 export，drizzle-kit 不會讀到新 table                          | 施工 checklist 明確列出此步驟                                              |
| 現有測試未覆蓋新表                      | 低   | 新增 schema 後，現有整合測試不測試新表，不能驗證 schema 正確性                       | Step 7C 施工時同步新增整合測試（Step 7C-3）                                |

---

## 9. 施工前確認清單（Checklist）

施工 Step 7C schema 前，請確認以下項目：

- [ ] `DATABASE_URL` 已設定且指向開發環境 DB（非生產環境）
- [ ] DB 已備份（或確認這是 dev/staging 環境）
- [ ] `lib/db/src/schema/shipmentTrackings.ts` 內容與 Step 7C Spec 5.1 節一致
- [ ] `lib/db/src/schema/shipmentTrackingEvents.ts` 內容與 Step 7C Spec 5.2 節一致
- [ ] `lib/db/src/schema/index.ts` 已加入兩個新 export
- [ ] `pnpm run typecheck` 通過（無型別錯誤）
- [ ] `pnpm --filter @workspace/db push` 執行成功
- [ ] 新表存在 DB（透過 psql 或 drizzle studio 驗證）
- [ ] `lib/db` TypeScript build 成功
- [ ] 現有整合測試（orders.route.test.mjs）仍通過（回歸確認）
- [ ] `dev-handoff/` 未被 stage
- [ ] `.claude/` 未被 stage

---

## 10. 附：相關 Schema 節錄（現況）

### `lib/db/drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";
import path from "path";

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
```

### `lib/db/package.json` 中 scripts

```json
"scripts": {
  "push": "drizzle-kit push --config ./drizzle.config.ts",
  "push-force": "drizzle-kit push --force --config ./drizzle.config.ts",
  "seed": "tsx src/seed.ts"
}
```

### `orders` 表 shippingStatus enum 現況

```typescript
export const shippingStatusEnum = [
  "not_shipped",
  "preparing",
  "shipped",
  "arrived",
  "picked_up",
  "returned",
  "cancelled",
] as const;
```

> 注意：orders.shippingStatus 與 Step 7C 新增的 shipment_tracking_events.eventStatus 是**不同層次的狀態**。前者是訂單層級（人工或自動更新），後者是業者事件層級（Step 7D worker 寫入）。Step 7D 施工時需定義兩者的映射規則。

---

_本文件為施工前盤點，不修改任何 schema 或 migration 檔案。_
_實際施工請參考本文件第 7 節步驟與第 9 節 Checklist。_
