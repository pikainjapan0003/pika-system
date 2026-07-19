# Order Step 7：客戶貨態頁與自動貨態更新 規格文件

> **版本**：Step 7A-Spec v1.0｜分支：`fix/step6c0c-disable-cvs-emap-import`
> **現況依據**：`docs/order-step7-current-field-audit.md`（commit 8794d8c）
> **本文件為規格文件，不含施工實作。**
> 文件語言：繁體中文。
>
> **重要聲明**：本規格不承諾貨態即時或百分百準確。
> 貨態資料來自物流業者 API 或店家手動輸入，可能有延遲或遺失。

---

## 1. Step 7A 定位

### 在整體 Step 7 中的位置

Step 7 是代購系統在完成 Step 5（付款 / 物流欄位）與 Step 5F（撿貨單 / 出貨單 / CSV）之後的下一個功能階段。

| Step   | 名稱                 | 說明                                                                             | 本文件範圍         |
| ------ | -------------------- | -------------------------------------------------------------------------------- | ------------------ |
| **7A** | 客戶貨態頁強化       | 優化現有 TrackOrder.tsx，正確呈現 shippingStatus、trackingCode、trackingProvider | ✅ **本規格主體**  |
| 7B     | 老闆匯入物流號碼     | 後台 UI / CSV 匯入批次更新 trackingCode / trackingProvider                       | 參照本文件第 16 節 |
| 7C     | 自動貨態更新資料模型 | 新增 shipment_trackings / shipment_tracking_events 資料表                        | 參照本文件第 16 節 |
| 7D     | worker 自動查詢貨態  | OpenClaw 或其他 worker 定時查詢並寫入                                            | 研究方向，未確認   |
| 7E     | 貨態 history 顯示    | 客戶頁顯示貨態時間軸                                                             | 依賴 7C            |
| 7F     | 自動出貨通知         | 寄送 LINE / Email 通知                                                           | 超出目前範圍       |

**Step 7A 的施工前提**：

- Step 5 已完成（訂單付款 / 物流欄位已存在）
- Step 5F 已完成（出貨 CSV 已包含 trackingCode / trackingProvider）
- `docs/order-step7-current-field-audit.md` 已完成欄位盤點

---

## 2. Step 7 目標

### 背景

老闆出貨後，需要能把 7-11 / 全家的物流號碼填入系統，讓客人用 publicToken 查詢時可以看到貨態。未來可由 worker 自動查詢貨態，無需老闆手動更新。

### 核心目標

| 目標                        | 說明                                                                      |
| --------------------------- | ------------------------------------------------------------------------- |
| 老闆可填入 / 匯入物流追蹤碼 | 支援手動填入與 CSV 批次匯入 trackingCode / trackingProvider               |
| 客人可查詢訂單貨態          | 以 publicToken 進入貨態頁，看到 shippingStatus + trackingCode             |
| 保存貨態 snapshot           | 保存 trackingCode / trackingProvider / 最新貨態（Step 7C 後才有 history） |
| 未來可自動更新              | 為 worker 自動查詢預留資料模型（Step 7C / 7D 範圍）                       |

### 不在 Step 7A 範圍內

- 串接 7-11 / 全家貨態 API（Step 7D 以後）
- 自動通知客人（Step 7F）
- 貨態 history / timeline（Step 7C / 7E 才有）
- OpenClaw 實作（未確認）
- E-Tracking 導入（未確認可商用）

---

## 3. 目前系統狀態

> 以下現況來自 `docs/order-step7-current-field-audit.md` 實際原始碼查核。

### 已存在的功能

| 功能               | 現況                                                          | 位置                                                        |
| ------------------ | ------------------------------------------------------------- | ----------------------------------------------------------- |
| 公開查詢頁（前端） | 已存在，顯示訂單進度 steps                                    | `artifacts/shop-app/src/pages/TrackOrder.tsx`               |
| 公開查詢 API       | 已存在，GET /api/orders/track/:publicToken                    | `artifacts/api-server/src/routes/public.ts:236`             |
| 個資排除           | 已明確排除個資欄位（STRICTLY EXCLUDED comment）               | `artifacts/api-server/src/routes/public.ts:268-270`         |
| 個資保護測試       | 已有 Step 5C 測試覆蓋                                         | `artifacts/api-server/src/routes/orders.route.test.mjs:518` |
| rate limiting      | 30 次 / 10 分鐘（trackOrderLimiter）                          | `artifacts/api-server/src/routes/public.ts:57`              |
| 後台手動更新       | PATCH /orders/:orderId 已支援 trackingCode / trackingProvider | `artifacts/api-server/src/routes/orders.ts:544-545`         |
| 出貨 CSV           | 已包含物流追蹤碼 / 物流商欄位                                 | `artifacts/api-server/src/routes/orders.ts:375-379`         |

### 已存在但需優化的問題

| 問題                      | 說明                                                                               | 位置                                              |
| ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| UI 用語混淆               | TrackOrder.tsx「複製追蹤碼」按鈕複製的是 publicToken，不是 trackingCode            | `artifacts/shop-app/src/pages/TrackOrder.tsx:185` |
| 404 文字混淆              | 404 頁面「請確認追蹤碼是否正確」此處追蹤碼指 publicToken                           | `artifacts/shop-app/src/pages/TrackOrder.tsx:62`  |
| shippingStatus 未顯示     | 公開查詢頁目前顯示 order.status（訂單狀態），未單獨顯示 shippingStatus（物流狀態） | TrackOrder.tsx                                    |
| trackingCode 未顯示       | 公開頁目前不顯示 trackingCode / trackingProvider                                   | TrackOrder.tsx                                    |
| trackingProvider 未標準化 | 目前為自由文字，無法對應物流業者 API                                               | orders DB schema                                  |

### 尚未存在的功能

| 功能                           | 說明                                                     |
| ------------------------------ | -------------------------------------------------------- |
| 批次 CSV 匯入 trackingCode     | Step 7B                                                  |
| 貨態 history / timeline 資料表 | Step 7C（shipment_trackings / shipment_tracking_events） |
| 自動貨態查詢 worker            | Step 7D                                                  |
| OpenClaw 實作                  | 僅為 comment 標記，未實作                                |
| E-Tracking                     | 完全不存在於系統                                         |

---

## 4. 既有欄位現況

> 來源：`lib/db/src/schema/orders.ts`（Drizzle ORM，PostgreSQL）

### 已存在欄位（可直接用於 Step 7A）

| 欄位               | DB 欄名             | 型別                                | 目前用途                               | Step 7A 用途                           |
| ------------------ | ------------------- | ----------------------------------- | -------------------------------------- | -------------------------------------- |
| `publicToken`      | `public_token`      | text NOT NULL UNIQUE                | 訂單公開查詢 URL token                 | 客人查詢訂單的入口，**不是物流追蹤碼** |
| `shippingStatus`   | `shipping_status`   | text NOT NULL DEFAULT 'not_shipped' | 訂單出貨狀態                           | 在貨態頁顯示目前出貨進度               |
| `trackingCode`     | `tracking_code`     | text nullable                       | 物流追蹤碼（手動填入）                 | 顯示給客人的物流追蹤號碼               |
| `trackingProvider` | `tracking_provider` | text nullable                       | 物流商名稱（自由文字）                 | 顯示物流業者名稱，Step 7B 後考慮標準化 |
| `shippingMethod`   | `shipping_method`   | text nullable                       | 配送方式 enum                          | 輔助顯示，**不等於** trackingProvider  |
| `cvsStoreId`       | `cvs_store_id`      | text nullable                       | 超商門市代碼（API 層映射為 storeCode） | 超商取貨時顯示門市資訊（需評估個資）   |
| `cvsStoreName`     | `cvs_store_name`    | text nullable                       | 超商門市名稱（API 層映射為 storeName） | 超商取貨時顯示門市名稱                 |

### shippingStatus 可用值

```
not_shipped  → 尚未出貨
preparing    → 備貨中
shipped      → 已出貨
arrived      → 已到門市 / 配送中心
picked_up    → 已取貨
returned     → 已退回
cancelled    → 已取消
```

### 已存在但公開頁已排除的欄位（個資 / 後台機密）

| 欄位               | 排除原因 | Step 7A 處置             |
| ------------------ | -------- | ------------------------ |
| `recipientPhone`   | 個資     | 維持排除，不開放         |
| `recipientAddress` | 個資     | 維持排除，不開放         |
| `internalNote`     | 後台機密 | 維持排除，不開放         |
| `paymentNote`      | 後台機密 | 維持排除，不開放         |
| `paidAmount`       | 財務資訊 | 維持排除，不開放         |
| `shippingNote`     | 物流備註 | 維持排除（含可能有個資） |
| `recipientName`    | 個資     | 維持排除，不開放         |

### 尚未存在的欄位（Step 7C / 7D 以後）

| 欄位 / 資料表              | 說明                 | 預計步驟 |
| -------------------------- | -------------------- | -------- |
| `shipment_trackings`       | 貨態追蹤記錄表       | Step 7C  |
| `shipment_tracking_events` | 貨態事件 timeline 表 | Step 7C  |
| `latestTrackingStatus`     | 最新貨態 snapshot    | Step 7C  |
| `failureCount`             | 查詢失敗計數         | Step 7C  |
| `lastCheckedAt`            | 上次自動查詢時間     | Step 7C  |
| `checkError`               | 查詢錯誤記錄         | Step 7C  |

---

## 5. 使用者流程

### 5.1 老闆填入 / 匯入物流號碼（Step 7A / 7B）

```
老闆出貨
  → 取得物流單號（黑貓、7-11 C2C、全家 B2C 等）
  → 填入系統

  路徑 A：後台手動填入（Step 7A 現有功能）
    → 後台 /orders → 開啟訂單 → 填入 trackingCode / trackingProvider
    → PATCH /orders/:orderId（已存在）

  路徑 B：CSV 批次匯入（Step 7B 規劃）
    → 老闆匯出出貨 CSV（已有「物流追蹤碼」欄位）
    → 填入各訂單的物流號碼
    → 上傳 CSV → 系統批次更新 trackingCode / trackingProvider
```

### 5.2 worker 自動更新貨態（Step 7D，研究方向）

> **假設**：此流程需要 Step 7C 資料模型完成後才能實作。
> **待確認**：worker 使用 OpenClaw 還是直接呼叫物流業者 API？

```
worker（定時執行，例如每小時）
  → 讀取所有 shippingStatus = 'shipped' 且有 trackingCode 的訂單
  → 依 trackingProvider 呼叫對應物流 API（尚未決定實作方式）
  → 寫入 shipment_trackings（Step 7C 資料表）
  → 更新 orders.shippingStatus（如有變化）
  → 記錄 lastCheckedAt / failureCount
```

**注意**：Step 7D 依賴 Step 7C 資料模型，且物流 API 尚未決定（OpenClaw / E-Tracking / 直接串接）。此流程目前為研究方向，不在 Step 7A 施工範圍。

### 5.3 客人查詢訂單貨態（Step 7A 核心）

```
客人收到訂單確認
  → 取得訂單查詢連結（含 publicToken）
  → 開啟 /track/:publicToken

  前端 TrackOrder.tsx
    → GET /api/orders/track/:publicToken
    → 顯示：
        - 訂單狀態（status / statusLabel）
        - 出貨狀態（shippingStatus / shippingStatusLabel）  ← Step 7A 新增顯示
        - 物流追蹤碼（trackingCode）                         ← Step 7A 新增顯示
        - 物流商（trackingProvider）                         ← Step 7A 新增顯示
        - 商品資訊（productName / quantity）
        - 金額（unitPrice / totalPrice / orderTotal）
        - 下單時間（createdAt）
```

**現況問題**：TrackOrder.tsx 目前只顯示 order.status steps，未單獨顯示 shippingStatus，也未顯示 trackingCode / trackingProvider。Step 7A 的 UI 工作是修正這些顯示缺口。

---

## 6. OpenClaw 角色邊界

### 現況確認

根據 `docs/order-step7-current-field-audit.md` 第 9 節：

- OpenClaw 在本系統中**只出現在一行 code comment**：
  `lib/db/src/schema/cvsStores.ts:17`
  `// source: manual_seed | lemai_store_db | future_openclaw_update`
- 這是 `source` 欄位的可能值列舉，**不代表任何實作**
- 系統中沒有任何 OpenClaw API 呼叫、設定、client 或 SDK

### Step 7 中的角色定位

| 角色                  | 說明                                      |
| --------------------- | ----------------------------------------- |
| 目前                  | 未實作，只是概念標記                      |
| Step 7C / 7D 研究方向 | 作為自動更新門市資料 / 貨態的候選方案之一 |
| 不可視為              | 已確認、已導入、可商用的依賴              |

### 規格邊界

- Step 7A 不依賴 OpenClaw
- Step 7B 不依賴 OpenClaw
- Step 7C 需決定資料模型，OpenClaw 是 **選項之一，需另行評估**
- 規格文件中提及 OpenClaw 時，必須標記「**研究中 / 未實作**」

---

## 7. E-Tracking 研究方向與風險

### 現況確認

根據 `docs/order-step7-current-field-audit.md` 第 9 節：

- E-Tracking 在本系統中**完全不存在**（grep 無任何命中）
- 沒有任何 E-Tracking API 呼叫、套件、設定或參考

### 風險

| 風險            | 說明                                  |
| --------------- | ------------------------------------- |
| 法律 / 授權風險 | E-Tracking 是否有合法商用授權尚不明確 |
| 穩定性風險      | 未評估 E-Tracking API 的穩定性與 SLA  |
| 資料準確性風險  | 不可承諾貨態百分百準確或即時          |
| 導入成本        | 需要完整 POC 評估後才能決定           |

### 規格邊界

- Step 7A 不依賴 E-Tracking
- Step 7B 不依賴 E-Tracking
- Step 7C / 7D 若考慮 E-Tracking，必須先完成 POC 與法律確認
- 規格文件中**不可將 E-Tracking 寫為已導入或確認可商用的核心依賴**

---

## 8. MVP 範圍（Step 7A）

### 本次 Step 7A 施工目標

| 項目                                 | 說明                                                           | 優先順序 |
| ------------------------------------ | -------------------------------------------------------------- | -------- |
| TrackOrder.tsx 顯示 shippingStatus   | 在公開查詢頁單獨顯示出貨狀態（含標籤）                         | 高       |
| TrackOrder.tsx 顯示 trackingCode     | 若有物流追蹤碼，顯示給客人                                     | 高       |
| TrackOrder.tsx 顯示 trackingProvider | 若有物流商，顯示業者名稱                                       | 高       |
| 修正 UI 用語混淆                     | 「複製追蹤碼」按鈕改為「複製訂單查詢碼」（或改為複製訂單連結） | 高       |
| 修正 404 文字                        | 「請確認追蹤碼是否正確」改為符合 publicToken 語意的文字        | 中       |
| 無 trackingCode 時的空狀態           | 若 trackingCode 為空，顯示「物流追蹤碼尚未填入，請稍後再查詢」 | 中       |

### API 層 Step 7A 不需修改

公開查詢 API（GET /api/orders/track/:publicToken）**已回傳** `trackingCode`、`trackingProvider`、`shippingStatus`、`shippingStatusLabel`，不需新增或修改 API。

Step 7A 的工作集中在**前端顯示**。

---

## 9. 非目標（Step 7A）

以下功能**在 Step 7A 不做**：

| 非目標                       | 說明                    |
| ---------------------------- | ----------------------- |
| 串接 7-11 / 全家貨態 API     | Step 7D 以後            |
| 批次 CSV 匯入 trackingCode   | Step 7B                 |
| 貨態 history / timeline 顯示 | Step 7C / 7E            |
| worker 自動查詢貨態          | Step 7D                 |
| OpenClaw 整合                | 未確認，Step 7D 研究    |
| E-Tracking 導入              | 未確認可商用            |
| 自動通知（LINE / Email）     | Step 7F                 |
| trackingProvider enum 標準化 | 可在 Step 7B 時一併處理 |
| 新增 DB schema / migration   | Step 7A 不需要          |
| 新增 API routes              | Step 7A 不需要          |

---

## 10. API 規劃

### Step 7A：不需新增或修改 API

公開查詢 API 已完備：

```
GET /api/orders/track/:publicToken
```

已回傳欄位：`publicToken`、`shippingStatus`、`shippingStatusLabel`、`trackingCode`、`trackingProvider`、`productName`、`quantity`、`unitPrice`、`totalPrice`、`orderTotal`、`pickupMethod`、`specValues`、`status`、`statusLabel`、`createdAt`

已排除欄位：`recipientPhone`、`recipientAddress`、`internalNote`、`paymentNote`、`paidAmount`、`shippingNote`、`recipientName`、`paymentMethod`、`paymentStatus`、`remainingAmount`

> Step 7A 的 API 不需要任何變更。

### Step 7B 預計 API（供後續規格參考）

```
POST /orders/import-tracking-csv          # CSV 批次匯入 trackingCode / trackingProvider
PATCH /orders/:orderId                    # 已存在，繼續使用
```

### Step 7C 預計 API（供後續規格參考）

```
GET /orders/:orderId/tracking-events      # 取得單一訂單的貨態 history（後台）
GET /api/orders/track/:publicToken/events # 取得公開貨態 history（需評估個資）
```

> Step 7B / 7C API 規劃為概念草案，需在對應步驟規格中詳細設計。

---

## 11. DB / migration 可能性

### Step 7A：不需修改 DB

所有必要欄位已存在於 `orders` 表：

- `public_token`、`shipping_status`、`tracking_code`、`tracking_provider`

Step 7A 不需執行任何 migration。

### Step 7B：可能需要 migration

若在 Step 7B 新增 `trackingProvider` enum 標準化（從自由文字改為 enum），需要 migration。但此為選擇性，若維持自由文字則不需要 migration。

### Step 7C：需要 migration（較複雜）

| 資料表                     | 說明                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `shipment_trackings`       | 每個訂單的貨態追蹤記錄，包含 trackingCode / trackingProvider / lastCheckedAt / failureCount / checkError |
| `shipment_tracking_events` | 貨態事件清單（時間軸），每筆記錄一個貨態事件                                                             |

> Step 7C migration 需在 Step 7C 規格中詳細定義資料表欄位後再施工。

**注意**：目前沒有 `shipment_trackings` 或 `shipment_tracking_events` 資料表，Step 7C 需從頭建立，不可在 Step 7A 中預先建立。

---

## 12. UI 規劃

### Step 7A：TrackOrder.tsx 修改重點

#### 12.1 顯示 shippingStatus

在訂單狀態步驟（STATUS_STEPS）之後，新增出貨狀態區塊：

```
出貨狀態：[shippingStatusLabel]
```

shippingStatusLabel 來自公開 API 已回傳的 `shippingStatusLabel`（如「已出貨（追蹤碼由店家提供）」）。

#### 12.2 顯示 trackingCode / trackingProvider

在出貨狀態下方，若 trackingCode 有值：

```
物流追蹤碼：[trackingCode]
物流業者：[trackingProvider]（若有值）
```

若 trackingCode 為空：

```
物流追蹤碼：（尚未提供，請稍後再查詢）
```

**不可顯示**：本頁面不顯示 recipientPhone、recipientAddress、internalNote、paymentNote、paidAmount。

#### 12.3 修正 UI 用語混淆

**現況問題**（`artifacts/shop-app/src/pages/TrackOrder.tsx:185`）：

```tsx
{
  copied ? "已複製！" : "複製追蹤碼";
}
// 實際執行：handleCopy(order.publicToken)
```

**Step 7A 修正方向**（二選一，待產品決策）：

| 方案 | 修正方式                                               | 說明                     |
| ---- | ------------------------------------------------------ | ------------------------ |
| A    | 按鈕改為「複製訂單查詢連結」，內容改為完整 URL         | 語意最清楚，對客人最友善 |
| B    | 保留複製 publicToken，但按鈕文字改為「複製訂單查詢碼」 | 較小改動                 |

> 待確認：哪個方案對客人更友善？建議先與老闆確認。

#### 12.4 修正 404 文字

**現況問題**（`artifacts/shop-app/src/pages/TrackOrder.tsx:62`）：

```
請確認追蹤碼是否正確
```

此處「追蹤碼」指的是 publicToken（訂單查詢碼），與物流追蹤碼混淆。

**Step 7A 修正建議**：

```
請確認訂單查詢碼是否正確
```

或

```
請確認訂單查詢連結是否完整
```

#### 12.5 trackingCode 顯示的附加考量

若有 trackingCode，可在旁邊提供一個「複製」按鈕，方便客人複製後到物流業者官網自行查詢。

**不應該**在系統內直接連到物流業者查詢頁（因為 URL 格式因 trackingProvider 而異，且 trackingProvider 目前為自由文字，無法自動對應）。

---

## 13. 個資與安全

### 個資保護原則

| 欄位                      | 公開頁規則                  | Step 7A 處置                           |
| ------------------------- | --------------------------- | -------------------------------------- |
| `recipientPhone`          | 禁止顯示                    | 維持現況排除                           |
| `recipientAddress`        | 禁止顯示                    | 維持現況排除                           |
| `internalNote`            | 禁止顯示                    | 維持現況排除                           |
| `paymentNote`             | 禁止顯示                    | 維持現況排除                           |
| `paidAmount`              | 禁止顯示                    | 維持現況排除                           |
| `shippingNote`            | 禁止顯示（可能含個資）      | 維持現況排除                           |
| `recipientName`           | 禁止顯示                    | 維持現況排除                           |
| `trackingCode`            | 可顯示（已在公開 API 回傳） | Step 7A 新增顯示                       |
| `trackingProvider`        | 可顯示（已在公開 API 回傳） | Step 7A 新增顯示                       |
| `storeCode` / `storeName` | 目前未在公開 API 回傳       | **待確認**，若要顯示需重新評估個資風險 |

### 現有保護機制（維持不動）

- 公開查詢 API 有 `// STRICTLY EXCLUDED` comment 明確標記排除欄位
- Step 5C 個資保護測試已覆蓋主要隱私欄位
- rate limiting：30 次 / 10 分鐘
- 無需登入的公開端點設計（使用 publicToken 作為 URL 身份識別）

### Step 7A 安全要求

1. Step 7A UI 修改不得新增任何個資欄位到公開頁面
2. 不得修改 API 的排除邏輯，維持現有 `STRICTLY EXCLUDED` 設計
3. 若後續 Step 7C 新增貨態 history 公開顯示，貨態事件內容不得含有任何個資

### publicToken 安全說明

- publicToken 由 `randomBytes(16).toString("hex")` 產生（32 字元 hex），安全強度足夠
- publicToken 是訂單查詢的唯一 URL token，**不是物流追蹤碼**
- 客人不應被引導認為 publicToken 可在 7-11 / 全家官網查詢包裹

---

## 14. 客服與對外承諾

### 絕對不可承諾

| 禁止承諾              | 說明                                     |
| --------------------- | ---------------------------------------- |
| 貨態即時              | 目前貨態依賴店家手動更新，無法保證即時性 |
| 貨態百分百準確        | 物流業者 API 可能有延遲或遺失            |
| trackingCode 必定存在 | 老闆尚未填入時 trackingCode 為空         |
| E-Tracking 可商用     | E-Tracking 尚未確認授權                  |
| OpenClaw 可用         | OpenClaw 尚未實作                        |

### 對客人的標準說明文字建議

```
物流資訊由店家提供，更新時間可能有所延遲，實際送達以物流業者通知為準。
```

```
如有疑問，請聯繫商家。
```

> 上述文字已在 TrackOrder.tsx 中有類似說明（「如有疑問，請聯繫商家。」），Step 7A 可保留並補充說明。

### 客服注意事項

- 客人詢問貨態時，正確解釋「訂單查詢碼（publicToken）」與「物流追蹤碼（trackingCode）」的差異
- 若 trackingCode 為空，說明店家尚未填入，需聯繫商家
- 不對貨態時效做出任何承諾

---

## 15. 測試計畫

### Step 7A 測試重點

| 測試項目                      | 類型                      | 說明                                                        |
| ----------------------------- | ------------------------- | ----------------------------------------------------------- |
| 有 trackingCode 時顯示正確    | 手動 / E2E                | 公開頁顯示 trackingCode / trackingProvider / shippingStatus |
| trackingCode 為空時空狀態正確 | 手動 / E2E                | 顯示「尚未提供」說明                                        |
| 個資欄位不可在公開頁顯示      | 自動（已有 Step 5C 測試） | recipientPhone / paymentNote / internalNote 等不可顯示      |
| rate limiting 不影響正常使用  | 手動                      | 單一客人 10 分鐘內不超過 30 次查詢                          |
| UI 文字修正後語意正確         | 人工核對                  | 不再有「追蹤碼」混用兩個不同概念                            |
| 404 頁面文字修正              | 手動                      | 使用正確術語                                                |

### 維持現有測試

- `artifacts/api-server/src/routes/orders.route.test.mjs`（Step 5C）的個資保護測試**不可因 Step 7A 修改而失效**
- Step 7A 的任何 UI 修改不得破壞現有 API 回傳格式

### 不執行的測試（Step 7A）

| 未執行項目               | 原因            |
| ------------------------ | --------------- |
| 7-11 / 全家物流 API 測試 | Step 7A 不串接  |
| OpenClaw API 測試        | OpenClaw 未實作 |
| 貨態 history 測試        | Step 7C 才有    |
| worker 測試              | Step 7D 才有    |

---

## 16. 分階段建議

### Step 7A（本次規格主體）

**目標**：優化現有公開查詢頁，正確顯示貨態相關欄位，修正 UI 用語混淆。

**施工範圍**：

- `artifacts/shop-app/src/pages/TrackOrder.tsx`：顯示 shippingStatus、trackingCode、trackingProvider；修正按鈕文字與 404 文字

**依賴**：無新增 DB / API，使用現有欄位

**預計產出**：

- 公開查詢頁正確顯示出貨狀態、物流追蹤碼、物流業者
- 空狀態處理（trackingCode 為空時的說明文字）
- UI 用語不再混淆 publicToken 與 trackingCode

---

### Step 7B（老闆匯入物流號碼）

**目標**：讓老闆可以批次匯入 trackingCode / trackingProvider，不需逐筆手動填寫。

**施工範圍**：

- CSV 匯入 UI（後台）
- `POST /orders/import-tracking-csv` API（新增）
- 可選：trackingProvider enum 標準化

**依賴**：Step 7A 完成

**現有基礎**：

- PATCH /orders/:orderId 已支援更新 trackingCode / trackingProvider（逐筆）
- 出貨 CSV 已有「物流追蹤碼」欄位，可作為匯入格式對照基礎
- CSV 格式建議與現有出貨 CSV 保持一致（UTF-8 BOM，同欄名）

---

### Step 7C（自動貨態更新資料模型）

**目標**：建立 history / timeline 資料模型，為 worker 自動查詢預留架構。

**施工範圍**：

- 新增 `shipment_trackings` 資料表
- 新增 `shipment_tracking_events` 資料表
- 在 orders 表新增 `lastCheckedAt`、`failureCount`、`checkError`、`latestTrackingStatus` 欄位
- Migration

**依賴**：Step 7B 完成、trackingProvider enum 標準化完成

**注意**：此步驟需要完整 DB migration，需謹慎設計資料表結構後再施工。

---

### Step 7D（worker 自動查詢貨態）

**目標**：實作定時 worker，自動查詢物流業者 API 並更新貨態。

**施工範圍**：

- worker 實作（OpenClaw 或直接串接物流業者 API，需另行評估）
- 依 trackingProvider 路由到對應物流 API
- 錯誤處理 / failureCount 機制

**依賴**：Step 7C 完成、物流業者 API 評估完成（OpenClaw / E-Tracking / 直接串接）

**狀態**：研究方向，尚未確認實作方式。OpenClaw 未實作，E-Tracking 未確認可商用。

---

### Step 7E（貨態 history 顯示）

**目標**：在公開查詢頁顯示貨態時間軸，讓客人看到完整的貨態歷程。

**施工範圍**：

- 公開查詢 API 新增 `/events` endpoint（需評估個資）
- TrackOrder.tsx 新增貨態 timeline 元件

**依賴**：Step 7C、Step 7D 完成

**注意**：公開頁的貨態事件不可含有個資。

---

### Step 7F（自動出貨通知）

**目標**：貨態變更時自動寄送通知給客人（LINE / Email）。

**依賴**：Step 7D 完成、通知機制建立

**狀態**：超出目前範圍，暫不規劃。

---

## 17. 待確認問題

| 編號 | 問題                                                                                                                                           | 優先順序 | 影響步驟         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------- |
| Q1   | TrackOrder.tsx「複製追蹤碼」按鈕要改為哪種文字？方案 A（複製訂單查詢連結）或方案 B（複製訂單查詢碼）？                                         | 高       | Step 7A          |
| Q2   | 公開查詢頁是否要顯示超商門市資訊（storeCode / storeName）？若要顯示，需評估個資風險（門市地址可間接推測收件地區）                              | 高       | Step 7A          |
| Q3   | trackingProvider 是否需要在 Step 7B 前先標準化為 enum？若要標準化，初始 enum 值為何（seven_eleven_c2c、family_mart_c2c、black_cat 等）？       | 中       | Step 7B、Step 7D |
| Q4   | Step 7C 資料模型選擇：在 orders 表新增欄位（snapshot 模式），或新增獨立 shipment_trackings 表（history 模式）？                                | 中       | Step 7C          |
| Q5   | Step 7D worker 的物流 API 選擇：OpenClaw（未實作）、E-Tracking（未確認可商用）、直接串接 7-11 / 全家 API？各方案的商業條款與技術可行性需先確認 | 中       | Step 7D          |
| Q6   | 若 trackingCode 有值，是否要提供「前往物流業者官網查詢」連結？若要提供，各 provider 的查詢 URL 格式需事先整理                                  | 低       | Step 7A / 7B     |
| Q7   | Step 7C 的 `failureCount` 閾值是多少才觸發停止自動查詢？                                                                                       | 低       | Step 7C / 7D     |
| Q8   | Step 7E 公開頁的貨態 history 是否需要任何身份驗證（僅 publicToken）？history 事件的顯示文字如何設計？                                          | 低       | Step 7E          |

---

## 附錄：概念對照表

> 防止混淆的核心定義，本規格中嚴格遵守。

| 概念         | 技術欄位                               | 建議 UI 文字              | 說明                                                                                    |
| ------------ | -------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| 訂單查詢入口 | `publicToken`                          | 訂單查詢碼 / 訂單查詢連結 | 客人用於進入 /track 頁面的 token，32 字元 hex，**不是物流追蹤碼**                       |
| 物流追蹤碼   | `trackingCode`                         | 物流追蹤碼                | 物流業者（如黑貓、7-11）的包裹追蹤號碼，由店家填入                                      |
| 配送方式     | `shippingMethod`                       | 取貨方式                  | enum（self_pickup / convenience_store / home_delivery / other），**不等於**物流業者名稱 |
| 物流業者     | `trackingProvider`                     | 物流業者                  | 目前為自由文字，Step 7B 後考慮 enum 標準化                                              |
| 超商門市代碼 | `cvsStoreId`（DB）/ `storeCode`（API） | 超商店號                  | 門市識別碼，**不是** trackingCode                                                       |
| 出貨狀態     | `shippingStatus`                       | 出貨狀態                  | enum（7 種值），代表訂單在物流流程中的位置                                              |

---

_文件版本：Step 7 規格 v1.0_
_撰寫日期：2026-06-06_
_撰寫：Claude B（Fixed Latest File Mode）_
_現況依據：docs/order-step7-current-field-audit.md（commit 8794d8c）_
_分支：fix/step6c0c-disable-cvs-emap-import_
