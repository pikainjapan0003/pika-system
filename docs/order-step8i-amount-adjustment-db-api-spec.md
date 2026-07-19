# Step 8I — 訂單金額調整 DB / API 規格文件

> 規格日期：2026-06-08
> 分支：qa/step6f-cvs-store-selection-browser-mobile
> 前置文件：docs/order-step8h-amount-note-pdf-delete-audit.md
> 本文件性質：規格，本次不施工
> 施工 Step：Step 8J（後端）、Step 8K（前端 UI）

---

## A. 規格目標

1. **本文件目標**：定義訂單金額調整功能的 DB schema 欄位設計、API request / response 格式、金額計算規則，作為 Step 8J 後端施工的唯一參考依據。
2. **本次只規格化，不施工**：不修改任何 DB schema、API、前端程式碼。
3. **MVP 優先解決「人工折讓金額」**：只新增 `discountAmount`（折讓金額）與 `discountNote`（折讓備註）兩個欄位。
4. **下列項目列為後續階段，本次不規格化施工**：
   - 折數（discountRate）
   - 購物金折抵（creditAmount）
   - 購物金餘額
   - 商品成本（costAmount）
   - 毛利（grossProfit）

---

## B. 現有金額欄位盤點

### B.1 DB orders 表目前金額欄位

來源：`lib/db/src/schema/orders.ts`

| 欄位       | DB 欄位名      | 型別                             | 狀態            | 備註                                   |
| ---------- | -------------- | -------------------------------- | --------------- | -------------------------------------- |
| 商品單價   | `unit_price`   | numeric(10,2) NOT NULL           | ✅ 已存在       | 下單時從 products 表讀取               |
| 商品數量   | `quantity`     | integer NOT NULL DEFAULT 1       | ✅ 已存在       | —                                      |
| 商品小計   | `total_price`  | numeric(10,2) NOT NULL           | ✅ 已存在       | = unitPrice × quantity，後端計算後寫入 |
| 運費       | `shipping_fee` | numeric(10,2) NOT NULL DEFAULT 0 | ✅ 已存在       | 後台手動設定                           |
| 已收金額   | `paid_amount`  | numeric(10,2) nullable           | ✅ 已存在       | 後台手動記錄，null = 尚未記錄          |
| 訂單總額   | 無             | —                                | ⚠️ 後端虛擬欄位 | `formatOrder()` 動態計算，不存入 DB    |
| 待收金額   | 無             | —                                | ⚠️ 後端虛擬欄位 | `formatOrder()` 動態計算，不存入 DB    |
| 折讓金額   | —              | —                                | ❌ 不存在       | 本次 Step 8J 待新增                    |
| 折讓備註   | —              | —                                | ❌ 不存在       | 本次 Step 8J 待新增                    |
| 折數       | —              | —                                | ❌ 不存在       | **不建議本階段做**                     |
| 購物金折抵 | —              | —                                | ❌ 不存在       | **等待會員系統**                       |
| 商品成本   | —              | —                                | ❌ 不存在       | **不建議本階段做**                     |
| 毛利       | —              | —                                | ❌ 不存在       | **不建議本階段做**                     |

### B.2 API formatOrder 目前輸出

來源：`artifacts/api-server/src/routes/orders.ts` L693-711

```typescript
function formatOrder(o: any) {
  const shippingFee = parseFloat(o.shippingFee ?? "0");
  const totalPrice = parseFloat(o.totalPrice);
  const paidAmount =
    o.paidAmount != null ? parseFloat(o.paidAmount as string) : null;
  const orderTotal = totalPrice + shippingFee; // 目前不含折讓
  const remainingAmount = Math.max(orderTotal - (paidAmount ?? 0), 0); // 目前不含折讓影響
  return {
    ...o,
    unitPrice: parseFloat(o.unitPrice),
    shippingFee,
    totalPrice,
    paidAmount,
    storeSelectedAt: o.storeSelectedAt?.toISOString() ?? null,
    storeCode: o.cvsStoreId ?? null,
    storeName: o.cvsStoreName ?? null,
    orderTotal,
    remainingAmount,
  };
}
```

**問題**：`orderTotal` 目前不扣除折讓，Step 8J 需修改。

### B.3 前端 Orders.tsx 目前顯示

來源：`artifacts/shop-app/src/pages/Orders.tsx`

| 顯示項目                    | 狀態      | 程式位置 |
| --------------------------- | --------- | -------- |
| 商品小計（totalPrice）      | ✅ 已顯示 | L528     |
| 運費（shippingFee）         | ✅ 已顯示 | L549     |
| 訂單總額（orderTotal）      | ✅ 已顯示 | L553     |
| 已收金額（paidAmount）      | ✅ 已顯示 | L557-560 |
| 待收金額（remainingAmount） | ✅ 已顯示 | L561-564 |
| 折讓金額                    | ❌ 不存在 | —        |

### B.4 EditOrderDialog 目前可修改金額欄位

來源：`artifacts/shop-app/src/pages/EditOrderDialog.tsx`

| 輸入欄位                  | 狀態      | 備註                                  |
| ------------------------- | --------- | ------------------------------------- |
| 運費（shippingFeeStr）    | ✅ 已存在 | L421-431                              |
| 已收金額（paidAmountStr） | ✅ 已存在 | L362-373                              |
| 金額預覽（唯讀）          | ✅ 已存在 | L599-611，只顯示 unitPrice × quantity |
| 折讓金額輸入框            | ❌ 不存在 | Step 8K 待施工                        |
| 折讓備註輸入框            | ❌ 不存在 | Step 8K 待施工                        |

### B.5 Generated API Schema / Types 現況

來源：`lib/api-zod/src/generated/`

| 型別 / Schema                                   | 有無 discountAmount          | 有無 discountNote |
| ----------------------------------------------- | ---------------------------- | ----------------- |
| `Order` interface（order.ts）                   | ❌ 不存在                    | ❌ 不存在         |
| `OrderUpdate` interface（orderUpdate.ts）       | ❌ 不存在                    | ❌ 不存在         |
| `UpdateOrderBody` zod schema（api.ts L424）     | ❌ 不存在                    | ❌ 不存在         |
| `UpdateOrderResponse` zod schema（api.ts L454） | ❌ 不存在                    | ❌ 不存在         |
| `orderTotal` 欄位                               | ✅ 已存在（optional number） | —                 |
| `remainingAmount` 欄位                          | ✅ 已存在（optional number） | —                 |

**重要**：generated 檔案由 orval 自動產生（`Do not edit manually`），Step 8J 後端施工完成後，需重新跑 orval 重新產生 generated types，不可手動修改 generated 檔案。

---

## C. MVP 欄位建議

### C.1 建議新增（MVP 必要）

#### `discountAmount`

| 項目     | 規格                                                         |
| -------- | ------------------------------------------------------------ |
| 用途     | 人工折讓金額，NT$ 整數                                       |
| 型別     | integer                                                      |
| 單位     | NT$（台幣整數，不處理小數）                                  |
| nullable | notNull                                                      |
| 預設值   | 0                                                            |
| 驗證規則 | >= 0；不可大於 itemSubtotal + shippingFee（見 F 節計算規則） |
| 意義     | 老闆手動輸入折讓，例如「滿千減百」「老客戶優惠」「瑕疵補償」 |

#### `discountNote`

| 項目     | 規格                                                         |
| -------- | ------------------------------------------------------------ |
| 用途     | 折讓原因備註，後台可見，買家不可見                           |
| 型別     | text（PostgreSQL text 無長度限制）                           |
| nullable | nullable（null 代表無備註）                                  |
| 預設值   | null                                                         |
| 意義     | 例如：「滿千減百活動」「商品輕微瑕疵補償 $50」「老客戶折讓」 |

### C.2 建議暫不做（Deferred）

#### `discountRate`（折數）

- **建議：Deferred，不建議 Step 8J 同時施工**
- 理由：
  1. 折數（例如 9 折）計算時需要明確定義基數（以小計還是含運費後的金額折？）
  2. `discountAmount` 與 `discountRate` 同時存在會造成計算規則衝突（要優先哪個？兩者相加？）
  3. MVP 只需要一個明確的折讓數字，不需要支援折數計算
  4. 若未來要做，應先確認計算規則後再新增欄位，避免日後資料不一致

#### `creditAmount` / `rewardAmount`（購物金折抵）

- **建議：Deferred，等待會員系統**
- 理由：
  1. 購物金折抵需要會員 ID 作為外鍵關聯
  2. 需要購物金餘額資料表（記錄每個會員的餘額與交易流水）
  3. 只在 orders 表存一個 `creditAmount` 數字，不記錄來源與餘額扣除，資料無法對帳
  4. 購物金系統的設計不應依賴訂單模組，需要獨立規劃

#### `costAmount` / `grossProfit`（成本 / 毛利）

- **建議：Deferred，不建議 Step 8J 施工**
- 理由：
  1. 商品成本需要在商品（products）或訂單快照層記錄
  2. products 表目前無 `cost_price` 欄位
  3. 毛利 = 訂單總額 - 商品成本，若成本欄位不存在則毛利無法計算
  4. 成本結算規則未確認（進貨成本？固定成本？活動成本？），不應貿然新增欄位

---

## D. DB Schema 建議

### D.1 建議新增欄位（僅規格，Step 8J 施工時才執行）

```typescript
// lib/db/src/schema/orders.ts 建議新增以下兩個欄位

discountAmount: integer("discount_amount").notNull().default(0),
discountNote: text("discount_note"),
```

| 欄位              | 型別    | nullable | 預設 | index | 備註                       |
| ----------------- | ------- | -------- | ---- | ----- | -------------------------- |
| `discount_amount` | integer | NOT NULL | 0    | 否    | 不需要 index，不做查詢篩選 |
| `discount_note`   | text    | NULL     | null | 否    | 純文字備註，不需要 index   |

**為什麼用 integer 而非 numeric？**

- 折讓金額以 NT$ 整數為單位，代購系統不需要小數點精度
- integer 在 PostgreSQL 比 numeric 運算更快，且避免浮點數精度問題
- 若未來有小數需求，再 migration 改型別

**為什麼不用 numeric(10,2)？**

- 既有的 `unit_price`、`shippingFee`、`totalPrice`、`paidAmount` 使用 numeric(10,2)，原因是可能有小數（例如 $99.9 的商品）
- 折讓金額通常為整數（活動折讓 $50、$100、$200）
- 若需要未來一致性，可在 Step 8J 確認後改為 numeric(10,2)，本規格建議 integer

### D.2 是否需要 Migration

- **是**，需要執行 DB migration（或 Drizzle push）
- 原因：新增 NOT NULL 欄位到既有資料表，需要 migration 設定 DEFAULT 值
- Drizzle 建議：使用 `drizzle-kit push` 或 `drizzle-kit generate` + `migrate`

### D.3 舊資料處理

- `discount_amount` 設定 DEFAULT 0，migration 後舊訂單自動得到 discountAmount = 0
- `discount_note` 為 nullable，migration 後舊訂單為 null，等同「無折讓備註」
- 舊訂單的 `orderTotal` 計算不受影響（0 折讓等於原本計算方式）
- **不需要回填舊資料**

### D.4 不建議本階段新增的欄位理由

| 欄位                         | 不新增原因                                   |
| ---------------------------- | -------------------------------------------- |
| `discount_rate`              | 計算規則不確定，與 discountAmount 並存會衝突 |
| `credit_amount`              | 需要會員系統與購物金流水，孤立的數字無法對帳 |
| `cost_price`（訂單成本快照） | products 表無成本欄位，來源未確認            |
| `gross_profit`               | 依賴 cost_price，不應先做計算結果欄位        |

---

## E. API Request / Response 規格建議

### E.1 Create Order（POST /stores/:storeId/orders）

| 項目                       | 建議                                                    |
| -------------------------- | ------------------------------------------------------- |
| 是否接受 discountAmount    | **否** — 建立訂單時折讓通常為 0，老闆在訂單建立後再調整 |
| 是否接受 discountNote      | **否** — 同上                                           |
| 建立後 discountAmount 預設 | 0（DB DEFAULT）                                         |

**理由**：折讓是事後調整行為，不應在建立訂單時就強制輸入。

### E.2 Update Order（PATCH /orders/:orderId）

| 項目                      | 建議                                                     |
| ------------------------- | -------------------------------------------------------- |
| 是否接受 discountAmount   | **是** — 後台調整折讓                                    |
| discountAmount 驗證規則   | `zod.number().int().min(0).optional()`（整數、不可為負） |
| 是否接受 discountNote     | **是** — 後台填寫折讓備註                                |
| discountNote 驗證規則     | `zod.string().nullish()`                                 |
| discountAmount 超過上限時 | **建議拒絕（422）**，不 clamp（見待確認事項）            |

**建議新增至 UpdateOrderBody（api.ts 不直接修改，需透過重新生成）：**

```
discountAmount: zod.number().int().min(0).optional()
discountNote: zod.string().nullish()
```

### E.3 FormatOrder Response

Step 8J 修改 `formatOrder()` 後應輸出：

| 欄位              | 類型              | 備註                    |
| ----------------- | ----------------- | ----------------------- |
| `discountAmount`  | number（integer） | 從 DB 讀取，預設 0      |
| `discountNote`    | string \| null    | 從 DB 讀取              |
| `orderTotal`      | number            | **修改後計算邏輯**      |
| `remainingAmount` | number            | 依賴修改後的 orderTotal |

### E.4 OrderTotal 計算規則修改

**目前（Step 8J 前）：**

```
orderTotal = totalPrice + shippingFee
```

**修改後（Step 8J）：**

```
orderTotal = max(totalPrice + shippingFee - discountAmount, 0)
```

**說明**：

- `totalPrice` = unitPrice × quantity（商品小計，不含運費）
- 折讓從「含運費後的金額」扣除
- 若折讓金額超過應收總額，orderTotal 最低為 0，不可為負

### E.5 RemainingAmount 計算規則

**修改後（Step 8J）：**

```
remainingAmount = max(orderTotal - (paidAmount ?? 0), 0)
```

計算邏輯不變，但因 orderTotal 改變，remainingAmount 也會連動改變。

### E.6 PaidAmount 邏輯

- 目前 paidAmount 邏輯保持不變
- 若 paidAmount > orderTotal（溢收情況），remainingAmount = 0
- **不自動退款，不做溢收標記**（MVP 不處理，見待確認事項）

### E.7 CSV 匯出是否加入 discountAmount

**建議：加入**（見 F 節計算規則說明）

CSV 匯出（GET /stores/:storeId/orders/export）目前 headers：

```
["訂單編號", "商品名稱", "買家姓名", "買家電話", "取貨方式", "數量", "單價", "總金額", "狀態", "備註", "規格", "下單時間"]
```

建議 Step 8J 同步修改 CSV 匯出，加入：

- `折讓金額`（discountAmount，若為 0 顯示 0）
- `折讓備註`（discountNote，若為 null 顯示空字串）

**理由**：老闆匯出 CSV 用於對帳，若不含折讓欄位，對帳金額會與後台不符。

### E.8 Public Tracking 是否顯示折讓

**建議：暫不顯示折讓金額，保守評估**

- 理由：折讓屬於店家與特定買家的個別議價行為，不適合公開顯示
- `discountNote` 屬後台內部備註，絕對不顯示在買家端
- `discountAmount` 是否顯示在追蹤頁（/track/:publicToken）：**待確認**（見 J 節）
- 建議 MVP 先不顯示，避免客訴（「為什麼別人有折讓我沒有」）

---

## F. 金額計算規則（明確定義）

### F.1 MVP 計算公式

```
itemSubtotal    = unitPrice × quantity
shippingFee     = 既有 shippingFee（後台手動設定）
discountAmount  = max(input, 0)   // 不可為負
orderTotal      = max(itemSubtotal + shippingFee - discountAmount, 0)
remainingAmount = max(orderTotal - (paidAmount ?? 0), 0)
```

### F.2 邊界條件

| 情境                                        | 結果                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| discountAmount = 0                          | orderTotal = itemSubtotal + shippingFee（與原本相同）                           |
| discountAmount = itemSubtotal + shippingFee | orderTotal = 0，remainingAmount = 0                                             |
| discountAmount > itemSubtotal + shippingFee | **拒絕（建議）**，或 clamp 至 itemSubtotal + shippingFee（待確認）              |
| paidAmount > orderTotal（溢收）             | remainingAmount = 0，不自動退款                                                 |
| status = cancelled 後調整折讓               | **不建議**，但目前 API 對 cancelled 狀態的 PATCH 會回 422（不可編輯已結束訂單） |
| status = completed 後調整折讓               | **不建議**，同上，API 保護                                                      |

### F.3 明確的 MVP 範圍界定

- **折讓金額與折數 MVP 不並存**：只做 discountAmount（絕對金額），不做 discountRate（折數）
- **購物金 MVP 暫不做**：等待會員系統
- **毛利 MVP 暫不做**：等待商品成本欄位建立

---

## G. 後台 UI 對接建議（Step 8K 規格）

本節不施工 UI，僅定義 Step 8K 需要的規格。

### G.1 EditOrderDialog 需要新增的欄位

| 欄位                             | 型別                        | 位置建議                           | 驗證                                          |
| -------------------------------- | --------------------------- | ---------------------------------- | --------------------------------------------- |
| 折讓金額輸入框（discountAmount） | number input，min=0，step=1 | 「付款資訊」區段，放在「運費」下方 | 不可為負；不可超過 itemSubtotal + shippingFee |
| 折讓備註輸入框（discountNote）   | textarea，選填              | 折讓金額輸入框正下方               | 可為空，nullable                              |

### G.2 金額預覽區（EditOrderDialog）修改

目前 EditOrderDialog 的「金額預覽」只顯示 `unitPrice × quantity = 預估總額`，Step 8K 需改成：

```
商品小計：NT$xxx
運費：    NT$yyy
折讓：    - NT$zzz    ← 若 discountAmount > 0 才顯示
──────────────────
訂單總額：NT$www
```

### G.3 Orders.tsx 展開面板需要新增的顯示列

「付款資訊」區塊，在「運費」與「訂單總額」之間新增：

```
折讓    - NT$zzz    ← 若 discountAmount > 0 才顯示
折讓備註  xxxxx     ← 若 discountNote 非 null 才顯示
```

### G.4 錯誤提示規格

| 情境                                        | 錯誤提示文字                           |
| ------------------------------------------- | -------------------------------------- |
| discountAmount < 0                          | 「折讓金額不可為負數」                 |
| discountAmount > itemSubtotal + shippingFee | 「折讓金額不可超過應收金額（NT$xxx）」 |

### G.5 儲存後行為

- 儲存成功後 toast 顯示「已更新訂單」（與現有行為相同）
- Orders.tsx 展開面板即時更新 orderTotal 與 remainingAmount
- 若折讓後 orderTotal < paidAmount，前端可考慮顯示「注意：已收金額超過訂單總額」提醒

---

## H. 測試案例建議

Step 8J 後端施工應補的測試（`artifacts/api-server/src/routes/orders.route.test.mjs`）：

| 測試案例                                          | 預期結果                                                       |
| ------------------------------------------------- | -------------------------------------------------------------- |
| 1. 建立訂單後 discountAmount 預設為 0             | formatOrder 回傳 discountAmount: 0                             |
| 2. PATCH /orders/:id 帶 discountAmount: 100       | DB 更新，formatOrder 回傳 discountAmount: 100                  |
| 3. discountAmount = 0（零折讓）                   | orderTotal = itemSubtotal + shippingFee（與原本相同）          |
| 4. discountAmount = -1（負數）                    | 回傳 422，拒絕更新                                             |
| 5. discountAmount > itemSubtotal + shippingFee    | 回傳 422（建議），或 clamp（待確認）                           |
| 6. orderTotal 計算正確                            | orderTotal = max(totalPrice + shippingFee - discountAmount, 0) |
| 7. remainingAmount 計算正確                       | remainingAmount = max(orderTotal - paidAmount, 0)              |
| 8. paidAmount > orderTotal 時 remainingAmount = 0 | 回傳 remainingAmount: 0                                        |
| 9. discountNote = null                            | 允許，不報錯                                                   |
| 10. discountNote = ""（空字串）                   | 允許（或 server 端 normalize 為 null，待確認）                 |
| 11. 舊訂單讀取時 discountAmount = 0               | formatOrder 讀取 DB default 值 0                               |
| 12. CSV 匯出包含折讓欄位                          | headers 含「折讓金額」「折讓備註」                             |
| 13. public tracking 不洩漏 discountNote           | PublicOrder 端點不回傳 discountNote                            |
| 14. cancelled 訂單嘗試更新 discountAmount         | 回傳 422（既有行為，不能編輯已結束訂單）                       |
| 15. completed 訂單嘗試更新 discountAmount         | 回傳 422（既有行為）                                           |

---

## I. Step 8J 施工 Checklist

Step 8J 後端施工時應按照以下順序執行：

### I.1 DB Schema 修改

- [ ] 修改 `lib/db/src/schema/orders.ts`，新增 `discountAmount` 與 `discountNote` 欄位
- [ ] 確認 drizzle-zod `insertOrderSchema` 是否自動包含新欄位（createInsertSchema）
- [ ] 執行 `drizzle-kit push` 或生成 migration 並確認 DEFAULT 值正確
- [ ] 確認本地 DB 已成功更新（worktree 環境需確認）

### I.2 修改 formatOrder

- [ ] 修改 `artifacts/api-server/src/routes/orders.ts` 的 `formatOrder()` function
- [ ] 新增 `discountAmount = parseInt(o.discountAmount ?? "0") || 0`
- [ ] 修改 `orderTotal = Math.max(totalPrice + shippingFee - discountAmount, 0)`
- [ ] 確認 `remainingAmount` 計算不需變動（依賴 orderTotal，自動正確）
- [ ] 在 return 物件加入 `discountAmount`、`discountNote`

### I.3 修改 Update Validation

- [ ] 確認 UpdateOrderBody（在 api-zod 或 server 端）加入 discountAmount / discountNote 驗證
- [ ] 注意：`api.ts` 是 generated 檔案，不可手動修改。需確認目前 server 端是否直接用 generated zod schema，或有另一個 server-side validation 層
- [ ] 修改 PATCH /orders/:orderId 的 updates 物件，加入 discountAmount / discountNote 處理

### I.4 修改 API Response

- [ ] 確認 ListOrders、GetOrder、UpdateOrder、CreateOrder 的 response 都透過 formatOrder 回傳
- [ ] 確認 discountAmount / discountNote 正確出現在所有 order response 中

### I.5 修改 CSV 匯出

- [ ] 修改 GET /stores/:storeId/orders/export 的 headers 加入「折讓金額」「折讓備註」
- [ ] 修改 rows 對應加入 discountAmount 與 discountNote 欄位

### I.6 重新生成 Generated Types（重要）

- [ ] 執行 orval 重新生成 `lib/api-zod/src/generated/` 相關檔案
- [ ] 確認 `Order` interface 已有 `discountAmount`、`discountNote`
- [ ] 確認 `OrderUpdate` interface 已有 `discountAmount`、`discountNote`
- [ ] 不可手動修改 generated 檔案

### I.7 測試

- [ ] 執行 TypeScript typecheck：`cd artifacts/api-server && npx tsc --noEmit`
- [ ] 執行 orders route test：`node --test src/routes/orders.route.test.mjs`（確認現有測試全數通過）
- [ ] 手動確認新增折讓後 orderTotal / remainingAmount 計算正確

### I.8 Migration 風險確認

- [ ] 確認 drizzle push / migration 前後 DB 資料無遺失
- [ ] 確認 DEFAULT 0 正確套用至舊資料
- [ ] 確認 nullable 欄位（discountNote）的 NULL 值正確保留

### I.9 範圍限制

- [ ] **不修改前端 UI**（前端 Step 8K 另行施工）
- [ ] **不修改 PDF / 刪除 / 封存**（另走 Step 8M / 8O）
- [ ] **不新增 discountRate / creditAmount / grossProfit**
- [ ] **不修改 PublicOrder.tsx**（買家端不顯示折讓）

---

## J. 風險與待確認

以下問題需要使用者確認後再開始 Step 8J 施工：

| #   | 問題                                                                                           | 建議預設                                                 |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | MVP 是否只做 discountAmount + discountNote，不做 discountRate / 購物金 / 毛利？                | **是，只做兩個欄位**                                     |
| 2   | discountAmount 超過應收總額時，要拒絕（422）還是自動 clamp 到上限？                            | **建議拒絕（422），前端驗證先擋**                        |
| 3   | 折讓金額是否要顯示在買家追蹤頁（/track/:publicToken）？                                        | **建議暫不顯示**                                         |
| 4   | CSV 匯出是否要加入折讓欄位？                                                                   | **建議加入**                                             |
| 5   | 已付款訂單（paidAmount > 0）調整折讓後導致 paidAmount > orderTotal（溢收），是否要提醒或標記？ | **待確認，建議前端顯示提醒**                             |
| 6   | discountNote 空字串是否 normalize 為 null？                                                    | **建議 normalize**（與 paymentNote / shippingNote 一致） |
| 7   | 折數（discountRate）是否確認延後？                                                             | **建議確認延後**                                         |
| 8   | 購物金是否確認等會員系統？                                                                     | **建議確認等待**                                         |
| 9   | 毛利是否確認等成本系統建立後再做？                                                             | **建議確認等待**                                         |
| 10  | discountAmount 型別：integer 還是 numeric(10,2)？                                              | **建議 integer（NT$ 整數）**                             |

---

## K. 結論

### K.1 Step 8J 優先建議

- **只新增 `discountAmount` + `discountNote` 兩個欄位**，不要一次施工折數、購物金、毛利
- **修改 `formatOrder()` 的 orderTotal 計算邏輯**，確保折讓正確反映在 API response
- **同步修改 CSV 匯出**，讓對帳資料正確
- **重新生成 generated types**，確保前端型別同步

### K.2 不建議 Step 8J 同時施工

| 功能                 | 原因                                         |
| -------------------- | -------------------------------------------- |
| discountRate（折數） | 與 discountAmount 計算規則衝突，先確認再施工 |
| 購物金折抵           | 需要尚不存在的會員系統                       |
| 毛利計算             | 需要尚不存在的商品成本欄位                   |
| 刪除 / 封存          | 另走 Step 8O，不同 scope                     |
| PDF 列印             | 另走 Step 8M，不同 scope                     |

### K.3 建議施工順序

```
Step 8J（本規格 → 後端施工 → DB migration + API + tests）
  ↓
Step 8K（前端 UI：EditOrderDialog + Orders.tsx 展開面板）
  ↓
Step 8O（封存訂單規格）→ Step 8P（封存施工）
  ↓
Step 8M（PDF 規格）→ Step 8N（PDF 施工）
```

---

> 本文件為規格，未修改任何 DB schema、API、前端程式碼。
> 施工請依 Step 8J checklist 逐項執行，不可一次施工多個 Step 的範圍。
