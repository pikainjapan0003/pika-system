# BATCH-20 包25：金額浮點／型別掃描

掃描日期：2026-08-01  
範圍：`artifacts/api-server/src`、`lib/db/src`、`artifacts/shop-app/src`、`scripts`；排除 `generated/`、`dist/`、`node_modules/`、測試檔與 QA 截圖。此包為唯讀盤點，不修改金額程式碼。

## 掃描方法

以 `rg` 搜尋 `parseFloat`、`Number(`、`float`、`real`、`double precision`、`::float`，再逐一核對金額寫入／快照／帳本路徑的上下文。掃描結果把「資料寫入計算」與「HTTP／UI 顯示或輸入解析」分開，不把所有 `Number` 命中誤列成金額缺陷。

## 結論

- 掃描到的訂單成交、交通成本、毛利快照、購物金交易與數量乘價寫入路徑，均以 `ExactDecimal`／字串定格；本次掃描沒有找到 `parseFloat` 或 `Number` 參與這些寫入公式的證據。
- `lib/db/src/transport-cost/orderMoney.ts:10-16` 的 `multiplyMoneyByQuantity` 使用 `ExactDecimal`，並以字串寫回；`artifacts/api-server/src/routes/public.ts:238-288`、`:446-511` 的單品／購物車建單也使用 ExactDecimal；`artifacts/api-server/src/routes/orders.ts:534-613` 的後台建單沿用相同鏈；快照定格集中在 `lib/db/src/transport-cost/orderProfitSnapshot.ts:60-109`。
- 以上「沒有發現寫入路徑浮點累加」是依本次命令與上下文核對所得的掃描結論，不等於數學上證明全庫永遠沒有其他路徑；後續新增金額寫入仍須沿用既有純函式。

## 命中分類與風險

### P2：訂單回應格式化仍轉成 JavaScript number

`artifacts/api-server/src/routes/orders.ts:2226-2269` 的 `formatOrder` 將 `shippingFee`、`totalPrice`、`creditSpent`、`payableAfterCredit`、`remainingAmount` 等欄位轉為 number，並以 `Math.max` 計算輸出欄位。這是 HTTP DTO／既有相容介面，不是資料庫寫入；但小數值可能受 JavaScript number 表示限制。BATCH-20 包19 的 `docs/ai-ops/47-order-response-decimal-options.md` 已把此列為待老闆決定的 API 語意（保留 number 並平行新增 exact 字串，或改回 decimal 字串），本包不自行改動。

### P2：編輯訂單折讓驗證使用 parseFloat

`artifacts/api-server/src/routes/orders.ts:1621-1626` 以 `parseFloat` 讀取既有總額／運費來做折讓上限驗證；真正的更新值在 `:1552-1564` 由 `multiplyMoneyByQuantity` 產生。這是驗證路徑的精度風險，未在本包改寫，以免越過既有金額語意與包19待拍板題。

### P3：其他 API／前端顯示與輸入解析

- `artifacts/api-server/src/routes/trips.ts:202-219`、`routes/products.ts:320-326`、`routes/stores.ts:164,188`、`routes/public.ts:145,155,455-456,537-538,611-619`：將 numeric 欄位轉成 number 供既有 JSON／顯示使用。
- `artifacts/api-server/src/lib/publicOrderResponse.ts:60-63`：顯示 DTO 取小數 2 位後轉 number。
- `artifacts/shop-app/src/pages/Trips.tsx:358-482,564`、`ProductForm.tsx:344-406`、`EditOrderDialog.tsx:479-508`、`PublicOrder.tsx:288,507-508` 等：表單輸入或畫面格式化使用 `parseFloat`／`Number`。這些不應被誤當成資料庫金額累加，但若 API decimal 語意調整，需由相容性測試一起處理。
- `artifacts/api-server/src/routes/public.ts:611-619` 與 `:621` 的追蹤回應僅組合顯示用的 `totalPrice + shippingFee - discountAmount`；它不寫回資料庫，但屬未來應集中到既有 decimal／display helper 的候選點。

## 建議

1. 先由老闆拍板 `docs/ai-ops/47-order-response-decimal-options.md` 的 API decimal 方案，再另開金額包處理 `formatOrder` 與前端相容性；本包不代決。
2. 另開小包把 `orders.ts:1621-1626` 的折讓驗證改為 ExactDecimal，並補 `0.1×3`／邊界測試；不得改測試期望值遷就。
3. 新增金額寫入一律複用 `ExactDecimal`、`multiplyMoneyByQuantity`、快照入口；顯示層若轉 number，需保持狀態標記與「待確認」語意。
