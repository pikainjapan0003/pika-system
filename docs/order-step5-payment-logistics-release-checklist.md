# Order Step 5 — 付款 / 物流欄位 Release Checklist

> 版本：Step 5E（批次操作）｜分支：`order-step5-payment-logistics-fields`
> 用途：Step 5 正式 release 前人工驗收，以及後續接手參考。
> 文件語言：繁體中文。

---

## 1. Step 5 總覽

| 階段   | 說明                                         | Commit    | 狀態    |
| ------ | -------------------------------------------- | --------- | ------- |
| **5A** | 付款 / 物流欄位規格文件                      | `b6204de` | ✅ 完成 |
| **5B** | DB schema 付款 / 物流欄位 migration          | `04e0e49` | ✅ 完成 |
| **5C** | API / OpenAPI / generated client / API tests | `f81eeb7` | ✅ 完成 |
| **5D** | 後台 Orders UI 顯示與編輯付款 / 物流欄位     | `1144924` | ✅ 完成 |
| **5E** | 批次付款狀態更新 / 批次出貨狀態更新          | `28629eb` | ✅ 完成 |

---

## 2. 功能清單

### 訂單付款欄位

- `paymentMethod`：付款方式（LINE Pay / 銀行轉帳 / ATM / 現金 / 其他）
- `paymentStatus`：付款狀態（pending / paid / refunded / cancelled）
- `paidAt`：實際付款時間（ISO 8601）
- `paidAmount`：實際付款金額（integer，最小單位：元）
- `paymentNote`：付款備註（後台內部使用）

### 訂單物流欄位

- `shippingMethod`：出貨方式（familymart / store_pickup / home_delivery / other）
- `shippingStatus`：出貨狀態（pending / processing / shipped / delivered / cancelled）
- `shippedAt`：出貨時間（ISO 8601）
- `trackingCode`：物流追蹤碼（由店家手動填入）
- `internalNote`：內部備註（後台內部使用，不公開）

### 訂單金額欄位（Step 5D 加入計算顯示）

- `subtotal`：商品小計
- `shippingFee`：運費
- `totalAmount`：訂單總額（subtotal + shippingFee）
- `amountDue`：待收金額（totalAmount - paidAmount）

### 單筆編輯

- 後台 `/orders` → 點開訂單 → 可編輯付款欄位（paymentMethod / paymentStatus / paidAt / paidAmount / paymentNote）
- 後台 `/orders` → 點開訂單 → 可編輯物流欄位（shippingMethod / shippingStatus / shippedAt / trackingCode / internalNote）
- 儲存後立即反映到訂單詳情頁

### 批次付款狀態更新（Step 5E）

- 後台 `/orders` → 勾選多筆 → 批次設定付款狀態
- 支援：pending / paid / refunded / cancelled
- 批次成功後自動重新整理列表

### 批次出貨狀態更新（Step 5E）

- 後台 `/orders` → 勾選多筆 → 批次設定出貨狀態
- 支援：pending / processing / shipped / delivered / cancelled
- 批次成功後自動重新整理列表

### 公開查詢頁個資保護

- 公開查詢頁（以 `publicToken` 存取）不回傳以下欄位：
  - `paidAmount`
  - `paymentNote`
  - `internalNote`
  - `recipientPhone`（或僅顯示末三碼）
  - `recipientAddress`（或僅顯示縣市）
- `publicToken`：訂單查詢 token，**不是** `trackingCode`
- `trackingCode`：物流追蹤碼，可依產品決策決定是否在公開頁顯示

---

## 3. QA 結果

| 項目                    | 結果                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| API tests               | ✅ 55 / 55 通過                                                                                   |
| Typecheck（全專案）     | ✅ 通過                                                                                           |
| shop-app build          | ✅ 通過                                                                                           |
| Step 5D 金額 QA         | ✅ 通過（商品小計 / 運費 / 訂單總額 / 待收金額計算正確）                                          |
| Step 5D 付款欄位儲存 QA | ✅ 通過                                                                                           |
| Step 5D 物流欄位儲存 QA | ✅ 通過                                                                                           |
| Step 5E 批次付款 QA     | ✅ 通過（重測後正常，Invalid orderId 已確認為 api-server 舊 dist 問題，rebuild + restart 後解決） |
| Step 5E 批次出貨 QA     | ✅ 通過                                                                                           |

> **備注**：Step 5E QA 過程中發現 Invalid orderId 錯誤，根因為 api-server 仍在運行舊的 dist。
> 解決方式：rebuild api-server → restart → 重測功能正常。
> 若環境有疑慮，每次部署後請確認 api-server 使用最新 build。

---

## 4. 已知限制

### 金流 / 物流

- 付款狀態是**店家手動記錄**，不是真實金流驗證
- 出貨狀態是**店家手動記錄**，不是真實物流 API 狀態
- 尚未串接任何金流（LINE Pay / 銀行等）
- 尚未串接任何物流（黑貓 / 宅配通 / 全家等）

### 功能缺口

- 尚未做買家通知（付款確認信 / 出貨通知信 / SMS）
- 尚未做撿貨單 / 出貨單（Step 5F 規劃範圍）
- 尚未做列印 / PDF / CSV 匯出
- 尚未做退款流程自動化

### 環境

- Production / Staging DB schema 是否已套用，需依各環境確認（本文件僅記錄 local 開發狀態）

---

## 5. 個資與客服注意事項

| 欄位               | 後台可見 | 公開查詢頁          | 說明                           |
| ------------------ | -------- | ------------------- | ------------------------------ |
| `internalNote`     | ✅       | ❌ 不公開           | 內部備註，不可洩露給買家       |
| `paymentNote`      | ✅       | ❌ 不公開           | 付款備註，不可洩露給買家       |
| `paidAmount`       | ✅       | ❌ 不公開           | 實際付款金額，屬財務資訊       |
| `recipientPhone`   | ✅       | ❌ 不公開（或遮罩） | 收件人電話                     |
| `recipientAddress` | ✅       | ❌ 不公開（或遮罩） | 收件人地址                     |
| `trackingCode`     | ✅       | 可選（依產品決策）  | 物流追蹤碼，可讓買家查詢       |
| `publicToken`      | ✅       | 用於驗證身份        | 訂單查詢 token，**不是**追蹤碼 |

**重要提醒**：

- `publicToken` ≠ `trackingCode`，兩者用途不同，勿混用
- 客服**不可對買家承諾**「已由金流確認付款」或「物流狀態即時同步」
- 付款 / 出貨狀態均為店家手動維護，可能有時間落差
- `internalNote` 絕對不可出現在任何公開頁面或 API 回應中

---

## 6. Git / 分支注意事項

### Step 5 Commit 清單（依時間順序）

```
b6204de docs-order-step5a-payment-logistics-fields-spec
04e0e49 db-order-step5b-payment-logistics-fields
f81eeb7 api-order-step5c-payment-logistics-fields
1144924 ui-order-step5d-payment-logistics-fields
28629eb order-step5e-bulk-payment-shipping-status
```

### FamilyMart 工作線說明

目前分支 `order-step5-payment-logistics-fields` 也混有 FamilyMart 相關 commits（stepF2 ～ stepF42）。
使用者已確認此狀況可接受。

**Release 前注意**：

- FamilyMart **未提交**的檔案不可混入 Step 5 收尾 commit：
  - `lib/db/import-family-stores-from-twcoupon.mjs`
  - `data/cvs/family-twcoupon-*.json`
- 下列檔案**不可 stage**：
  - `.claude/settings.local.json`
  - `dev-handoff/`（已在 .gitignore）
  - 任何 secrets / credentials / env 檔案

---

## 7. 下一階段建議

| 選項                       | 說明                                              | 建議時機                   |
| -------------------------- | ------------------------------------------------- | -------------------------- |
| **Step 5F**                | 撿貨單 / 出貨單 / 匯出 / 列印 / PDF / CSV         | 本 Step 5 穩定後，另開任務 |
| **Merge / Release Step 5** | 將 Step 5 合併回主線並部署                        | 完成 release checklist 後  |
| **整理 FamilyMart 工作線** | 將 FamilyMart 相關 commits / files 整理到獨立分支 | 依排程決定                 |

> **Step 5F 建議另開任務**，不要直接在本分支擴大範圍，避免影響 Step 5 release 時程。

---

## 8. Release Checklist

請在 release 前逐項確認。

### A. 環境準備

- [ ] DB schema migration 已套用（`db-order-step5b-payment-logistics-fields`）
- [ ] API server 使用最新 build（已 rebuild，非舊 dist）
- [ ] API server 已 restart 並正常回應 `/healthz`
- [ ] 相關環境變數確認（無 secrets 硬寫在程式碼）

### B. 後台 Orders UI QA

- [ ] `/orders` 列表可正常載入
- [ ] 點開訂單，金額欄位（商品小計 / 運費 / 訂單總額 / 待收金額）顯示正確
- [ ] 付款欄位（paymentMethod / paymentStatus / paidAt / paidAmount / paymentNote）可編輯並儲存
- [ ] 物流欄位（shippingMethod / shippingStatus / shippedAt / trackingCode / internalNote）可編輯並儲存
- [ ] 儲存後資料正確回填
- [ ] 手機版不爆版

### C. 批次操作 QA

- [ ] 勾選多筆訂單 → 批次設定付款狀態 → 成功更新
- [ ] 勾選多筆訂單 → 批次設定出貨狀態 → 成功更新
- [ ] 批次操作後列表自動重新整理
- [ ] 批次操作送出無效 orderId 時，回傳明確錯誤訊息（不崩潰）

### D. 公開查詢頁個資確認

- [ ] 公開查詢頁（`/order?token=xxx`）可正常存取
- [ ] `paidAmount` 不顯示在公開頁
- [ ] `paymentNote` 不顯示在公開頁
- [ ] `internalNote` 不顯示在公開頁
- [ ] `recipientPhone` 不完整顯示（或不顯示）
- [ ] `recipientAddress` 不完整顯示（或不顯示）
- [ ] `trackingCode` 顯示方式符合產品決策

### E. 安全性確認

- [ ] secrets / token / API key / credentials 不出現在任何頁面或 API 回應
- [ ] `internalNote` 確認不在 public API schema 中
- [ ] 後台 API 需要認證（未登入回 401）

### F. 程式碼 / CI 確認

- [ ] API tests 55 / 55 通過（`pnpm --filter api-server test` 或對應指令）
- [ ] Typecheck 通過
- [ ] shop-app build 通過
- [ ] 未提交的 FamilyMart 檔案未混入 staged 內容
- [ ] `.claude/` 未 stage
- [ ] `dev-handoff/` 未 stage

### G. 回歸測試

- [ ] 訂單新增流程未被破壞
- [ ] 商品列表 / 商品編輯未被破壞
- [ ] 下單流程未被破壞
- [ ] 公開商品頁未被破壞

---

## 9. Release 判斷規則

| 狀態                 | 定義                                            |
| -------------------- | ----------------------------------------------- |
| **READY**            | 所有 critical 項目通過，沒有 blocking bug。     |
| **READY WITH NOTES** | 可出貨 / 試跑，但仍有非阻斷性待確認事項。       |
| **NEEDS WORK**       | 功能大致可用，但有 UI / 文案 / 小流程問題需修。 |
| **NOT READY**        | 任一 critical 項失敗。                          |
| **BLOCKED**          | 缺環境、缺登入、缺測試資料，無法判斷。          |

**Critical 項目定義**（以下任一失敗 → NOT READY）：

- 付款欄位無法儲存
- 物流欄位無法儲存
- 批次操作完全無法使用
- `internalNote` 出現在公開頁
- `paidAmount` 出現在公開頁
- secrets / credentials 出現在任何頁面

---

## 附記

- 本文件對應分支：`order-step5-payment-logistics-fields`
- Step 5A 規格文件：`docs/order-step4-payment-logistics-spec.md`（原始規格，供對照）
- 每次 Step 5 相關功能有改動，應重新逐項勾選 Section 8 Release Checklist
- Step 5F（撿貨單 / 出貨單）建議另開獨立任務
