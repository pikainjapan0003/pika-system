# Step 8A — 後台訂單操作區 UX / 取消可恢復 / 刪除訂單盤點文件

> 盤點日期：2026-06-07
> 分支：qa/step6f-cvs-store-selection-browser-mobile
> 範圍：後台訂單操作區 UX、狀態更新、取消可恢復、刪除訂單
> 不含：Step 7 貨態頁、金流串接、會員購物金、完整會計功能

---

## 一、現況摘要

| 功能項目                              | 現況                                       |
| ------------------------------------- | ------------------------------------------ |
| 金額調整區（折讓 / 折數 / 購物金）    | **不存在** — DB schema、API、UI 均無此欄位 |
| 金額顯示（小計 / 運費 / 合計）        | **已存在**（Orders.tsx 展開面板）          |
| 訂單狀態按鈕（VALID_NEXT_STATUSES）   | **已存在**，dynamically rendered           |
| 已取消可恢復                          | **不可恢復** — UI + API + 後端三層限制     |
| 刪除訂單 API                          | **不存在**                                 |
| 刪除訂單 UI                           | **不存在**                                 |
| Soft delete（deletedAt / archivedAt） | **不存在** — DB schema 未定義              |

---

## 二、金額調整區現況

### 2.1 DB schema（`lib/db/src/schema/orders.ts`）

| 欄位                                      | 有無                                          |
| ----------------------------------------- | --------------------------------------------- |
| `unitPrice`                               | ✅ 存在                                       |
| `shippingFee`                             | ✅ 存在（預設 0）                             |
| `totalPrice`                              | ✅ 存在（= unitPrice × quantity，由後端計算） |
| `paidAmount`                              | ✅ 存在（手動記錄已收）                       |
| 折讓 / discount                           | ❌ 不存在                                     |
| 折數 / discountRate                       | ❌ 不存在                                     |
| 購物金折抵 / creditAmount / voucherAmount | ❌ 不存在                                     |

DB schema 中沒有任何折扣欄位。`totalPrice` 是 `unitPrice × quantity`，未包含折扣計算。

### 2.2 API 回傳（`lib/api-zod/src/generated/types/order.ts`）

API 在後端動態計算並加入兩個虛擬欄位：

- `orderTotal`：`totalPrice + shippingFee`（`orders.ts` line 697）
- `remainingAmount`：`max(orderTotal - paidAmount, 0)`（`orders.ts` line 698）

這兩個欄位不在 DB 中，是後端 route 組裝後一起回傳的。

### 2.3 EditOrderDialog（`artifacts/shop-app/src/pages/EditOrderDialog.tsx`）

金額相關欄位：

- **運費輸入框**（`shippingFeeStr`）：位於「物流資訊」區段（line 421-431）
- **金額預覽**區段（line 599-611）：只顯示 `unitPrice × quantity = 預估總額`，為唯讀參考值
- 沒有折讓、折數、購物金折抵的輸入欄位
- 沒有小計 / 合計的明細顯示

**結論：EditOrderDialog 金額欄位目前僅有運費，無折扣功能。**

### 2.4 Orders.tsx 展開面板（`artifacts/shop-app/src/pages/Orders.tsx`，line 507-542）

展開後「付款資訊」區塊顯示：

- 付款狀態（badge）
- 付款方式
- **運費**（shippingFee）
- **訂單總額**（orderTotal = totalPrice + shippingFee）
- **已收金額**（paidAmount）
- **待收金額**（remainingAmount）
- 付款備註（paymentNote）

「商品明細」區塊（line 494-504）顯示：

- 商品名稱
- 數量
- 單價
- **商品小計**（totalPrice = unitPrice × quantity）

**結論：訂單展開面板已有小計 / 運費 / 合計 / 已收 / 待收的顯示，但沒有折扣欄位。**

---

## 三、狀態按鈕現況

### 3.1 前端狀態定義（`artifacts/shop-app/src/lib/orderStatus.ts`）

訂單狀態列表：

```
pending       → 待確認
awaiting_payment → 待付款
preparing     → 備貨中
shipped       → 已出貨
completed     → 已完成
cancelled     → 已取消
```

有效狀態轉換（`VALID_NEXT_STATUSES`，line 31-38）：

```
pending           → [awaiting_payment, cancelled]
awaiting_payment  → [preparing, cancelled]
preparing         → [shipped, cancelled]
shipped           → [completed, cancelled]
completed         → []       ← 終態，無法轉換
cancelled         → []       ← 終態，無法轉換
```

### 3.2 UI 渲染邏輯（`Orders.tsx` line 739-766）

```tsx
{(VALID_NEXT_STATUSES[o.status]?.length ?? 0) > 0 ? (
  // 動態顯示各狀態按鈕（例如：待付款、已取消）
) : (
  // 顯示：此訂單已結束，無法更新狀態
)}
```

- 當訂單為 `completed` 或 `cancelled`，`VALID_NEXT_STATUSES` 回傳 `[]`，條件不成立 → 不渲染按鈕
- 取而代之：顯示 status badge + "此訂單已結束，無法更新狀態"
- 「編輯訂單」按鈕（line 716-724）對 `completed` 和 `cancelled` 也隱藏

### 3.3 UI 問題觀察

1. 「更新狀態」區段沒有明確的區塊標題樣式，視覺上混在展開面板底部
2. 「已取消」和「待付款」都是按鈕，視覺上相同，沒有危險操作的視覺區隔
3. 沒有確認對話框：直接點擊「已取消」即觸發 API，沒有二次確認
4. 沒有刪除訂單的危險操作區

---

## 四、已取消不可恢復原因研判

**結論：三層限制同時存在，不是單純 UI 問題。**

### 第一層：UI 限制

`VALID_NEXT_STATUSES.cancelled = []`（`orderStatus.ts` line 36）

前端完全不渲染任何「恢復狀態」的按鈕。使用者在 UI 上沒有任何操作路徑可以恢復。

### 第二層：API 限制

`PATCH /orders/:orderId/status` 呼叫 `isValidTransition(from, to)`（`orderStatusMachine.ts` line 12-14）：

```typescript
export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (TRANSITIONS[from] as readonly string[]).includes(to);
}
```

`TRANSITIONS.cancelled = []` → `isValidTransition("cancelled", 任何狀態)` 回傳 `false`

### 第三層：後端明確拒絕

`getTransitionError("cancelled", ...)` 回傳（`orderStatusMachine.ts` line 19）：

```
"Cannot change status of a cancelled order"
```

如果繞過 UI 直接打 API，後端也會拒絕。

### 研判

「已取消不可恢復」是前後端共同設計的有意行為，並非技術疏失。  
要讓已取消訂單可以恢復，需要同時修改：

1. `orderStatus.ts`（前端 VALID_NEXT_STATUSES）
2. `orderStatusMachine.ts`（後端 TRANSITIONS）
3. `Orders.tsx`（UI 渲染邏輯）

---

## 五、刪除訂單現況

### 5.1 DB schema

`lib/db/src/schema/orders.ts` 掃描結果：

- **無 `deletedAt` 欄位**
- **無 `archivedAt` 欄位**
- **無 `isDeleted` / `archived` / `hidden` 欄位**
- 唯一的刪除相關定義：`storeId` 有 `onDelete: "cascade"`（即 store 刪除時連帶刪除 orders）

**結論：DB schema 完全不支援 soft delete。**

### 5.2 API routes（`artifacts/api-server/src/routes/orders.ts`）

目前存在的 route：

```
GET    /stores/:storeId/orders          ← 列表
POST   /stores/:storeId/orders          ← 建立
POST   /orders/picking-list             ← 撿貨單
POST   /orders/picking-list.csv         ← 撿貨 CSV
POST   /orders/shipping-list            ← 出貨單
POST   /orders/shipping-list.csv        ← 出貨 CSV
PATCH  /orders/bulk                     ← 批次更新
PATCH  /orders/:orderId                 ← 更新訂單
GET    /stores/:storeId/orders/export   ← CSV 匯出
PATCH  /orders/:orderId/status          ← 狀態更新
```

**無 `DELETE /orders/:orderId` 或任何刪除 / 封存 endpoint。**

### 5.3 UI

Orders.tsx 展開面板掃描：

- 沒有任何刪除按鈕
- 沒有任何「移至垃圾桶」或「封存」操作

**結論：刪除訂單功能完全不存在（UI、API、DB 三層均無）。**

---

## 六、風險

| 風險項目                 | 說明                                                                                   | 嚴重程度 |
| ------------------------ | -------------------------------------------------------------------------------------- | -------- |
| 取消後誤操作無法恢復     | 老闆誤按「已取消」後，目前無法恢復，需客服人工處理                                     | 高       |
| 取消無二次確認           | 直接點擊即生效，沒有確認對話框                                                         | 高       |
| 刪除訂單若實作為永久刪除 | 影響訂單查帳、客訴追蹤、財務記錄                                                       | 極高     |
| 無 soft delete 機制      | 若直接新增 DELETE API，刪除即永久消失，無法復原                                        | 高       |
| 金額調整區缺折扣欄位     | 目前折讓 / 折數 / 購物金等功能完全未實作，DB schema 也無對應欄位，若要新增需大範圍修改 | 中       |
| 批次操作無保護           | 批次更新 paymentStatus / shippingStatus 沒有對已取消訂單的過濾保護（前端層面）         | 低       |

---

## 七、建議 MVP Scope

### Step 8B（建議下一步施工）

**優先度高：**

1. **「已取消」取消前二次確認**
   - 點擊「已取消」按鈕後，彈出確認對話框（"確定要取消此訂單？取消後需聯絡系統管理員才能恢復"）
   - 確認後才呼叫 API
   - 修改範圍：`Orders.tsx`（UI 層）

2. **已取消可恢復（Restore from Cancelled）**
   - 僅允許恢復到「待確認（pending）」狀態，不跳過流程
   - 需同步修改：
     - `orderStatus.ts`：`cancelled: ["pending"]`
     - `orderStatusMachine.ts`：`cancelled: ["pending"]`
     - `Orders.tsx`：移除 "此訂單已結束" 的硬限制，或改為僅顯示「恢復至待確認」按鈕
   - 建議在 UI 上做視覺區隔（例如：灰色區塊、"恢復訂單" 字樣）

3. **狀態操作區 / 危險操作區 UI 分區**
   - 狀態操作區：顯示有效下一步狀態按鈕（目前的 VALID_NEXT_STATUSES）
   - 危險操作區：「已取消」移至危險操作區，以紅色或警示樣式呈現
   - 分區顯示，避免「待付款」和「已取消」並排讓使用者誤按

**優先度中：**

4. **刪除訂單（Soft Delete）**
   - 建議優先實作 soft delete（新增 `deletedAt` 欄位）
   - DB 遷移：`ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE`
   - API：新增 `PATCH /orders/:orderId/archive`（改為封存，不是 DELETE）
   - UI：展開面板底部「封存訂單」按鈕，帶二次確認
   - 列表預設不顯示已封存訂單，提供「顯示已封存」篩選
   - 建議命名為「封存」而非「刪除」，降低使用者心理壓力與資料損失風險

---

## 八、不建議本階段做的事項

| 項目                                       | 原因                                                              |
| ------------------------------------------ | ----------------------------------------------------------------- |
| 直接新增 DELETE（永久刪除）API             | 無法復原，影響查帳與客訴，需有 soft delete 保護                   |
| 金額調整折扣欄位（折讓 / 折數 / 購物金）   | DB schema 需大幅修改，影響 totalPrice 計算邏輯，建議獨立為 Step 9 |
| 購物金折抵系統                             | 需要完整的會員購物金帳戶設計，超出本階段範圍                      |
| 訂單取消退款自動化                         | 需串接金流，目前付款記錄為手動模式                                |
| 批次刪除訂單                               | 在無 soft delete 機制前，批次刪除風險過高                         |
| 修改 orderTotal / remainingAmount 計算邏輯 | 目前是後端動態計算，若要加入折扣需同時修改 DB + API + UI          |

---

## 九、後續施工拆分建議

| 步驟    | 名稱                                       | 範圍                                                | 前置條件                   |
| ------- | ------------------------------------------ | --------------------------------------------------- | -------------------------- |
| Step 8B | 取消前二次確認                             | 只改 Orders.tsx UI                                  | 無                         |
| Step 8C | 已取消可恢復至待確認                       | orderStatus.ts + orderStatusMachine.ts + Orders.tsx | Step 8B 完成               |
| Step 8D | 狀態操作區 UI 分區（正常操作 vs 危險操作） | Orders.tsx                                          | Step 8B 完成               |
| Step 8E | Soft Delete（封存訂單）                    | DB migration + API + Orders.tsx                     | Step 8B/8C 完成後確認需求  |
| Step 9  | 金額調整（折讓 / 折數）                    | DB schema + API + EditOrderDialog                   | 獨立討論，不屬 Step 8 範圍 |

---

## 十、測試與驗收建議

### Step 8B 驗收

- [ ] 點擊「已取消」按鈕後出現確認對話框
- [ ] 確認後才更新狀態
- [ ] 取消操作後訂單狀態不變

### Step 8C 驗收

- [ ] 已取消訂單展開後，出現「恢復至待確認」按鈕
- [ ] 點擊後訂單回到 `pending` 狀態
- [ ] API `PATCH /orders/:orderId/status` 接受 `cancelled → pending` 轉換
- [ ] 後端 orderStatusMachine 不再拒絕此轉換
- [ ] `completed` 仍為終態，不可恢復

### Step 8E 驗收

- [ ] 訂單封存後在列表中不顯示（預設）
- [ ] 可切換「顯示已封存」查看
- [ ] 封存訂單無法繼續操作（狀態凍結）
- [ ] DB 有 `deletedAt` 欄位，封存後寫入時間戳
- [ ] 無永久刪除 endpoint（只有封存）

---

## 十一、附錄：相關檔案對照

| 檔案                                                 | 用途                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `artifacts/shop-app/src/lib/orderStatus.ts`          | 前端狀態定義、VALID_NEXT_STATUSES（line 31-38）                |
| `artifacts/shop-app/src/pages/Orders.tsx`            | 狀態按鈕渲染（line 739-766）、展開面板金額顯示（line 494-542） |
| `artifacts/shop-app/src/pages/EditOrderDialog.tsx`   | 訂單編輯表單、金額預覽（line 599-611）                         |
| `artifacts/api-server/src/lib/orderStatusMachine.ts` | 後端狀態機、isValidTransition、getTransitionError              |
| `artifacts/api-server/src/routes/orders.ts`          | API routes（無 DELETE endpoint）                               |
| `lib/db/src/schema/orders.ts`                        | DB schema（無 deletedAt / discount 欄位）                      |
| `lib/api-zod/src/generated/types/order.ts`           | API 回傳型別（orderTotal、remainingAmount 為虛擬欄位）         |
