# Order Step 7B：物流號碼匯入與 trackingProvider 標準化規格

> **版本**：Step 7B Spec v1.0｜分支：`feat/step6d-edit-order-cvs-store-picker`
> **現況依據**：`docs/order-step7-current-field-audit.md`（commit 8794d8c）、`docs/order-step7-customer-shipment-status-spec.md`（commit bd75161）
> **本文件為規格文件，不含施工實作。**
> 文件語言：繁體中文。
>
> **重要聲明**：本規格不承諾貨態即時或百分百準確。物流號碼由店家手動提供，匯入後的貨態資訊可能有延遲或不完整。

---

## 1. Step 7B 定位

### 本文件聲明

- **本文件只做規格定義。不施工 API / DB / UI。**
- 所有 API / DB / UI 描述均為規劃草案，待施工時需在對應任務中實作。
- Step 7B 的施工需在本規格確認後單獨執行。

### Step 7B 是什麼

Step 7B 是「老闆匯入物流號碼」功能，讓店家在出貨後可以將 trackingCode 與 trackingProvider 批次寫入系統，讓客人在公開查詢頁看到物流資訊。

### Step 7B 不是什麼

| 不包含              | 說明                                             |
| ------------------- | ------------------------------------------------ |
| 自動貨態查詢        | Step 7D 以後，需先完成 Step 7C 資料模型          |
| OpenClaw 整合       | OpenClaw 尚未實作，只是 comment 標記             |
| E-Tracking 導入     | E-Tracking 完全不存在於系統，未確認可商用        |
| 即時貨態保證        | 本規格不承諾任何貨態即時性                       |
| 第三方物流 API 串接 | 本步驟只做「店家手動填入 / CSV 批次匯入」        |
| 公開查詢 API 修改   | 公開 API 在 Step 7A 已完備，Step 7B 不修改       |
| 公開查詢頁 UI 修改  | TrackOrder.tsx 在 Step 7A 已完成，Step 7B 不修改 |

---

## 2. Step 7B 目標

### 核心目標

| 目標                      | 說明                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| 批次匯入 trackingCode     | 老闆出貨後可透過 CSV 批次填入物流號碼，不需逐筆手動操作              |
| 批次匯入 trackingProvider | 每筆物流號碼需對應一個標準化的物流商代碼                             |
| trackingProvider 標準化   | 將自由文字改為 enum，避免後續 Step 7D 自動查詢時無法對應物流業者 API |
| 單筆後台輸入介面          | 提供後台單筆訂單的 trackingCode / trackingProvider 輸入欄位          |
| 錯誤回報                  | 匯入失敗的列需有明確錯誤原因，讓店家修正後重試                       |

### 業務流程價值

老闆目前出貨後需逐筆在後台手動更新 trackingCode，效率低。若一次出貨 30 筆，逐筆操作耗時且易出錯。Step 7B 讓老闆可在物流系統取得追蹤碼後，整理為 CSV 一次上傳，系統批次更新訂單。

---

## 3. 與 Step 7A 的關係

### 銜接關係

| 項目                    | Step 7A                                                   | Step 7B                |
| ----------------------- | --------------------------------------------------------- | ---------------------- |
| 工作                    | 前端顯示 trackingCode / trackingProvider / shippingStatus | 讓店家批次填入這些欄位 |
| 公開查詢 API            | 已完備（已回傳上述三個欄位）                              | 不修改                 |
| 公開查詢頁              | 已能顯示（TrackOrder.tsx 已完成）                         | 不修改                 |
| DB 欄位                 | 使用現有 trackingCode / trackingProvider                  | 同左，不需新增         |
| trackingProvider 標準化 | 建議但未施工                                              | **本步驟完成**         |

### Step 7A 已完成的前提

- `GET /api/orders/track/:publicToken` 已回傳 `trackingCode`、`trackingProvider`、`shippingStatus`、`shippingStatusLabel`
- `artifacts/shop-app/src/pages/TrackOrder.tsx` 已能顯示物流資訊卡片（commit c7958a0）
- 公開查詢頁個資保護完備（recipientPhone / recipientAddress / internalNote / paymentNote 均已排除）

---

## 4. trackingProvider 標準化規格

### 4.1 現況問題

目前 `trackingProvider` 欄位（DB：`tracking_provider`）為自由文字（text nullable），沒有 enum 限制。現有 DB 中已有的測試資料如 `"7-11"`（自由填入），與任何 enum 標準不一致。若 Step 7D 要自動查詢貨態，無法用自由文字對應物流業者 API。

### 4.2 初版 provider code 規格

| provider code   | 顯示名稱    | 用途說明             | Step 7D 是否可自動查詢 | 備註                                    |
| --------------- | ----------- | -------------------- | ---------------------- | --------------------------------------- |
| `711`           | 7-11 交貨便 | 7-11 超商取貨物流    | 待研究                 | 需確認 7-11 C2C 查詢 API 來源與商用條款 |
| `familymart`    | 全家 B2C    | 全家超商取貨物流     | 待研究                 | 需確認全家查詢 API 來源與商用條款       |
| `home_delivery` | 宅配        | 黑貓、新竹等宅配物流 | 暫不處理               | 宅配業者 API 各異，Step 7D 再評估       |
| `other`         | 其他        | 無法分類或特殊物流   | 不自動查詢             | 需人工處理，可在備註欄補充說明          |

### 4.3 provider code 命名規則

- 儲存值：英文小寫 + 底線 + 數字，如 `711`、`familymart`、`home_delivery`、`other`
- 顯示名稱：繁體中文，如「7-11 交貨便」、「全家 B2C」
- UI 下拉選單顯示中文名稱，API 傳入 provider code
- 不支援的 code 視為驗證錯誤，不得寫入 DB

### 4.4 與其他欄位的區分（嚴格執行）

| 概念                | 欄位                                           | 說明                                                                                                       |
| ------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 物流查詢來源        | `trackingProvider`                             | **本規格的標準化對象**，代表哪家物流業者持有這個 trackingCode                                              |
| 配送方式            | `shippingMethod`                               | enum（self_pickup / convenience_store / home_delivery / other），代表配送類型，**不等於** trackingProvider |
| 超商門市代碼        | `cvsStoreId`（DB）/ `storeCode`（API）         | 門市識別碼，**不是** trackingCode，**不是** trackingProvider                                               |
| 超商門市名稱        | `cvsStoreName`（DB）/ `storeName`（API）       | 門市名稱，**不是** trackingProvider                                                                        |
| CVS stores provider | `cvsStores.provider`（seven/family/ok/hilife） | 門市資料表的物流商代碼，**與 trackingProvider 分開**，不可混用                                             |

> **重要**：`cvsStores` 表的 `provider` 欄（seven / family / ok / hilife）代表門市所屬物流商，是門市選擇流程用的欄位，與訂單的 `trackingProvider` 是不同概念，不可直接沿用其命名。

### 4.5 trackingProvider 標準化的 migration 評估

- **方案 A（保守）**：維持 text nullable，在 API 層做 allowlist 驗證，不改 DB schema。優點：不需 migration，不破壞現有資料。
- **方案 B（嚴格）**：在 DB 層新增 check constraint 或 enum，需 migration。優點：資料層保證一致性。

**建議方案 A 優先**：Step 7B 施工時先做 API 驗證，現有自由文字資料不強制轉換。若後來確認 provider 清單穩定，再評估是否補 migration。

---

## 5. CSV 匯入格式

### 5.1 匹配 key 選擇建議

**建議使用 `orderId`（純數字）**，理由：

- 對應 DB 的 `orders.id`（primary key），查詢最直接
- 無需字串解析（`orderNumber` 格式為 `#123`，需去掉 `#`）
- 不易混淆，程式處理明確

**同時支援 `orderNumber`（`#123` 格式）**，理由：

- 現有出貨 CSV 匯出的「訂單編號」即為此格式
- 讓老闆可直接在匯出 CSV 基礎上新增追蹤碼欄位，再匯回

API 解析邏輯：若欄位為純數字 → 當 orderId；若為 `#` 開頭數字 → 去掉 `#` 當 orderId。

### 5.2 必要欄位

| 欄位名                     | 型別 | 說明                                                                    |
| -------------------------- | ---- | ----------------------------------------------------------------------- |
| `orderId` 或 `orderNumber` | 字串 | 訂單識別碼，擇一提供（不可兩欄位同時出現不一致值）                      |
| `trackingProvider`         | 字串 | provider code，需在允許清單（711 / familymart / home_delivery / other） |
| `trackingCode`             | 字串 | 物流追蹤碼，不可空白                                                    |

### 5.3 建議欄位（選用）

| 欄位名      | 型別                               | 說明                                      |
| ----------- | ---------------------------------- | ----------------------------------------- |
| `note`      | 字串                               | 備註，匯入時不寫入 DB，只用於人工閱讀     |
| `shippedAt` | 日期字串（ISO 8601 或 YYYY-MM-DD） | 出貨日期，暫不寫入 DB（Step 7C 後可評估） |

### 5.4 CSV 格式規則

- 編碼：**UTF-8**（不加 BOM，或加 BOM 均可接受，API 需能處理兩種情況）
- 第一列必須為 header 列
- 空白需 trim（欄位前後空格自動去除）
- 每列的欄位數必須與 header 一致
- 不接受合併儲存格或多 sheet（CSV 無此問題，防範 Excel 匯出時的格式問題）
- 最大檔案大小：待確認（建議初版設 500KB 或 1000 列上限）

### 5.5 範例 CSV（最小版）

```
orderId,trackingProvider,trackingCode
101,711,F45913208600
102,familymart,FM123456789
103,home_delivery,999123456789
104,other,SPECIAL001
```

### 5.6 範例 CSV（含選用欄位）

```
orderNumber,trackingProvider,trackingCode,note,shippedAt
#101,711,F45913208600,6/1 出貨,2026-06-01
#102,familymart,FM123456789,,2026-06-01
#103,home_delivery,999123456789,黑貓,2026-06-02
```

### 5.7 CSV 不應包含的欄位

- `publicToken`（訂單查詢 token，不得作為匯入的匹配 key，理由：安全性，防止匯入 CSV 外洩 publicToken）
- `recipientPhone`（個資）
- `recipientAddress`（個資）
- `internalNote`（後台機密）
- `paymentNote`（後台機密）
- `paidAmount`（財務資訊）

---

## 6. 單筆輸入規格

本次只定義規格，不施工 UI。

### 6.1 後台單筆更新流程

```
後台 /orders 訂單列表
  → 點擊訂單
  → 開啟訂單詳情 / 編輯對話框
  → 填入 trackingCode（文字輸入）
  → 選擇 trackingProvider（下拉選單，顯示中文名稱，傳入 provider code）
  → 儲存
  → 呼叫 PATCH /orders/:orderId（已存在）
```

### 6.2 UI 需求（規劃，不施工）

| 元件                  | 規格                                                 |
| --------------------- | ---------------------------------------------------- |
| trackingCode 輸入欄位 | 文字輸入框，placeholder 如「請輸入物流追蹤碼」       |
| trackingProvider 選單 | 下拉選單，選項：7-11 交貨便 / 全家 B2C / 宅配 / 其他 |
| 清除按鈕              | 可清空 trackingCode（在訂單退回後可能需要清除）      |
| 儲存確認              | 成功 / 失敗提示                                      |

### 6.3 現有 API 基礎

`PATCH /orders/:orderId`（`artifacts/api-server/src/routes/orders.ts:484`）已支援更新 `trackingCode` / `trackingProvider`，Step 7B 的單筆輸入功能可直接呼叫此 API，不需新增。

---

## 7. 匯入流程

### 7.1 完整流程描述

```
1. 老闆出貨
   → 從物流業者取得追蹤碼（7-11 / 全家 / 宅配 / 其他）

2. 整理 CSV
   → 填寫 orderId / trackingProvider / trackingCode
   → 可用現有出貨 CSV 匯出作為基礎，加入追蹤碼欄位

3. 後台上傳 CSV
   → 後台 → 匯入物流號碼 → 選擇 CSV 檔案上傳
   → 可在上傳前預覽（建議功能，待確認是否實作）

4. 系統解析 CSV
   → 讀取 header，驗證必要欄位是否存在
   → 逐列讀取，trim 空白

5. 逐列驗證
   → 驗證 orderId / orderNumber 是否能對應到訂單
   → 驗證訂單是否屬於此店家（後台權限隔離）
   → 驗證 trackingProvider 是否在允許清單
   → 驗證 trackingCode 是否非空

6. 批次更新
   → 所有驗證通過的列：更新 orders.trackingCode / orders.trackingProvider
   → 失敗的列：收集錯誤原因，不寫入 DB

7. 回報結果
   → 顯示成功筆數 / 失敗筆數
   → 失敗列顯示錯誤原因
   → 可提供失敗列的 CSV 下載（讓老闆修正後重試）
```

### 7.2 事務處理策略

**建議「部分成功」策略**：成功的列個別寫入，失敗的列不影響其他列的更新。不採全部成功才寫入（all-or-nothing），因為批次匯入中常有少數錯誤，全部回滾會造成老闆需重新整理整份 CSV。

---

## 8. 欄位驗證規則

| 欄位               | 驗證規則                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `orderId`          | 必填（或 orderNumber 擇一）；純數字；對應到 DB 的 orders.id；訂單必須屬於當前登入店家                  |
| `orderNumber`      | 可選（與 orderId 擇一）；格式為 `#數字` 或純數字；去除 `#` 後當 orderId 處理                           |
| `trackingProvider` | 必填；必須在 allowlist 中（711 / familymart / home_delivery / other）；不分大小寫（trim 後轉小寫比對） |
| `trackingCode`     | 必填；不可空白或僅空格；trim 後長度需 >= 1；最大長度建議 100 字元（防止過長輸入）                      |
| `note`             | 選用；不驗證；最大長度建議 500 字元                                                                    |
| `shippedAt`        | 選用；若填寫需為合法日期格式（YYYY-MM-DD 或 ISO 8601）；目前暫不寫入 DB                                |

---

## 9. 錯誤處理

### 9.1 錯誤分類

| 錯誤類型                        | 處理方式                                                          | 說明                                                                           |
| ------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **CSV 格式錯誤**                | 整份拒絕，回報格式問題                                            | 非 CSV、不可讀、編碼錯誤                                                       |
| **header 錯誤**                 | 整份拒絕，回報 header 問題                                        | 缺少必要 header 欄位（orderId 或 orderNumber、trackingProvider、trackingCode） |
| **匯入檔案過大**                | 整份拒絕，回報大小限制                                            | 超過最大檔案大小限制（建議 500KB 或 1000 列，待確認）                          |
| **找不到訂單**                  | 逐列失敗，繼續其他列                                              | orderId / orderNumber 無對應訂單，或訂單不屬於此店家                           |
| **trackingProvider 不支援**     | 逐列失敗，繼續其他列                                              | provider code 不在 allowlist                                                   |
| **trackingCode 空白**           | 逐列失敗，繼續其他列                                              | trackingCode 欄位為空或僅空格                                                  |
| **缺少必要欄位值**              | 逐列失敗，繼續其他列                                              | orderId 或 trackingProvider 或 trackingCode 欄位有值缺失                       |
| **重複訂單（同 CSV）**          | 待確認：後者覆蓋前者，或列為錯誤                                  | 同一份 CSV 中出現同一 orderId 兩次                                             |
| **重複 trackingCode（跨訂單）** | 待確認：是否警告但允許寫入                                        | 同一 trackingCode 出現在不同訂單                                               |
| **部分成功 / 部分失敗**         | 成功列更新，失敗列回報                                            | 一份 CSV 中部分列成功、部分列失敗                                              |
| **CSV injection 風險**          | API 端清洗，不讓 `=`、`+`、`-`、`@` 開頭的值直接寫入 trackingCode | 防止惡意公式注入（主要防止前端 CSV 下載被利用）                                |

### 9.2 不對外顯示的錯誤

- DB 錯誤 stack trace
- 內部 server error 細節
- SQL 查詢內容
- 任何個資（即使匯入時含個資欄位，錯誤訊息不得回顯個資）

---

## 10. 成功 / 失敗回報格式

### 10.1 API 回應格式（規劃）

**成功完成（含部分失敗）**：HTTP 200

```json
{
  "totalRows": 10,
  "successCount": 8,
  "failedCount": 2,
  "errors": [
    {
      "row": 3,
      "orderId": "103",
      "reason": "找不到訂單"
    },
    {
      "row": 5,
      "orderId": "105",
      "reason": "trackingProvider 不支援：'黑貓'，允許值為 711 / familymart / home_delivery / other"
    }
  ]
}
```

**整份拒絕（CSV 格式錯誤、header 錯誤、檔案過大）**：HTTP 422

```json
{
  "error": "CSV 格式錯誤",
  "detail": "缺少必要 header 欄位：trackingCode"
}
```

### 10.2 後台 UI 回報（規劃）

- 匯入成功：顯示「成功更新 8 筆訂單」
- 部分失敗：顯示「成功 8 筆，失敗 2 筆」，列出失敗原因
- 提供「下載失敗列 CSV」按鈕，讓老闆修正後重試
- 整份失敗：顯示整份拒絕原因，不顯示 stack trace

---

## 11. 後台 UI 規劃

本次只做規劃，不施工。

### 11.1 入口位置

建議在後台訂單管理頁（/orders）新增「匯入物流號碼」按鈕，或在工具列提供獨立入口。

### 11.2 匯入頁面元件

| 元件             | 說明                                           |
| ---------------- | ---------------------------------------------- |
| 檔案上傳         | 選擇 CSV 檔案（.csv），顯示檔案名稱與大小      |
| 格式說明         | 顯示 CSV 欄位說明與範例下載連結                |
| 匯入預覽（可選） | 上傳後先預覽解析結果（前 10 列），確認後再提交 |
| 匯入按鈕         | 觸發 API 呼叫                                  |
| 結果統計         | 顯示成功 / 失敗筆數                            |
| 失敗列詳細資訊   | 列出每列失敗的 orderId 與原因                  |
| 失敗列 CSV 下載  | 讓老闆修正後重試                               |

### 11.3 trackingProvider 顯示規則

- 後台下拉選單：顯示中文名稱（7-11 交貨便 / 全家 B2C / 宅配 / 其他）
- CSV 匯入欄位：接受 provider code（711 / familymart / home_delivery / other）
- 匯入結果顯示：若 provider 不支援，顯示「trackingProvider 不支援：輸入值為 'XXX'，允許值請參閱格式說明」
- 不顯示 provider 的內部 enum 值給非技術使用者

---

## 12. API 規劃

本次只規劃，不實作。

### 12.1 批次匯入 API

```
POST /orders/tracking-import
```

- 需要後台權限（`requireAuth` middleware）
- 不可從公開端點呼叫（無 publicToken 路由）
- OpenClaw 不應使用此 API（OpenClaw 尚未實作，且此 API 為後台專用）
- 客戶端公開查詢頁完全不可呼叫此 API

**Request**：

```
Content-Type: multipart/form-data

file: <CSV 檔案>
```

或提供 JSON rows 方案（待確認）：

```json
{
  "rows": [
    {
      "orderId": 101,
      "trackingProvider": "711",
      "trackingCode": "F45913208600"
    },
    {
      "orderId": 102,
      "trackingProvider": "familymart",
      "trackingCode": "FM123456789"
    }
  ]
}
```

**建議 multipart 方案**：CSV 格式對店家操作最直覺，也與現有 CSV 匯出工作流程銜接。

**Response**（見第 10 節）

### 12.2 單筆更新 API（已存在）

```
PATCH /orders/:orderId
```

位置：`artifacts/api-server/src/routes/orders.ts:484`

已支援更新 `trackingCode` / `trackingProvider`，Step 7B 單筆功能直接呼叫此 API，不需新增。

施工時需確認此 API 是否已對 `trackingProvider` 做 allowlist 驗證，若無，需補強。

### 12.3 安全限制

- 匯入 API 需要後台登入（requireAuth）
- 不可有公開無認證的匯入入口
- 每次匯入需驗證訂單屬於當前登入店家，防止跨店家竄改
- API response 不得包含個資欄位（即使訂單本身有 recipientPhone 等）
- 不得把 DB 錯誤 stack trace 回傳給前端

---

## 13. DB / migration 影響

### 13.1 Step 7B 不需新增資料表

Step 7B 使用 `orders` 表上現有欄位：

| 欄位               | DB 欄名             | 現況                                | Step 7B 用途                             |
| ------------------ | ------------------- | ----------------------------------- | ---------------------------------------- |
| `trackingCode`     | `tracking_code`     | text nullable                       | 寫入物流追蹤碼                           |
| `trackingProvider` | `tracking_provider` | text nullable                       | 寫入標準化 provider code                 |
| `shippingStatus`   | `shipping_status`   | text NOT NULL DEFAULT 'not_shipped' | 可評估是否同時更新為 `shipped`（待確認） |

### 13.2 trackingProvider 標準化的 migration 評估

| 方案           | 說明                                                 | 建議                       |
| -------------- | ---------------------------------------------------- | -------------------------- |
| 方案 A（保守） | 維持 text nullable，只在 API 層做 allowlist 驗證     | **Step 7B 優先使用**       |
| 方案 B（嚴格） | DB 層新增 check constraint 或改為 enum，需 migration | 等 provider 清單穩定後評估 |

**理由**：現有 DB 中已有自由文字資料（如 `"7-11"` 測試資料），若立即加 check constraint 需先清洗資料，風險較高。Step 7B 先在 API 層驗證，等資料乾淨後再評估 DB constraint。

### 13.3 Step 7C 才需要的資料表（本步驟不新增）

| 資料表                     | 說明                                                           | 預計步驟 |
| -------------------------- | -------------------------------------------------------------- | -------- |
| `shipment_trackings`       | 貨態追蹤記錄表（含 lastCheckedAt / failureCount / checkError） | Step 7C  |
| `shipment_tracking_events` | 貨態事件 timeline 表                                           | Step 7C  |

Step 7B **不新增**上述資料表，不新增任何 migration。

---

## 14. 個資與安全

### 14.1 CSV 匯入個資原則

| 原則                           | 說明                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| CSV 不應含 recipientPhone      | 手機號碼不是物流匯入所需欄位，若老闆從現有出貨 CSV 刪除個資欄位再匯入更安全                                        |
| CSV 不應含 recipientAddress    | 同上                                                                                                               |
| publicToken 禁止出現在匯入 CSV | publicToken 是訂單查詢 token，作為匹配 key 有安全風險（CSV 外洩等於洩露所有客人查詢 URL）；使用 orderId 匹配更安全 |
| 錯誤訊息不得含個資             | 即使訂單本身有個資，API 的錯誤回應不得包含 recipientPhone / recipientAddress 等                                    |
| 失敗列 CSV 下載不含個資        | 下載的失敗列只含 orderId / trackingProvider / trackingCode / 錯誤原因                                              |

### 14.2 CSV Injection 防護

CSV injection（也稱 Formula Injection）：惡意輸入以 `=`、`+`、`-`、`@` 開頭的值，在 Excel / Google Sheets 開啟時可能執行公式。

防護措施：

- **API 端**：解析 CSV 時，若欄位值以 `=`、`+`、`-`、`@` 開頭，清洗為安全字元（加前綴 `'` 或拒絕）
- **前端匯出失敗列 CSV 時**：同樣套用清洗規則
- **trackingCode 的實際影響**：一般物流追蹤碼不含這些字元，但仍需防護

### 14.3 後台權限

- 匯入 API（`POST /orders/tracking-import`）需要 `requireAuth`
- 匯入時需驗證訂單的 `storeId` 與登入者一致，防止跨店家竄改
- 不可有未認證的公開匯入入口
- 單筆更新 API（`PATCH /orders/:orderId`）已有 `requireAuth`，需確認是否有 storeId 隔離

### 14.4 不輸出的資訊

- Secrets / token / API key
- DB 錯誤 stack trace
- SQL 查詢
- 個資欄位（recipientPhone / recipientAddress / internalNote / paymentNote）

---

## 15. 測試計畫

本次為規格文件，測試計畫為後續施工時的執行清單。

### 15.1 功能測試（施工後執行）

| 測試案例 | 情境                                                      | 預期結果                                                 |
| -------- | --------------------------------------------------------- | -------------------------------------------------------- |
| T1       | provider 正常（711 / familymart / home_delivery / other） | 成功更新 trackingCode / trackingProvider                 |
| T2       | provider 不支援（如 `黑貓`、`7-11`、空白）                | 列為失敗，回報「trackingProvider 不支援」                |
| T3       | trackingCode 空白                                         | 列為失敗，回報「trackingCode 不可空白」                  |
| T4       | 找不到訂單（orderId 不存在）                              | 列為失敗，回報「找不到訂單」                             |
| T5       | 訂單不屬於當前店家                                        | 列為失敗，回報「找不到訂單」（不暴露訂單存在於其他店家） |
| T6       | CSV header 錯誤（缺少必要欄位）                           | 整份拒絕，HTTP 422                                       |
| T7       | 非 CSV 格式（如 Excel .xlsx）                             | 整份拒絕，HTTP 422                                       |
| T8       | 部分成功 / 部分失敗（混合）                               | 成功列更新，失敗列回報，HTTP 200                         |
| T9       | 重複匯入同一訂單（待確認是否覆蓋）                        | 待確認後補充預期結果                                     |
| T10      | 同 CSV 重複 orderId（待確認是否允許）                     | 待確認後補充預期結果                                     |
| T11      | CSV 檔案過大（超過限制）                                  | 整份拒絕，HTTP 422                                       |
| T12      | orderNumber 格式（#123）匹配                              | 成功對應 orderId = 123                                   |
| T13      | trackingCode 含特殊字元（=開頭）                          | API 清洗後正確儲存，不執行公式                           |

### 15.2 權限測試

| 測試案例 | 情境                                | 預期結果                                |
| -------- | ----------------------------------- | --------------------------------------- |
| P1       | 未登入呼叫匯入 API                  | HTTP 401                                |
| P2       | 一般客人（無後台帳號）呼叫          | HTTP 401                                |
| P3       | 公開查詢 API 不可呼叫匯入           | publicToken 路由無此端點                |
| P4       | 跨店家匯入（A 店家匯入 B 店家訂單） | 回報「找不到訂單」，不暴露 B 店訂單存在 |

### 15.3 回歸測試

| 測試案例 | 情境                                    | 預期結果                                                  |
| -------- | --------------------------------------- | --------------------------------------------------------- |
| R1       | Step 7A 公開查詢頁仍正常顯示            | trackingCode / trackingProvider / shippingStatus 顯示正確 |
| R2       | Step 5C 個資保護測試未失效              | GET /api/orders/track/:publicToken 仍不回傳個資欄位       |
| R3       | Step 5F 出貨 CSV 匯出未受影響           | POST /orders/shipping-list.csv 正常                       |
| R4       | 撿貨單 CSV 未受影響                     | POST /orders/picking-list.csv 正常                        |
| R5       | PATCH /orders/:orderId 單筆更新未受影響 | 仍可正常逐筆更新 trackingCode                             |

### 15.4 不執行的測試（Step 7B）

| 未執行項目                   | 原因                                   |
| ---------------------------- | -------------------------------------- |
| 7-11 / 全家物流 API 實際查詢 | Step 7D 才做自動查詢                   |
| OpenClaw API 測試            | OpenClaw 未實作                        |
| E-Tracking 測試              | E-Tracking 完全不存在於系統            |
| 貨態 history 測試            | Step 7C 才有 shipment_trackings 資料表 |

未執行自動化測試，原因是：本次僅新增 Step 7B 規格文件，未修改功能程式碼。

---

## 16. 非目標

以下功能**在 Step 7B 不做**：

| 非目標                           | 說明                                      |
| -------------------------------- | ----------------------------------------- |
| 自動貨態查詢                     | Step 7D，需先完成 Step 7C 資料模型        |
| OpenClaw 整合                    | 僅為 comment 標記，未實作，不在本步驟範圍 |
| E-Tracking 導入                  | 完全不存在於系統，未確認可商用            |
| 新增 shipment_tracking_events    | Step 7C 才需要                            |
| 正式物流託運（開單給物流業者）   | 系統只記錄物流號碼，不實際託運            |
| 即時貨態保證                     | 不承諾，物流資訊依賴店家手動提供          |
| 修改公開查詢 API                 | 公開 API 在 Step 7A 已完備                |
| 修改公開查詢頁 UI                | TrackOrder.tsx 在 Step 7A 已完成          |
| 自動發送出貨通知                 | Step 7F                                   |
| 跨物流業者 trackingCode 格式驗證 | 各業者格式不同，驗證規則待 Step 7D 評估   |

---

## 17. 待確認問題

| 編號 | 問題                                                                                                   | 優先順序 | 影響範圍                |
| ---- | ------------------------------------------------------------------------------------------------------ | -------- | ----------------------- |
| Q1   | CSV 用 orderId（純數字）還是 orderNumber（`#123`）作為主要匹配 key？還是兩種都支援？                   | 高       | API 設計、CSV 格式      |
| Q2   | provider 初版是否只支援 711 / familymart / home_delivery / other？是否需要新增黑貓（`black_cat`）等？  | 高       | provider 清單           |
| Q3   | 重複匯入同一訂單的 trackingCode 時：覆蓋舊值，還是列為錯誤，還是警告後覆蓋？                           | 高       | 匯入邏輯、錯誤處理      |
| Q4   | 一個訂單是否允許多個 trackingCode？（如分批出貨，目前 orders 表只有一個 tracking_code 欄位）           | 高       | DB schema、Step 7C 銜接 |
| Q5   | trackingCode 是否需要格式驗證（如長度、字元集）？各 provider 格式不同，是否 Step 7B 先不驗證？         | 中       | 驗證規則                |
| Q6   | familymart 的 provider code 確認使用 `familymart`？（cvsStores 表用的是 `family`，兩者需有意識地區分） | 中       | provider 命名一致性     |
| Q7   | 是否需要提供匯入結果的失敗列 CSV 下載？                                                                | 中       | 後台 UI、UX             |
| Q8   | 老闆是否可以手動覆蓋現有 trackingProvider（如出貨後換物流商）？                                        | 中       | 業務邏輯                |
| Q9   | 匯入成功後是否同時將 shippingStatus 更新為 `shipped`？或讓老闆另行手動更新 shippingStatus？            | 中       | 業務流程                |
| Q10  | publicToken 是否明確禁止出現在匯入 CSV 的任何欄位？（建議禁止，原因見第 14 節）                        | 中       | 安全設計                |
| Q11  | CSV 檔案大小上限定為多少？（建議 500KB 或 1000 列，待確認）                                            | 低       | API 實作                |
| Q12  | 匯入預覽功能是否列入 Step 7B，或延後至 Step 7B+ 再做？                                                 | 低       | 後台 UI 工期            |

---

## 18. 下一步 Step 7C 銜接建議

### Step 7C 的前提

Step 7C（自動貨態更新資料模型）需在 Step 7B 完成後執行，原因：

1. Step 7C 需要 `trackingProvider` 已標準化，才能對應 Step 7D 的物流業者 API
2. Step 7B 完成後，系統才有穩定的 trackingCode / trackingProvider 資料，Step 7C 的 history 才有意義
3. Step 7C 的資料模型設計（shipment_trackings / shipment_tracking_events）需考量 Step 7B 後的 trackingCode 格式

### Step 7C 需要決定的事項

| 項目                     | 說明                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------- |
| 資料模型選擇             | 在 orders 表新增欄位（snapshot 模式）vs 新增獨立 shipment_trackings 表（history 模式） |
| lastCheckedAt            | 記錄上次自動查詢時間                                                                   |
| failureCount             | 記錄連續查詢失敗次數，超過閾值停止查詢                                                 |
| checkError               | 記錄最後一次查詢錯誤                                                                   |
| latestTrackingStatus     | 物流業者回傳的最新貨態 snapshot                                                        |
| shipment_tracking_events | 貨態事件 timeline，每筆一個事件（時間、狀態、說明）                                    |

### Step 7C 不可提前施工的部分

- Step 7B 的 provider 標準化未完成前，Step 7C 的自動查詢路由無法確認
- Step 7C 需要先確認物流業者 API 方案（OpenClaw / E-Tracking / 直接串接），再設計資料模型
- E-Tracking 未確認可商用，OpenClaw 未實作，Step 7C 的施工時機需等業務決策

---

_文件版本：Step 7B Spec v1.0_
_撰寫日期：2026-06-06_
_撰寫：Claude B（Fixed Latest File Mode）_
_現況依據：docs/order-step7-current-field-audit.md（commit 8794d8c）、docs/order-step7-customer-shipment-status-spec.md（commit bd75161）_
_分支：feat/step6d-edit-order-cvs-store-picker_
