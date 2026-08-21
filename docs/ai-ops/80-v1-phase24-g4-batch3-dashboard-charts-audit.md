# V1 包24 G4 第 3 批：Dashboard KPI＋8 圖表＋mock 防護 稽核

日期：2026-08-21
L0：DESIGN.md@76ee361；前提：78（批次1）、79（批次2）稽核
批次 3：P（21 chart tokens）→ A（5 頁 64 處硬寫色）→ B（13 KPI）→ C（8 圖表）→ D（假資料六防護＋CI 閘門）

## 環境

- 執行者：DeepSeek Harness（dsh）
- 驗證環境：**node:24-bookworm 容器**（Windows 無法 build）；Node v24.18.0、pnpm 10.34.4、PostgreSQL 16-alpine disposable（label pika-g4-phase24-b3-20260821）
- 起點 bf27d72；工作樹 C:/Users/Lnovo/Desktop/pika-v1-phase24

## P：21 個圖表 token（DESIGN.md L369 起 21 個雙值，逐字照抄）

寫入位置：artifacts/shop-app/src/index.css 的 **design-token-bridge:end 之後**（生成區塊之外，bridge 重跑不覆蓋；SOURCE_COMMIT 釘選邏輯未動）。

- Light 欄 → 新 :root 區塊；Night 欄 → 新 body[data-pika-theme="night"] 區塊（照既有 scope 寫法）。
- 21 個 token 來源行（DESIGN.md）：sequential-profit-1~7（L372–378）、diverging-profit-negative-3~1／neutral／positive-1~3（L385–391）、missing／axis／gridline／contour／target-line／legend-foreground／legend-border（L398–404）。
- 取值逐字未動：無調色、無四捨五入、無省略（42 行；自檢 12/12 OK）。

## A：5 頁硬寫色逐項換法（64 處）

對照沿用批次 2（79 號文件）已定做法：卡片面 bg-white→bg-card；表單控制底 bg-white→bg-background；filled 主按鈕 text-white→text-primary-foreground；amber（待確認/警告）→--accent（文字 text-accent、面 bg-accent/10、框 border-accent/30、小按鈕 bg-accent/15）；red（錯誤）→--destructive（bg-destructive/10 text-destructive、框 border-destructive/30）；green（成功/確認）→bg-secondary text-secondary-foreground；gray（次要）→bg-muted text-muted-foreground。

| 頁                 | 處數 | 明細換法                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard.tsx      |   28 | 8×bg-white→bg-card（header／卡／BottomNav）；banner 3×amber→accent（含 border-amber-100→border-accent/30、bg-amber-100→bg-accent/15）；低庫存列 amber→accent；狀態徽章 bg-gray-100 text-gray-600→bg-muted text-muted-foreground；MetricCard accent 變體 border-amber-200 bg-amber-50→border-accent/30 bg-accent/10、text-amber-800→text-accent；錯誤徽章 bg-red-100 text-red-700→bg-destructive/10 text-destructive、text-red-600→text-destructive；StatCard 非 accent bg-white→bg-card |
| Trips.tsx          |   12 | inputClass bg-white→bg-background；3×filled 按鈕 text-white→text-primary-foreground；3×取消按鈕＋提示框＋行程卡＋header＋空態＋新增卡 bg-white→bg-card                                                                                                                                                                                                                                                                                                                                  |
| TripActual.tsx     |    9 | inputClass bg-white→bg-background；header／二卡 bg-white→bg-card；錯誤 bg-red-50 text-red-700→bg-destructive/10 text-destructive；成功 bg-green-50 text-green-700→bg-secondary text-secondary-foreground；主按鈕 text-white→text-primary-foreground                                                                                                                                                                                                                                     |
| TripComparison.tsx |    8 | header／表格容器 bg-white→bg-card；pending bg-amber-50 text-amber-800→bg-accent/10 text-accent；錯誤 bg-red-50 text-red-700→bg-destructive/10 text-destructive；方向欄 text-red-600→text-destructive、text-green-600→text-chart-3（與「有利／不利」文字雙編碼，鐵律 4）                                                                                                                                                                                                                 |
| MonthlyProfit.tsx  |    7 | header／月份卡／卡片 bg-white→bg-card；錯誤框 border-red-200 bg-red-50 text-red-700→border-destructive/30 bg-destructive/10 text-destructive；alert 值 text-amber-600→text-accent                                                                                                                                                                                                                                                                                                       |

鐵律 3 收斂：上述頁面的金額輸入／顯示補 tabular-nums lining-nums（與批次 2 同）。

## B：13 KPI（G0 凍結名單，不增不減不改名）

架構：lib/tripProfitBoard.ts（型別＋useTripProfitBoard hook＋deriveKpiCards）＋ components/ProfitKpiBoard.tsx（含行程選擇、空狀態）。

|   # | KPI          | 資料來源                                                                                 | 顯示                                               |
| --: | ------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
|   1 | 銷售總額     | ⚠️ **現行 API 無欄位**（trips 無 grossSalesRevenue；operating-inputs 僅 PATCH、無 GET）  | **待確認**（鐵律 2；不補 0；登記見「已知限制」）   |
|   2 | 調整後收入   | operating-summary ESTIMATE projections.unit.adjustedRevenueTwd                           | formatApiTwd                                       |
|   3 | 商品進貨成本 | tripProfit.purchaseCostPrincipalTwd                                                      | formatApiTwd                                       |
|   4 | 營業毛利     | projections.unit.grossProfitTwd                                                          | formatApiTwd                                       |
|   5 | 毛利率       | projections.unit.grossMarginRate                                                         | ExactDecimal ×100→%（1 位）                        |
|   6 | 固定成本     | tripProfit.fixedCostTotalTwd                                                             | formatApiTwd                                       |
|   7 | 變動成本     | tripProfit.variableCostTotalTwd                                                          | formatApiTwd                                       |
|   8 | 最終營業利益 | projections.unit.finalOperatingProfitTwd                                                 | formatApiTwd                                       |
|   9 | 薪資目標     | projections.unit.salaryTargetTwd                                                         | formatApiTwd                                       |
|  10 | 達標狀態     | projections.unit.outcome（三態**後端**判定，前端只映射文字/色）                          | 已達標／未達標／虧損＋chart-3／accent／destructive |
|  11 | 商品總件數   | totalItemQuantity                                                                        | 整數                                               |
|  12 | 平均單件毛利 | unitGrossProfitTwd（UNIT projection）                                                    | formatApiTwd                                       |
|  13 | 平均每日毛利 | projections.daily.grossProfitTwd（DAILY 投影；÷工作天數需除法、API 未回工作天數 → 附註） | formatApiTwd                                       |

- 無行程／未選行程 → SemanticStatePanel kind:"empty"（「尚無行程／請選擇行程」），⛔ 絕不顯示 0（鐵律 2）。
- 載入 → kind:"loading"；失敗 → kind:"inlineError"。
- 既有訂單／商品／低庫存卡未刪（B 群日常營運保留）；13 KPI 為新增區塊。

## C：8 張圖表

全部使用 21 個 chart token（hsl(var(--chart-…))），無 #hex、無 Tailwind 調色盤；每張有圖例（--chart-legend-foreground/-border）、a11y 文字摘要；recharts 僅 ResponsiveContainer 存在時掛載（jsdom 保護）。

| 圖                  | 型態 | 資料                                                                                                                                          | 使用的 chart token                                                                                                                                 | 落點                                                     |
| ------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| A 損益階梯（瀑布）  | 真實 | operating-summary ESTIMATE：營業毛利→扣固定/變動/手續費→調整前→最終→薪資目標→達標差額（階梯式累積、非對稱；差額以 ExactDecimal 字串管線計算） | chart-1（收入/結果）、diverging-negative-1（扣減）、neutral（小計）、target-line（薪資目標）、diverging-±3（差額）、missing（缺值）、axis/gridline | components/charts/ProfitWaterfall.tsx                    |
| B 預估↔實際群組長條 | 真實 | 同端點 ESTIMATE＋ACTUAL 各一次 → sections fixed/variable/purchase totalTwd                                                                    | chart-1（預估）、chart-4（實際）                                                                                                                   | EstimateActualBars.tsx                                   |
| C 成本結構堆疊      | 真實 | sections＋paymentFeeTwd（單列堆疊）                                                                                                           | chart-1/2、chart-4、chart-5                                                                                                                        | CostStructureStack.tsx                                   |
| D 差異貢獻（發散）  | 真實 | fixed-cost-comparison rows difference/direction                                                                                               | diverging-positive-2（有利）/negative-2（不利）/missing（缺值）；中心 0 參考線；有利/不利文字雙編碼                                                | VarianceContribution.tsx                                 |
| E 路線單件成本排行  | 示意 | mocks/mockProfitCharts.ts（整數化假值）                                                                                                       | sequential-profit-5                                                                                                                                | PreviewChart.tsx                                         |
| F 地區商品散點      | 示意 | mocks 假值                                                                                                                                    | diverging-positive-2                                                                                                                               | PreviewChart                                             |
| G 敏感度熱圖        | 示意 | mocks 假值（5×5 網格）                                                                                                                        | sequential-profit-1~7（表格式網格，附 7 階金額刻度圖例）                                                                                           | PreviewChart（data-preview-chart="sensitivity-heatmap"） |
| H 歷史趨勢          | 示意 | mocks 假值                                                                                                                                    | chart-4                                                                                                                                            | PreviewChart                                             |

B-5：390px 無水平捲動——KPI grid 用 min-w-0 卡、圖表容器 max-w-[480px] 內 min-w-0；G 熱圖表格 overflow-x-auto 限縮於表格區（DESIGN「全框網格只用於表格區」）。

## D：假資料六防護與 CI 閘門

1. 單一存放點：假資料只在 artifacts/shop-app/src/mocks/mockProfitCharts.ts。
2. 唯一取用點：只有 components/PreviewChart.tsx import mocks 目錄。
3. 不可關閉角標：PreviewChart 永久渲染「⚠️ 示意圖・非真實資料」，無 prop／設定／CSS 可關閉。
4. CI 機械閘門：.github/workflows/ci.yml 新增 step「Verify V1 mock import isolation」（唯一授權的 ci.yml 變更，未動任何既有 step），通過印 V1_MOCK_IMPORT_GUARD=PASS；邏輯＝掃描全部 TS/TSX/JS/MJS（跳過 mocks/ 目錄自身），凡出現 mocks/X 引用且非 PreviewChart.tsx → exit 1。
   **反證（三次輸出，已留存）**：
   - RUN 1 基線（無違規）→ V1_MOCK_IMPORT_GUARD=PASS（exit 0）
   - RUN 2 故意於 Trips.tsx 加入 import（@/mocks/mockProfitCharts）→ V1 mock isolation violated; mocks/ referenced outside PreviewChart.tsx: artifacts/shop-app/src/pages/Trips.tsx（exit 1）
   - RUN 3 還原 → V1*MOCK_IMPORT_GUARD=PASS（exit 0）
     ⚠️ 開發期已修正一處守衛自身缺陷：初版 grep 樣式含 ['"] 於 bash 雙引號內會被字串切除（模擬與 CI 都會假綠）；改為無內嵌引號樣式 mocks/[A-Za-z0-9*-] 並排除 _/mocks/_ 自身。此修正同時落於 ci.yml 與模擬腳本。
5. 假值一眼假：E–H 全部整數化／刻意極端（999、876…；階刻度 NT$ 0–120,000），無真實營運數字。
6. 上線硬閘門：§20.9 另案，本批不處理。

## 六條鐵律逐條落點

1. 三態結論取後端 outcome：KPI 10／圖 A 皆只映射 projections.unit.outcome；前端零判斷。
2. 缺值待確認不顯示 0：KPI 1（無欄位）顯示待確認；KPI 缺值一律 formatApiTwd→待確認；圖表 --chart-missing＋文字待確認，不補 0；空行程走 empty 面板。
3. tabular numbers：KPI 值、圖表圖例、月報金額全部 tabular-nums lining-nums。
4. 預估/實際視覺區別＋有利/不利語意：B 圖（預估 chart-1 vs 實際 chart-4）；D 圖（有利/不利＋發散 ± 色＋文字）；TripComparison 方向欄（text-chart-3/text-destructive＋「有利/不利」文字）；TripActual 成功/失敗面。
5. 空狀態必須設計：KPI 無行程 empty 面板；圖表缺資料顯示待確認文字，不空白。
6. 桌機/手機同等：KPI grid sm:grid-cols-3；圖表容器 max-w-480／ResponsiveContainer 伸縮。

## 驗證鏈逐步結果

0. 自檢：①21 token 自檢 12/12 OK（42 行）②五頁硬寫色 grep＝無輸出 ③PreviewChart＋Dashboard #hex grep＝無輸出
1. codegen：exit 0；generated diff＝0
2. Prettier 全庫（pnpm exec、repo 釘 3.8.3）：新增檔案與測試先 --write 後全庫通過
3. schema push：exit 0
4. seed：fixed=12 variable=7 purchase=1 total=20
5. V1_FIXED_COST_SCHEMA_GUARD=PASS
   5b. V1_MOCK_IMPORT_GUARD=PASS（＋反證 3 次輸出）
6. DB routes：**tests 107 / pass 107 / fail 0 / skipped 0 / todo 0**，duration 258,402 ms，exit 0
7. pure suites（--test-concurrency=1）：**tests 474 / pass 474 / fail 0 / skipped 0 / todo 0**，duration 3,482,008 ms，PURE_EXIT=0（471 基準＋本批新增 3 dashboard tests）
8. Playwright：**本機未驗，留待 push 後 current-HEAD CI** —— 依包23 先例與第 1 批終審：Playwright 不在本機驗證鏈；`e2e/playwright.config.mjs` 的 `timeout: 120_000` webServer 窗維持不變；第 1 批量測 api-server 啟動 ~137s ＞ 120s（本機常態負載）。不謊報。
9. Typecheck：api-server／mockup-sandbox／shop-app／scripts ＋ `tsc --build` → **ALL_TYPECHECK_PASS=1**
10. Build（PORT=3000 BASE_PATH=/）：api-server esbuild（146s）＋ mockup-sandbox（11s）＋ shop-app vite（7m41s，chunk-size 警告資訊性）→ **BUILD_DONE=1**

## 已知限制

- **Playwright 本機未驗**（見上）；120s 窗未更動。
- **KPI 1 銷售總額無後端欄位**：trips 無 grossSalesRevenueTwd、operating-inputs 僅 PATCH（無 GET）→ 依鐵律 2 顯示「待確認」，附註說明；待 API 契約另案補齊（本批未改 API）。
- KPI 13 平均每日毛利顯示 **DAILY 投影整趟值**（=每日毛利×天數）；÷工作天數 需 API 回工作天數，現況未供 → 附註於卡面，除法另案。
- 圖 A 損益階梯：現行 ESTIMATE 為 UNIT 源（adjustedRevenueTwd 恆 null），階段為「營業毛利→扣固定/變動/手續費→調整前→最終→薪資目標→達標差額」不等長；當 REVENUE 源出現（adjustedRevenueTwd 有值）自動前置「調整後收入」階段。達標差額以 ExactDecimal 字串管線計算（B-6 合規）；recharts 幾何位置需 Number() 轉換，僅用於 SVG 維度，可見金額一律 formatApiTwd。
- 本機負載仍偏高（domBootstrap 首測 26–39s 通過；DB routes 已回穩 258s）。
- mock 防護閘門於開發期修正一處假綠缺陷（引號樣式），修正版已同時落於 ci.yml 與模擬腳本（見 D 段反證）。
- 本批未動計算核心、schema、migration、API 契約、pnpm-workspace.yaml、lockfile、DESIGN.md；ci.yml 僅新增 5b 的 guard step。
