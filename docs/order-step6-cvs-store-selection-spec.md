# Order Step 6A：7-11 / 全家超商門市選擇正式化規格

> **本文件為規格文件（Step 6A）。**
> Step 6A 只做規格整理與現況盤點，不施工任何功能、不改 DB、不改 API、不改 UI。
> 所有實作計畫在後續 Step 6B 起按序推進。

---

## 目錄

1. [Step 6 目標](#1-step-6-目標)
2. [目前系統狀態](#2-目前系統狀態)
3. [既有欄位現況](#3-既有欄位現況)
4. [7-11 / 全家資料來源盤點](#4-7-11--全家資料來源盤點)
5. [MVP 範圍](#5-mvp-範圍)
6. [非目標](#6-非目標)
7. [買家端流程](#7-買家端流程)
8. [老闆後台流程](#8-老闆後台流程)
9. [API 規劃](#9-api-規劃)
10. [DB / Migration 可能性](#10-db--migration-可能性)
11. [UI 規劃](#11-ui-規劃)
12. [個資與安全](#12-個資與安全)
13. [測試計畫](#13-測試計畫)
14. [分階段建議](#14-分階段建議)
15. [待確認問題](#15-待確認問題)

---

## 1. Step 6 目標

### 為什麼要做超商門市選擇正式化

目前系統中，超商門市資訊可能透過多種途徑進入訂單：

- 老闆後台手動輸入店號 / 店名
- 買家透過現有選店頁面選擇（`/cvs/711/select`）
- 系統從 cvs_stores 搜尋後帶入

但整合程度尚未完整，存在以下問題：

1. **欄位映射不一致**：DB 欄位名稱（`cvsStoreId`）與 API 欄位名稱（`storeCode`）不同，容易混淆。
2. **provider 沒有獨立欄位**：目前 provider（`seven` / `family`）是從 `pickupMethod` 文字推導（例如「7-11 貨到付款」），沒有結構化欄位。
3. **後台選店器尚未整合**：現有 Orders 編輯流程尚未直接觸發選店器。
4. **買家端選店流程尚未完整**：`/cvs/711/select` 頁面存在，但買家下單流程中尚未完整串接。
5. **storeAddress 未完整對外暴露**：`cvsStoreAddress` 已在 DB，但 API 回傳尚未包含。

### Step 6 希望解決的問題

- 讓「超商店號 / 店名 / 地址」來源可驗證（來自 cvs_stores，不是純手填）。
- 降低老闆手動輸入錯誤的機率。
- 支援買家或老闆快速搜尋、點選門市。
- 明確記錄「誰選的門市」（`storeSelectedBy`）、「何時選的」（`storeSelectedAt`）。
- 為後續超商物流流程打基礎（Step 6 本身不是正式物流託運整合）。

### 明確聲明

**Step 6 不是正式超商物流託運整合。**
Step 6 的目標是門市資料可搜尋、可選擇、可驗證，並將選定門市資料寫入訂單。
正式的超商物流 API（電子託運單、物流狀態追蹤、取件通知）不在 Step 6 範圍內。

---

## 2. 目前系統狀態

> 注意：Step 6A 盤點後發現，目前實作程度遠比任務描述中預期的更完整。以下如實記錄。

### 已完成（Step 5 / Step 5F 含）

| 項目 | 狀態 |
|------|------|
| `orders` 表付款 / 物流欄位正式化 | ✅ 已完成（Step 5）|
| `orders` 表 CVS 欄位（`cvsStoreId` / `cvsStoreName` / `cvsStoreAddress` / `cvsStorePhone` / `storeSelectedBy` / `storeSelectedAt`）| ✅ 已存在 |
| 後台 API 可讀寫付款 / 物流欄位 | ✅ 已完成 |
| 後台 API 可讀寫 `storeCode` / `storeName`（映射自 `cvsStoreId` / `cvsStoreName`）| ✅ 已完成 |
| 撿貨單 / 出貨單 / CSV / 列印 | ✅ 已完成（Step 5F）|
| **`cvs_stores` table** | ✅ 已存在（含 `provider` / `storeId` / `storeName` / `storeAddress` / `city` / `district` 等）|
| **`GET /api/cvs/stores`** 搜尋 API | ✅ 已實作且上線 |
| **`GET /api/cvs/regions`** 地區 API | ✅ 已實作 |
| **`POST /api/cvs/orders/:orderId/select-store`** 選店寫入 API | ✅ 已實作 |
| **`/cvs/711/select`** 選店頁面 | ✅ 已存在（支援 seven / family）|
| **`/cvs/711/return`** 選店回傳頁 | ✅ 已存在 |
| `cvs711.ts` 工具函式（CvsStore 介面 / provider 推導 / localStorage / URL 解析）| ✅ 已存在 |
| Production DB 門市資料 | ✅ 7-11 active 7,386 筆、全家 active 4,492 筆（共 11,878 筆）|

### 已知缺口 / 尚未完整整合

| 項目 | 現況 | 說明 |
|------|------|------|
| Orders 後台編輯對話框觸發選店器 | ❓ 未確認完整整合 | `EditOrderDialog` 是否已有選店器入口待確認 |
| 買家下單流程選店 | ❓ 部分實作 | `/cvs/711/select` 頁存在，但下單完整流程待確認 |
| `cvsProvider` 獨立欄位 | ❌ 未存在 | 目前從 `pickupMethod` 文字推導（見第 3 節）|
| `storeAddress` 在訂單 API 回傳 | ⚠️ 部分 | `cvsStoreAddress` 已在 DB，但 API mapping 需確認是否對外 |
| `storePhone` 在公開頁面的個資保護 | ⚠️ 需確認 | 門市電話是否應出現在公開查詢 |
| 舊訂單（只有 `pickupMethod` 文字，無結構化 cvs 欄位）fallback | ❌ 未處理 | 升級前舊訂單缺 storeId / storeName 時的顯示策略 |
| 門市資料更新策略 | ❓ 待決定 | 目前為手動匯入，定期同步機制未定 |

---

## 3. 既有欄位現況

### orders 表 CVS 相關欄位

| DB 欄位 | API 欄位名 | 目前用途 | 問題 | Step 6 建議 |
|---------|-----------|----------|------|------------|
| `shippingMethod` | `shippingMethod` | enum：`convenience_store` / `self_pickup` / `home_delivery` / `other` | 僅區分「超商」，不區分 7-11 / 全家 | 保持現有 enum，provider 另外記錄 |
| `pickupMethod` | `pickupMethod` | 文字：「7-11 貨到付款」/ 「全家取貨（先付款）」等 | provider 從文字推導，非結構化欄位 | 考慮增加 `cvsProvider` 欄位做結構化 |
| `cvsStoreId` | `storeCode` | 超商店號（文字） | API 名稱（`storeCode`）與 DB 名稱（`cvsStoreId`）不同，易混淆 | 維持現有，文件化映射關係 |
| `cvsStoreName` | `storeName` | 超商店名（文字） | 同上，名稱不一致 | 維持現有，文件化映射關係 |
| `cvsStoreAddress` | 未確認是否對外 | 超商地址（文字） | 已在 DB，但 API 是否回傳需確認 | 後續加入 API 回傳 |
| `cvsStorePhone` | 未確認是否對外 | 超商電話（文字） | 門市電話通常是公開資訊，但需確認對外政策 | 評估是否對外，注意不要與收件人電話混淆 |
| `storeSelectedBy` | 未確認是否對外 | `'customer'` / `'admin'` / `'system'` | 記錄誰選了門市 | 僅後台可見 |
| `storeSelectedAt` | 未確認是否對外 | 選店時間戳記 | 記錄何時選門市 | 僅後台可見 |
| `trackingCode` | `trackingCode` | 物流追蹤碼 | 不可與 `publicToken` 混淆 | 保持物流追蹤用途 |
| `publicToken` | `publicToken` | 公開查詢 token | 不可與 `trackingCode` 混淆 | 不應出現在出貨單 / CSV 不必要位置 |

> **待確認**：`cvsStoreAddress` 和 `cvsStorePhone` 是否已在後台 API 回傳？是否應加入公開查詢回傳？

### cvs_stores 表現有欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | serial | PK |
| `provider` | text | `"seven"` \| `"family"` |
| `storeId` | text | 門市店號（provider + storeId 唯一） |
| `storeName` | text | 門市名稱 |
| `storeAddress` | text | 門市地址 |
| `storePhone` | text / null | 門市電話 |
| `city` | text / null | 縣市 |
| `district` | text / null | 行政區 |
| `latitude` | numeric / null | 緯度 |
| `longitude` | numeric / null | 經度 |
| `businessHours` | text / null | 營業時間（非即時） |
| `deliveryStatus` | text / null | 配送狀態說明（非即時） |
| `isActive` | boolean | 是否有效門市 |
| `source` | text | 資料來源（`emap_district_batch` / `family_official_map` / `manual_seed` 等）|
| `sourceUpdatedAt` | timestamp | 資料來源更新時間 |
| `createdAt` | timestamp | 建立時間 |
| `updatedAt` | timestamp | 更新時間 |

### cvs_stores 現有資料量（2026-06-06 同步後）

| provider | is_active | 數量 |
|----------|-----------|------|
| seven | true | 7,386 |
| seven | false | 4 |
| family | true | 4,492 |
| family | false | 2,509 |

---

## 4. 7-11 / 全家資料來源盤點

### 7-11（統一超商）

**目前資料來源：**

- `emap_district_batch`：從 7-11 電子地圖（emap.pcsc.com.tw）批次匯入，共 7,347 筆 active
- `manual_seed`：手動種入，2 筆
- `twcoupon_emap_verified`：TW Coupon 來源驗證後 1 筆
- `twcoupon_unverified`：TW Coupon 未驗證 36 筆
- 內建 `POST /cvs/711/import-from-emap` API：可查詢 7-11 EmapSDK 補充單筆門市

**現有 API 呼叫方式（內部 import 用）：**

```
POST https://emap.pcsc.com.tw/EmapSDK.aspx
```

**風險：**

- 上述網址為非官方 SDK 端點，不是穩定 API，可能隨時下線或改版
- 門市資料可能隨時異動（關店 / 遷址 / 改名）
- 爬取行為需確認法律合規性
- `businessHours` / `deliveryStatus` 非即時，不應承諾準確性
- 批次匯入時間點（`sourceUpdatedAt`）是資料更新的唯一依據

### 全家（FamilyMart）

**目前資料來源：**

- `family_official_map`：從全家官方地圖 API 匯入，共 4,492 筆 active
- 2,509 筆 inactive（舊資料 / 已關店）

**風險：**

- 官方地圖 API 格式可能變動
- 門市資料需定期更新
- 不應承諾即時營業狀態 / 庫存

### MVP 資料策略選項

| 選項 | 做法 | 優點 | 缺點 | 建議 |
|------|------|------|------|------|
| **A（現有）** | 維持現有批次匯入 + 手動補充 | 最可控，已有 11,878 筆資料，無需立即施工 | 資料可能過期，無自動更新 | **目前已採用，繼續評估更新頻率** |
| **B** | 設定定期同步排程（cron / 手動觸發）| 資料較新鮮 | 需確認來源穩定性與合規性 | Step 6B 評估 |
| **C** | 串接穩定、合規的資料 API | 使用體驗最好 | 需確認合法性、穩定性、成本 | 後續長期研究 |
| **D** | 爬官方頁面自動化 | 資料即時 | 法規 / 穩定 / 維護風險極高 | **Step 6A 不建議施工** |

---

## 5. MVP 範圍

Step 6 MVP 建議聚焦於以下範圍：

**支援 provider：**

- 7-11（`seven`）：已有 7,386 筆資料
- 全家（`family`）：已有 4,492 筆資料
- 其他超商（OK / 萊爾富）延後

**搜尋功能（已實作）：**

- 門市店號（`storeId`）
- 門市名稱（`storeName`）
- 地址（`storeAddress`）
- 縣市（`city`）
- 行政區（`district`）

**選定門市後帶入欄位（目標）：**

| 欄位 | 說明 |
|------|------|
| `cvsStoreId` / API `storeCode` | 門市店號 |
| `cvsStoreName` / API `storeName` | 門市名稱 |
| `cvsStoreAddress` | 門市地址 |
| `cvsStorePhone` | 門市電話（選填）|
| provider（待評估欄位）| 記錄 `seven` / `family` |
| `storeSelectedBy` | `'customer'` / `'admin'` |
| `storeSelectedAt` | 選店時間戳記 |

**明確不承諾：**

- 即時營業時間正確性
- 即時庫存或取件狀態
- 門市資料零異動保證

**明確不做（MVP 範圍外）：**

- 正式超商物流託運（電子託運單 / 物流追蹤）
- server-side PDF
- 修改 Step 5 / Step 5F 已完成流程

---

## 6. 非目標

以下項目明確**不在 Step 6A 範圍**：

- ❌ Step 6A 不實作新 API（現有 API 已足夠，後續確認是否補強）
- ❌ Step 6A 不改 DB schema
- ❌ Step 6A 不改任何 UI
- ❌ Step 6A 不爬門市資料
- ❌ Step 6A 不串正式超商物流（電子託運單 / 退貨單 / 物流追蹤）
- ❌ Step 6A 不承諾門市資料即時準確
- ❌ Step 6A 不支援 7-11 / 全家以外超商
- ❌ Step 6A 不重構 Step 5 付款 / 物流流程
- ❌ Step 6A 不處理客服 SOP

---

## 7. 買家端流程

### 現有流程（已部分實作）

```
買家進入訂單頁面
→ 選擇取件方式（7-11 / 全家相關方法）
→ 觸發 openCvsStoreMap()
→ 跳轉 /cvs/711/select?provider=seven&returnTo=...
→ 搜尋門市（GET /api/cvs/stores）
→ 點選門市
→ POST /api/cvs/orders/:orderId/select-store
→ 跳轉回來源頁
```

### 完整目標流程

```
1. 買家下單 → 選擇配送方式：超商取貨
2. 選擇 provider：7-11 / 全家
3. 進入選店頁（/cvs/711/select?provider=seven|family）
4. 搜尋門市（關鍵字 / 城市 / 區域）
5. 選定門市 → 系統帶入店號 / 店名 / 地址
6. 買家確認訂單資訊
7. 完成下單
8. 後台可查看門市資訊 / 必要時修改
```

### MVP 延後建議

買家端完整選店流程可延後到 **Step 6E**。
Step 6C / 6D 優先讓老闆後台選店，降低風險、縮小測試範圍。

**理由：**

- 買家端涉及手機 UX / 連線不穩 / 各種瀏覽器相容性
- 後台選店風險較低（登入用戶、環境可控）
- 可先在後台驗證選店流程的正確性，再推給買家端

---

## 8. 老闆後台流程

### 目標流程（Step 6D 實作）

```
1. 老闆進入 Orders 頁
2. 展開或點擊編輯單筆訂單
3. 在物流資訊欄位中：
   a. shippingMethod 選擇 convenience_store
   b. 顯示 provider 選擇器：7-11 / 全家
   c. 出現「選擇門市」按鈕
4. 點擊「選擇門市」
5. 跳轉 /cvs/711/select?provider=seven&source=admin&orderId=...
6. 搜尋門市（輸入關鍵字或直覽）
7. 點選門市卡片
8. 系統自動帶入：
   - storeCode（cvsStoreId）
   - storeName（cvsStoreName）
   - storeAddress（cvsStoreAddress）
   - provider
9. 跳轉回 EditOrderDialog
10. 確認儲存訂單
11. 出貨單 / CSV 顯示對應門市資料
```

### 錯誤狀態

| 狀態 | 處理方式 |
|------|---------|
| 找不到門市 | 顯示「查無結果，請嘗試其他關鍵字」；允許手動輸入 fallback |
| provider 未選 | 禁止進入搜尋；提示「請先選擇超商」|
| 店號與店名不一致 | 顯示警告，仍允許儲存（老闆知情）|
| 舊訂單只有 storeCode / storeName 無 provider | 顯示現有資料，允許老闆選店補齊 |
| 門市資料過期 | 標示 `sourceUpdatedAt` 以提示資料更新時間 |
| 使用者手動覆寫 | 允許，但標記 `storeSelectedBy: 'admin'` 以區別 |
| API 錯誤 | 顯示「門市搜尋暫時無法使用，請稍後再試」|

---

## 9. API 規劃

> Step 6A 只規劃，不實作新 API。以下現有 API 已滿足基本需求，需評估是否補強。

### 現有 API（已實作）

```
GET  /api/cvs/stores
     ?provider=seven|family
     &q=<關鍵字>
     &city=<縣市>
     &district=<行政區>
     &limit=<1-50>

GET  /api/cvs/regions
     ?provider=seven|family

POST /api/cvs/orders/:orderId/select-store
     body: { cvsStoreId, cvsStoreName?, ... }
```

### 現有 stores 回傳格式

```json
{
  "stores": [
    {
      "provider": "seven",
      "storeId": "123456",
      "storeName": "範例門市",
      "storeAddress": "台北市信義區...",
      "storePhone": "(02)xxxx-xxxx",
      "city": "台北市",
      "district": "信義區",
      "businessHours": "07:00~23:00",
      "deliveryStatus": "正常配送",
      "sourceUpdatedAt": "2026-06-03T15:22:21.588Z"
    }
  ]
}
```

### 後續可能補強項目（Step 6C 評估）

| 補強項目 | 說明 |
|---------|------|
| `GET /api/cvs/stores/:id` | 依門市 ID 查詢單筆（目前只有列表搜尋）|
| 回傳 `dataAge` 欄位 | 標示資料新鮮度，提示距上次更新的天數 |
| 新增 `source` 欄位到回傳 | 讓前端知道資料來源 |

### 安全限制

- 門市 API 只回傳門市公開資料，不可混入訂單個資
- 不回傳 `publicToken` / `paymentNote` / `internalNote` / `paidAmount`
- 不回傳收件人姓名 / 電話 / 地址（與門市聯絡電話不同）
- `businessHours` / `deliveryStatus` 需標示非即時資料

---

## 10. DB / Migration 可能性

> Step 6A 只規劃，不實作 DB 變更。

### 方案 A：只補強 orders 欄位

**可能新增欄位：**

```sql
-- 考慮新增，但需評估是否已足夠
cvsProvider  text  -- 'seven' | 'family'（避免從 pickupMethod 推導）
```

**優點：**

- 改動最小
- 相容現有流程
- `cvs_stores` table 已足夠支援搜尋

**缺點：**

- 若 `cvsProvider` 不補，provider 仍從 `pickupMethod` 文字推導

**現況評估：**

`pickupMethod` 目前使用 `"7-11 貨到付款"` / `"全家取貨（先付款）"` 等文字，已有 `getPickupProvider()` 函式可推導。
是否需要新增獨立欄位，取決於後續是否要做更嚴格的結構化查詢。

### 方案 B：cvs_stores table（已存在）+ 補強 orders 關聯

`cvs_stores` table 已存在且有資料，不需重建。
後續可考慮在 orders 加入外鍵關聯（`cvsStores.id`），作為 snapshot 的來源追蹤。

```sql
-- 考慮新增（評估中）
cvsStoreRef  integer  -- FK to cvs_stores.id（可 nullable，保持彈性）
```

**優點：**

- 可追蹤門市資料來源
- 門市異動後可比對 snapshot

**缺點：**

- 需要 migration
- 需處理舊訂單無對應 cvs_stores 記錄的情況

### 重要原則

**orders 應保留門市 snapshot：**

無論是否有外鍵，`orders` 表的 `cvsStoreId` / `cvsStoreName` / `cvsStoreAddress` 欄位應視為**下單當下的 snapshot**。
即使 `cvs_stores` 的門市資料之後異動（改名 / 關店），舊訂單顯示的門市資訊不應被覆蓋。

---

## 11. UI 規劃

> Step 6A 只規劃，不實作 UI。

### 現有前端（已存在）

| 元件 / 頁面 | 路徑 | 說明 |
|------------|------|------|
| 選店頁面 | `/cvs/711/select` | 支援 seven / family，含搜尋 input 和結果列表 |
| 回傳頁面 | `/cvs/711/return` | 接收選店結果 |
| 工具函式 | `cvs711.ts` | openCvsStoreMap / saveCvsStore / loadCvsStore 等 |

### 後台 Orders EditOrderDialog 選店器（Step 6D 規劃）

**provider 選擇器：**

```
[ 7-11 ]  [ 全家 ]
```

**搜尋列：**

```
[搜尋門市名稱、店號或地址____________________] [搜尋]
```

**地區篩選（可延後）：**

```
縣市：[台北市 ▼]  區域：[信義區 ▼]
```

**搜尋結果列表：**

```
╔══════════════════════════════════════╗
║  7-11  信義微風門市                    ║
║  店號：256123                         ║
║  台北市信義區松仁路100號                ║
║  07:00~23:00                         ║
║                          [選擇此門市] ║
╚══════════════════════════════════════╝
```

**選定後帶入欄位（自動）：**

- `storeCode`（顯示用：超商店號）
- `storeName`（顯示用：超商店名）
- `storeAddress`（顯示用：超商地址）
- `provider`（系統記錄，不一定顯示）

**保留手動輸入 fallback：**

- 允許老闆直接輸入 storeCode / storeName
- 手動輸入時標示「未從門市搜尋器帶入，請確認資料正確性」

**手機版要求（買家端 Step 6E）：**

- 搜尋欄固定在上方
- 結果以大型卡片顯示
- 每張卡片的「選擇」按鈕要夠大（至少 44px 高）
- 清楚的確認 / 取消按鈕
- 可返回（不強制選擇）

**空狀態定義：**

| 狀態 | 顯示文字 |
|------|---------|
| 尚未搜尋 | 「輸入店名、店號或地址，找到你的超商門市」|
| 查無結果 | 「找不到符合的門市，請嘗試其他關鍵字」|
| provider 未選 | 「請先選擇 7-11 或全家」|
| 載入中 | spinner / skeleton |
| 載入失敗 | 「門市搜尋暫時無法使用，請稍後再試」|

---

## 12. 個資與安全

### 門市資料 vs 訂單個資

| 資料類型 | 性質 | 應對外公開 |
|---------|------|-----------|
| 門市店號 / 店名 / 地址 / 電話 | 公開商業資訊 | ✅ 可 |
| 收件人姓名 / 電話 / 地址 | 訂單個資 | ❌ 不可 |
| `publicToken` | 查詢令牌 | ❌ 不應出現在 CSV / 出貨單不必要位置 |
| `internalNote` / `paymentNote` | 內部備註 | ❌ 不可公開 |
| `paidAmount` | 付款金額 | ❌ 不可公開 |
| `storeSelectedBy` / `storeSelectedAt` | 操作記錄 | ❌ 僅後台 |

### 公開查詢頁（買家追蹤）

- 不應暴露：`recipientPhone` / `recipientAddress` / `internalNote` / `paymentNote` / `paidAmount`
- 門市地址（`cvsStoreAddress`）是否對外：**待確認**（門市地址是公開資訊，但需確認是否有商業考量）

### 出貨 CSV 安全

- 出貨 CSV 是後台內部使用，可包含必要收件資料
- 但仍需避免 `publicToken` / `internalNote` / `paymentNote` 不必要出現
- 維持 UTF-8 BOM 輸出（避免 Excel 亂碼）
- 所有欄位需 escape 逗號 / 換行（CSV injection 防護）

### 輸入驗證

- 若支援手動輸入門市資料，需防止 XSS（前端 escape）
- `storeCode` / `storeName` 長度限制
- CSV export 欄位 escape 規則維持現有標準

### 門市 API 一致性

- `provider` 欄位必須明確（`"seven"` 或 `"family"`），不允許模糊值
- `provider + storeId` 組合唯一性保護（已在 cvs_stores 有 unique constraint）
- 不同 provider 的 storeId 不得混淆（7-11 店號可能與全家店號重複）

---

## 13. 測試計畫

> **本文件為規格文件，以下測試尚未執行。**
> 所有測試項目為後續 Step 6C / 6D / 6E / 6F 的規劃，非已通過結果。

### API 測試（Step 6C 後執行）

| 測試項目 | 說明 |
|---------|------|
| `provider=seven` 可搜尋 | 確認 seven 門市可查詢 |
| `provider=family` 可搜尋 | 確認 family 門市可查詢 |
| keyword 可搜尋店號 | 輸入數字店號可找到對應門市 |
| keyword 可搜尋店名 | 輸入中文店名可找到門市 |
| keyword 可搜尋地址 | 輸入地址關鍵字可找到門市 |
| city / district filter | 地區篩選正確 |
| 不支援的 provider | 應回 400 或空結果，不應崩潰 |
| 門市 API 不回傳訂單個資 | 確認 response 不含 buyerPhone / recipientAddress 等 |
| 搜尋結果 limit 上限 | 確認最多 50 筆 |
| 空白 keyword | 應回傳預設結果（依 sourceUpdatedAt 排序）|

### UI 測試（Step 6D / 6E 後執行）

| 測試項目 | 說明 |
|---------|------|
| 後台可搜尋門市 | 輸入關鍵字有結果 |
| 點選門市後欄位自動帶入 | storeCode / storeName / storeAddress 正確帶入 |
| 可取消選店 | 取消後欄位不變 |
| 查無結果顯示空狀態 | 顯示正確提示 |
| API 錯誤顯示錯誤狀態 | 不閃退 |
| 手機版可操作 | 單手操作可完成選店 |
| 舊訂單仍可編輯 | 缺 cvsStoreId 的舊訂單不崩潰 |
| provider 未選時禁止搜尋 | 提示選擇 provider |

### 回歸測試（Step 6D / 6E 後執行）

| 測試項目 | 說明 |
|---------|------|
| Step 5 付款 / 物流欄位仍可儲存 | 現有付款流程不壞 |
| Step 5E 批次付款 / 批次出貨不壞 | 批次操作不受影響 |
| Step 5F 撿貨單 / 出貨單 / CSV / 列印不壞 | 現有匯出功能不壞 |
| cancelled 訂單排除邏輯不壞 | 取消訂單邏輯不受影響 |
| public tracking 不洩漏個資 | 公開查詢頁不含個資 |

### 資料一致性測試（Step 6C 後執行）

| 測試項目 | 說明 |
|---------|------|
| provider + storeId 唯一性 | 確認 unique constraint 有效 |
| 不同 provider 同店號不混淆 | 7-11 與全家店號分開 |
| 舊訂單缺 provider 時的 fallback 顯示 | 不崩潰，顯示現有文字資料 |
| 門市資料更新後舊訂單不被覆蓋 | snapshot 獨立於 cvs_stores |

---

## 14. 分階段建議

### Step 6A：規格文件（本次完成）

- 盤點現有欄位、資料、API、UI
- 整理問題與缺口
- 不施工任何功能

### Step 6B：資料來源確認 / 更新策略

建議確認項目：

- 7-11 emap / 全家官方 API 合規性
- 現有 11,878 筆資料的維護策略（多久更新一次）
- 是否需要定期 sync 工具（已有 `sync-cvs-stores-to-prod.mjs`）
- 是否需要門市停用 / 下架機制

### Step 6C：門市搜尋 API 確認與補強

- 確認現有 `GET /api/cvs/stores` 是否已足夠
- 評估是否需要 `/api/cvs/stores/:id`
- 確認回傳欄位是否需補強（`storeAddress` 是否已在回傳中？）
- 執行 API 測試
- 確認個資保護規則

### Step 6D：後台選店器整合

- 在 `EditOrderDialog` 中整合選店流程
- provider 選擇器（7-11 / 全家）
- 選定門市後自動帶入欄位
- 處理舊訂單相容
- 手動輸入 fallback
- 執行後台 UI 測試 + 回歸測試

### Step 6E：買家端選店整合

- 買家下單流程中串接 `/cvs/711/select`
- 手機版 UX 優化
- 完整流程測試（不同瀏覽器 / 裝置）
- 確認 storeSelectedBy = 'customer' 正確記錄

### Step 6F：QA / Release Checklist

- 建立 release checklist
- 完成 API / UI / 回歸 / 資安 / 個資測試
- 確認 Production DB 資料同步正確
- 不在沒有測試證據時宣稱 ready

---

## 15. 待確認問題

> 以下問題需店家或技術團隊確認後，才能推進後續 Step。

| # | 問題 | 影響範圍 |
|---|------|---------|
| 1 | 7-11 / 全家的門市資料要採用哪種更新策略？多久更新一次？ | Step 6B |
| 2 | 現有 emap 批次匯入方式是否符合使用條款？ | Step 6B / 合規 |
| 3 | orders 是否需要新增 `cvsProvider` 獨立欄位（避免從 pickupMethod 文字推導）？ | Step 6C / DB |
| 4 | `cvsStoreAddress` 是否已在後台 API 回傳？是否應加入？ | Step 6C / API |
| 5 | 門市地址（`cvsStoreAddress`）是否應出現在公開買家查詢頁？ | Step 6C / 個資 |
| 6 | 門市電話（`cvsStorePhone`）是否應出現在公開查詢或出貨單中？ | Step 6C / 個資 |
| 7 | 舊訂單只有 `pickupMethod` 文字（如「7-11 貨到付款」），無 `cvsStoreId` 時，後台應如何顯示？ | Step 6D / 相容性 |
| 8 | 買家端選店是否在 MVP 內，還是先做後台選店（Step 6D）再推給買家（Step 6E）？ | 優先順序 |
| 9 | 是否允許老闆手動輸入門市（不透過搜尋器）？ | Step 6D / UI |
| 10 | 出貨單 / CSV 是否要顯示 `storeAddress`？ | Step 6D / Step 5F 回歸 |
| 11 | `publicToken` 是否可能出現在出貨單 / CSV 中？若有需確認是否移除 | 資安 / 現有流程 |
| 12 | 7-11 / 全家以外超商（OK / 萊爾富）何時納入支援？ | 路線圖 |
| 13 | 是否需要門市停用 / 下架機制（`isActive=false` 後現有訂單如何顯示）？ | Step 6B / DB |
| 14 | 是否需要匯入工具 UI，還是只維持 script 層操作？ | Step 6B / 工具 |
| 15 | 是否有法務 / 條款限制不能自動爬取官方門市頁面？ | 合規 / Step 6B |
| 16 | 是否需要客服 SOP，告知買家門市資料可能有異動？ | 客服流程 |
| 17 | `storeSelectedBy` / `storeSelectedAt` 是否需要在後台 UI 顯示？ | Step 6D / UX |
| 18 | 是否需要限制某些 provider 的門市才可選（例如只允許有 `deliveryStatus=正常配送` 的門市）？ | Step 6C / 業務邏輯 |

---

*文件版本：Step 6A 初稿*
*建立日期：2026-06-06*
*狀態：規格文件，等待確認後進入 Step 6B*
