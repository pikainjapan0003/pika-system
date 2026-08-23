# 84 · 全站前後端契約盤點與可用性走查（v1-frontend-backend-contracts）

日期：2026-08-22 分支：`fix/v1-frontend-backend-contracts`（基底 `a23adc1` Merge PR #15）

## 1. 環境

- 執行：Windows 11（工作樹）+ WSL Ubuntu（node v22.22.3、pnpm 10.34.4）＋ PostgreSQL 16（Docker 容器 `pika-repo-db`，port 55433，拋棄式）
- 預覽：`~/pika-preview`（`pika-preview-db` port 55432、api-server :8090、shop-app :4173，Clerk 替身）
- Owner 啟動器：`C:\Users\Lnovo\Desktop\pika-preview-launcher\`（start.bat／stop.bat／api.cmd／web.cmd／使用說明.md；以 Windows 排程工作常駐，關閉視窗不影響）

## 2. A-1 網址對照表（前端逐端點 vs 後端 vs openapi）

交叉比對來源：shop-app/src 全部 direct `fetch()`（16 檔）、`lib/api-client-react/src/generated`（orval 產出）、`artifacts/api-server/src/routes/*.ts`、`lib/api-spec/openapi.yaml`。`{X}`＝路徑參數。

### 2.1 前端 direct fetch 端點（16 檔 46 個呼叫，去重後）：

| 前端網址                                                                                      | 後端有無                  | openapi 有無      | 判定                                    |
| --------------------------------------------------------------------------------------------- | ------------------------- | ----------------- | --------------------------------------- |
| /api/cart/orders                                                                              | ✅ /cart/orders           | ✅                | 一致                                    |
| /api/cvs/stores?…                                                                             | ✅ /cvs/stores            | ⚠️ 未宣告         | 後端有；spec 未同步（登記，不影響執行） |
| /api/dev/handoff/data / data/a / data/b                                                       | ✅                        | ⚠️ 未宣告         | 同上（開發除錯端點）                    |
| /api/exchange-rate-reference/jpy/compare                                                      | ✅                        | ⚠️ 未宣告         | 同上                                    |
| /api/orders/picking-list.csv / shipping-list.csv                                              | ✅                        | ✅                | 一致                                    |
| /api/orders/track/{X}（+payment-last5）                                                       | ✅ /orders/track/{X}      | ✅                | 一致                                    |
| /api/orders/{X}/cvs                                                                           | ✅ /orders/{X}/cvs        | ⚠️ 未宣告         | 後端有；spec 未同步（登記）             |
| /api/orders/{X}/picking-check                                                                 | ✅                        | ⚠️ 未宣告         | 同上                                    |
| /api/orders/{X}/profit-snapshot/backfill                                                      | ✅                        | ⚠️ 未宣告         | 同上                                    |
| /api/stores/{X}/audit-events / audit-logs                                                     | ✅                        | ⚠️ 未宣告         | 同上                                    |
| /api/stores/{X}/customers（含 export/{X}/store-credit）                                       | ✅                        | ⚠️ 未宣告         | 同上                                    |
| /api/stores/{X}/logistics/\*（sync/status/manual-provider/imports/exceptions/import-batches） | ✅ 全有                   | ⚠️ 未宣告         | 同上                                    |
| /api/stores/{X}/orders/export（＋maihuobian/monthly-profit/profit-summary/{X}）               | ✅ 全有                   | ✅ orders/export  | 一致（追加端點未宣告→登記）             |
| /api/stores/{X}/products/image                                                                | ✅                        | ⚠️ 未宣告         | 後端有；spec 未同步（登記）             |
| /api/stores/{X}/skill-packages/{X}/preview·apply                                              | ✅                        | ⚠️ 未宣告         | 同上                                    |
| /api/stores/{X}/skills（＋enable/preview）                                                    | ✅                        | ⚠️ 未宣告         | 同上                                    |
| **/api/stores/{X}/trips**                                                                     | ❌ **前批發現、本批已修** | ⚠️ 修復時同步宣告 | 🔴→✅ 見 §4                             |
| /api/stores/{X}/trips/{X}/\*（close/unlock/cost-entries/operating-inputs/summary/comparison） | ✅ 全有                   | ⚠️ 未宣告         | 後端有；spec 未同步（登記）             |
| /api/p/{X}（＋/orders）                                                                       | ✅                        | ✅                | 一致                                    |

### 2.2 generated client（orval，lib/api-client-react）端點：

healthz、me/store、stores（CRUD）、stores/{X}（PATCH）、categories、products、orders（CRUD/export/status）、stats、agent/settings、trips（CRUD/routes/areas）→ **全部與後端路由一一對應**（比對無缺口）。

### 2.3 判定規則

- 「後端有、spec 未宣告」＝執行上無風險（generated client 未使用該路徑）；openapi 落後已登記，本批只對「新增端點」強制同步 spec＋codegen（CI 第 1 步）。
- 唯一硬缺口 = **GET /stores/{storeId}/trips**（tripProfitBoard.ts:225 固定抓取、後端與 spec 皆無）→ 本批修復。

## 3. A-2 型別對照表（id／數量／金額體欄位）

| 前端送出                                                                           | 型別                          | 後端驗證器                                                    | 判定    |
| ---------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------- | ------- |
| cost-entries.categoryId                                                            | number                        | positiveId（前批改為接受 number＋數字字串）                   | ✅ 已修 |
| cost-entries.originalAmount / currency                                             | string                        | decimalString / 枚舉                                          | ✅      |
| cost-entries.tripRouteId                                                           | number｜null                  | positiveId(String(v)) 強轉                                    | ✅      |
| trips.create/update exchangeRate                                                   | number（parseFloat）          | api-zod number                                                | ✅      |
| routes.create estQty/trainJpy/etcJpy…                                              | number（parseInt/parseFloat） | api-zod number                                                | ✅      |
| operating-inputs（exchangeRate/dailyGross…/workingDays/totalItemQuantity/hepDays） | string｜number                | decimalString／parsePositive/NonNegativeInteger（皆接受兩種） | ✅      |
| orders（客人端/後台） quantity/金額                                                | number                        | api-zod SubmitOrderBody 等                                    | ✅      |
| skills.enable enabled/catalogVersion/confirmations                                 | boolean/number/boolean        | 直接比對                                                      | ✅      |
| customers export / audit-logs 篩選                                                 | string query                  | 字串                                                          | ✅      |
| 其餘 URL params                                                                    | string                        | positiveId/parseInt（URL 一律字串）                           | ✅      |

→ 除已修的 categoryId 外，**無其他型別契約缺口**。

## 4. A-3 修復（本批）

### N-1：新增 GET /stores/:storeId/trips（原幽靈端點）

- 後端 `trips.ts`：requireAuth＋verifyStoreOwner＋回傳與 GET /trips?storeId= 同形（含 routes；不洩漏 storeId 欄位）。
- spec `openapi.yaml`：新增 `listStoreTrips`（400/401/403/404 回應），並執行 codegen（api-client-react +77 / api-zod +35 行 generated 同步提交）。
- 前端 `tripProfitBoard.ts` 不改（前端實際行為即抓此網址，端點補上即通）。

### N-2：A–H 圖表在瀏覽器完全隱形（走查發現，同批修）

- 根因：8 個圖表元件全部使用**無 width/height 的裸 recharts `<BarChart>/<LineChart>/<ScatterChart>`**（recharts 2.15.2）；recharts 無尺寸時**不產生任何 SVG**（jsdom 測試只看文字/圖例，從未驗證 SVG）。
- 前端明顯寫錯（Task A-3 明示可改前端）：新增共用 `ChartFrame`（jsdom guard＋`ResponsiveContainer width=100% height=240`），8 個圖表（A–F、H + G 自訂熱圖表格維持原樣）全部換用。不變更任何欄位語意/值域。
- 實測：修復前 `svg=0`；修復後 A–F、H 各 panel svg≥1、bar/line 繪製正常（見 §6 走查截圖）。

## 5. A-4 回歸測試（tripsStoreIsolation.route.test.mjs，在 CI 清單內）

- 「dashboard trips endpoint GET /stores/:storeId/trips matches the frontend contract (KPI board source)」：owner 200＋回傳 own trips＋routes 附掛、跨店 403、不存在商店 404、非法 id 400；未登入 401（併入既有 auth 清單）。全部經 HTTP 路由，無 drizzle 繞路。

## 6. Task B：12 路徑走查結果（Playwright 實測，示範資料皆以 App 內建路徑產生並標示示範）

| #   | 路徑                           | 結果                                                                                                                                                                                                                                                | 截圖                                            |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | /dashboard（13 KPI＋A–D 圖表） | ✅ 13 張 KPI 卡有數字（自動選中「示範行程 北海道 2026.09」：營業毛利 NT$21,120、固定成本 NT$113,700…）；A–H 八張圖表渲染；K5 捲入繪入實測（scaleY 0→1 打在 4/4/1/6 根 rect＋H 線段繪入）；K6 交錯進場（stagger 0.035 於載入時播放，數字先出現再動） | walk-01-dashboard.png                           |
| 2   | /trips＋新增行程               | ✅ 兩筆示範行程可見；UI「＋新增行程」建立「示範行程 大阪 2026.10（匯率 0.22，備註 預覽走查示範）」成功                                                                                                                                              | walk-02-trips.png                               |
| 3   | /trips/3/estimate 輸入→儲存    | ✅ 行銷費用 3000→4000、儲存→「預估成本已儲存」、金額更新；K1 結算動效逐幀驗證（前批）                                                                                                                                                               | walk-03-estimate.png                            |
| 4   | /trips/3/actual 輸入→儲存      | ✅ 新增「電車費用 TWD 1200」→「實際費用已新增」、清單出現（無單據標示）                                                                                                                                                                             | walk-04-actual.png                              |
| 5   | /trips/3/comparison            | ✅ 預估/實際/差異/方向表渲染（有預估無實際的類別正確顯示「預算外／未發生」）                                                                                                                                                                        | walk-05-comparison.png                          |
| 6   | /reports/monthly-profit        | ✅ 月報渲染：已定格毛利 NT$0、訂單 1、尚無快照 1（訂單無定格快照時如實標示，不補 0）                                                                                                                                                                | walk-06-monthly.png                             |
| 7   | /orders /products /customers   | ✅ 訂單清單（#1 NT$123 面交 備貨中、匯出按鈕群）；商品清單（1 件、庫存 10）；顧客清單經技能地圖 UI 開啟 S-19 後可用（尚無客戶資料＝如實空態）                                                                                                       | walk-07a/b/c\*.png                              |
| 8   | /p/ci-smoke-product            | ✅ 商品頁＋「加入購物車」成功                                                                                                                                                                                                                       | walk-08-product.png                             |
| 9   | /cart                          | ✅ 購物車有 1 件（NT$123）、數量增減、取貨方式選單                                                                                                                                                                                                  | walk-09-cart.png                                |
| 10  | 下單流程                       | ✅ 面交（免運）→ 送出 →「下單成功」＋追蹤碼 5c42ae04736ef9362a61bc2169e58ce7                                                                                                                                                                        | walk-10-order.png                               |
| 11  | /track（＋/track/{token}）     | ✅ 查到訂單：店家處理中、進度、商品明細、面交說明                                                                                                                                                                                                   | walk-11-track.png                               |
| 12  | /cvs/711/select（＋return）    | ⚠️ 頁面可用（搜尋＋「測試用：使用懷民門市」開發按鈕）；商店清單需 7-11 eMap 外部資料匯入（本環境 cvs_stores 空表→「找不到門市」）；return 頁在無門市資料時正確顯示「門市資料不完整，請重新選擇」                                                    | walk-12-cvs711.png / walk-12b-cvs711-return.png |

### 走不通/受限之說明

- **7-11 選店與門市資料**：依賴外部 eMap（`/cvs/711/import-from-emap` 需外部服務號召）；⚙️ 本機無資料，非程式缺陷 → 據實說明、未偽造。
- **月報「尚無快照」**：利潤定格快照需對訂單產出（profit-snapshot/backfill 為後台操作）；現有訂單無快照 → 如實顯示。
- **K4 脈衝**需物流同步操作（外部/作業流程依賴），未觸發。
- **顧客清單空態**：顧客檔案來自訂單/物流匯入流程；示範環境僅有 2 筆面交訂單（未建顧客檔）→ 如實空態。

## 7. 驗證鏈

| 步驟                       | 結果                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0-① 12 頁硬寫色            | 0（僅 Settings 品牌色選取器功能值，doc81 已載）                                                                                                                                                            |
| 0-② prefers-reduced-motion | index.css P 段＋motion.ts 雙層存在                                                                                                                                                                         |
| 0-③ gsap/all               | 無                                                                                                                                                                                                         |
| 0-④ 契約對照表未解決項     | 0（唯一硬缺口 N-1 已修；「spec 未同步」皆登記）                                                                                                                                                            |
| 1 codegen drift            | generated diff = 0（新增 listStoreTrips 同步提交）                                                                                                                                                         |
| 2 Prettier                 | 全庫通過（pnpm exec 3.8.3）                                                                                                                                                                                |
| 3–5b schema/seed/GUARD×2   | push OK／seed 20 類別／兩 GUARD PASS                                                                                                                                                                       |
| 6 DB routes                | **110 / 110**（基準 109＋新增 1），fail 0                                                                                                                                                                  |
| 7 pure suites              | **477 / 477**，fail 0                                                                                                                                                                                      |
| 8 Playwright               | 本機實作：前批 3/15 通過；本批涉及圖表改動後**未重跑**（實測環境與 CI 差異同前批：Docker Desktop 佔 8080、CLERK dummy key 對後台 401）→ **留待 push 後 current-HEAD CI**（上批 CI 15 passed 印證環境判斷） |
| 9 typecheck×4              | 全過（TC3=0）                                                                                                                                                                                              |
| 10 build                   | BUILD_EXIT=0；主 chunk gzip **405.71 kB**（上手基準 404.42 kB，+1.29 kB＝ChartFrame 引入；上限 460 kB 內）                                                                                                 |

## 8. 已知限制／登記

- openapi.yaml 落後後端（約 30 條路徑未宣告）——執行無風險，建議另批同步（本批只強制新增端點）。
- 圖表尺寸修復屬「走查發現、前端明顯錯誤」同批修復（審批者可覆核撤退）。
- 預覽啟動器以 Windows 排程工作承載服務；若 Owner 電腦睡眠/重開機需重跑 start.bat。
