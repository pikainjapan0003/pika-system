# Order Step 7A 現況欄位盤點

> **文件說明**：本文件為 Step 7A（客戶貨態頁與自動貨態更新）規格文件的前置現況查核。
> 只做盤點，不施工功能。不改 DB / API / UI。不導入 7-11 / 全家 / OpenClaw / E-Tracking。
> 所有欄位來自實際原始碼查核，明確標示「已找到」「未找到」「尚未確認」「可能相關但需人工判斷」。
> 本文件不承諾貨態即時或百分百準確。

---

## 1. 盤點目的

| 目的 | 說明 |
|------|------|
| 為 Step 7A 提供現況依據 | 供 Claude A 撰寫 Step 7A 規格文件時引用 |
| 確認既有欄位 | 哪些已在 DB / API，哪些尚未存在 |
| 確認公開查詢現況 | 公開頁已回傳哪些欄位、哪些被排除 |
| 確認個資保護狀態 | 目前是否已有遮蔽機制 |
| 釐清概念混淆 | publicToken 與 trackingCode 不可混用 |
| 整理後續施工缺口 | 為 Step 7B / 7C 提供參考 |

本次範圍限定為**盤點與整理**，不包含任何功能施工。

---

## 2. 搜尋範圍與方法

### 執行指令

```bash
git status
git branch --show-current
find docs -maxdepth 2 -type f | sort
grep -R "trackingCode|trackingProvider|shippingStatus|shippingMethod|publicToken|storeCode|storeName|recipientPhone|recipientAddress|internalNote|paymentNote|paidAmount|711|7-11|FamilyMart|familymart|OpenClaw|openclaw|E-Tracking" -n . \
  --include="*.ts" --include="*.tsx" --include="*.prisma" --include="*.md" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.claude --exclude-dir=dev-handoff \
  --exclude="*.map" --exclude="pnpm-lock.yaml"
find . -maxdepth 10 -type f -name "*.prisma"
find . -path "*/db/src/schema/orders*" -type f
```

### 搜尋關鍵字

`trackingCode`、`trackingProvider`、`shippingStatus`、`shippingMethod`、`publicToken`、`storeCode`、`storeName`、`recipientPhone`、`recipientAddress`、`internalNote`、`paymentNote`、`paidAmount`、`711`、`7-11`、`FamilyMart`、`familymart`、`OpenClaw`、`openclaw`、`E-Tracking`

### 搜尋日期

2026-06-06

---

## 3. 相關檔案總覽

| 檔案 | 命中關鍵字 | 與 Step 7A 的關係 | 備註 |
|------|-----------|-----------------|------|
| `lib/db/src/schema/orders.ts` | trackingCode, trackingProvider, shippingStatus, shippingMethod, publicToken, paidAmount, paymentNote, recipientPhone, recipientAddress, internalNote, cvsStoreId, cvsStoreName | **核心 DB 定義**，所有訂單欄位來源 | 無獨立 shipment_trackings 表 |
| `lib/db/src/schema/cvsStores.ts` | storeName, provider, openclaw（comment） | CVS 門市資料表，provider 欄已預留 | OpenClaw 僅為 comment，未實作 |
| `artifacts/api-server/src/routes/public.ts` | publicToken, trackingCode, trackingProvider, shippingStatus | **公開查詢 API**，GET /api/orders/track/:publicToken | 已有個資排除邏輯 |
| `artifacts/api-server/src/routes/orders.ts` | trackingCode, trackingProvider, shippingStatus, shippingMethod, paidAmount, paymentNote, internalNote, storeCode, storeName, recipientPhone, recipientAddress, publicToken | 後台訂單 CRUD + CSV 匯出 | CSV 已包含 trackingCode |
| `artifacts/shop-app/src/pages/TrackOrder.tsx` | publicToken, trackingCode（間接）| 客戶公開查詢頁（前端） | **「複製追蹤碼」按鈕實際複製的是 publicToken，非 trackingCode** |
| `artifacts/shop-app/src/pages/Orders.tsx` | shippingStatus, trackingCode, trackingProvider, paidAmount, paymentNote, recipientPhone, recipientAddress, storeCode, storeName, internalNote, 7-11, FamilyMart | 後台訂單管理頁 | 後台已顯示 trackingCode / trackingProvider |
| `lib/api-zod/src/generated/types/publicOrder.ts` | publicToken, trackingCode, trackingProvider, shippingStatus | PublicOrder 型別定義 | 已包含 trackingCode / trackingProvider |
| `lib/api-zod/src/generated/types/order.ts` | publicToken, trackingCode, trackingProvider, shippingStatus, paidAmount, paymentNote, recipientPhone, recipientAddress, internalNote, storeCode, storeName | Order 型別定義 | |
| `lib/api-client-react/src/generated/api.ts` | publicToken | useGetPublicOrder hook | 公開查詢的 React query hook |
| `artifacts/api-server/src/routes/orders.route.test.mjs` | publicToken, trackingCode, trackingProvider, internalNote, paymentNote, paidAmount, recipientPhone | **Step 5C 個資保護測試** | 已有明確隱私保護測試 |
| `artifacts/shop-app/src/lib/printHelpers.ts` | trackingCode, trackingProvider, shippingStatus, shippingMethod, storeCode, storeName, recipientPhone, recipientAddress | 出貨單列印 HTML helper | 列印版已含 trackingCode |
| `docs/order-step5-payment-logistics-release-checklist.md` | publicToken, trackingCode, shippingStatus, paidAmount, paymentNote, internalNote, recipientPhone, recipientAddress | Step 5 驗收清單 | 已明確區分 publicToken ≠ trackingCode |
| `docs/order-step5f-picking-shipping-export-spec.md` | shippingStatus, shippingMethod | Step 5F 撿貨 / 出貨 / CSV 規格文件 | |

---

## 4. 既有欄位盤點

> DB 來源：`lib/db/src/schema/orders.ts`（Drizzle ORM，PostgreSQL）

| 欄位 / 用語 | 搜尋結果 | 目前用途 | Step 7A 判斷 | 狀態 |
|-----------|---------|---------|------------|------|
| `shippingStatus` | **已找到**（DB、API、前端） | 訂單物流狀態，enum：`not_shipped`、`preparing`、`shipped`、`arrived`、`picked_up`、`returned`、`cancelled` | 保留作訂單層級狀態；Step 7A 貨態頁使用此欄位顯示目前出貨狀態 | 已確認 |
| `trackingCode` | **已找到**（DB、公開 API、後台 API、CSV、列印） | 物流追蹤碼，由店家手動填入，可選 | Step 7B 匯入物流號碼的目標欄位；公開頁已回傳 | 已確認 |
| `trackingProvider` | **已找到**（DB、公開 API、後台 API、CSV、後台 UI） | 物流商名稱，目前為自由文字（無 enum 標準化） | 後續需標準化 provider enum（如 `seven_eleven_c2c`、`family_mart_c2c` 等） | 已確認，**provider 尚未標準化** |
| `shippingMethod` | **已找到**（DB、API、前端） | 配送方式，enum：`self_pickup`、`convenience_store`、`home_delivery`、`other` | 代表配送類型，**不等於**物流查詢 provider | 已確認 |
| `storeCode`（DB 欄 `cvsStoreId`） | **已找到**（DB、API、前端） | 超商門市代碼，API 層映射為 `storeCode` | 不可混為 trackingCode，是門市識別碼 | 已確認 |
| `storeName`（DB 欄 `cvsStoreName`） | **已找到**（DB、API、前端） | 超商門市名稱，API 層映射為 `storeName` | 保留顯示用途 | 已確認 |
| `publicToken` | **已找到**（DB、公開 API、前端） | 訂單公開查詢入口 token，唯一值，不可猜測，用於 GET /api/orders/track/:publicToken | **不可與 trackingCode 混淆**，是身份驗證 token，不是物流追蹤碼 | 已確認 |
| `recipientPhone` | **已找到**（DB、後台 API、CSV、列印） | 收件電話 | 公開查詢 API **已明確排除**，不回傳 | 已確認 |
| `recipientAddress` | **已找到**（DB、後台 API、CSV、列印） | 收件地址 | 公開查詢 API **已明確排除**，不回傳 | 已確認 |
| `internalNote` | **已找到**（DB、後台 API、後台 UI） | 內部備註，僅後台可見 | 公開查詢 API **已明確排除**，不回傳 | 已確認 |
| `paymentNote` | **已找到**（DB、後台 API、後台 UI） | 付款備註，僅後台可見 | 公開查詢 API **已明確排除**，不回傳 | 已確認 |
| `paidAmount` | **已找到**（DB、後台 API、後台 UI） | 已付款金額（numeric），後台財務資訊 | 公開查詢 API **已明確排除**，不回傳 | 已確認 |
| `shipment_trackings`（表） | **未找到** | 無此資料表 | Step 7C 若需 history / timeline，需新增 | 未存在 |
| `shipment_tracking_events`（表） | **未找到** | 無此資料表 | Step 7C 貨態 history 資料模型需新設計 | 未存在 |
| `latestTrackingStatus` | **未找到** | 無此欄位 | Step 7C 需評估是否在 orders 表新增 snapshot 欄位 | 未存在 |
| `failureCount` | **未找到** | 無此欄位 | 自動貨態更新失敗計數，Step 7C 需評估 | 未存在 |
| `lastCheckedAt` | **未找到** | 無此欄位 | 上次查詢時間，Step 7C 需評估 | 未存在 |
| `checkError` | **未找到** | 無此欄位 | 查詢錯誤記錄，Step 7C 需評估 | 未存在 |

---

## 5. publicToken 與 trackingCode 現況差異

> **核心結論：publicToken 是訂單公開查詢入口。trackingCode 是物流追蹤碼。兩者不可混用。**

### publicToken 目前狀態

| 項目 | 現況 |
|------|------|
| 定義位置 | `lib/db/src/schema/orders.ts`：`publicToken: text("public_token").notNull().unique()` |
| 產生時機 | 訂單建立時，由 `randomBytes(16).toString("hex")` 產生，16 bytes hex = 32 字元 |
| 用途 | 作為 URL 路徑參數，讓客人在未登入情況下存取自己的訂單：`GET /api/orders/track/:publicToken` |
| 前端路徑 | `/track/:publicToken`（TrackOrder.tsx） |
| 公開頁 API | `GET /api/orders/track/:publicToken`（`artifacts/api-server/src/routes/public.ts:236`） |
| 是否有 rate limiting | **是**，30 次 / 10 分鐘（trackOrderLimiter） |
| 是否需要登入 | 不需要（公開端點） |

### trackingCode 目前狀態

| 項目 | 現況 |
|------|------|
| 定義位置 | `lib/db/src/schema/orders.ts`：`trackingCode: text("tracking_code")` |
| 填入方式 | 由店家在後台手動填入，無自動串接 |
| 公開 API 是否回傳 | **是**，`GET /api/orders/track/:publicToken` 回傳 `trackingCode` |
| 後台 CSV 是否包含 | **是**，`POST /orders/shipping-list.csv` 包含「物流追蹤碼」欄位 |
| 後台 UI 是否顯示 | **是**，Orders.tsx 已顯示「物流追蹤碼」 |
| 列印版是否包含 | **是**，`printHelpers.ts` 已輸出追蹤碼欄位 |
| 是否有標準化 | **無**，目前為自由文字 |

### 混淆風險

**已發現具體混淆案例**：

`artifacts/shop-app/src/pages/TrackOrder.tsx` 第 185 行：
```tsx
{copied ? "已複製！" : "複製追蹤碼"}
```
該按鈕執行的是 `handleCopy(order.publicToken)`，即**複製的是 publicToken，不是 trackingCode**。

按鈕文字寫「追蹤碼」，但實際複製的是 publicToken（訂單查詢 token），不是物流追蹤碼。

此外，404 錯誤頁面（TrackOrder.tsx 第 62 行）顯示「請確認追蹤碼是否正確」，此處的「追蹤碼」指的是 publicToken。

**判斷**：目前前端 UX 將 publicToken 稱為「追蹤碼」（作為客人查詢訂單的入口碼），與 orders 表的 `trackingCode`（物流業者的追蹤碼）在用語上有潛在混淆。Step 7A 規格需明確定義兩者在 UI 上的顯示文字。

### Step 7A 建議區分方式

| 概念 | 建議 UI 文字 | 技術欄位 | 說明 |
|------|------------|---------|------|
| 訂單查詢入口 | 訂單查詢碼 / 訂單連結 | `publicToken` | 客人用於進入訂單查詢頁的 token |
| 物流追蹤碼 | 物流追蹤碼 | `trackingCode` | 物流業者（如黑貓、7-11）的包裹追蹤號碼 |

---

## 6. 公開查詢與個資保護現況

### 公開查詢 API

- 路由：`GET /api/orders/track/:publicToken`
- 位置：`artifacts/api-server/src/routes/public.ts:236`
- 不需要身份驗證（無 requireAuth middleware）
- 有 rate limiting（30 次 / 10 分鐘）

### 公開 API 已回傳欄位

| 欄位 | 公開 API 是否回傳 |
|------|----------------|
| `publicToken` | ✅ 回傳 |
| `productName` | ✅ 回傳 |
| `quantity` | ✅ 回傳 |
| `unitPrice` | ✅ 回傳 |
| `shippingFee` | ✅ 回傳 |
| `totalPrice` | ✅ 回傳 |
| `orderTotal` | ✅ 回傳（totalPrice + shippingFee） |
| `pickupMethod` | ✅ 回傳 |
| `specValues` | ✅ 回傳 |
| `status` | ✅ 回傳 |
| `statusLabel` | ✅ 回傳 |
| `shippingStatus` | ✅ 回傳 |
| `shippingStatusLabel` | ✅ 回傳 |
| `trackingCode` | ✅ 回傳（nullable） |
| `trackingProvider` | ✅ 回傳（nullable） |
| `createdAt` | ✅ 回傳 |

### 公開 API 已排除欄位（個資保護）

以下欄位在程式碼中有明確的 comment 標記（`// STRICTLY EXCLUDED`）：

| 欄位 | 是否排除 | 說明 |
|------|---------|------|
| `recipientPhone` | ✅ **已排除** | 收件電話，個資 |
| `recipientAddress` | ✅ **已排除** | 收件地址，個資 |
| `internalNote` | ✅ **已排除** | 內部備註，後台機密 |
| `paymentNote` | ✅ **已排除** | 付款備註，後台機密 |
| `paidAmount` | ✅ **已排除** | 財務資訊 |
| `shippingNote` | ✅ **已排除** | 物流備註 |
| `recipientName` | ✅ **已排除** | 個資 |
| `paymentMethod` | ✅ **已排除** | 財務資訊 |
| `paymentStatus` | ✅ **已排除** | 財務資訊 |
| `remainingAmount` | ✅ **已排除** | 財務資訊 |

### 個資保護測試

`artifacts/api-server/src/routes/orders.route.test.mjs`（Step 5C 測試，第 518 行起）已包含測試：
- `public tracking MUST NOT return internalNote`
- `public tracking MUST NOT return paymentNote`
- `public tracking MUST NOT return paidAmount`
- `public tracking MUST NOT return recipientPhone`

### Step 7A 貨態公開頁注意事項

1. `trackingCode` 和 `trackingProvider` **已在公開 API 回傳**，Step 7A 可直接使用。
2. 若新增貨態 history / timeline，公開頁只可顯示貨態事件，不可暴露收件人資訊。
3. `storeCode`（cvsStoreId）與 `storeName`（cvsStoreName）**目前未在公開 API 回傳**（`public.ts` 中無此兩欄位），若 Step 7A 需在貨態頁顯示門市資訊，需評估是否加入，並確認個資風險。
4. `shippingFee`、`orderTotal` 等金額欄位已在公開 API 回傳，但此為設計決策，Step 7A 若需修改需另行評估。

---

## 7. 出貨單 / CSV / 列印工具現況

### Step 5F 相關文件位置

| 文件 / 檔案 | 位置 |
|-----------|------|
| Step 5F 規格文件 | `docs/order-step5f-picking-shipping-export-spec.md` |
| 列印 HTML helper | `artifacts/shop-app/src/lib/printHelpers.ts` |
| 出貨單 CSV API | `POST /orders/shipping-list.csv`（`artifacts/api-server/src/routes/orders.ts:364`） |
| 撿貨單 API | `POST /orders/picking-list`（`artifacts/api-server/src/routes/orders.ts:96`） |
| 撿貨單 CSV API | `POST /orders/picking-list.csv`（`artifacts/api-server/src/routes/orders.ts:202`） |

### CSV 欄位現況（出貨單 CSV）

出貨單 CSV（`POST /orders/shipping-list.csv`）已包含以下欄位：

| CSV 欄位名稱 | 對應 DB 欄位 | 是否包含 |
|------------|-----------|---------|
| 訂單ID | id | ✅ |
| 訂單編號 | id（格式化） | ✅ |
| 訂單狀態 | status | ✅ |
| 買家姓名 | buyerName | ✅ |
| 買家電話 | buyerPhone | ✅ |
| 商品名稱 | productName | ✅ |
| 規格 | specValues | ✅ |
| 數量 | quantity | ✅ |
| 付款狀態 | paymentStatus | ✅ |
| 出貨狀態 | shippingStatus | ✅ |
| 物流方式 | shippingMethod | ✅ |
| **物流追蹤碼** | **trackingCode** | ✅ **已包含** |
| **物流商** | **trackingProvider** | ✅ **已包含** |
| 超商店號 | cvsStoreId | ✅ |
| 超商店名 | cvsStoreName | ✅ |
| 收件人 | recipientName | ✅ |
| 收件電話 | recipientPhone | ✅ |
| 收件地址 | recipientAddress | ✅ |
| 物流備註 | shippingNote | ✅ |
| 商品明細文字 | itemsText | ✅ |
| internalNote | internal_note | ❌ **已排除**（comment 標記） |
| paymentNote | payment_note | ❌ **已排除**（comment 標記） |

### 撿貨單 CSV 與 trackingCode 的關係

- 撿貨單（`POST /orders/picking-list`）依商品彙總訂單數量，**不包含 trackingCode**（撿貨時尚未出貨，無追蹤碼）。
- `trackingCode` 只在出貨單 / 出貨 CSV 中有意義。

### 列印工具現況（printHelpers.ts）

出貨單列印版已包含：
- 追蹤碼（`trackingCode`）
- 物流商（`trackingProvider`）
- 出貨狀態（`shippingStatus`）
- 物流方式（`shippingMethod`）
- 超商店號（`storeCode`）
- 超商店名（`storeName`）
- 收件電話（`recipientPhone`）
- 收件地址（`recipientAddress`）

### Step 7B 匯入物流號碼的參考

Step 7B（老闆匯入物流號碼）可參考現有 CSV 設計：
- 現有出貨 CSV 已有「物流追蹤碼」與「物流商」欄位，可作為**匯入格式的欄位對照基礎**。
- 若採 CSV 匯入，格式可與現有匯出 CSV 對應（同欄名、同編碼 UTF-8 BOM）。
- 現有 `PATCH /orders/:orderId` API 已支援更新 `trackingCode` 與 `trackingProvider`，可作為 Step 7B API 的基礎。

---

## 8. 7-11 / 全家 / FamilyMart 內容現況

### 搜尋結果整理

| 項目 | 現況 | 位置 |
|------|------|------|
| 7-11 / 711 相關內容 | **已找到** | Orders.tsx、PublicOrder.tsx、Cvs711Select.tsx、Cvs711Return.tsx、cvs.ts（API）、cvsStores.ts（DB schema） |
| FamilyMart / familymart 相關內容 | **已找到** | Orders.tsx、PublicOrder.tsx（familymart-logo-official.png）、cvs711 lib |
| 是否只是門市選擇 / shippingMethod | **是**，目前 7-11 / 全家只出現在取貨方式選擇與門市選擇流程中 | — |
| 是否已有貨態查詢 | **否**，目前無 7-11 / 全家貨態查詢功能 | — |
| 是否已有 provider 標準命名 | **部分**，`cvsStores.ts` 有 `provider` 欄位（`seven`、`family`、`ok`、`hilife`），但 `trackingProvider` 為自由文字，尚未標準化 | `lib/db/src/schema/cvsStores.ts` |

### 詳細說明

**7-11 現有功能**：
- 門市資料表（`cvs_stores`）已有 provider = `seven` 的記錄
- 門市選擇頁（Cvs711Select.tsx）：客人可選 7-11 門市
- 7-11 emap API（`POST /cvs/711/import-from-emap`）：可查詢 7-11 電子地圖取得門市資料
- Orders.tsx 後台已顯示 7-11 門市資訊（門市名稱、編號）

**FamilyMart 現有功能**：
- cvsStores table 有 provider = `family` 的設計
- PublicOrder.tsx 已顯示全家 logo（`familymart-logo-official.png`）
- FamilyMart 門市選擇流程存在

**明確結論**：7-11 / FamilyMart 目前**只有門市選擇功能**，**沒有物流貨態查詢功能**。

---

## 9. OpenClaw / E-Tracking 內容現況

### OpenClaw

| 項目 | 現況 |
|------|------|
| 是否有 OpenClaw 相關實作 | **否**，只在一個 code comment 中出現 |
| 出現位置 | `lib/db/src/schema/cvsStores.ts:17`：`// source: manual_seed | lemai_store_db | future_openclaw_update` |
| 說明 | 該 comment 記錄 `source` 欄位的可能值，`future_openclaw_update` 僅為**未來規劃的 comment 標記**，尚無任何實作 |
| 是否可在規格中寫為已完成 | **否** |

**結論**：OpenClaw 在本系統中**尚未實作**，僅為 cvsStores 的資料來源 source 欄位的一個 future 概念標記。Step 7A 規格若提到 OpenClaw，應標記為「研究 / 未來方向」，不可寫為已完成功能。

### E-Tracking

| 項目 | 現況 |
|------|------|
| 是否有 E-Tracking 相關內容 | **未找到**，grep 結果無任何命中 |
| 說明 | 整個 repo 中沒有任何 `E-Tracking`、`etracking`、`e_tracking` 相關內容 |
| 是否為已確認可商用核心依賴 | **否**，E-Tracking 目前不存在於系統中 |

**結論**：E-Tracking 在本系統中**完全不存在**。Step 7A 規格若提到 E-Tracking，應標記為「研究 / 評估中」，不可寫為已導入或確認可商用。

---

## 10. 貨態 history / timeline 資料結構現況

### 資料表搜尋結果

| 資料表 / 欄位 | 是否存在 | 說明 |
|-------------|---------|------|
| `shipment_trackings` | **未找到** | 無此資料表 |
| `shipment_tracking_events` | **未找到** | 無此資料表 |
| `latestTrackingStatus` | **未找到** | 無此欄位 |
| `failureCount` | **未找到** | 無此欄位 |
| `lastCheckedAt` | **未找到** | 無此欄位 |
| `checkError` | **未找到** | 無此欄位 |

### 目前已有的物流欄位（orders 表，單組最新狀態）

| 欄位 | 說明 |
|------|------|
| `shippingStatus` | 目前出貨狀態（enum，單一值） |
| `trackingCode` | 物流追蹤碼（最新，單一值） |
| `trackingProvider` | 物流商（自由文字，單一值） |
| `shippingNote` | 物流備註 |

### 結論

目前系統只有 `orders` 表上的一組最新物流欄位，**沒有 history / timeline 資料結構**。

- Step 7A（顯示貨態）：可直接使用現有的 `shippingStatus`、`trackingCode`、`trackingProvider` 欄位，不需新增資料模型。
- Step 7B（匯入物流號碼）：更新現有 `trackingCode`、`trackingProvider` 欄位，不需新增資料模型。
- Step 7C（自動貨態更新 / history）：**需新增資料模型**。目前沒有任何 timeline、history、failureCount、lastCheckedAt 等欄位，Step 7C 需從頭設計。

---

## 11. 對 Step 7A 規格文件的重點摘要

> 以下為 Claude A 可直接引用的現況結論。

### 已存在的欄位

- `publicToken`（DB + 公開 API + 前端）：訂單公開查詢入口
- `shippingStatus`（DB + 公開 API + 後台）：出貨狀態 enum（7 種值）
- `shippingStatusLabel`（公開 API）：shippingStatus 的中文顯示文字
- `trackingCode`（DB + 公開 API + CSV + 列印 + 後台）：物流追蹤碼
- `trackingProvider`（DB + 公開 API + CSV + 後台）：物流商名稱（自由文字）
- `storeCode`（DB 欄 cvsStoreId + 後台 API + CSV）：超商門市代碼
- `storeName`（DB 欄 cvsStoreName + 後台 API + CSV）：超商門市名稱
- 公開查詢 API（GET /api/orders/track/:publicToken）：已有 rate limiting，已排除個資

### 缺少的欄位 / 功能

- `trackingProvider` 尚未標準化為 enum，目前為自由文字
- `storeCode` / `storeName` 目前**未在公開 API 回傳**（public.ts 中無此兩欄）
- 無 `shipment_trackings` / `shipment_tracking_events` 資料表（Step 7C 需新增）
- 無 `latestTrackingStatus`、`failureCount`、`lastCheckedAt`、`checkError` 欄位（Step 7C 需評估）
- 無自動貨態查詢機制（OpenClaw / E-Tracking 均未實作）

### 已存在的功能

- 公開訂單查詢頁（TrackOrder.tsx）：已有前端頁面，顯示訂單進度與狀態
- 公開查詢 API：GET /api/orders/track/:publicToken（`artifacts/api-server/src/routes/public.ts:236`）
- 個資保護設計：internalNote / paymentNote / paidAmount / recipientPhone / recipientAddress 已被排除
- 個資保護測試：Step 5C 測試已覆蓋主要隱私欄位
- 後台手動更新 trackingCode / trackingProvider：PATCH /orders/:orderId 已支援
- 出貨 CSV 包含 trackingCode / trackingProvider

### 不可混淆的概念

| 概念 A | 概念 B | 差異 |
|--------|--------|------|
| `publicToken` | `trackingCode` | publicToken 是訂單查詢入口 token；trackingCode 是物流業者的包裹追蹤號碼 |
| `shippingMethod` | `trackingProvider` | shippingMethod 是配送方式 enum；trackingProvider 是物流商名稱 |
| `storeCode`（API） | `cvsStoreId`（DB） | 同一欄位，API 層重新命名 |
| `storeName`（API） | `cvsStoreName`（DB） | 同一欄位，API 層重新命名 |
| 7-11 門市選擇 | 7-11 貨態查詢 | 前者已實作；後者尚未存在 |

### 需要保守處理的個資

- `recipientPhone`：公開 API 已排除，維持現狀
- `recipientAddress`：公開 API 已排除，維持現狀
- `internalNote`：公開 API 已排除，維持現狀
- `paymentNote`：公開 API 已排除，維持現狀
- `paidAmount`：公開 API 已排除，維持現狀
- `storeCode` / `storeName`：目前未在公開 API 回傳，若 Step 7A 需加入需評估是否有個資風險（門市地址可間接推測收件地區）

### 後續建議

1. **Step 7A**（貨態顯示）：可直接用現有 `shippingStatus`、`trackingCode`、`trackingProvider` 欄位，不需新增 DB 欄位，重點在前端顯示邏輯優化。
2. **Step 7B**（匯入物流號碼）：需設計批次更新介面，API 基礎（PATCH /orders/:orderId）已存在，需補強 CSV import。
3. **TrackOrder.tsx 文字問題**：「複製追蹤碼」按鈕複製的是 `publicToken`，不是 `trackingCode`，應在 Step 7A 中釐清並更新 UI 文字。
4. **trackingProvider 標準化**：目前為自由文字，若後續要做自動查詢，需定義 provider enum（如 `seven_eleven_c2c`、`family_mart_c2c`、`black_cat`）。
5. **Step 7C 資料模型**：需從頭設計 history / timeline 資料結構，建議在 Step 7C 規格中明確定義資料表架構後再施工。

---

## 12. 風險與待確認

| 編號 | 風險 / 待確認 | 狀態 | 說明 |
|-----|------------|------|------|
| R1 | `trackingProvider` 尚無標準化 enum，若 Step 7C 需自動查詢，需先定義 provider 命名規範 | **確認為風險** | 目前欄位為自由文字（如「黑貓宅急便」），無法直接對應查詢 API |
| R2 | 無貨態 history / timeline 資料結構，Step 7C 需從頭新增資料模型 | **確認缺失** | `shipment_trackings`、`shipment_tracking_events`、`failureCount`、`lastCheckedAt` 均未存在 |
| R3 | `publicToken` 與 `trackingCode` 在 TrackOrder.tsx 的 UI 文字中存在混淆（「複製追蹤碼」複製的是 publicToken） | **確認為風險** | Step 7A 規格應明確定義各 token 的 UI 顯示文字 |
| R4 | 公開頁不可暴露 `recipientPhone`、`recipientAddress`、`internalNote`、`paymentNote`（目前已排除，需在 Step 7A 中維持不開放） | **已有保護，需維持** | 個資保護測試已覆蓋，Step 7A 新功能不得破壞此設計 |
| R5 | `paidAmount` 是否可公開需保守評估（目前已排除） | **已排除，建議維持** | 財務資訊應保持後台專用，不建議在 Step 7A 中開放 |
| R6 | 7-11 / FamilyMart 目前只有門市選擇功能，不代表已有貨態查詢能力 | **確認缺失** | Step 7A / 7B 規格不可預設已有物流查詢 API |
| R7 | E-Tracking 在本系統中完全不存在，若在規格中提及須標記為研究 / 評估中 | **確認未實作** | 不可寫為已導入或確認可商用 |
| R8 | OpenClaw 僅為 `cvsStores.ts` 的一行 comment，尚未有任何實作 | **確認未實作** | Step 7A 規格中提及 OpenClaw 應標記為未來方向，不可寫成已完成 |
| R9 | `storeCode`（cvsStoreId）與 `storeName`（cvsStoreName）目前未在公開 API 回傳，若 Step 7A 貨態頁需顯示取貨門市，需評估個資風險 | **尚未確認是否需開放** | 需產品決策 |
| R10 | 公開查詢 API 有 rate limiting（30 次 / 10 分鐘），Step 7C 自動輪詢若使用同一 endpoint 需另行設計 | **尚未確認** | 自動查詢應使用內部後台 API，不得使用公開查詢 endpoint |

---

*文件版本：Step 7A 現況欄位盤點 v1.0*
*盤點日期：2026-06-06*
*盤點執行：Claude B（Fixed Latest File Mode）*
*分支：docs/order-step6b-cvs-existing-implementation-audit*
