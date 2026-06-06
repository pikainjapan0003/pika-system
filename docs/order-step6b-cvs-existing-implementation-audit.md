# Order Step 6B：CVS 既有實作查核與補強決策

> **本文件說明**：Step 6B 目標為查核既有實作，不進行功能施工。
> 所有章節均來自實際 repo 原始碼查核，並明確標示「已確認」「未確認」「假設」「待確認」「風險」。
> 本文件不判定 emap 合法或不合法，不宣稱門市資料即時或百分百準確。

---

## 6.1 Step 6B 目標

### 背景

Step 6A 文件（`docs/order-step6-cvs-store-selection-spec.md`）完成後，重大發現是：
系統已存在大量 CVS 相關功能，遠超原任務描述的預期。

### Step 6B 目標

- **不重做既有功能**，先確認哪些已完成、哪些真正缺失。
- 查核現有 DB / API / UI / 資料流的實際狀態（基於原始碼，非假設）。
- 回答 Step 6A 未解決的高優先問題。
- 決定 Step 6C（API 補強）與 Step 6D（後台選店器）是否仍需施工，以及剩餘範圍。
- 本次**不施工功能**，只做查核與決策文件。

---

## 6.2 Git 與分支狀態查核

| 項目 | 實際狀態 |
|------|---------|
| 目前分支 | `docs/order-step6b-cvs-existing-implementation-audit`（本次新建） |
| 最新 commit | `850bbb2 docs-order-step6-cvs-store-selection-spec` |
| git status | 乾淨（clean） |
| Step 6A commit 850bbb2 | **存在** |
| staged changes | 無 |
| `.claude/settings.local.json` | 無修改、未 stage |
| `dev-handoff/` | 有更新但未 stage（正常，已在 .gitignore） |
| push GitHub | 未執行 |

### Handoff 矛盾說明

Step 6A handoff JSON（`dev-handoff/latest.json`）中存在矛盾：

- `gitStatus: ""`（乾淨）
- `stagedChanges: "A docs/order-step6-cvs-store-selection-spec.md"`（暗示尚有 staged 檔案）

**實際查核結果**：git status 確認為乾淨，commit 850bbb2 已存在。
推測：handoff JSON 的 `stagedChanges` 欄位擷取自 commit 前的狀態，但 `gitStatus` 已更新為 commit 後，造成不一致。
**結論**：repo 狀態正常，無未提交殘留。

---

## 6.3 既有 CVS DB / Schema 查核

### 6.3.1 cvs_stores 表

**已確認** — 定義位於 `lib/db/src/schema/cvsStores.ts`

| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| `id` | serial | ✅ | auto | 主鍵 |
| `provider` | text | ✅ | `"seven"` | `seven` \| `family`（schema 另有 `ok` \| `hilife` 但無資料） |
| `store_id` | text | ✅ | — | 門市代碼 |
| `store_name` | text | ✅ | — | 門市名稱 |
| `store_address` | text | ✅ | `""` | 門市地址（預設空字串，非 null） |
| `store_phone` | text | ❌ | null | 電話，nullable |
| `city` | text | ❌ | null | 縣市 |
| `district` | text | ❌ | null | 行政區 |
| `latitude` | numeric(10,7) | ❌ | null | 緯度 |
| `longitude` | numeric(10,7) | ❌ | null | 經度 |
| `business_hours` | text | ❌ | null | 營業時間 |
| `delivery_status` | text | ❌ | null | 配送狀態 |
| `is_active` | boolean | ✅ | true | 是否啟用 |
| `source` | text | ✅ | `"manual_seed"` | 資料來源（見下方） |
| `source_updated_at` | timestamp | ✅ | now() | 資料來源更新時間 |
| `created_at` | timestamp | ✅ | now() | — |
| `updated_at` | timestamp | ✅ | now() | 自動更新 |

**Unique constraint**：`(provider, store_id)`

**provider 實際值**（依 prod sync 報告 `data/cvs/prod-cvs-sync-apply.json`）：
- `seven`：7,386 筆 active
- `family`：4,492 筆 active

**source 實際值**：
- `seven`：`emap_district_batch`（7,347）、`manual_seed`（2）、`twcoupon_emap_verified`（1）、`twcoupon_unverified`（36）
- `family`：`family_official_map`（4,492）

### 6.3.2 orders 表 CVS 欄位

**已確認** — 定義位於 `lib/db/src/schema/orders.ts`

| 欄位（DB） | 欄位（API alias） | 類型 | 說明 |
|-----------|----------------|------|------|
| `cvs_store_id` | `storeCode` | text \| null | 門市代碼（API 用 storeCode） |
| `cvs_store_name` | `storeName` | text \| null | 門市名稱 |
| `cvs_store_address` | `cvsStoreAddress` | text \| null | 門市地址（無 API alias） |
| `cvs_store_phone` | `cvsStorePhone` | text \| null | 門市電話（無 API alias） |
| `store_selected_by` | `storeSelectedBy` | text \| null | `customer` \| `admin` \| `system` |
| `store_selected_at` | `storeSelectedAt` | timestamp \| null | 選店時間 |

> **⚠️ 注意**：`orders` 表**無** `cvsProvider` 欄位。provider 需從 `pickupMethod` 文字推導（見第 6.7 節）。

### 6.3.3 整體查核表

| 項目 | 現況 | 證據位置 | 風險 | 建議 |
|------|------|---------|------|------|
| `cvs_stores` table | ✅ 存在 | `lib/db/src/schema/cvsStores.ts` | 低 | 無需新增 |
| `provider` 欄位 | ✅ 存在 | `cvsStores.ts:5` | 低 | 命名為 `seven` / `family` |
| `active` 機制 | ✅ `is_active` 欄位 | `cvsStores.ts:16` | 低 | 無需新增 |
| `city` / `district` | ✅ 存在 | `cvsStores.ts:11-12` | 低 | 資料完整性待確認 |
| `store_address` | ✅ 存在，default `""` | `cvsStores.ts:8` | 中（部分空） | 匯入品質需確認 |
| `store_phone` | ✅ 存在，nullable | `cvsStores.ts:9` | 中（部分 null） | 全家電話資料可能缺 |
| `source_updated_at` | ✅ 存在 | `cvsStores.ts:19` | 低 | 資料更新頻率未定義 |
| `cvsStoreId` in orders | ✅ 存在 | `orders.ts:55` | 低 | 無需新增 |
| `cvsStoreName` in orders | ✅ 存在 | `orders.ts:56` | 低 | 無需新增 |
| `cvsStoreAddress` in orders | ✅ 存在 | `orders.ts:57` | 低 | 無需新增 |
| `cvsStorePhone` in orders | ✅ 存在 | `orders.ts:58` | 低 | 無需新增 |
| `storeSelectedBy` in orders | ✅ 存在 | `orders.ts:59` | 低 | 無需新增 |
| `storeSelectedAt` in orders | ✅ 存在 | `orders.ts:60` | 低 | 無需新增 |
| `cvsProvider` in orders | ❌ **不存在** | 無 | **高** | 見 6.7 節三方案 |

---

## 6.4 既有 CVS API 查核

### 6.4.1 API 清單

| API | 是否存在 | 用途 | 權限 | 路徑 |
|-----|---------|------|------|------|
| `GET /api/cvs/stores` | ✅ | 搜尋門市 | 無（公開） | `cvs.ts:50` |
| `GET /api/cvs/regions` | ✅ | 縣市/行政區清單 | 無（公開） | `cvs.ts:16` |
| `POST /api/cvs/711/import-from-emap` | ✅ | emap 單店匯入 | **⚠️ 無 auth** | `cvs.ts:109` |
| `PATCH /api/orders/:orderId/cvs` | ✅ | 寫入訂單 CVS snapshot | `requireAuth` + 店主驗證 | `cvs.ts:264` |
| `PATCH /api/orders/:orderId` | ✅ | 更新訂單（含 storeCode/storeName） | `requireAuth` | `orders.ts:484` |

> **注意**：Step 6A handoff 中提到 `POST /api/cvs/orders/:orderId/select-store`，此路由**不存在**。
> 實際路由為 `PATCH /api/orders/:orderId/cvs`（在 `cvs.ts`，非 `orders.ts`）。

### 6.4.2 GET /api/cvs/stores 詳細查核

**已確認**

| 項目 | 狀態 |
|------|------|
| `provider` filter | ✅ 支援，default `"seven"` |
| `q` keyword 搜尋 | ✅ 支援（storeId, storeName, storeAddress, city, district）|
| `city` filter | ✅ 支援（ilike） |
| `district` filter | ✅ 支援（ilike） |
| `limit` | ✅ 支援，max 50，default 20 |
| 分頁（cursor / offset） | ❌ **不支援** |
| 回傳欄位 | provider, storeId, storeName, storeAddress, storePhone, city, district, businessHours, deliveryStatus, sourceUpdatedAt |
| 是否回傳個資 | 否，全部為門市公開資訊 |
| auth | ❌ 無（公開可存取） |

### 6.4.3 PATCH /api/orders/:orderId/cvs 詳細查核

**已確認**

| 項目 | 狀態 |
|------|------|
| 寫入 `cvsStoreId` | ✅ |
| 寫入 `cvsStoreName` | ✅ |
| 寫入 `cvsStoreAddress` | ✅ |
| 寫入 `cvsStorePhone` | ✅ |
| 寫入 `storeSelectedBy` | ✅（預設 `"admin"`）|
| 寫入 `storeSelectedAt` | ✅（`new Date()`）|
| 寫入 `cvsProvider`（orders 欄位） | ❌ 欄位不存在 |
| auth | ✅ `requireAuth` |
| 店主驗證 | ✅ `verifyStoreOwner` |

### 6.4.4 Orders API 回傳欄位查核（GET /api/stores/:storeId/orders）

**已確認** — `formatOrder()` 使用 `...o` spread（`orders.ts:686`）

| 欄位 | 是否回傳 | 說明 |
|------|---------|------|
| `cvsStoreId` / `storeCode` | ✅ | 原始欄位 + alias |
| `cvsStoreName` / `storeName` | ✅ | 原始欄位 + alias |
| `cvsStoreAddress` | ✅ | 透過 `...o` spread |
| `cvsStorePhone` | ✅ | 透過 `...o` spread |
| `storeSelectedBy` | ✅ | 透過 `...o` spread |
| `storeSelectedAt` | ✅（ISO string） | `orders.ts:692` |
| `buyerPhone` | ✅ | 後台 API 可存取（正常） |
| `internalNote` | ✅ | 後台 API 可存取（正常） |

### 6.4.5 POST /api/cvs/711/import-from-emap 查核

**已確認，存在安全疑慮**

| 項目 | 狀態 |
|------|------|
| 功能 | 呼叫 `emap.pcsc.com.tw/EmapSDK.aspx`，查詢並 upsert 單一 7-11 門市 |
| provider | 硬編碼 `"seven"` |
| 是否需要 secrets/cookie | ❌ 否（直接 HTTP POST） |
| auth | ❌ **無 auth**（任何人可觸發） |
| 逾時設定 | ✅ 10 秒 timeout |
| emap 合規性 | **未確認**（見 6.8 節）|

> **⚠️ 風險**：`POST /api/cvs/711/import-from-emap` 無 auth，任何人皆可呼叫，觸發對 emap.pcsc.com.tw 的請求並修改 `cvs_stores`。

### 6.4.6 PATCH /api/orders/:orderId 與 EditOrderDialog 限制

**已確認**

`PATCH /api/orders/:orderId` 透過 `UpdateOrderBody`（`lib/api-zod/src/generated/api.ts`），
只接受 `storeCode`（→ `cvsStoreId`）和 `storeName`（→ `cvsStoreName`），
**不接受** `cvsStoreAddress` 或 `cvsStorePhone`。

這是 EditOrderDialog 的寫入路徑，表示透過 EditOrderDialog 更新門市時，
**只能更新店號與店名，無法同時更新地址與電話**。

若要完整寫入 CVS snapshot，需改用 `PATCH /api/orders/:orderId/cvs`（但 EditOrderDialog 目前不呼叫此路由）。

---

## 6.5 既有 UI / UX 查核

### 6.5.1 /cvs/711/select 選店頁

**已確認** — `artifacts/shop-app/src/pages/Cvs711Select.tsx`

| 項目 | 狀態 | 說明 |
|------|------|------|
| 頁面是否存在 | ✅ | 路由：`/cvs/711/select` |
| 支援 7-11 | ✅ | `provider=seven`（default）|
| 支援全家 | ✅ | `provider=family`（URL param）|
| 搜尋功能 | ✅ | keyword 搜尋，送出 GET /api/cvs/stores |
| 選定門市後回寫訂單 | ✅（admin）| 呼叫 `PATCH /api/orders/:orderId/cvs` |
| 選定門市後存 localStorage | ✅（customer）| 使用 `saveCvsStore()` |
| 從 Orders 後台進入 | ✅ | Orders.tsx 有「選擇/修改 X 門市」按鈕 |
| 手機版 | ✅ | `max-w-[480px]` 設計 |
| 錯誤狀態 | ✅ | `apiError`, `selectError` 均有處理 |
| 空結果狀態 | ✅ | 「找不到符合...」 |
| 7-11 測試門市按鈕 | ✅ | 只在 `provider=seven` 時顯示 |
| city / district filter UI | ❌ | 頁面只有 keyword 搜尋，無縣市下拉 |

> **注意**：頁面 URL 含 "711" 但**同時支援全家**（透過 `?provider=family`）。
> 命名可能誤導，但功能是通用選店器。

### 6.5.2 Orders 後台（admin panel）

**已確認** — `artifacts/shop-app/src/pages/Orders.tsx`

| 功能 | 狀態 | 說明 |
|------|------|------|
| 顯示 7-11 門市名稱/店號 | ✅ | `o.storeCode`, `o.storeName` |
| 顯示 7-11 門市地址 | ✅ | `(o as any).cvsStoreAddress`（cast 存取）|
| 顯示全家門市名稱/店號/地址 | ✅ | 同上 |
| 顯示 storeSelectedBy / storeSelectedAt | ✅ | 老闆代選 / 客人選擇 |
| 尚未選店的 warning | ✅ | amber 警示框 |
| 「選擇/修改 7-11 門市」按鈕 | ✅ | 導向 `/cvs/711/select?source=admin&orderId=xxx` |
| 「選擇/修改全家門市」按鈕 | ✅ | 導向 `/cvs/711/select?source=admin&provider=family&orderId=xxx` |
| 舊訂單（舊取貨方式）fallback | ✅ | DEPRECATED_METHODS 顯示 amber 提示 |

### 6.5.3 EditOrderDialog（後台編輯彈窗）

**已確認** — `artifacts/shop-app/src/pages/EditOrderDialog.tsx`

| 功能 | 狀態 | 說明 |
|------|------|------|
| 顯示/編輯 storeCode（超商店號） | ✅ | 文字輸入框 |
| 顯示/編輯 storeName（超商店名） | ✅ | 文字輸入框 |
| 整合 CVS 選店器（選店按鈕） | ❌ **缺失** | 無「選擇門市」按鈕 |
| 編輯 cvsStoreAddress | ❌ **缺失** | 無此欄位 |
| 編輯 cvsStorePhone | ❌ **缺失** | 無此欄位 |
| 呼叫 `PATCH /orders/:orderId/cvs` | ❌ | 使用 `PATCH /orders/:orderId`（只含 storeCode/storeName）|

> **⚠️ 差距**：EditOrderDialog 有手動文字輸入 storeCode/storeName，但：
> 1. 不整合選店器，需手動打字（容易打錯）
> 2. 不更新 cvsStoreAddress / cvsStorePhone
> 3. 不更新 storeSelectedBy / storeSelectedAt

### 6.5.4 PublicOrder（買家下單頁）

**已確認** — `artifacts/shop-app/src/pages/PublicOrder.tsx`

| 功能 | 狀態 | 說明 |
|------|------|------|
| 7-11 方法顯示選店入口 | ✅ | 點「選擇 7-11 門市」→ openCvsStoreMap |
| 全家方法顯示選店入口 | ✅ | 點「選擇全家門市」→ openCvsStoreMap |
| 選完後顯示門市資訊 | ✅ | 顯示名稱、地址、店號 |
| 下單時送出 CVS snapshot | ✅ | cvsStoreId, cvsStoreName, cvsStoreAddress, cvsStorePhone, storeSelectedBy |
| 地址空時顯示警示 | ✅ | 「地址資料未完整回傳，請確認門市資訊」|
| provider 驗證（防止混淆） | ✅ | 依 pickupMethod 比對 provider，不一致時清除 localStorage |

### 6.5.5 整體 UI 查核表

| 頁面 / 元件 | 現況 | 支援 provider | 可否接 Orders | 風險 | 建議 |
|------------|------|-------------|-------------|------|------|
| `/cvs/711/select` | ✅ 完整 | seven + family | ✅（admin 模式）| 命名含 711 易誤解 | 低優先：考慮路徑改名或加說明 |
| `Orders.tsx` 門市區塊 | ✅ 完整 | seven + family | ✅ | `cvsStoreAddress` 需 `(o as any)` cast | 補強 TypeScript 型別 |
| `EditOrderDialog.tsx` | ⚠️ 部分 | — | 手動文字輸入 | 不整合選店器、不更新地址/電話 | Step 6D 補強 |
| `PublicOrder.tsx` | ✅ 完整 | seven + family | ✅（買家下單）| localStorage 依賴 | 低 |
| `Cvs711Return.tsx` | ✅ | seven + family | ✅（emap 回調）| emap 回調格式需匹配 | 低 |

---

## 6.6 Step 6A 高優先待確認問題回覆

| # | 問題 | 查核結果 | 是否已解決 | 風險 | 建議下一步 |
|---|------|---------|----------|------|-----------|
| 1 | `cvsStoreAddress` 是否已在後台 API 回傳？ | ✅ **已確認**：`formatOrder()` 使用 `...o` spread，`cvsStoreAddress` 含於 Orders API 回傳。 `Orders.tsx` 以 `(o as any).cvsStoreAddress` 存取（需 TypeScript cast）。 | **是，已解決** | 型別為 `any` cast，非 TypeScript typed | 補 TypeScript 型別定義 |
| 2 | `orders` 是否需要新增 `cvsProvider` 獨立欄位？ | 目前無此欄位。provider 從 `pickupMethod` 文字推導（`getPickupProvider()`）。詳見 6.7 節。 | **未決定**，需產品確認 | getPickupProvider 遇到非 family 方法一律回傳 "seven"（有誤判風險） | 見 6.7 節三方案決策 |
| 3 | emap 批次匯入方式的合規性如何標示？ | **未確認**。呼叫 `emap.pcsc.com.tw/EmapSDK.aspx`，無官方 API 協議或授權文件可見。 | **未解決** | 未授權使用非官方 API 可能被封鎖或有法律風險 | 需法務 / 7-11 官方確認，暫標示風險 |
| 4 | 門市資料更新頻率與策略目前是什麼？ | **未確認**。無排程任務（cron job）定義。資料匯入為手動 script 執行。 | **未解決** | 資料可能過期（門市關閉、地址更動不反映） | 確認更新週期，可能需要定期排程 |
| 5 | 舊訂單只有 `pickupMethod` 文字時，後台 fallback 顯示策略是什麼？ | ✅ **已實作**：`Orders.tsx` 有 `DEPRECATED_METHODS` 對照表，舊取貨方式顯示 amber 警示框。但 cvsStoreId 為空時顯示「尚未選擇門市」，無法回溯舊資料。 | **部分解決**（UI fallback 已有，但舊訂單無 storeId 時無法補回歷史門市） | 舊訂單顯示「尚未選擇門市」可能誤導 | 考慮顯示「此訂單建立時未記錄門市」或「舊訂單不適用」說明 |

---

## 6.7 Provider 設計與欄位決策

### 現況分析

- **`cvs_stores.provider`**：結構化欄位，值為 `seven` 或 `family`。已確認。
- **`orders.cvsProvider`**：**不存在**。provider 從 `pickupMethod` 文字推導，邏輯定義於 `artifacts/shop-app/src/lib/cvs711.ts`：

```ts
export function getPickupProvider(method: string): "seven" | "family" {
  return isFamilyMartMethod(method) ? "family" : "seven";
}
```

若 `pickupMethod` 不在 `FAMILY_MART_PICKUP_METHODS` 內，**一律回傳 `"seven"`**（包含未知方法）。

### 方案比較

| 項目 | 方案 A：維持現狀，從 pickupMethod 推導 | 方案 B：orders 新增 cvsProvider | 方案 C：只存 cvsStoreId，provider 從 cvs_stores join |
|------|--------------------------------------|-------------------------------|------------------------------------------------------|
| 優點 | 不需 migration，立即可用 | provider 結構化，查詢可靠 | 最精確（永遠與 cvs_stores 一致） |
| 缺點 | pickupMethod 變動時會誤判；getPickupProvider 預設 "seven" 風險 | 需 migration；寫入時需同步設定 | 需 join query；cvsStoreId 為空時無 provider |
| 風險 | 如果新增非 7-11/全家的 CVS（OK Mart, 萊爾富），邏輯需更新 | 新欄位需確保寫入路徑全部更新 | 舊訂單無 cvsStoreId 時 join 無結果 |
| 適合情境 | 短期、provider 種類穩定、不新增超商 | 長期、需要可靠 provider 查詢 | 只在有 cvsStoreId 的訂單才需要 provider |
| 建議 | **可接受短期** | **長期建議，但暫不施工** | 備選，待業務需求確認 |

**建議**：短期維持方案 A（現狀），如確認有多 provider 混淆問題，在 Step 6C/6D 時以遷移 migration 補充方案 B。

### 命名建議（若新增 cvsProvider）

- `seven`（與 cvs_stores.provider 一致，避免 `711` 或 `7-11`）
- `family`（與 cvs_stores.provider 一致，避免 `familymart`）

---

## 6.8 emap 匯入與資料來源風險

### 現況

**已確認** — `artifacts/api-server/src/routes/cvs.ts:109`

- **Runtime import API**：`POST /api/cvs/711/import-from-emap`
  - 呼叫 `https://emap.pcsc.com.tw/EmapSDK.aspx`（HTTP POST form）
  - 無需 token / cookie（公開 endpoint，屬於 7-11 電子地圖服務）
  - 只處理 7-11（硬編碼 provider: `"seven"`）
  - 無 rate limit 保護
  - **無 auth**（任何人可觸發）

- **批次匯入 scripts**（dev 環境用）：
  - `scripts/import-seven-stores-from-emap-districts.mjs`（依行政區批次匯入）
  - `scripts/import-seven-stores-from-emap.mjs`（依關鍵字批次匯入）
  - `lib/db/import-seven-stores-from-emap.mjs`（同上，lib 目錄版）

- **全家資料來源**：`scripts/family-official-map-upsert.mjs`（全家官方地圖 API 批次匯入）

### 風險清單

| 風險 | 程度 | 說明 |
|------|------|------|
| emap API 合規性 | **高** | 使用 `emap.pcsc.com.tw/EmapSDK.aspx` 未確認是否有官方授權 |
| emap endpoint 穩定性 | **中** | 非官方合約 API，隨時可能變更或封鎖 |
| `POST /cvs/711/import-from-emap` 無 auth | **中** | 任何人可觸發 emap 請求，也可修改 cvs_stores |
| 無 rate limit | **中** | 批次呼叫可能被 emap 封鎖 IP |
| 全家批次 API 合規性 | **中** | 全家官方地圖 API 授權狀態**未確認** |
| 資料更新無自動排程 | **低** | 手動執行，資料可能過期 |

### 特別聲明

> **本文件不判定 emap 或全家官方地圖 API 合法或不合法。**
> 以上僅供技術查核，實際合規性需由使用者 / 法務 / 營運確認。
> **門市資料不保證即時、完整、百分百準確。**

---

## 6.9 公開查詢頁與個資風險

### 公開追蹤 API（GET /api/orders/track/:publicToken）

**已確認** — `artifacts/api-server/src/routes/public.ts:236`

| 欄位 | 是否回傳 | 說明 |
|------|---------|------|
| `pickupMethod` | ✅ | 取貨方式文字（非 CVS 門市資訊） |
| `cvsStoreId` | ❌ | 明確排除 |
| `cvsStoreName` | ❌ | 明確排除 |
| `cvsStoreAddress` | ❌ | 明確排除 |
| `cvsStorePhone` | ❌ | 明確排除 |
| `buyerName` | ❌ | 明確排除 |
| `buyerPhone` | ❌ | 明確排除 |
| `recipientPhone` | ❌ | 明確排除（代碼注解標示）|
| `recipientAddress` | ❌ | 明確排除 |
| `internalNote` | ❌ | 明確排除 |
| `paymentNote` | ❌ | 明確排除 |
| `paidAmount` | ❌ | 明確排除 |

**已確認**：公開追蹤 API 目前**不洩漏門市地址、電話、個資**。設計正確。

### GET /api/cvs/stores 公開可存取風險

**已確認**：此 API 無 auth，任何人可搜尋門市資料。

| 欄位 | 是否為個資 | 說明 |
|------|----------|------|
| storeName | ❌ | 公開門市名稱 |
| storeAddress | ❌ | 公開門市地址 |
| storePhone | ⚠️ 待確認 | 門市公開電話（非個人資料），但需確認是否顯示 |
| city / district | ❌ | 公開地理資訊 |

**評估**：門市名稱、地址屬於公開資訊，不屬於個資。門市電話亦為公開資訊。
但若 cvs_stores 中有不應公開的欄位（目前沒有），需注意。

### 建議

| 項目 | 建議 |
|------|------|
| 門市名稱 | ✅ 可顯示 |
| 門市地址 | ✅ 可顯示（公開資訊） |
| 門市電話 | ✅ 可顯示（公開資訊），但需**產品決策** |
| 客戶頁不應顯示 | internalNote / paymentNote / paidAmount / recipientPhone / recipientAddress |
| 資料更新提醒 | 若資料來自匯入，建議顯示「門市資料可能延遲，請以實際門市為準」 |

---

## 6.10 Step 6C / 6D 真正剩餘工作

### Step 6C：API 補強

| 工作項目 | 是否仍需要 | 原因 | 優先級 |
|---------|----------|------|--------|
| 補 `GET /api/cvs/stores` provider filter | ❌ 已完成 | 已支援 provider、q、city、district、limit | — |
| 補 `PATCH /api/orders/:orderId/cvs` | ❌ 已完成 | 路由存在且功能完整 | — |
| 補 `cvsStoreAddress` 回傳（Orders API）| ❌ 已完成 | `formatOrder()` 透過 `...o` spread 已包含 | — |
| 補 `POST /api/cvs/711/import-from-emap` auth | ⚠️ **建議補** | 目前無 auth，任何人可觸發 | 中 |
| 補 GET /api/cvs/stores 分頁 | 低優先 | 目前 limit=50 足夠搜尋，非必要 | 低 |
| `UpdateOrderBody` 補 cvsStoreAddress/Phone | ⚠️ **建議** | EditOrderDialog 透過 PATCH /orders/:orderId 無法更新地址/電話 | 中 |
| 補 OpenAPI / generated client for `/orders/:id/cvs` | 待確認 | 目前手動呼叫，需要 typesafe client 嗎？ | 低 |
| `cvsStoreAddress` TypeScript 型別（非 any cast）| ⚠️ **建議** | Orders.tsx 目前用 `(o as any)` | 低 |
| `GET /api/cvs/stores` 加 city/district filter UI | 待確認 | API 已支援，但選店頁目前無下拉選單 | 低 |

### Step 6D：後台選店器

| 工作項目 | 是否仍需要 | 原因 | 優先級 |
|---------|----------|------|--------|
| Orders.tsx 後台門市顯示 | ❌ 已完成 | 顯示名稱、地址、storeSelectedBy、按鈕均已實作 | — |
| Orders.tsx「選擇/修改門市」按鈕 | ❌ 已完成 | 7-11 和全家按鈕均已實作 | — |
| `/cvs/711/select` 頁面本身 | ❌ 已完成 | 支援 seven + family | — |
| 管理員選完門市回寫訂單 | ❌ 已完成 | `PATCH /orders/:orderId/cvs` 流程完整 | — |
| **EditOrderDialog 整合選店器** | ✅ **仍需要** | 目前只有手動文字輸入，無選店按鈕 | **高** |
| EditOrderDialog 補 cvsStoreAddress 顯示/編輯 | ✅ **仍需要** | 目前 EditOrderDialog 無此欄位 | 中 |
| 舊訂單 fallback 顯示優化 | ✅ **仍需要** | 「尚未選擇門市」訊息對舊訂單不適切 | 中 |
| 選店頁 city/district 下拉 | 待確認 | 提升使用者體驗，但非必要 | 低 |
| TypeScript 型別補強（cvsStoreAddress 不再 any cast）| ✅ **仍需要** | 改善 type safety | 低 |

---

## 6.11 測試計畫

> **本次未執行任何測試**。本節列出後續進入 Step 6C / 6D 施工後所需的測試清單。

### API 測試

| 測試案例 | 說明 |
|---------|------|
| `GET /api/cvs/stores?provider=seven` | 回傳 7-11 門市列表 |
| `GET /api/cvs/stores?provider=family` | 回傳全家門市列表 |
| keyword 搜尋店號 / 店名 / 地址 | 確認 ilike 搜尋有效 |
| city filter | 只回傳指定縣市 |
| district filter | 只回傳指定行政區 |
| limit 超過 50 時被截斷為 50 | 安全上限確認 |
| `PATCH /api/orders/:orderId/cvs` 寫入完整 CVS snapshot | cvsStoreId, cvsStoreName, cvsStoreAddress, cvsStorePhone, storeSelectedBy, storeSelectedAt 均正確寫入 |
| `PATCH /api/orders/:orderId/cvs` 無 auth → 401 | 權限驗證 |
| `PATCH /api/orders/:orderId/cvs` 非店主 → 403 | 店主驗證 |
| Orders API 回傳 cvsStoreAddress | 確認 formatOrder spread 正確 |
| 公開追蹤 API 不回傳 CVS 資訊 | 確認個資隔離 |
| `POST /cvs/711/import-from-emap` 無 auth 可存取 | 確認此漏洞（待修補）|

### UI 測試

| 測試案例 | 說明 |
|---------|------|
| Orders 後台可搜尋 7-11 門市 | 點選「選擇/修改 7-11 門市」→ 選店頁 → 回到訂單 |
| Orders 後台可搜尋全家門市 | provider=family 流程 |
| 選定門市後門市資訊正確顯示 | 名稱、地址、storeSelectedBy、storeSelectedAt |
| 查無結果的 UI | 「找不到符合...」提示 |
| API 錯誤的 UI | 「門市查詢暫時無法使用」 |
| 舊訂單（無 storeId）的 fallback 顯示 | 確認訊息適切 |
| 手機版選店頁 | max-w-[480px] 正常顯示 |
| EditOrderDialog 選店器整合（Step 6D 後）| 按鈕存在、可選、自動填入 |

### 回歸測試

| 測試案例 | 說明 |
|---------|------|
| Step 5 付款 / 物流欄位仍可儲存 | PATCH /orders/:orderId 其他欄位不受影響 |
| Step 5E 批次付款 / 出貨 PATCH /orders/bulk 不壞 | 批次操作不影響 CVS 欄位 |
| Step 5F 撿貨單 / 出貨單 / CSV 不壞 | shipping-list 包含 storeCode/storeName，需確認 |
| 公開追蹤頁不洩漏個資 | 重新確認 public.ts 回傳欄位 |
| cancelled 訂單排除邏輯不壞 | 批次操作 excluded 邏輯 |

### 資料一致性測試

| 測試案例 | 說明 |
|---------|------|
| cvsStoreId 與 cvsStoreName snapshot 一致 | 選完門市後的資料不亂 |
| provider 不混淆 | 7-11 訂單不會選到全家門市 |
| 舊訂單 cvsStoreId 為 null 時 fallback 正常 | 顯示「尚未選擇門市」不 crash |
| 門市資料更新不意外覆蓋舊訂單 snapshot | 訂單儲存的是 snapshot，不 join live 資料 |

---

## 6.12 風險清單

| # | 風險 | 影響 | 可能性 | 建議緩解 |
|---|------|------|--------|---------|
| 1 | Handoff 與 repo Git 狀態不一致（stagedChanges / gitStatus 矛盾） | 低（已確認 repo 正常）| 低 | 本次文件已說明；可改進 handoff 更新流程 |
| 2 | `orders` 無 `cvsProvider` 欄位，provider 從 pickupMethod 推導 | 中（新增超商類型時會誤判）| 中 | 短期維持現狀；長期考慮新增欄位 |
| 3 | emap 使用合規性未確認 | **高**（法律與服務穩定性）| 中 | 暫停新增 emap 匯入；等待確認 |
| 4 | `POST /cvs/711/import-from-emap` 無 auth | **高**（任何人可觸發 emap 請求、修改 cvs_stores）| 中 | 補加 requireAuth 或移除此 API |
| 5 | emap endpoint 穩定性（非官方合約）| **高**（資料匯入中斷）| 中 | 備份門市資料；考慮其他資料來源 |
| 6 | 門市資料更新策略未確認 | 中（門市資料過期）| 高（無排程）| 確認更新週期；建立排程機制 |
| 7 | 公開查詢頁顯示門市電話的產品決策未確認 | 低（目前追蹤頁不顯示）| 低 | 確認 /api/cvs/stores 的 storePhone 是否應公開 |
| 8 | 舊訂單（只有 pickupMethod 文字）fallback 不適切 | 低（顯示「尚未選擇門市」誤導）| 高（所有舊訂單）| 改善舊訂單 fallback 訊息文字 |
| 9 | EditOrderDialog 選店器未整合，手動打字易錯 | 中（管理效率 / 資料正確性）| 中 | Step 6D 補強 |
| 10 | 測試覆蓋不足 | 中（CVS 相關功能無自動化測試）| 高 | Step 6C/6D 補充測試 |
| 11 | `cvsStoreAddress` 在 Orders.tsx 以 `(o as any)` 存取 | 低（型別不安全，但功能正常）| 中 | 補強 TypeScript 型別 |

---

## 6.13 建議決策

| 項目 | 建議 | 理由 |
|------|------|------|
| Step 6C 是否要做 | **是（小範圍）** | 主要 API 已完成；需補 `POST /cvs/711/import-from-emap` auth、`UpdateOrderBody` 補欄位、型別補強 |
| Step 6D 是否要做 | **是（聚焦 EditOrderDialog）** | Orders.tsx 已整合；EditOrderDialog 缺選店器整合是主要缺口 |
| 是否先補 API | **是（安全優先）** | `POST /cvs/711/import-from-emap` 無 auth 是安全問題，應優先修 |
| 是否先補 Orders UI | **否（Orders.tsx 已完整）** | 聚焦 EditOrderDialog 缺失部分 |
| 是否需要 cvsProvider 欄位 | **暫不施工** | 現有邏輯可運作；若有多 provider 混淆案例再評估 |
| 是否要暫停 emap 自動匯入 | **建議暫停新批次** | 合規性未確認前，避免大量呼叫 emap API |
| 是否要先做 release checklist | **是** | 進入 Step 6D 施工前，先確認 6.14 待確認問題 |

---

## 6.14 待確認問題

| # | 問題 | 優先級 | 說明 |
|---|------|--------|------|
| 1 | 是否接受 emap 匯入來源風險？ | **高** | 7-11 emap.pcsc.com.tw 使用授權未確認 |
| 2 | 全家官方地圖 API 是否有使用授權？ | **高** | family_official_map 來源合規性需確認 |
| 3 | 是否要新增 `orders.cvsProvider` 欄位？ | 中 | 見 6.7 節三方案；影響後續 migration 決策 |
| 4 | 公開查詢頁（/cvs/stores API）是否顯示門市電話 `storePhone`？ | 中 | 目前 API 已回傳，需確認是否適切 |
| 5 | `POST /cvs/711/import-from-emap` 是否要加 auth？ | **高** | 目前任何人可觸發 emap 請求 |
| 6 | 既有 `/cvs/711/select` 是否要改名？ | 低 | URL 含 711 但支援全家，可能誤導 |
| 7 | Step 6D 是否優先做 EditOrderDialog 選店器整合？ | 中 | 目前 EditOrderDialog 只有文字輸入 |
| 8 | 買家端選店是否延後？ | 低 | PublicOrder.tsx 已完整整合，可能無需修改 |
| 9 | 門市資料多久更新一次？是否需要排程？ | 中 | 目前無排程；手動執行 scripts |
| 10 | 是否需要停用門市機制（is_active = false 的使用情境）？ | 低 | 何時觸發 is_active 切換？ |
| 11 | 是否需要人工新增 / 編輯門市？ | 低 | 目前無後台管理介面 |
| 12 | `storeSelectedBy` / `storeSelectedAt` 是否要在 EditOrderDialog 中顯示？ | 低 | 目前 Orders.tsx 已顯示，EditOrderDialog 沒有 |
| 13 | 舊訂單「尚未選擇門市」的 UI 訊息是否要改？ | 中 | 對建立於選店功能之前的訂單不適切 |
| 14 | 是否提供門市資料更新日期的使用者端提示？ | 低 | 選店頁已顯示 `sourceUpdatedAt`，但說明不夠清楚 |

---

## 附錄：主要檔案位置

| 檔案 | 用途 |
|------|------|
| `lib/db/src/schema/cvsStores.ts` | cvs_stores table schema |
| `lib/db/src/schema/orders.ts` | orders table schema（含 CVS 欄位）|
| `artifacts/api-server/src/routes/cvs.ts` | CVS API routes |
| `artifacts/api-server/src/routes/orders.ts` | Orders API routes（含 formatOrder）|
| `artifacts/api-server/src/routes/public.ts` | 公開 API（追蹤頁、下單）|
| `artifacts/shop-app/src/pages/Cvs711Select.tsx` | 選店頁（seven + family）|
| `artifacts/shop-app/src/pages/Cvs711Return.tsx` | emap 回調頁 |
| `artifacts/shop-app/src/pages/Orders.tsx` | 後台訂單頁（CVS 顯示 + 選店按鈕）|
| `artifacts/shop-app/src/pages/EditOrderDialog.tsx` | 後台編輯彈窗（CVS 僅文字輸入）|
| `artifacts/shop-app/src/pages/PublicOrder.tsx` | 買家下單頁（CVS 整合完整）|
| `artifacts/shop-app/src/lib/cvs711.ts` | CVS 工具函式、getPickupProvider |
| `lib/api-zod/src/generated/api.ts` | UpdateOrderBody schema |
| `scripts/sync-cvs-stores-to-prod.mjs` | 開發→生產 DB 同步工具 |
| `data/cvs/prod-cvs-sync-apply.json` | 生產同步報告（11,878 筆）|
