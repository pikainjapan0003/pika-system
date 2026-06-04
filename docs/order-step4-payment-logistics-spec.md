# Order Step 4：付款 / 物流欄位正式化規格（含後台手動訂單管理）

> 版本：Draft v3（Step 5A 付款 / 物流欄位正式化確認版）
> 最後更新：2026-06-04
> Step 4A–4D 狀態：已完成
> Step 5A 狀態：規格確認中（本文件）

---

## 1. 背景

目前「代購系統」的訂單管理已完成 Step 3B（訂單卡片 App 化 + 底部安全距離），但發現兩個重要缺口：

1. **付款 / 物流欄位仍是 placeholder**：店家無法在系統內記錄付款方式、付款狀態、出貨追蹤碼等資訊。
2. **無法手動新增或編輯訂單**：店家無法從後台手動建立訂單，也無法修改既有訂單的基本資料（買家姓名、電話、數量等）。

本規格文件定義 Step 4 所需的 DB 欄位、API 變更、UI 方向，並分階段拆解實作計畫。

**重要前提**：本次正式化為「手動管理」模式，不串接第三方金流（LINE Pay、綠界等），不串接物流 API（超商、宅配）。所有付款與物流狀態均由店家手動維護。

---

## 2. 重要缺口：後台無法手動新增 / 編輯訂單

### 2.1 問題說明

目前系統只有一種建立訂單的方式：**買家透過公開連結自行下單**（`POST /p/:shareToken/orders`）。

這導致後台無法處理代購的常見情境：

| 情境 | 說明 | 目前是否可行 |
|------|------|-------------|
| LINE 私訊下單 | 買家在 LINE 下單，店家在後台補建訂單 | ❌ 不可行 |
| 電話下單 | 買家電話，店家手動記錄 | ❌ 不可行 |
| 現場下單 | 展場 / 市集收單，回家再建立訂單 | ❌ 不可行 |
| 補單 | 之前漏單或臨時加購 | ❌ 不可行 |
| 修正買家資料 | 買家電話或地址填錯 | ❌ 不可行 |
| 修正數量 | 買家要改數量 | ❌ 不可行 |
| 修正備註 | 補充或更正備註 | ❌ 不可行 |

### 2.2 優先級調整

因為手動新增 / 編輯訂單是代購工作台的核心基礎能力，**必須在付款物流欄位正式化之前或同步處理**。

調整後的 Step 4 分階段順序見第 15 節。

---

## 3. 目前狀態

### 3.1 DB 層

使用 Drizzle ORM + PostgreSQL。`orders` 表定義在 `lib/db/src/schema/orders.ts`。

**現有 `status` 流程**（`orderStatusMachine.ts`）：
```
pending → awaiting_payment → preparing → shipped → completed
        ↘ cancelled (任意時機)
```

### 3.2 API 層

- `GET /stores/:storeId/orders` — 列出訂單（店家認證）
- `GET /stores/:storeId/orders/export` — 匯出 CSV（店家認證）
- `PATCH /orders/:orderId/status` — 更新訂單 status（店家認證）
- `POST /p/:shareToken/orders` — 買家建立訂單（公開，**唯一建單方式**）
- `GET /orders/track/:publicToken` — 買家查詢訂單（公開）

目前缺少：
- 店家後台建立訂單的 API
- 店家後台編輯訂單基本資料的 API
- PATCH 整體訂單欄位的 API（只有 status 更新）

### 3.3 前端層

`Orders.tsx` 使用欄位：
- 顯示：`id`, `buyerName`, `buyerPhone`, `totalPrice`, `pickupMethod`, `status`, `productName`, `quantity`, `createdAt`, `notes`, `specValues`, `unitPrice`, `publicToken`
- placeholder 顯示但無真實欄位：付款方式、付款狀態、運費、出貨狀態、物流追蹤碼
- **無新增訂單入口**
- **無編輯訂單按鈕**

---

## 4. 現有欄位盤點

| 欄位 | 來源 | DB 存在 | API 回傳 | UI 顯示 | 備註 |
|------|------|---------|----------|---------|------|
| `id` | DB | ✅ | ✅ | ✅ 訂單編號 `#N` | |
| `productId` | DB | ✅ | ✅ | ❌ | 僅後端用 |
| `storeId` | DB | ✅ | ✅ | ❌ | 僅後端用 |
| `productName` | DB | ✅ nullable | ✅ | ✅ 商品明細 | 建單時快照 |
| `publicToken` | DB | ✅ unique | ✅ | ✅ 複製追蹤連結 | 買家查詢用，非物流追蹤碼 |
| `buyerName` | DB | ✅ | ✅ | ✅ 買家資訊 | |
| `buyerPhone` | DB | ✅ | ✅ | ✅ 買家資訊 | |
| `pickupMethod` | DB | ✅ text | ✅ | ✅ 取貨方式 badge | 自由文字，買家填寫 |
| `notes` | DB | ✅ nullable | ✅ | ✅ 展開詳情 | 買家備註 |
| `specValues` | DB | ✅ jsonb | ✅ | ✅ 展開詳情 | |
| `quantity` | DB | ✅ | ✅ | ✅ 商品件數 | |
| `unitPrice` | DB | ✅ numeric | ✅ | ✅ 展開詳情 | |
| `totalPrice` | DB | ✅ numeric | ✅ | ✅ 卡片金額 | |
| `status` | DB | ✅ text + check | ✅ | ✅ 狀態 badge | 6 種 enum |
| `createdAt` | DB | ✅ | ✅ | ✅ 下單時間 | |
| `updatedAt` | DB | ✅ | ❌（API 未回傳） | ❌ | |

---

## 5. 缺少欄位盤點

| 欄位 | 分類 | 必要性 | 備註 |
|------|------|--------|------|
| `paymentMethod` | 付款 | 高 | 手動記錄付款方式 |
| `paymentStatus` | 付款 | 高 | 手動記錄是否已付款 |
| `paidAmount` | 付款 | 中 | 記錄已收金額，支援分批付款 |
| `paymentNote` | 付款 | 低 | 店家內部備註 |
| `shippingStatus` | 物流 | 高 | 手動記錄出貨狀態 |
| `trackingCode` | 物流 | 高 | 物流追蹤碼（非 publicToken） |
| `trackingProvider` | 物流 | 中 | 物流商名稱 |
| `shippingFee` | 物流/金額 | 中 | 運費 |
| `shippingMethod` | 物流 | 中 | 正式化出貨方式 enum |
| `recipientName` | 物流/收件 | 中 | 收件人姓名（可能不同於買家） |
| `recipientPhone` | 物流/收件 | 中 | 收件人電話 |
| `recipientAddress` | 物流/收件 | 中 | 宅配地址 |
| `convenienceStoreType` | 物流/收件 | 低 | 超商類型 enum |
| `cvStoreCode` | 物流/收件 | 低 | 超商門市代號 |
| `cvStoreName` | 物流/收件 | 低 | 超商門市名稱 |
| `shippingNote` | 物流 | 低 | 物流備註 |
| `internalNote` | 管理 | 低 | 店家內部備註（買家看不到） |
| `refundStatus` | 退款 | 低（MVP 後） | 退款狀態，建議 Step 4 後期 |
| `refundedAmount` | 退款 | 低（MVP 後） | 退款金額，建議 Step 4 後期 |

---

## 6. MVP 欄位設計

### 6.1 付款欄位

| 欄位名 | 型別 | Nullable | 預設值 | 說明 |
|--------|------|----------|--------|------|
| `paymentMethod` | text | ✅ | null | 付款方式 enum |
| `paymentStatus` | text | ✅ | `'unpaid'` | 付款狀態 enum |
| `paidAmount` | numeric(10,2) | ✅ | null | 已付金額 |
| `paymentNote` | text | ✅ | null | 付款備註（店家內部） |

### 6.2 物流欄位（MVP）

| 欄位名 | 型別 | Nullable | 預設值 | 說明 |
|--------|------|----------|--------|------|
| `shippingStatus` | text | ✅ | `'not_shipped'` | 出貨狀態 enum |
| `trackingCode` | text | ✅ | null | 物流追蹤碼 |
| `trackingProvider` | text | ✅ | null | 物流商，如「黑貓」、「統一速達」 |
| `shippingFee` | numeric(10,2) | ✅ | null | 運費 |
| `shippingMethod` | text | ✅ | null | 出貨方式 enum |
| `shippingNote` | text | ✅ | null | 物流備註 |

### 6.3 收件資訊（MVP，僅宅配場景）

| 欄位名 | 型別 | Nullable | 預設值 | 說明 |
|--------|------|----------|--------|------|
| `recipientName` | text | ✅ | null | 收件人姓名（預設可從 buyerName 推導） |
| `recipientPhone` | text | ✅ | null | 收件人電話 |
| `recipientAddress` | text | ✅ | null | 宅配完整地址 |

### 6.4 超商取貨欄位（MVP，僅超商場景）

| 欄位名 | 型別 | Nullable | 預設值 | 說明 |
|--------|------|----------|--------|------|
| `convenienceStoreType` | text | ✅ | null | 超商類型 enum |
| `cvStoreCode` | text | ✅ | null | 門市代號 |
| `cvStoreName` | text | ✅ | null | 門市名稱 |

### 6.5 管理欄位

| 欄位名 | 型別 | Nullable | 預設值 | 說明 |
|--------|------|----------|--------|------|
| `internalNote` | text | ✅ | null | 店家內部備註（買家不可見） |

### 6.6 金額欄位建議

現有 `totalPrice` 沿用，**不重命名**，避免大範圍 migration。

新增：
- `shippingFee`（已在 6.2）
- `paidAmount`（已在 6.1）
- `remainingAmount` = `totalPrice + shippingFee - paidAmount`，由前端或 API 推導，**不存 DB**

退款欄位（`refundStatus`、`refundedAmount`）**暫緩至 Step 4 後期**，不列入 MVP。

---

## 7. Enum 設計

### 7.1 paymentMethod

```typescript
export const paymentMethodEnum = [
  'cash',              // 現金
  'bank_transfer',     // ATM / 銀行轉帳
  'line_pay_manual',   // LINE Pay（店家手動確認，非串接）
  'other',             // 其他
] as const;
```

### 7.2 paymentStatus

```typescript
export const paymentStatusEnum = [
  'unpaid',    // 未付款（預設）
  'partial',   // 已付部分
  'paid',      // 已全額付清
  'refunded',  // 已退款
] as const;
```

> ⚠️ 注意：`paymentStatus = 'paid'` 由**店家手動標記**，不等於金流系統自動確認。

### 7.3 shippingStatus

```typescript
export const shippingStatusEnum = [
  'not_shipped',  // 未出貨（預設）
  'preparing',    // 備貨中（可與 order.status 搭配）
  'shipped',      // 已出貨（已有追蹤碼）
  'delivered',    // 已送達
  'returned',     // 退貨中
] as const;
```

> ⚠️ 注意：`shippingStatus` 與 `order.status` 是兩個不同維度，不可合併。

### 7.4 shippingMethod

```typescript
export const shippingMethodEnum = [
  'self_pickup',             // 自取
  'home_delivery',           // 宅配（黑貓、新竹等）
  'seven_eleven_prepaid',    // 7-11 超商寄件（店到店）
  'familymart_prepaid',      // 全家超商寄件
  'hilife_prepaid',          // 萊爾富超商寄件
  'okmart_prepaid',          // OK 超商寄件
  'other',                   // 其他
] as const;
```

### 7.5 convenienceStoreType

```typescript
export const convenienceStoreTypeEnum = [
  'seven_eleven',   // 7-11
  'familymart',     // 全家
  'hilife',         // 萊爾富
  'okmart',         // OK
] as const;
```

### 7.6 status 與 paymentStatus / shippingStatus 的分工

| order.status | paymentStatus 預期 | shippingStatus 預期 |
|---|---|---|
| `pending` | `unpaid` | `not_shipped` |
| `awaiting_payment` | `unpaid` | `not_shipped` |
| `preparing` | `unpaid` 或 `paid`（由店家確認） | `not_shipped` 或 `preparing` |
| `shipped` | `paid`（建議） | `shipped` |
| `completed` | `paid` | `delivered` |
| `cancelled` | `unpaid` 或 `refunded` | `not_shipped` 或 `returned` |

> 三個 status 各自獨立維護，不強制聯動。但可在 UI 給予建議提示。

---

## 8. 後台手動新增訂單規格

### 8.1 使用情境

代購店家常見的線下 / 非網頁下單情境，需要從後台手動建立訂單：

- LINE 私訊收單（買家傳訊息給店家，店家手動新增）
- 電話收單
- 展場 / 市集現場收單
- 補單（之前漏單或臨時加購）
- 代買人代下（店家替買家建單）

### 8.2 MVP 範圍

手動新增訂單 MVP 包含：

| 欄位 | 必填 | 說明 |
|------|------|------|
| `productId` | ✅ | 選擇商品（從店家商品清單選） |
| `buyerName` | ✅ | 買家姓名 |
| `buyerPhone` | ✅ | 買家電話 |
| `quantity` | ✅ | 數量，最少 1 |
| `pickupMethod` | ✅ | 取貨方式（自由文字，或選項） |
| `notes` | ❌ | 買家備註 / 訂單備註 |
| `specValues` | 視商品 | 商品有規格時必填 |

Server 負責：
- 驗證 store 擁有者身份
- 驗證 `productId` 屬於該 store
- 從商品讀取 `productName` 快照（不使用前端傳入）
- 從商品讀取 `unitPrice` 快照（不使用前端傳入）
- 計算 `totalPrice = unitPrice × quantity`
- `status` 預設 `'pending'`
- 生成 `publicToken`（與公開下單相同機制）
- 寫入 `orders` table

### 8.3 MVP 暫不包含

- 多商品同一訂單
- 折扣欄位
- 運費（建單後可透過付款物流欄位補填）
- 已付金額
- 付款狀態正式欄位（建單後可透過付款物流欄位補填）
- 物流追蹤碼
- 第三方金流
- 第三方物流
- PDF / 列印
- 庫存扣減（與公開下單行為一致：只有在商品有設 inventory 時才扣）

### 8.4 商品快照規則

手動新增訂單時，`productName` 和 `unitPrice` 必須從商品資料**快照**，不能由店家前端直接傳入：

- Server 讀取 `productsTable` 的目前商品資料
- 寫入 `orders.productName = product.name`
- 寫入 `orders.unitPrice = product.price`
- 如果商品日後改價，訂單的 `unitPrice` 不會自動變動（此為設計意圖）

> ⚠️ 注意：若商品已下架（`isActive = false`），是否仍允許手動建單？建議：允許，但加上警告提示（UI）。

### 8.5 API 建議

**新增 endpoint**：

```
POST /stores/:storeId/orders
```

**認證**：`requireAuth` + `verifyStoreOwner`

**Request Body**：
```json
{
  "productId": 42,
  "buyerName": "陳小明",
  "buyerPhone": "0912345678",
  "quantity": 2,
  "pickupMethod": "超商取貨",
  "notes": "需要袋裝",
  "specValues": { "口味": "原味" }
}
```

**Response**：與現有 `GET /stores/:storeId/orders` 單筆訂單格式相同（201 Created）

**注意**：
- `productName` / `unitPrice` 由 server 從 DB 取得，前端不得覆寫
- `totalPrice` 由 server 計算
- `status` 固定 `'pending'`
- `publicToken` 由 server 生成（同公開下單邏輯）
- 若商品不屬於該 store，回傳 403
- 若 `productId` 不存在，回傳 404

### 8.6 UI 流程建議

1. `/orders` 頁面右上角（CSV 匯出旁）新增「＋ 新增訂單」按鈕
2. 手機版：點擊後開啟 bottom sheet 或跳轉至獨立頁 `/orders/new`
3. 表單區塊（建議順序）：
   - **選擇商品**：商品清單下拉 / 搜尋選擇，選後自動帶入商品名稱 / 單價
   - **買家資訊**：姓名（必填）、電話（必填）
   - **數量與規格**：數量 input，如有規格顯示規格選擇
   - **取貨方式**：自由文字 input 或預設選項
   - **備註**：optional
   - **金額預覽**：`單價 × 數量 = 合計`（即時計算，不可手動修改）
4. 送出後回到訂單列表，新建訂單出現於最上方
5. 若建立失敗，顯示錯誤訊息，表單資料保留

### 8.7 風險與注意事項

- 金額應完全由 server 計算，前端只顯示 preview，**不可讓店家直接輸入 totalPrice 或 unitPrice**
- 不可建立屬於其他 store 的商品訂單
- 手動建立訂單的買家無法自行查詢（他們沒有 publicToken 連結），需由店家提供追蹤連結
- 建議 UI 建立成功後提示「可複製追蹤連結傳給買家」

---

## 9. 後台手動編輯訂單規格

### 9.1 使用情境

- 買家電話或姓名填錯，需要修正
- 數量臨時調整（多買 / 少買）
- 備註補充或更正
- 取貨方式調整

### 9.2 MVP 可編輯欄位

| 欄位 | 可編輯 | 說明 |
|------|--------|------|
| `buyerName` | ✅ | 買家姓名 |
| `buyerPhone` | ✅ | 買家電話 |
| `pickupMethod` | ✅ | 取貨方式 |
| `notes` | ✅ | 買家備註 |
| `quantity` | ✅ | 數量（修改後自動重算 totalPrice）|
| `specValues` | ✅ | 商品規格（若資料結構支援） |

### 9.3 MVP 不可編輯欄位

| 欄位 | 不可編輯 | 原因 |
|------|---------|------|
| `productId` | ❌ | 改商品等於重新建單 |
| `unitPrice` | ❌ | 快照價不應手動改（列為後期功能） |
| `totalPrice` | ❌ | 由 server 根據 unitPrice × quantity 重算 |
| `productName` | ❌ | 快照欄位 |
| `publicToken` | ❌ | 買家追蹤連結不可改 |
| `status` | ❌（用現有機制）| 繼續用既有 `PATCH /orders/:orderId/status` |

### 9.4 數量修改的金額計算規則

- 修改 `quantity` 時：`totalPrice = unitPrice（原快照）× 新 quantity`
- `unitPrice` **不因商品後續改價而變動**，沿用建單時的快照值
- 若需修改 `unitPrice`，列為後續功能，不在 MVP 範圍

### 9.5 completed / cancelled 訂單的編輯限制

**待確認**（見第 17 節問題 10）

建議方案：
- `completed` 訂單：**禁止編輯**，顯示「此訂單已完成，無法修改基本資料」
- `cancelled` 訂單：**禁止編輯**，顯示「此訂單已取消，無法修改基本資料」
- 若有特殊需求，可由店家先將訂單取消後重建

### 9.6 API 建議

**新增 endpoint**（與付款物流共用，但欄位分開定義）：

```
PATCH /orders/:orderId
```

**認證**：`requireAuth` + `verifyStoreOwner`

**基本資料更新 Request Body**（所有欄位 optional）：
```json
{
  "buyerName": "王小花",
  "buyerPhone": "0987654321",
  "pickupMethod": "面交",
  "notes": "更新備註",
  "quantity": 3,
  "specValues": { "口味": "抹茶" }
}
```

**注意**：
- `quantity` 傳入時，server 需重算 `totalPrice = unitPrice × quantity`
- `unitPrice` 不在 request body 中（由 server 從 DB 中的快照取）
- `completed` / `cancelled` 訂單回傳 422 + 錯誤說明（待確認）
- `PATCH /orders/:orderId` 同時也處理付款物流欄位更新（見第 10 節），兩者合用一個 endpoint

### 9.7 UI 流程建議

1. 訂單展開詳情下方（或訂單詳情頁）提供「編輯基本資料」按鈕
2. 點擊後進入編輯模式（inline edit 或跳至編輯頁）
3. 編輯 `quantity` 時，即時顯示重算後的 `totalPrice` preview
4. 儲存前顯示確認提示（若金額有變更）
5. `completed` / `cancelled` 訂單的「編輯」按鈕 disabled，顯示原因
6. 儲存成功後回到詳情，顯示更新後資料

---

## 10. API 變更建議

### 10.1 新增 API：後台建立訂單

```
POST /stores/:storeId/orders
```

**用途**：店家手動新增訂單（詳見第 8 節）

**認證**：`requireAuth` + `verifyStoreOwner`

**重要規則**：
- `productName` / `unitPrice` 由 server 從 DB 取得快照
- `totalPrice` 由 server 計算
- `publicToken` 由 server 生成
- 驗證 `productId` 屬於該 store

### 10.2 新增 API：後台更新訂單

```
PATCH /orders/:orderId
```

**用途**：店家更新訂單基本資料 + 付款欄位 + 物流欄位

**認證**：`requireAuth` + `verifyStoreOwner`

**Request Body**（所有欄位 optional，分為三類）：

**基本資料類**：
```json
{
  "buyerName": "王小花",
  "buyerPhone": "0987654321",
  "pickupMethod": "面交",
  "notes": "備註",
  "quantity": 3,
  "specValues": { "口味": "抹茶" }
}
```

**付款欄位類**：
```json
{
  "paymentMethod": "bank_transfer",
  "paymentStatus": "paid",
  "paidAmount": 1000.00,
  "paymentNote": "ATM 末5碼12345"
}
```

**物流欄位類**：
```json
{
  "shippingStatus": "shipped",
  "trackingCode": "123456789",
  "trackingProvider": "黑貓宅急便",
  "shippingFee": 60.00,
  "shippingMethod": "home_delivery",
  "shippingNote": "請放門口",
  "recipientName": "陳小明",
  "recipientPhone": "0912345678",
  "recipientAddress": "台北市中山區中山北路一段1號3F",
  "convenienceStoreType": null,
  "cvStoreCode": null,
  "cvStoreName": null,
  "internalNote": "店家備注"
}
```

**Server 驗證規則**：
- 驗證 enum 值合法性（paymentMethod / paymentStatus / shippingStatus / shippingMethod / convenienceStoreType）
- `quantity` 傳入時重算 `totalPrice`
- `paidAmount <= totalPrice + shippingFee`
- `completed` / `cancelled` 訂單的基本資料欄位禁止修改（待確認）
- `internalNote` 欄位**不應出現在公開訂單追蹤 API**

**注意**：`status` 仍透過現有 `PATCH /orders/:orderId/status` 更新，不在本 endpoint 處理。

### 10.3 現有 API 變動

#### `GET /stores/:storeId/orders`

**回傳新增欄位**（全部 nullable，向後相容）：
```json
{
  "paymentMethod": null,
  "paymentStatus": "unpaid",
  "paidAmount": null,
  "paymentNote": null,
  "shippingStatus": "not_shipped",
  "trackingCode": null,
  "trackingProvider": null,
  "shippingFee": null,
  "shippingMethod": null,
  "shippingNote": null,
  "recipientName": null,
  "recipientPhone": null,
  "recipientAddress": null,
  "convenienceStoreType": null,
  "cvStoreCode": null,
  "cvStoreName": null,
  "internalNote": null
}
```

#### `PATCH /orders/:orderId/status`（現有）

不變，繼續只更新 `status` 欄位。

#### CSV 匯出新增欄位

`GET /stores/:storeId/orders/export` 建議新增欄位：
- 付款方式
- 付款狀態
- 已付金額
- 出貨狀態
- 追蹤碼
- 運費

### 10.4 公開 API 變動

`GET /orders/track/:publicToken`（買家追蹤）建議新增回傳：
```json
{
  "shippingStatus": "shipped",
  "shippingStatusLabel": "已出貨",
  "trackingCode": "123456789",
  "trackingProvider": "黑貓宅急便"
}
```

> ⚠️ **不回傳** `internalNote`、`paymentNote`、`paidAmount`、`recipientAddress` 等敏感欄位。

### 10.5 Backward Compatibility

- 所有新欄位為 nullable，現有訂單值為 null
- `paymentStatus` 預設 `'unpaid'`，`shippingStatus` 預設 `'not_shipped'`
- OpenAPI spec 更新後需重新執行 orval codegen
- 前端 generated client 需重新 generate

---

## 11. 前端 UI 變更建議

### 11.1 訂單卡片（列表）

保持 Step 3B 已完成的 4 層結構。變動：

- Row 4 出貨狀態 badge：由目前保守推導（derived from `order.status`）改為直接讀取 `shippingStatus` 欄位
- Row 3 付款狀態：可在 `paymentStatus === 'paid'` 時加入「已付款」badge（綠色）
- 右上角新增「＋ 新增訂單」按鈕（Step 4C）

### 11.2 訂單展開詳情

**買家資訊區（新增編輯功能）：**

| 欄位 | 顯示內容 | 可編輯 |
|------|----------|--------|
| 姓名 | buyerName | ✅（Step 4D） |
| 電話 | buyerPhone | ✅（Step 4D） |

**商品明細區（quantity 可編輯）：**

| 欄位 | 顯示內容 | 可編輯 |
|------|----------|--------|
| 商品名稱 | productName | ❌（快照） |
| 數量 | quantity | ✅（Step 4D，重算金額）|
| 單價 | unitPrice | ❌（快照） |
| 總金額 | totalPrice（重算後）| ❌（自動計算） |

**付款資訊區（由 placeholder 升級）：**

| 欄位 | 顯示內容 | 可編輯 |
|------|----------|--------|
| 付款方式 | paymentMethod label 或 placeholder | ✅（Step 4F） |
| 付款狀態 | paymentStatus badge（未付款 / 已付款）| ✅（Step 4F） |
| 已付金額 | paidAmount / totalPrice | ✅（Step 4F） |
| 運費 | shippingFee | ✅（Step 4F） |
| 付款備註 | paymentNote | ✅（Step 4F） |

**物流資訊區（由 placeholder 升級）：**

| 欄位 | 顯示內容 | 可編輯 |
|------|----------|--------|
| 出貨方式 | shippingMethod label | ✅（Step 4F） |
| 出貨狀態 | shippingStatus badge | ✅（Step 4F） |
| 追蹤碼 | trackingCode + trackingProvider | ✅（Step 4F） |
| 物流備註 | shippingNote | ✅（Step 4F） |
| 收件人 | recipientName / recipientPhone | ✅（Step 4F） |
| 地址 | recipientAddress（宅配時） | ✅（Step 4F） |
| 超商資訊 | cvStoreCode / cvStoreName（超商時）| ✅（Step 4F） |

**取貨方式區（新增編輯功能）：**

| 欄位 | 顯示內容 | 可編輯 |
|------|----------|--------|
| 取貨方式 | pickupMethod | ✅（Step 4D） |
| 備註 | notes | ✅（Step 4D） |

### 11.3 金額明細區（新增區塊，Step 4F）

```
商品金額：NT$1,000
運費：     NT$60
─────────────
合計：     NT$1,060
已付款：   NT$1,000
待收款：   NT$60
```

### 11.4 手機操作

- 追蹤碼可複製（類似現有電話複製）
- 付款狀態 / 出貨狀態可點擊快速切換（inline button，不開 modal）
- 敏感資料（地址）需謹慎處理，不建議在列表卡片顯示

---

## 12. 資料遷移策略

### 12.1 現有訂單欄位 fallback

| 新欄位 | 現有訂單預設值 | 說明 |
|--------|---------------|------|
| `paymentMethod` | `null` | 現有訂單不強制填 |
| `paymentStatus` | `'unpaid'` | 保守預設，店家自行更新 |
| `paidAmount` | `null` | 未知，不填 |
| `shippingStatus` | 推導（見下） | |
| `trackingCode` | `null` | |
| `shippingFee` | `null` | |
| `recipientName` | `null` | 可從 `buyerName` 手動複製 |

### 12.2 shippingStatus 現有訂單推導

Migration 後可用 SQL UPDATE 給既有訂單設定合理初始值：

```sql
UPDATE orders SET shipping_status = 'shipped'
WHERE status IN ('shipped', 'completed');

UPDATE orders SET shipping_status = 'not_shipped'
WHERE status IN ('pending', 'awaiting_payment', 'preparing');

UPDATE orders SET shipping_status = 'returned'
WHERE status = 'cancelled';
```

> 此推導非完美，僅提供初始值。店家仍需人工確認。

### 12.3 totalPrice 沿用

`totalPrice` 欄位名稱不變，不重命名為 `subtotalAmount`，避免大範圍 API / 前端 migration。

### 12.4 pickupMethod 沿用

`pickupMethod` 是買家在下單時填寫的自由文字（或選項），保留不動。

新的 `shippingMethod` 是店家端設定的正式出貨方式 enum，兩者可並存：
- `pickupMethod` = 買家要求的取件方式
- `shippingMethod` = 店家實際使用的物流方式

---

## 13. 測試計畫

### 13.1 DB Migration 測試

- [ ] migration 在測試 DB 執行無錯誤
- [ ] 所有新欄位都是 nullable / 有預設值，不影響現有資料
- [ ] rollback migration 可正確執行
- [ ] 既有訂單資料在 migration 後完整

### 13.2 後台手動新增訂單 API 測試

- [ ] 店家可用自己 store 的商品建立訂單
- [ ] 不可用其他 store 的商品建立訂單（回傳 403）
- [ ] `productName` / `unitPrice` 由 server 從 DB 取得，與前端輸入無關
- [ ] `totalPrice = unitPrice × quantity` 計算正確
- [ ] `status` 預設 `'pending'`
- [ ] `publicToken` 成功生成且唯一
- [ ] 必填欄位（buyerName / buyerPhone / quantity / pickupMethod）驗證
- [ ] `quantity < 1` 回傳 422
- [ ] 未認證呼叫回傳 401
- [ ] 商品已下架時仍可建立（或依規格拒絕，待確認）

### 13.3 後台手動編輯訂單 API 測試

- [ ] 店家可修改自己的訂單 buyerName / buyerPhone / pickupMethod / notes
- [ ] `quantity` 修改後，`totalPrice` 自動重算為 `unitPrice × 新 quantity`
- [ ] `unitPrice` 不因商品改價而改變（快照保留）
- [ ] `productId` / `unitPrice` / `productName` 無法透過 PATCH 修改
- [ ] `completed` / `cancelled` 訂單的基本資料修改行為符合規格（待確認 §17）
- [ ] 不可修改其他 store 的訂單（回傳 403）
- [ ] 未認證回傳 401
- [ ] enum 欄位傳入無效值回傳 422

### 13.4 付款物流欄位 API 測試

- [ ] `PATCH /orders/:orderId` 可更新付款欄位
- [ ] `PATCH /orders/:orderId` 可更新物流欄位
- [ ] `PATCH /orders/:orderId` 傳入無效 enum 值回傳 422
- [ ] `paidAmount > totalPrice + shippingFee` 回傳 422
- [ ] 未認證或非店主回傳 401/403
- [ ] 公開 API `GET /orders/track/:publicToken` 不洩漏 internalNote / paidAmount / recipientAddress
- [ ] CSV 匯出包含新欄位

### 13.5 前端顯示測試

- [ ] 「＋ 新增訂單」按鈕顯示在 /orders 頁面
- [ ] 新增訂單表單可選擇商品並帶入名稱 / 單價
- [ ] 新增訂單金額 preview 即時更新
- [ ] 新增訂單後列表出現新訂單
- [ ] 展開訂單詳情出現「編輯基本資料」按鈕
- [ ] 編輯數量後金額 preview 重算
- [ ] 付款資訊區顯示真實欄位值（非 placeholder）
- [ ] 物流資訊區顯示真實欄位值（非 placeholder）
- [ ] paymentStatus badge 顏色正確
- [ ] shippingStatus badge 顏色正確

### 13.6 權限測試

- [ ] 店家 A 無法修改店家 B 的訂單
- [ ] 店家 A 無法用店家 B 的商品新增訂單
- [ ] 未登入無法呼叫任何 write API
- [ ] 公開 API 不回傳 internalNote

### 13.7 金額計算測試

- [ ] `totalPrice = unitPrice × quantity` 計算正確（新增）
- [ ] `totalPrice = unitPrice × quantity` 重算正確（編輯 quantity）
- [ ] `shippingFee + totalPrice` 顯示合計正確
- [ ] `remainingAmount = totalPrice + shippingFee - paidAmount` 計算正確
- [ ] `paidAmount = totalPrice + shippingFee` 時 `remainingAmount = 0`

### 13.8 回歸測試

- [ ] 搜尋 / 篩選 / 統計卡 仍可用
- [ ] 展開 / 收合訂單詳情 仍可用
- [ ] 現有狀態更新按鈕（PATCH /orders/:orderId/status）仍可用
- [ ] CSV 匯出現有欄位仍正確
- [ ] 公開訂單建立 / 追蹤 仍可用
- [ ] 公開下單流程（`POST /p/:shareToken/orders`）不受影響

---

## 14. 風險與客服注意事項

### 14.1 不等於金流已串接

本系統的「付款方式」與「付款狀態」均為**店家手動記錄欄位**，不連接任何第三方支付平台。

- ❌ LINE Pay 按鈕不會出現
- ❌ 金流驗證不會自動發生
- ✅ 店家可以記錄「買家說他轉帳了」
- ✅ 店家可以標記「我確認收到款項」

前端文案建議：「店家確認後標記已付款」而非「系統自動確認」。

### 14.2 不等於物流已串接

`trackingCode` 由店家**手動填入**，不連接超商 API 或宅配 API。

- ❌ 不會自動向超商/宅配查詢包裹狀態
- ✅ 買家可以複製追蹤碼去物流商官網查詢
- ✅ `shippingStatus` 由店家手動更新

前端文案建議：「複製追蹤碼」而非「即時追蹤」。

### 14.3 手動新增訂單的金額責任

店家手動新增訂單時，金額由系統根據商品當時的標價計算。若商品後續改價，既有訂單金額不變，可能與買家記憶中的報價不同。

建議：
- UI 顯示「建單時商品單價 NT$XXX」
- 不開放店家手動輸入 unitPrice（MVP 階段）

### 14.4 手動建立訂單的買家通知

手動建立的訂單，買家不會自動收到通知（系統目前無 SMS / Email 通知功能）。

建議：
- UI 提示店家「建立後請自行透過 LINE 等管道告知買家追蹤連結」
- 提供「複製追蹤連結」按鈕

### 14.5 編輯訂單資料的客服風險

若店家修改了買家姓名或電話，公開追蹤頁的資料也會同步更新，可能與買家手上的資訊不符。

建議：
- UI 顯示「最後修改時間」
- completed / cancelled 訂單建議禁止編輯基本資料（避免事後竄改）

### 14.6 地址資料個資保護

- `recipientAddress` 是高度敏感個資，絕對不可出現在：
  - 訂單卡片列表
  - 公開訂單追蹤 API 回傳
- 只應在展開訂單詳情（已登入店家）時顯示
- CSV 匯出時需注意保護，建議加入匯出授權確認

### 14.7 退款流程（MVP 不包含）

本次 MVP 不包含退款欄位。若有退款需求：
- 當前建議：店家在 `paymentNote` / `internalNote` 手動記錄
- 未來 Step 4 後期再規劃 `refundStatus` / `refundedAmount`

---

## 15. 分階段實作建議（更新版）

### Step 4A：規格文件補強（本文件）
- 盤點現有欄位
- 確認後台無法手動新增 / 編輯訂單的缺口
- 定義手動新增 / 編輯訂單 MVP 規格
- 定義付款 / 物流 MVP 欄位
- 設計 enum
- 定義 API 變更
- 確認 UI 方向
- **狀態：✅ 已完成**

### Step 4B：DB / API 支援後台手動新增訂單與編輯訂單
- 新增 `POST /stores/:storeId/orders` endpoint（店家後台建立訂單）
- 新增 `PATCH /orders/:orderId` endpoint（店家後台編輯訂單基本資料）
- 同步新增付款 / 物流欄位到 DB schema（`lib/db/src/schema/orders.ts`）
- 更新 `lib/api-spec/openapi.yaml`
- 重新執行 orval codegen（`lib/api-client-react`、`lib/api-zod`）
- 更新 `GET /stores/:storeId/orders` 回傳新欄位
- 更新 `GET /orders/track/:publicToken` 回傳出貨資訊
- 執行 DB migration
- **狀態：✅ 已完成**

### Step 4C：後台手動新增訂單 UI
- `/orders` 頁面新增「＋ 新增訂單」按鈕
- 新增訂單表單（商品選擇 / 買家資訊 / 數量規格 / 取貨方式 / 備註 / 金額預覽）
- 建立後回到訂單列表
- **狀態：✅ 已完成**

### Step 4D：後台手動編輯訂單 UI
- 訂單展開詳情增加「編輯基本資料」功能
- 可編輯：buyerName / buyerPhone / pickupMethod / notes / quantity / specValues
- quantity 修改後即時顯示重算金額
- completed / cancelled 訂單禁止編輯
- **狀態：✅ 已完成**

### Step 4E：付款 / 物流欄位正式化 UI
- `Orders.tsx` 付款資訊區接真實欄位（移除 placeholder）
- `Orders.tsx` 物流資訊區接真實欄位（移除 placeholder）
- 新增付款方式 / 狀態的 inline 快速更新 UI
- 新增出貨狀態 / 追蹤碼的 inline 快速更新 UI

### Step 4F：訂單詳情完整工作台
- 獨立訂單詳情頁 `/orders/:id`（或 bottom sheet）
- 完整金額明細（商品金額 + 運費 + 已付 + 待收）
- 收件人資訊區
- 超商資訊區
- 店家備註區

### Step 4G：批次狀態更新
- 訂單列表多選
- 批次更新付款狀態
- 批次更新出貨狀態

### Step 4H：文件 / 列印 / 出貨單
- 撿貨單（商品彙總）
- 銷貨單（金額彙總）
- 出貨標籤（收件人 + 地址）
- PDF / 列印支援

---

## 16. 非目標

本規格文件及後續 Step 4 系列**不包含**：

- 串接第三方金流（LINE Pay、綠界、藍新等）
- 串接超商 API（7-ELEVEN、全家 B2C）
- 串接宅配 API（黑貓、新竹等）
- 自動更新追蹤狀態
- 退款自動化
- 發票 / 電子收據
- 多幣種
- 分期付款
- 多商品同一訂單
- 訂單金額手動折扣輸入
- 手動修改 unitPrice（快照保護）
- 買家地址自動驗證
- 大量出貨批次介面（超過 4G 的複雜程度）
- 店家手動修改 productId（等於重新建單）

---

## 17. 待確認問題

以下問題需使用者 / Product 確認後才進入 Step 4B 實作：

1. **pickupMethod 正式化**：現有 `pickupMethod` 是自由文字，是否要在 Step 4B 保持自由文字並只新增 `shippingMethod` enum？或是要將 `pickupMethod` 也正式化？
   - 建議：保持自由文字，只新增 `shippingMethod`

2. **shippingFee 來源**：運費是由店家事後填寫，還是要在商品設定就定義？
   - 建議：事後由店家 PATCH 填寫（MVP 簡單做）

3. **paymentStatus 預設值**：對現有訂單（migration 前），`paymentStatus` 應預設 `'unpaid'` 還是 `null`？
   - 建議：`'unpaid'`（有預設值，前端可顯示）

4. **公開追蹤頁是否顯示追蹤碼**：買家可見的追蹤頁是否應顯示 `trackingCode`？
   - 建議：是，但加上「由店家提供」說明

5. **recipientName 與 buyerName 的關係**：收件人是否預設等於買家？
   - 建議：UI 預填 buyerName，但允許店家修改

6. **internalNote 顯示位置**：店家備註是否應在展開詳情中單獨顯示，還是整合到現有 `notes`（買家備註）旁邊？
   - 建議：兩者分開顯示（`notes` 是買家備註，`internalNote` 是店家備註）

7. **shippingStatus 初始值 migration**：是否要在 migration 時根據現有 `status` 自動設定 `shippingStatus` 初始值？
   - 建議：是（見第 12.2 節 SQL）

8. **Step 4B 優先範圍**：DB + API，或是也包含 orval codegen 重新 generate？
   - 建議：Step 4B 包含 DB + API + openapi.yaml + codegen，一起做以保持一致性

9. **已下架商品是否允許手動建單**：若商品 `isActive = false`，店家後台手動新增訂單時是否允許？
   - 建議：允許，但 UI 顯示警告「此商品已下架」

10. **completed / cancelled 訂單是否允許編輯基本資料**：
    - 建議：禁止修改（顯示已結束訂單無法修改），避免事後竄改

11. **手動新增訂單的庫存扣減**：與公開下單相同（有設 inventory 才扣）？還是後台手動不扣庫存？
    - 建議：與公開下單一致，有設 inventory 才扣

12. **新增訂單 UI 入口位置**：右上角 button？或 FAB（浮動新增按鈕）？
    - 建議：右上角 button（現有 CSV 匯出旁），手機版可考慮 FAB

---

## 18. Step 5A：付款 / 物流欄位正式化規格確認（2026-06-04）

### 18.1 背景

Step 4B / 4C / 4D 已完成後台手動建立 / 編輯訂單功能。訂單詳情中仍有下列 placeholder 尚未連接真實欄位：

- 付款方式（`paymentMethod`）
- 付款狀態（`paymentStatus`）
- 運費（`shippingFee`）— 注意：DB 已有此欄位（default `'0'`），需確認 API 是否已回傳
- 出貨狀態（`shippingStatus`）
- 物流追蹤碼（`trackingCode`）

**Step 5A 本次任務範圍：僅做規格確認與任務切分，不修改 DB schema、不修改 API、不修改 UI、不執行 migration。**

---

### 18.2 DB 欄位現況確認

依 `lib/db/src/schema/orders.ts` 目前狀態：

**已存在於 DB（無需 migration）：**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `shippingFee` | numeric(10,2) NOT NULL DEFAULT `'0'` | 運費，Step 5C 確認 API 是否已回傳 |
| `cvsStoreId` | text nullable | 超商門市代號（Step 5A 命名對應：`storeCode`） |
| `cvsStoreName` | text nullable | 超商門市名稱（Step 5A 命名對應：`storeName`） |
| `cvsStoreAddress` | text nullable | 超商門市地址 |
| `cvsStorePhone` | text nullable | 超商門市電話 |
| `storeSelectedBy` | text nullable | 門市選擇者（`customer` / `admin` / `system`） |
| `storeSelectedAt` | timestamp nullable | 門市選擇時間 |

**尚未存在於 DB（需 Step 5B migration 新增）：**

`paymentMethod`、`paymentStatus`、`paidAmount`、`paymentNote`、
`shippingMethod`、`shippingStatus`、`recipientName`、`recipientPhone`、
`recipientAddress`、`trackingCode`、`trackingProvider`、`shippingNote`、`internalNote`

---

### 18.3 付款欄位完整規格

| 欄位名 | 型別建議 | 預設值 | 公開給買家 | 可手動編輯 | 影響金額計算 | 說明 |
|--------|---------|--------|-----------|-----------|------------|------|
| `paymentMethod` | text nullable | `null` | ❌ | ✅ | ❌ | 付款方式 enum；null 表示未設定 |
| `paymentStatus` | text nullable | `'unpaid'` | 有限（見 18.12） | ✅ | ❌ | 付款狀態 enum；店家手動標記，非自動驗證 |
| `paidAmount` | numeric(10,2) nullable | `null` | ❌ | ✅ | ✅（推導 remainingAmount） | 已收款金額；null 視同 0 |
| `paymentNote` | text nullable | `null` | ❌ | ✅ | ❌ | 店家付款備註；任何公開 API 均不可回傳 |

---

### 18.4 物流欄位完整規格

| 欄位名 | 型別建議 | 預設值 | 公開給買家 | 可手動編輯 | 影響金額計算 | 說明 |
|--------|---------|--------|-----------|-----------|------------|------|
| `shippingMethod` | text nullable | `null` | ❌ | ✅ | ❌ | 出貨方式 enum |
| `shippingStatus` | text nullable | `'not_shipped'` | ✅（有限） | ✅ | ❌ | 出貨狀態 enum；店家手動記錄，非 API 即時狀態 |
| `shippingFee` | numeric(10,2) NOT NULL | `0` | ❌ | ✅ | ✅（計入 orderTotal） | DB 已存在；Step 5C 補充 API 回傳 |
| `recipientName` | text nullable | `null`（UI 預填 buyerName） | ❌ | ✅ | ❌ | 收件人姓名；可能與買家姓名不同 |
| `recipientPhone` | text nullable | `null` | ❌ | ✅ | ❌ | 收件人電話（個資） |
| `recipientAddress` | text nullable | `null` | ❌（個資保護） | ✅ | ❌ | 宅配地址；任何公開 API 均不可回傳 |
| `storeCode` | text nullable | `null` | ❌ | ✅ | ❌ | 超商門市代號；DB 欄位對應 `cvsStoreId`，Step 5B 確認命名 |
| `storeName` | text nullable | `null` | ❌ | ✅ | ❌ | 超商門市名稱；DB 欄位對應 `cvsStoreName`，Step 5B 確認命名 |
| `trackingCode` | text nullable | `null` | ✅ | ✅ | ❌ | 物流追蹤碼；與 `publicToken` 完全不同（見 18.6） |
| `trackingProvider` | text nullable | `null` | ✅ | ✅ | ❌ | 物流商名稱，如「黑貓宅急便」 |
| `shippingNote` | text nullable | `null` | ❌ | ✅ | ❌ | 物流備註；買家不可見 |
| `internalNote` | text nullable | `null` | ❌（絕對禁止） | ✅ | ❌ | 店家內部備註；任何公開 API 均不可回傳 |

---

### 18.5 Enum 值正式化（Step 5A 確認版）

#### paymentMethod

```typescript
export const paymentMethodEnum = [
  'cash',          // 現金
  'bank_transfer', // ATM / 銀行轉帳
  'line_pay',      // LINE Pay（店家手動確認，非串接）
  'other',         // 其他
] as const;
// null = 未設定付款方式
```

> ⚠️ Step 5A 決策：`unpaid` 本質上屬於 `paymentStatus` 語意，不應列入 `paymentMethod`。
> `paymentMethod = null` 表示「尚未設定付款方式」，語意清晰且無歧義。
> Step 4A 規格中的 `line_pay_manual` 簡化為 `line_pay`。

#### paymentStatus

```typescript
export const paymentStatusEnum = [
  'unpaid',         // 未付款（預設）
  'pending',        // 待確認（買家聲稱已付，等待店家確認）
  'partially_paid', // 已付部分
  'paid',           // 已全額付清（店家手動確認）
  'refunded',       // 已退款
  'failed',         // 付款失敗 / 取消付款
] as const;
```

> ⚠️ Step 5A 更新：
> - `partial`（Step 4A）改為 `partially_paid`（語意更明確）
> - 新增 `pending`：買家聲稱已轉帳但店家尚未確認
> - 新增 `failed`：付款失敗或買家取消
> - **`paymentStatus = 'paid'` 由店家手動標記，不等於金流系統自動確認**

#### shippingMethod

```typescript
export const shippingMethodEnum = [
  'self_pickup',        // 自取
  'convenience_store',  // 超商寄件（不分業者，搭配 storeCode/storeName 記錄）
  'home_delivery',      // 宅配（黑貓、新竹等）
  'other',              // 其他
] as const;
```

> ⚠️ Step 5A 更新：Step 4A 規格將各超商分成獨立 enum（`seven_eleven_prepaid`、`familymart_prepaid` 等）。
> 本版本改用通用的 `convenience_store`，搭配 `storeCode` / `storeName` 區分業者，擴充性更好。

#### shippingStatus

```typescript
export const shippingStatusEnum = [
  'not_shipped', // 未出貨（預設）
  'preparing',   // 備貨中
  'shipped',     // 已出貨（已填追蹤碼）
  'arrived',     // 已到達門市 / 物流站
  'picked_up',   // 買家已取貨
  'returned',    // 退貨中
  'cancelled',   // 物流取消
] as const;
```

> ⚠️ Step 5A 更新：
> - `delivered`（Step 4A）拆分為 `arrived`（到達）+ `picked_up`（取貨），對超商取貨更有意義
> - 新增 `cancelled`：物流取消（與 `order.status = 'cancelled'` 是不同維度）
> - **`shippingStatus` 由店家手動更新，不代表真實物流 API 狀態**

---

### 18.6 publicToken vs trackingCode 明確區分

| 欄位 | 用途 | 產生方式 | 買家可見 |
|------|------|---------|---------|
| `publicToken` | 系統內部買家查詢連結（`/orders/track/:publicToken`） | Server 自動生成（UUID） | ✅ 訂單查詢連結用 |
| `trackingCode` | 物流追蹤碼（如宅急便單號） | 店家手動填入 | ✅ 讓買家至物流商官網查詢 |

> ❌ 嚴格禁止混淆：`publicToken` 不是物流追蹤碼。
> 公開追蹤頁可同時顯示兩者，但功能完全不同。

---

### 18.7 金額欄位正式定義

| 名稱 | 計算方式 | DB 存在 | API 回傳建議 | 說明 |
|------|---------|--------|------------|------|
| `unitPrice` | 建單快照 | ✅ | ✅ | 建單時商品單價快照，不可手動修改 |
| `quantity` | 店家可編輯 | ✅ | ✅ | 修改後觸發 totalPrice 重算 |
| `totalPrice` | `unitPrice × quantity` | ✅ | ✅ | **商品金額小計**（非訂單總計）；現有欄位，不重命名 |
| `shippingFee` | 店家手動填入 | ✅（已存在） | ✅ | 運費；Step 5C 確認是否已在 API 回傳 |
| `orderTotal` | `totalPrice + shippingFee` | ❌ 推導 | ✅（推導後回傳） | 訂單應付總計；MVP 不存 DB，前端或 API response 計算 |
| `paidAmount` | 店家手動記錄 | ❌ 需新增 | ✅（店家端） | 已收款金額；null 視同 0；**不出現在公開 API** |
| `remainingAmount` | `max(orderTotal − paidAmount, 0)` | ❌ 推導 | ✅（推導後回傳） | 待收款；MVP 不存 DB，前端或 API response 計算 |

> 重要定義：
> - `totalPrice` = 商品金額小計（`itemSubtotal`），**不是訂單總計**
> - `orderTotal` = `totalPrice + shippingFee`，才是應付總計
> - 不重命名 `totalPrice`，避免大範圍 migration 風險

---

### 18.8 API 建議確認

沿用第 10 節規格，Step 5C 實作時確認以下事項：

1. **`PATCH /orders/:orderId`** — 接受本節定義的所有付款 / 物流欄位；enum 驗證回傳 422
2. **`GET /stores/:storeId/orders`** — 回傳所有付款 / 物流欄位（含 `shippingFee`）；`internalNote` 店家端可見
3. **`GET /orders/track/:publicToken`** — 公開回傳：`shippingStatus`、`trackingCode`、`trackingProvider`；**嚴格禁止回傳**：`internalNote`、`paymentNote`、`paidAmount`、`recipientAddress`、`recipientPhone`
4. **`GET /stores/:storeId/orders/export`** — CSV 新增：付款方式、付款狀態、已付金額、出貨狀態、追蹤碼、運費

**storeCode / storeName 命名確認事項（Step 5B 需決策）：**
- DB 目前欄位：`cvsStoreId`（非 `storeCode`）、`cvsStoreName`
- 建議：API 層統一使用 `storeCode` / `storeName`（更通用），DB 欄位維持 `cvsStoreId` / `cvsStoreName`，在 API response 層做映射

---

### 18.9 UI 呈現建議確認

沿用第 11 節規格，Step 5D 實作時確認以下事項：

**付款資訊區**（移除 placeholder）：
- `paymentMethod`：現金 / 轉帳 / LINE Pay / 其他（null 顯示「未設定」）
- `paymentStatus` badge：未付款（紅）/ 待確認（黃）/ 已付部分（橙）/ 已付清（綠）/ 已退款（灰）/ 付款失敗（紅）
- 金額明細：商品金額 + 運費 = 合計 / 已付 / 待收
- 快速更新 inline button（不開 modal）

**物流資訊區**（移除 placeholder）：
- `shippingStatus` badge：未出貨（灰）/ 備貨中（藍）/ 已出貨（藍）/ 已到達（綠）/ 已取貨（綠）/ 退貨中（橙）/ 已取消（紅）
- `trackingCode` + `trackingProvider`（一鍵複製）
- 宅配：`recipientName`、`recipientPhone`、`recipientAddress`
- 超商：`storeCode`、`storeName`（對應 DB `cvsStoreId`、`cvsStoreName`）
- 快速更新 inline button

> 注意：前端文案需避免暗示金流 / 物流已自動確認（見 18.12）

---

### 18.10 測試案例（Step 5 專屬）

#### 付款欄位 API 測試

- [ ] `PATCH /orders/:orderId` 傳入有效 `paymentMethod` 正確儲存
- [ ] `PATCH /orders/:orderId` 傳入無效 `paymentMethod` 回傳 422
- [ ] `PATCH /orders/:orderId` 傳入有效 `paymentStatus` 正確儲存
- [ ] `PATCH /orders/:orderId` 傳入無效 `paymentStatus` 回傳 422
- [ ] `PATCH /orders/:orderId` 傳入 `paidAmount` 正確儲存（含 0、null、正數）
- [ ] `GET /stores/:storeId/orders` 回傳 `shippingFee`（DB 已存在，確認 API 層）
- [ ] 公開追蹤 API 不回傳 `paidAmount`、`paymentNote`、`internalNote`

#### 物流欄位 API 測試

- [ ] `PATCH /orders/:orderId` 傳入有效 `shippingStatus` 正確儲存
- [ ] `PATCH /orders/:orderId` 傳入 `trackingCode` 正確儲存
- [ ] `PATCH /orders/:orderId` 傳入有效 `shippingMethod` 正確儲存
- [ ] `PATCH /orders/:orderId` 傳入無效 enum 值回傳 422
- [ ] 公開追蹤 API 回傳 `shippingStatus`、`trackingCode`、`trackingProvider`
- [ ] 公開追蹤 API 不回傳 `recipientAddress`、`internalNote`
- [ ] `storeCode` / `storeName`（或 `cvsStoreId` / `cvsStoreName`）正確儲存

#### 金額計算測試

- [ ] `shippingFee` 預設 `0`，現有訂單不受影響
- [ ] `orderTotal = totalPrice + shippingFee` 計算正確
- [ ] `remainingAmount = max(orderTotal − paidAmount, 0)` 計算正確
- [ ] `paidAmount = null` 時 `remainingAmount = orderTotal`（null 視同 0）

#### UI 回歸測試（Step 5D 後）

- [ ] 付款資訊區顯示真實欄位值（非 placeholder）
- [ ] 物流資訊區顯示真實欄位值（非 placeholder）
- [ ] `paymentStatus` badge 顏色正確
- [ ] `shippingStatus` badge 顏色正確
- [ ] 追蹤碼可一鍵複製
- [ ] 既有功能（狀態更新、搜尋、篩選、CSV 匯出、公開下單）不受影響

> 未執行程式測試，原因是：本次僅修改文件 / 規格，未改動程式碼。

---

### 18.11 風險清單（Step 5 專屬）

| 風險 | 影響程度 | 建議處理方式 |
|------|---------|------------|
| `shippingFee` DB 已存在但 API 可能未回傳 | 中 | Step 5C 第一步確認 `GET /stores/:storeId/orders` 是否已包含此欄位 |
| `cvsStoreId` vs `storeCode` 命名不一致 | 中 | Step 5B 決策：API 層統一映射為 `storeCode`，避免前後端命名混亂 |
| 多欄位同時 migration 風險 | 高 | 建議拆兩個 migration（付款欄位 / 物流欄位），分別可 rollback |
| `paymentStatus = 'paid'` 被誤解為金流確認 | 高（客服風險） | 前端文案嚴格管控，見 18.12 |
| `recipientAddress` 個資洩漏到公開 API | 嚴重 | 加入測試案例強制驗證；code review 必查項目 |
| `internalNote` 不慎出現在公開 API | 嚴重 | 加入測試案例強制驗證；openapi.yaml 需標記不公開 |
| `shippingStatus` 被誤解為真實物流 API 狀態 | 高（客服風險） | 前端文案嚴格管控，見 18.12 |
| 退款欄位缺失（MVP 不含）導致店家混用 `paymentNote` | 低 | 暫以 `paymentNote` / `internalNote` 記錄退款情況；Step 後期補 `refundStatus` |

---

### 18.12 客服 / 對外文字注意事項

**禁止使用的文案（與建議替代）：**

| ❌ 禁止 | ✅ 建議替代 | 原因 |
|---------|-----------|------|
| 「系統確認付款」 | 「店家確認已收款」 | `paymentStatus` 為店家手動標記，非自動驗證 |
| 「自動出貨通知」 | 「店家更新出貨資訊」 | 目前無自動通知 |
| 「即時追蹤包裹」 | 「複製追蹤碼至物流商官網查詢」 | `trackingCode` 非 API 串接，無法即時追蹤 |
| 「LINE Pay 付款完成」 | 「LINE Pay（待店家確認）」 | 非金流串接，店家手動標記 |
| 「訂單已送達」（系統自動） | 「店家更新：已送達門市」 | `shippingStatus` 為店家手動更新 |
| 「追蹤連結」（指 publicToken） | 「訂單查詢連結」 | `publicToken` 是查詢連結，非物流追蹤碼 |

**公開追蹤頁 shippingStatus 建議文案：**

| enum 值 | 顯示文案 |
|---------|---------|
| `not_shipped` | 尚未出貨 |
| `preparing` | 備貨中 |
| `shipped` | 已出貨（追蹤碼由店家提供） |
| `arrived` | 已到達目的地 |
| `picked_up` | 已取貨完成 |
| `returned` | 退貨處理中 |
| `cancelled` | 物流取消，請聯繫店家 |

> `paymentStatus` 建議不出現在公開追蹤頁（個資保護）。
> 例外：可於 `paymentStatus = 'unpaid'` 時顯示「請確認付款方式」提示。

---

## 19. Step 5B / 5C / 5D 後續任務切分

### Step 5B：付款 / 物流欄位 DB Schema 更新與 Migration

**範圍：**
- 在 `lib/db/src/schema/orders.ts` 新增以下欄位：
  - 付款：`paymentMethod`（text nullable）、`paymentStatus`（text default `'unpaid'`）、`paidAmount`（numeric(10,2) nullable）、`paymentNote`（text nullable）
  - 物流：`shippingMethod`（text nullable）、`shippingStatus`（text default `'not_shipped'`）、`recipientName`（text nullable）、`recipientPhone`（text nullable）、`recipientAddress`（text nullable）、`trackingCode`（text nullable）、`trackingProvider`（text nullable）、`shippingNote`（text nullable）、`internalNote`（text nullable）
  - 注意：`shippingFee` 已存在，無需新增
- 建立 migration（建議拆兩個：付款欄位 / 物流欄位）
- 定義 enum 常數（見 18.5）
- 決策並統一 `storeCode` / `storeName` 與 DB `cvsStoreId` / `cvsStoreName` 的命名關係
- 確認 migration rollback 可正常執行

**不做：**API route 邏輯、前端 UI、第三方串接

**驗收：** migration 在測試 DB 可執行 / rollback；現有訂單資料完整；所有新欄位為 nullable 或有合理預設值

---

### Step 5C：付款 / 物流欄位 API 更新

**範圍：**
- 更新 `lib/api-spec/openapi.yaml`，新增付款 / 物流欄位定義
- `GET /stores/:storeId/orders` 回傳所有新欄位（含 `shippingFee` 確認）
- `PATCH /orders/:orderId` 接受付款 / 物流欄位；enum 驗證回傳 422
- `GET /orders/track/:publicToken` 回傳 `shippingStatus`、`trackingCode`、`trackingProvider`；嚴格排除個資與內部欄位
- `GET /stores/:storeId/orders/export` CSV 新增付款 / 物流欄位
- 重新執行 orval codegen（`lib/api-client-react`、`lib/api-zod`）
- `orderTotal` / `remainingAmount` 在 API response 推導回傳（不存 DB）

**不做：**DB schema 變更、前端 UI、第三方串接

**驗收：** 18.10 付款欄位 API 測試 / 物流欄位 API 測試 / 金額計算測試全部通過；個資洩漏測試通過

---

### Step 5D：付款 / 物流欄位 UI 正式化

**範圍：**
- `Orders.tsx` 付款資訊區：移除 placeholder，接真實欄位
- `Orders.tsx` 物流資訊區：移除 placeholder，接真實欄位
- `paymentStatus` 快速切換 inline UI
- `shippingStatus` 快速切換 inline UI
- `trackingCode` 填入 + 複製功能
- 金額明細區（商品金額 + 運費 = 合計 / 已付 / 待收）
- `paymentStatus` / `shippingStatus` badge 顏色設計
- 依 18.12 規範調整所有文案

**不做：**第三方金流 / 物流串接、買家自動通知、批次操作、訂單詳情獨立頁（留後期）

**驗收：** 18.10 UI 回歸測試全部通過；原有功能（搜尋、篩選、CSV、公開下單）不受影響

---

## 20. Step 5A 決策摘要與待確認事項

| 決策項目 | Step 5A 建議 | 需確認方 |
|---------|-------------|---------|
| `unpaid` 列入 paymentMethod | ❌ 移除，改用 `null` 表示未設定 | Product 確認 |
| `partial` vs `partially_paid` | 採用 `partially_paid`（語意更明確） | Engineering 確認 |
| `delivered` vs `arrived` + `picked_up` | 拆分為 `arrived` + `picked_up` | Product 確認 |
| `convenience_store` 通用 vs 分超商 enum | 採用通用 `convenience_store` | Engineering 確認 |
| `storeCode` / `storeName` 命名 | API 層用 `storeCode` / `storeName`，DB 維持 `cvsStoreId` / `cvsStoreName` | Engineering 確認 |
| `shippingFee` DB 已存在 | Step 5B 不新增欄位，Step 5C 確認 API 回傳 | Engineering 確認 |
| `paidAmount > orderTotal` 驗證規則 | 建議允許（過付情境存在），但在 UI 顯示提示 | Product 確認 |
| migration 拆分策略 | 拆付款欄位 / 物流欄位兩個 migration | Engineering 確認 |
| 退款欄位（`refundStatus` / `refundedAmount`） | MVP 不包含，暫以 `paymentNote` 記錄，後期補充 | Product 確認 |
| `orderTotal` / `remainingAmount` 是否存 DB | MVP 不存 DB，推導回傳；未來視需求再評估 | Engineering 確認 |
