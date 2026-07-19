# Step 6D Release Checklist：後台 CVS 選店器（EditOrderDialog）

> 文件版本：1.0  
> 建立日期：2026-06-06  
> 對應分支：`qa/step6d-cvs-store-picker-clean-browser`（乾淨 QA2 分支）  
> 基準 commit：`2a76ef0 fix-step6d-store-selected-at-dirty-tracking`

---

## 1. 目的

本文件是 Step 6D「後台 EditOrderDialog CVS 選店器」的 release checklist，紀錄：

- 已完成的功能與修補項目
- 已執行的自動化測試與 API 實測結果
- 需補做的人工瀏覽器驗收清單
- 已知風險與技術債
- 進入 Step 6E 之前必須確認的前置條件

---

## 2. 乾淨基準與分支狀態

### 正確的 QA 分支

| 項目                             | 值                                                       |
| -------------------------------- | -------------------------------------------------------- |
| QA 分支名稱                      | `qa/step6d-cvs-store-picker-clean-browser`               |
| 基準 commit                      | `2a76ef0 fix-step6d-store-selected-at-dirty-tracking`    |
| 保留 Step 6D 功能 commit         | `cf799c6 feat-step6d-edit-order-cvs-store-picker` ✅     |
| 保留 Enter key 修正 commit       | `20ea74e qa-step6d-fix-enter-key-loading-guard` ✅       |
| 保留 storeSelectedAt 修正 commit | `2a76ef0 fix-step6d-store-selected-at-dirty-tracking` ✅ |

### 污染 commit（不在乾淨分支內）

| Commit    | 描述                                                               | 狀態              |
| --------- | ------------------------------------------------------------------ | ----------------- |
| `ec3b3bd` | `feat-orders-tracking-import-api`（Step 7B API）                   | ❌ 不在 QA 分支內 |
| `47a6f81` | `feat-orders-tracking-import-ui`（Step 7B UI，Orders.tsx +256 行） | ❌ 不在 QA 分支內 |

> **警告**：`fix/step6d-store-selected-at-dirty-tracking` 分支 HEAD 已有 `47a6f81`（Step 7B UI 污染）。  
> **必須從 `2a76ef0` 或 `qa/step6d-cvs-store-picker-clean-browser` 進行後續 merge，不可從 fix 分支 HEAD 合入主線。**

---

## 3. Step 6D 已完成項目

### 3.1 功能開發（commit `cf799c6`）

- [x] `EditOrderDialog.tsx`：CVS 選店器 UI 區塊（+131 行）
  - [x] Provider selector（7-11 / 全家）
  - [x] 依 `pickupMethod` 自動預選 provider（`isFamilyMartMethod` → `"family"`，其他 → `"seven"`）
  - [x] 關鍵字輸入框 + 搜尋按鈕
  - [x] 結果列表：店名 + 地址 + 電話 + 「選擇」按鈕
  - [x] 「選擇」後帶入 `storeCode` / `storeName` / `cvsStoreAddress` / `cvsStorePhone`
  - [x] `storeSelectedBy = 'admin'` 自動設定
  - [x] 已選門市 summary card（`cvsStoreAddress` 非空時顯示）
  - [x] 保守免責聲明：「門市資料可能因超商更新而異動，實際資訊以超商公告為準。」
  - [x] 手填 fallback（超商店號 / 超商店名輸入框保留）
  - [x] UI 狀態機：idle / loading / error / success+empty / results
  - [x] `handleSubmit` 送出 `cvsStoreAddress` / `cvsStorePhone` / `storeSelectedBy`

- [x] `orders.ts`：API 端接收 `cvsStoreAddress` / `cvsStorePhone` / `storeSelectedBy` 三個新欄位

### 3.2 CVS 搜尋 API（已存在，Step 6C 建立）

- [x] `GET /api/cvs/stores?provider=seven|family&q=...&limit=20`：公開端點（無 auth）
- [x] `POST /api/cvs/711/import-from-emap`：**永久停用**（`cvs.ts:120–122` 早回 403）

---

## 4. Step 6D-Fix 已完成項目

### 4.1 Enter key loading guard 修正（commit `20ea74e`）

- [x] 搜尋輸入框 `onKeyDown`：`if (e.key === "Enter" && cvsSearchStatus !== "loading")` 才觸發搜尋
- [x] 防止搜尋中重複送出請求

### 4.2 storeSelectedAt dirty tracking 修正（commit `2a76ef0`）

**問題**：原邏輯只要 payload 中有任何 CVS 欄位就更新 `storeSelectedAt`，即使值未改變。

**修正位置**：`artifacts/api-server/src/routes/orders.ts:548–556`

```javascript
// Only update storeSelectedAt when a CVS store field actually changes value.
// Guards against saves that don't change the store (e.g. payment-only edits).
const cvsChanged =
  (storeCode !== undefined &&
    (storeCode ?? null) !== (order.cvsStoreId ?? null)) ||
  (storeName !== undefined &&
    (storeName ?? null) !== (order.cvsStoreName ?? null)) ||
  (cvsStoreAddress !== undefined &&
    (cvsStoreAddress ?? null) !== (order.cvsStoreAddress ?? null)) ||
  (cvsStorePhone !== undefined &&
    (cvsStorePhone ?? null) !== (order.cvsStorePhone ?? null)) ||
  (storeSelectedBy !== undefined &&
    (storeSelectedBy ?? null) !== (order.storeSelectedBy ?? null));
if (cvsChanged) updates.storeSelectedAt = new Date();
```

- [x] 只有 CVS 欄位值實際變更時才更新 `storeSelectedAt`
- [x] 使用 `?? null` 正規化，避免 `undefined` vs `null` 誤判
- [x] 5 個新增整合測試覆蓋以下情境：
  - [x] 只改 `paymentStatus` → `storeSelectedAt` 不變
  - [x] 只改 `shippingStatus` → `storeSelectedAt` 不變
  - [x] 只改 `trackingCode` → `storeSelectedAt` 不變
  - [x] 相同 CVS snapshot 重送 → `storeSelectedAt` 不變
  - [x] 變更 `cvsStoreAddress` → `storeSelectedAt` 更新

---

## 5. 已執行測試與結果

### 5.1 自動化整合測試

| 測試套件                | 執行命令                                             | 結果                |
| ----------------------- | ---------------------------------------------------- | ------------------- |
| `orders.route.test.mjs` | `node --test --import tsx/esm orders.route.test.mjs` | ✅ **104/104 pass** |
| `cvs.route.test.mjs`    | `node --test --import tsx/esm cvs.route.test.mjs`    | ✅ **4/4 pass**     |
| shop-app typecheck      | `pnpm --filter shop-app tsc --noEmit`                | ✅ 通過，無錯誤     |

> 測試分布：原 Step 6C 共 99 tests；Step 6D-Fix 新增 5 tests（dirty tracking）；共 104 tests。

### 5.2 API curl 實測

| 測試項目          | 指令                                                     | 結果                                                                           |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 7-11 搜尋（懷民） | `GET /api/cvs/stores?provider=seven&q=懷民&limit=20`     | ✅ 1 筆：storeId=284754, 懷民門市, 新北市板橋區民治街111號, phone=(02)22504664 |
| 全家搜尋（板橋）  | `GET /api/cvs/stores?provider=family&q=板橋&limit=20`    | ✅ 3 筆：family-015125, family-024442, family-025213                           |
| 查無結果          | `GET /api/cvs/stores?provider=seven&q=ZZZNORESULTXXX999` | ✅ count: 0                                                                    |
| emap 未認證       | `POST /api/cvs/711/import-from-emap`（無 header）        | ✅ HTTP 401（Clerk 無有效 session）                                            |
| emap 已認證 mock  | 整合測試 cvs.route.test.mjs                              | ✅ HTTP 403（endpoint disabled，cvs.ts:120–122）                               |

### 5.3 靜態程式碼確認

| 驗收項目                                                                    | 位置                      | 結果 |
| --------------------------------------------------------------------------- | ------------------------- | ---- |
| CVS 選店器 UI 區塊在物流資訊區塊                                            | `EditOrderDialog.tsx:503` | ✅   |
| Provider selector（7-11 / 全家）                                            | `:512–513`                | ✅   |
| 依 `pickupMethod` 自動預選                                                  | `:115`                    | ✅   |
| Enter key loading guard                                                     | `:521`                    | ✅   |
| Idle 狀態「尚未搜尋」                                                       | `:533`                    | ✅   |
| 搜尋中「搜尋中…」                                                           | `:529`                    | ✅   |
| Error 狀態「搜尋失敗，請稍後再試」                                          | `:151, :535`              | ✅   |
| 查無結果「查無符合門市，請換關鍵字再試」                                    | `:539`                    | ✅   |
| 選門市帶入四個 CVS 欄位                                                     | `:156–163`                | ✅   |
| `storeSelectedBy='admin'` 自動設定                                          | `:162`                    | ✅   |
| `handleSubmit` 送出 `cvsStoreAddress` / `cvsStorePhone` / `storeSelectedBy` | `:213–215`                | ✅   |
| 已選門市 summary card                                                       | `:565–575`                | ✅   |
| 保守免責聲明                                                                | `:572`                    | ✅   |
| 手填 fallback（超商店號 / 超商店名）                                        | `:483–501`                | ✅   |
| 付款欄位完整                                                                | `:54–56, :200–202`        | ✅   |
| 物流欄位完整                                                                | `:61–62, :68, :206–216`   | ✅   |
| `storeSelectedAt` dirty tracking 邏輯                                       | `orders.ts:548–556`       | ✅   |
| emap 早回 403                                                               | `cvs.ts:120–122`          | ✅   |

---

## 6. 未完成／需人工補測項目

下列項目因 Replit headless 環境限制（React SPA 需 JS 執行，WebFetch 只回傳靜態 HTML），**無法由 Claude Code 自動化驗收**，需在有瀏覽器的環境補做：

| 未執行項目                                                           | 原因                                              |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| 瀏覽器視覺驗收（選門市 → 儲存 → 重開）                               | Replit headless，React SPA 需 JS 執行             |
| `storeSelectedAt` dirty tracking 視覺確認（Orders 列表「選擇時間」） | 同上                                              |
| 搜尋失敗 error 狀態視覺確認                                          | 無 DevTools Network block；error 程式碼已靜態確認 |
| 手機寬度（375px）視覺確認                                            | 同上                                              |

---

## 7. 人工瀏覽器驗收 Checklist

請在 Replit web preview 或本機環境完成以下步驟後，勾選確認：

### 7.1 開啟 EditOrderDialog

- [ ] 物流資訊區塊有「超商門市搜尋（選填）」區域
- [ ] Provider selector 預設符合 `pickupMethod`
  - 全家取貨方法 → 預選「全家」
  - 其他物流方式 → 預選「7-11」

### 7.2 7-11 搜尋

- [ ] 選「7-11」、輸入「懷民」→ 按 Enter 鍵
- [ ] 搜尋中期間按鈕顯示「搜尋中…」且禁用（Enter 無法重複送出）
- [ ] 有結果列表，顯示「懷民門市」+ 地址 + 電話

### 7.3 全家搜尋

- [ ] 切換 provider 為「全家」
- [ ] 輸入「板橋」→ 點搜尋按鈕
- [ ] 有全家門市結果（至少 1 筆）

### 7.4 查無結果

- [ ] 輸入不存在的關鍵字（例如 `ZZZNORESULTXXX999`）→ 搜尋
- [ ] 顯示「查無符合門市，請換關鍵字再試」（不顯示錯誤）

### 7.5 搜尋失敗（手動模擬）

- [ ] 在 DevTools Network 中 block `/api/cvs/stores`
- [ ] 執行搜尋 → 顯示「搜尋失敗，請稍後再試」

### 7.6 選擇門市

- [ ] 點選某筆門市的「選擇」按鈕
- [ ] 超商店號輸入框自動填入 storeCode
- [ ] 超商店名輸入框自動填入 storeName
- [ ] 「已選門市」卡片顯示：店名、地址、電話
- [ ] 免責聲明文字可見

### 7.7 儲存訂單

- [ ] 點「儲存」→ 成功（無錯誤 toast）
- [ ] 重新打開同訂單
- [ ] `cvsStoreId` / `cvsStoreName` / `cvsStoreAddress` / `cvsStorePhone` 正確顯示
- [ ] 「已選門市」卡片仍顯示

### 7.8 storeSelectedAt dirty tracking

- [ ] 選門市後儲存 → Orders 列表「選擇時間」欄位更新為當下時間
- [ ] 只改付款狀態後儲存 → 「選擇時間」**不變**
- [ ] 只改物流狀態後儲存 → 「選擇時間」**不變**
- [ ] 重送相同門市資料 → 「選擇時間」**不變**

### 7.9 舊有欄位不受影響

- [ ] 付款狀態 / 付款方式 / 已收金額 正常顯示與儲存
- [ ] 物流狀態 / 物流方式 / 運費 / 物流單號 正常顯示與儲存
- [ ] 其他訂單資訊欄位無回歸問題

### 7.10 手機寬度（375px）

- [ ] 搜尋結果列表可滾動
- [ ] 「選擇」按鈕可點擊
- [ ] Dialog 沒有明顯橫向爆版

---

## 8. 已知風險與技術債

1. **Step 7B 分支污染**  
   `fix/step6d-store-selected-at-dirty-tracking` 分支 HEAD 已有 `47a6f81 feat-orders-tracking-import-ui`（Step 7B UI，+256 行 Orders.tsx）。後續 merge 主線**必須從 `2a76ef0` 或 `qa/step6d-cvs-store-picker-clean-browser` 操作，不可從 fix 分支 HEAD 合入**。

2. **瀏覽器互動驗收未完成**  
   Section 7 全部 checklist 項目尚未勾選，需在有瀏覽器的環境補做後才算 release ready。

3. **cvs.ts(163) TypeScript 技術債**  
   `geoMatch possibly null` 是 pre-existing error，不影響 Step 6D 功能，但屬未修復技術債。

4. **門市資料即時性**  
   CVS 資料來自本地資料庫，非即時更新。已加保守免責聲明，但若超商實體調整（地址、電話、暫停服務），資料可能落後。

5. **emap 永久停用**  
   `POST /api/cvs/711/import-from-emap` 早回 403，現況下 emap 資料無法更新。待法務確認使用授權後才可解除。

6. **storeSelectedBy 固定為 'admin'**  
   管理員選店一律設 `storeSelectedBy = 'admin'`，Step 6E 買家端需另行設 `'customer'`，兩者邏輯需保持獨立。

---

## 9. Step 6E 前置條件

進入 Step 6E（買家端 PublicOrder.tsx CVS 選店器）前，必須確認：

| 前置條件                                        | 狀態                     |
| ----------------------------------------------- | ------------------------ |
| Section 7 人工瀏覽器驗收 Checklist 全部通過     | ⬜ 待確認                |
| 乾淨 commit（`2a76ef0`）已確認，無 Step 7B 污染 | ✅ 已確認                |
| `orders.ts` 接受 `storeSelectedBy` 欄位         | ✅ 已完成（Step 6D）     |
| `storeSelectedAt` dirty tracking 邏輯已修正     | ✅ 已完成（Step 6D-Fix） |
| 整合測試 104/104 pass                           | ✅ 已確認                |
| `GET /api/cvs/stores` 公開端點正常              | ✅ 已實測                |
| Step 7B merge 策略確認（不混入 Step 6E）        | ⬜ 待確認                |

---

## 10. 下一步建議

1. **人工瀏覽器補測**  
   在 Replit web preview 或本機完成 Section 7 全部 checklist，勾選後更新本文件。

2. **Step 6E：買家端選店器**  
   `PublicOrder.tsx` 整合 CVS 選店流程，`storeSelectedBy = 'customer'`。參考 `EditOrderDialog.tsx` 的 `handleCvsSearch` / `handleCvsStoreSelect` 實作，但需確保不依賴後台 auth。

3. **47a6f81 污染清理**  
   評估 `fix/step6d-store-selected-at-dirty-tracking` 分支是否需要 reset 至 `2a76ef0`，或以 QA2 分支為後續合入主線的基礎。

4. **emap 恢復評估**  
   法務確認 `emap.pcsc.com.tw` 使用授權後，移除 `cvs.ts:120–122` 早回邏輯。

5. **cvs.ts TypeScript 技術債**  
   修復 `geoMatch possibly null`（`cvs.ts:163`）。
