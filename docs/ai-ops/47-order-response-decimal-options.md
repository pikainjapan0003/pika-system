# 訂單 API 金額回應 decimal 選項（設計稿）

日期：2026-07-31  
狀態：僅設計、尚未拍板、未改任何 API 或金額邏輯

## 1. 問題範圍

目前資料庫中的多個訂單金額是 PostgreSQL `numeric`，寫入端也已使用 `ExactDecimal`。但 `artifacts/api-server/src/routes/orders.ts` 的 `formatOrder()` 會把以下欄位轉成 JavaScript `number`，並用浮點加減組裝部分回應值：

- `unitPrice`
- `shippingFee`
- `totalPrice`
- `creditSpent`
- `payableAfterCredit`
- `paidAmount`
- `orderTotal`
- `remainingAmount`

這段只發生在 API 回應格式化，沒有回寫資料庫；因此目前不是帳本寫入錯誤。但 `number` 無法精確表達所有十進位小數，未來若前端把回應值再次作為計算原料，可能出現 `0.1 + 0.2 !== 0.3` 類誤差。

現行 OpenAPI `Order` 把主要金額宣告為 `number`，前端多處也同時接受 `number | string`。若改回應型別，必須把 API spec、產生流程與所有呼叫端視為同一個相容性變更；不得直接修改 generated 目錄。

## 2. 選項

### A. 所有訂單金額一律回 decimal 字串

範例：`"0.30"`、`"4780.000000000000"`。

- 優點：傳輸全程保留十進位精度；語意最單純；與 PostgreSQL `numeric`、`ExactDecimal` 一致。
- 缺點：屬 API breaking change；所有顯示、排序、篩選與第三方呼叫端都要同步調整；OpenAPI 需改為 `string` 並重新產生 client。
- 風險：漏改任一舊呼叫端時，字串串接或錯誤排序可能悄悄發生。
- 適合：有明確 API 版本切換或能一次更新全部客戶端時。

### B. 保留既有 number，另加精確字串欄位做過渡

範例：保留 `orderTotal: 4780`，另回 `orderTotalExact: "4780.000000000000"`。

- 優點：舊 UI 不會立即壞；新功能可只讀精確欄位；能分批遷移。
- 缺點：同一金額有兩個事實表面，期間容易讀錯欄；欄位數增加；需定義何時移除舊 number。
- 風險：如果沒有 lint、測試或退場日期，過渡欄可能永久並存。
- 適合：目前系統仍頻繁變動、又不能承受一次 breaking change 時。

### C. 回傳最小貨幣單位整數

範例：新台幣分以 `orderTotalMinor: 478000` 表示。

- 優點：一般付款金額可用整數安全傳輸與排序。
- 缺點：本系統快照有 12 位小數，單一「分」無法表達所有既有精度；還要為 JPY/TWD 與快照另定 scale。
- 風險：scale 認知不一致會造成 100 倍或更大錯誤。
- 適合：只針對最終收款欄，且貨幣與 scale 已明確固定時；不適合作為全部快照欄的通用方案。

## 3. 保守建議（尚待老闆拍板）

建議先採 **B 作為相容性遷移手段**，新精確欄位只由 `ExactDecimal` 產生；待所有前端、列印與匯出都改讀精確欄後，再以版本化方式進入 A。不得讓 number 與 exact 欄各自重算，兩者必須來自同一個 decimal 原值。

在拍板前，維持現況且遵守兩條界線：

1. `formatOrder()` 的浮點值只作既有顯示相容層，不得回寫資料庫或作為新金額計算入口。
2. 新增金額功能繼續使用既有 `ExactDecimal`／快照純函式，不得仿照 `formatOrder()` 內聯浮點公式。

## 4. 需要一起決定的相容性題

1. 是否允許一次性 breaking change，或必須經過雙欄過渡？
2. 精確字串固定 12 位，還是保留資料庫原字串尾數？
3. 哪些欄屬「收款終值」可固定 2 位，哪些欄屬快照必須保留 12 位？
4. 公開 API 與 owner-only API 是否同批切換？
5. 舊 number 欄的退場條件與日期為何？

## 5. 驗收建議（未來實作包）

- 加入 `0.1 + 0.2`、12 位快照、負毛利、購物金折抵與已付款金額的判別測試。
- API route 測試逐鍵確認精確欄是字串，且不得由 `Number()`／`parseFloat()` 再轉回。
- OpenAPI 先改來源檔，再依既有產生流程更新 client；禁止手改 generated。
- 前端只在最終顯示邊界轉換格式，排序與加總使用 decimal 字串純函式。
