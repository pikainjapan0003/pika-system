# 85 · 包25 前置整地：四項缺陷修復 ＋ 示範資料補完 稽核

日期：2026-08-23
分支：fix/v1-preflight-phase25（基底 2f186f7 Merge PR #16＝含前端後端契約批次）
執行者：DeepSeek Harness（dsh）
L0：DESIGN.md@76ee361（既有，未動）；工單：包25 前置整地（O-1/O-2/O-4/O-5/O-8/O-9）

## 0. 對版與範圍

- 修正版對版指令執行：git fetch origin → git checkout -b fix/v1-preflight-phase25 origin/main → git log -1 ＝ 2f186f7 Merge pull request #16 from pikainjapan0003/fix/v1-frontend-backend-contracts ✅
- ⚠️ 對版曾兩次失配（main 被另一 worktree 佔用、PR #16 未合併的時差快照），依規則停手回報；審批者 B 裁決後以修正版指令對上。
- 範圍外一律未動：schema／migration／API 契約語意結構（O-4 僅放寬 route 驗證）、DESIGN.md、ci.yml、pnpm-workspace.yaml、components/ui/、printHelpers.ts、ReceiptPreview.tsx、Settings.tsx、O-3／O-6／O-7（移交包25）。

## 1. 環境

- 工作樹：C:\Users\Lnovo\Desktop\pika-v1-phase24（Windows 11；編輯與 git commit）
- 驗證：WSL Ubuntu（node v22.22.3、pnpm 10.34.4）鏡像副本 ~/pika-phase25-verify（tar 傳輸、無 .git）
- codegen 對照：node:24-bookworm 容器（Node v24.18.0）跑 orval 8.9.1 ＝ CI 同款環境
- PostgreSQL：pika-repo-db（port 55433）內 pika_ci（postgres／postgres，disposable）
- 預覽（示範資料＋截圖）：~/pika-preview（審批者 B 預覽環境；api :8090 → pika-preview-db 55432、shop-app :4173、Clerk 替身）

## 2. O-1／O-2：金額輸入欄 12 位小數零 ＋ 天文數字

### 根因（與審批者 B 核對）

operating-summary 回傳 entry.originalAmount（ExactDecimal numeric(30,12) 序列化、固定 12 位小數），前端直接灌入 values state，render 照貼 → 「0.000000000000」「6000.000000000000」；O-2 的天文數字是輸入被污染（後端計算本身正確）。

### 修法（只改顯示層，⛔ 送出格式不變）

- artifacts/shop-app/src/lib/operatingCostDisplay.ts 新增兩個純字串 helper（不經 Number／parseFloat／toFixed）：
  - trimAmountForDisplay(value)：只移除小數尾隨零（「0.000000000000」→「0」、「6000.000000000000」→「6000」、「6000.」打字中途保留小數點）。
  - decimalStringAtMost(value, max)：digit-string 比長度＋字典序的「≦ 上限」判斷；空串或不合後端文法（^\d+(?:\.\d+)?$）不攔截（交由後端 400）。
- TripEstimate.tsx 四個輸入（各類成本金額、估算匯率、預估件數、單件毛利）的 render 值套 trimAmountForDisplay；save() 送出仍用 state 原串——精度／格式不變。
- 測試：operatingCostDisplay.test.mjs 新增 2 組（各 9＋9 斷言，共 18）。

### 建議輸入上限（供審批者 B 複核；實作為 INPUT_MAX_LIMITS 常數）

| 欄位                   | 建議上限        | 依據                                                                                                                                                                                  |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 預估件數               | 100,000 件      | 計畫書 §7.9 範例整趟 670 件、O-2 案例 720 件、回本篇 412/528 件：單趟件數在 10³ 量級；10⁵ 為「絕不可能誤擋」的寬鬆上界。後端 parseNonNegativeInteger 另有 Number.isSafeInteger 硬限。 |
| 單件毛利               | NT$ 1,000,000   | 計畫書範例單件毛利 130 元、日薪目標 1500×工作天；單件毛利百萬屬打字污染量級。                                                                                                         |
| 單筆成本（各類別金額） | NT$ 100,000,000 | DB cost_entries.original_amount 為 numeric(30,12)（整數最多 18 位）；計畫書範例單筆成本（採購／運費／HEP）為千～萬元級；10⁸ 遠低於 DB 硬限且可攔 O-2 式污染（15 位天文數）。          |
| 估算匯率（同行治理）   | 1,000           | 計畫書 §7.9 例匯率 0.21、示範庫 0.199–0.22；JPY→TWD 實務同量級，>1000 只可能是污染。                                                                                                  |

超限時 save() 中止並具名回報欄位＋上限值（不送出）；皆為「防打字污染」寬鬆值，不影響正常業務輸入。

### 驗收（preview 實際 UI，Playwright 實機）

- 開 /trips/6/estimate：全欄位顯示無任何 .000000… 尾零（12 位零 count＝0；人事費用顯示「12000」）。
- 示範資料流程中以 UI 輸入 20 欄並儲存成功，數值正確寫入（DB：total_item_quantity=720、unit_gross_profit_twd=130.000000000000——寫入精度照舊）。
- 超限守衛實測（皆攔截、不送出）：預估件數 100001 →「預估件數 100001 超出上限 100000」；單件毛利 2000000 →「單件毛利 2000000 超出上限 1000000」；人事費用 100000001 →「人事費用 金額 100000001 超出上限 100000000」。恢復正常值後儲存照常成功。

## 3. O-4：起點／終點不再必填

### 後端（三處；未改 schema／migration）

- lib/api-spec/openapi.yaml：TripRouteInput required 移除 startPlace／endPlace（僅留 areaTitle, estQty, etcJpy）；該二欄移除 minLength: 1（空字串可）。TripRouteUpdate 同移除 minLength。
- codegen（node:24-bookworm 容器、orval 8.9.1＝CI 同款）→ generated diff 僅 2 檔：api.schemas.ts（-6/+4）、api-zod generated/api.ts（startPlace／endPlace → zod.string().optional()）。
- artifacts/api-server/src/routes/trips.ts POST：startPlace／endPlace 缺省補 ?? ""（防 DB NOT NULL 違規；DB 欄位 text NOT NULL 不變、空字串合法）。

### 前端

- Trips.tsx：起點／終點標籤移除星號；儲存驗證只要求路線名稱；錯誤文案改「請填寫路線名稱；起點與終點可留空」。
- ⛔ 未放寬其他任何欄位（路線名稱／預估件數／ETC 維持必填）。

### 驗收（preview 實際 UI）

- 對示範行程新增路線「示範路線（起終點留空）」：起點／終點留空 → 儲存成功、列表出現。✅

## 4. O-5：components/ 硬寫色 token 化（本工單最重要）

### 範圍與更正

- 工單敘述的「50 處」經審批者 B 更正為 **43 個硬寫 class、分布 30 行**（50 誤含 components/ui/ 的 7 個；ui/ 屬 shadcn 元件庫，⛔ 不在範圍）。
- 實測基準（開工前）：4 元件 30 行 43 class；修後執行工單【4】自檢 grep → **無輸出**。

### 43 個 class 逐項換法對照（⭐ = 新換法，具名依據）

| 檔                        | 行  | 原樣式                                      | 換法                                                     | 依據                                                              |
| ------------------------- | --- | ------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| ExchangeRateReferenceHint | 70  | 重整按鈕 bg-white                           | bg-background                                            | 表單控制底（79 批次慣例）                                         |
| 〃                        | 76  | loading 提示 bg-white                       | bg-muted                                                 | ⭐ 次要資訊面→muted（DESIGN.md 356「次要背景 --muted」）          |
| 〃                        | 81  | bg-amber-50 ＋ text-amber-700               | bg-accent/10 ＋ text-accent                              | 警告→accent 系（79-8；81 批 TrackOrder 同款）                     |
| 〃                        | 93  | 銀行列 bg-white                             | bg-card                                                  | 卡片面                                                            |
| 〃                        | 110 | text-amber-700                              | text-accent                                              | 同上                                                              |
| 〃                        | 117 | 套用按鈕 bg-white                           | bg-background                                            | 表單控制底                                                        |
| 〃                        | 132 | auditError text-red-700                     | text-destructive                                         | 錯誤→destructive（DESIGN 356）                                    |
| LogisticsSyncStatusNotice | 158 | 整卡 bg-white                               | bg-card                                                  | 卡片面                                                            |
| 〃                        | 165 | text-red-700 bg-red-50 border-red-200       | text-destructive bg-destructive/10 border-destructive/30 | ⭐ border-red-200→border-destructive/30（Dashboard 同款）；錯誤面 |
| 〃                        | 222 | filled 主按鈕 text-white                    | text-primary-foreground                                  | DESIGN「filled primary 禁止 text-white」                          |
| 〃                        | 228 | 同 165                                      | 同 165                                                   | 同上                                                              |
| 〃                        | 233 | text-green-800 bg-green-50 border-green-200 | text-secondary-foreground bg-secondary border-border     | 成功訊息面（79-6；全站無 success token）                          |
| ManualTrackingSyncPanel   | 577 | 過期卡 bg-amber-50 border-amber-200         | bg-accent/10 border-accent/30                            | ⭐ border-amber-200→border-accent/30（Dashboard 同款）            |
| 〃                        | 611 | 剩餘≤30s text-amber-600                     | text-accent/80                                           | ⭐ 保留 600↔700 相對層級（81 批餘例 /80、/70）                    |
| 〃                        | 618 | 略過原因 text-amber-600                     | text-accent/80                                           | 同上                                                              |
| 〃                        | 627 | 7-11 預覽標示 text-amber-700                | text-accent                                              | amber→accent                                                      |
| 〃                        | 658 | 過期文字 text-amber-700                     | text-accent                                              | 同上                                                              |
| 〃                        | 668 | previewError bg-red-50 border-red-200       | bg-destructive/10 border-destructive/30                  | 錯誤面                                                            |
| 〃                        | 682 | commitSuccess bg-green-50 border-green-200  | bg-secondary border-border                               | 成功訊息面                                                        |
| 〃                        | 683 | text-green-800                              | text-secondary-foreground                                | 同上                                                              |
| 〃                        | 688 | text-green-700                              | text-secondary-foreground                                | 同上                                                              |
| 〃                        | 692 | text-green-700                              | text-secondary-foreground                                | 同上                                                              |
| 〃                        | 720 | commitError bg-red-50 border-red-200        | bg-destructive/10 border-destructive/30                  | 錯誤面                                                            |
| 〃                        | 731 | drifted bg-amber-50 border-amber-200        | bg-accent/10 border-accent/30                            | 待確認面                                                          |
| 〃                        | 732 | text-amber-700                              | text-accent                                              | 同上                                                              |
| 〃                        | 733 | text-amber-600                              | text-accent/80                                           | 同上                                                              |
| 〃                        | 824 | modal 剩餘 text-amber-600                   | text-accent/80                                           | 同上                                                              |
| LaundryCountdownTimer     | 28  | 已截止 bg-red-50 border-red-100             | bg-destructive/10 border-destructive/20                  | ⭐ border-red-100→border-destructive/20（TrackOrder 同款）        |
| 〃                        | 30  | text-red-500                                | text-destructive                                         | 已截止→錯誤語意                                                   |
| 〃                        | 31  | text-red-400                                | text-destructive/70                                      | ⭐ 次級說明保留相對層級                                           |

- ⚠️ 檔內另有 3 個 hex 色（LaundryCountdownTimer 的 #ffd166／#a09080／#faf8f4）不在工單 grep（命名色板）定義範圍：倒數影片疊字（固定影片色板）與「印刷感」底色條設計，維持不動；登記供包25 評估。
- ⭐ 全站登記：pages/「12 個凍結頁面」硬寫色開工前後均為 0；pages/ 其餘非凍結頁面（Customers、Orders、ProductForm、AuditLogs、CustomerDetail、Home、DevHandoff、Logistics\* 等）尚有 **386 處**硬寫色（D 群與未排程頁面）——本工單不擴權，登記供包25 排程評估。

### 夜間主題銀行卡片實機驗證（⭐）

- 環境：preview（新 code）＋ playwright chromium；/trips 展開新增行程表單＝night scope（body data-pika-theme=night、class dark）。
- 實測：4 家銀行列表渲染；銀行名稱文字 rgb(235,232,224)（--foreground 夜間淺色）、卡片底 rgb(32,32,29)（--card 夜間）→ **WCAG 對比 13.34:1**（修復前白底淺字近似不可見）。
- 截圖：o5-bank-card-night.png（卡片特寫）／o5-trips-night.png（整頁），已收進本批 commit：artifacts/shop-app/qa-screenshots/（含 dashboard／estimate-saved／actual-saved／comparison／o9-cart-with-item 等示範資料截圖）。

## 5. 示範資料（O-8／O-9）

### 目標

8 張圖表全部畫得出來、13 KPI 卡有數字、購物車看得到品牌色結帳按鈕。

### 方法（⛔ App 內建正式 UI 路徑；未直接改 DB、未跑 demo-seed 直寫腳本）

Playwright（Clerk 替身）對 preview（新 code、pika-preview-db）執行正式 UI 操作：

1. /trips「＋新增行程」→「示範行程 福岡 2026.11（包25前置整地示範）」，匯率 0.208、備註「示範資料：金額為示範整數，非真實營運數據；由 App 正式 UI 路徑建立」。
2. /trips/6/estimate：20 類別全填（FIXED 12／VARIABLE 7／PURCHASE 1，示範整數）＋預估件數 720＋單件毛利 130 →「預估成本已儲存」。
3. /trips/6/actual：逐筆「新增實際費用」共 20 筆（12／7／1，金額與預估同量級、略有差異）→「實際費用已新增」×20。
4. /dashboard：13 KPI 均有 NT$ 金額；頁面 svg＝10（A–H 圖表）→ 截圖。
5. 購物車（O-9）：/p/ci-smoke-product「加入購物車」→ /cart 有 1 件商品、filled primary「確認下單」按鈕可視。✅

### DB 覆核（唯讀確認）

trips#6：exchange_rate 0.208、total_item_quantity 720、unit_gross_profit_twd 130；cost_entries＝ESTIMATE 20（FIXED12／VARIABLE7／PURCHASE1）＋ ACTUAL 20（同分布）→ 預估↔實際 1:1（B 圖不再 20:1 傾斜）、三類齊全（C 圖可堆疊）、KPI 全數可算。

### 涵蓋

A–H 八圖全可繪（dashboard svg 10）、13 KPI 卡有數字、比較頁可用；截圖：estimate-saved / actual-saved / comparison / dashboard / o9-cart-with-item。

## 6. 驗證鏈逐步結果（ci.yml 順序；Linux 環境執行）

| 步  | 項目                                                                            | 結果                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0-① | components/（不含 ui/）硬寫色 grep                                              | **無輸出**（30 行 43 class → 0）                                                                                                                                         |
| 0-② | 12 凍結頁面硬寫色                                                               | **0**                                                                                                                                                                    |
| 0-③ | prefers-reduced-motion                                                          | 存在（index.css＋motion.ts）                                                                                                                                             |
| 0-④ | gsap/all                                                                        | 0                                                                                                                                                                        |
| 1   | codegen drift                                                                   | **diff＝0**（O-4 的 2 檔 generated 已同步；以 node24 容器 orval 產物＝CI 同款為準。註：node22 與 node24 輸出有空白差異，本批以 CI 環境為準）                             |
| 2   | Prettier 全庫                                                                   | ⏳ 最後一次編輯後執行（本批最後編輯為稽核文，尚未跑）                                                                                                                    |
| 3   | schema push（pika_ci）                                                          | [✓] Changes applied                                                                                                                                                      |
| 4   | seed-fixed-cost-defaults                                                        | fixed=12 variable=7 purchase=1 total=20 operating_settings_id_1=1                                                                                                        |
| 5   | V1_FIXED_COST_SCHEMA_GUARD                                                      | PASS                                                                                                                                                                     |
| 5b  | V1_MOCK_IMPORT_GUARD                                                            | PASS                                                                                                                                                                     |
| 6   | DB routes                                                                       | **tests 110 / pass 110 / fail 0 / skipped 0 / todo 0**（duration 162,093 ms）＝基準 110                                                                                  |
| 7   | pure suites                                                                     | 見下「步 7 結果」段                                                                                                                                                      |
| 8   | Playwright                                                                      | 本機標準 e2e 未跑（依包23/24 先例：CI webServer 僅於 CI 觸發、本機 8080 已被既有服務佔用）→ **留待 push 後 current-HEAD CI**；§4/§5 的 Playwright 實機操作為本批替代實測 |
| 9   | Typecheck ×4（api-server／mockup-sandbox／shop-app／scripts ＋ typecheck:libs） | **全過（exit 0，TC\_\*＝0）**                                                                                                                                            |
| 10  | Build（PORT=3000 BASE_PATH=/）                                                  | **BUILD_DONE**；api-server esbuild 7.3s＋shop-app vite 1m53s；主 chunk gzip **406.01 kB**（基準 405.71，+0.30；上限 460 ✅；vite chunk 警告為資訊性）                    |

### 步 7 結果（pure suites）

**tests 479 / pass 479 / fail 0 / skipped 0**（基準 477＋本批新增 2 測試；首次跑發現並修正 ① decimalStringAtMost 對小數點未對齊的比較 bug（99999999.9999 曾誤判超限，已改整數部件＋小數逐位比較），② tripsPage.test.mjs 的 label 隨 O-4 UI 同步（起點/終點星號移除）；修正後全綠。另有兩次誤跑記錄：mapfile 在 wsl 層失效導致 node --test 自動探索（593 測試含未排入 CI 的 route 測試、31 fail）與漏帶 --test flag——均為執行環境問題，已以正確指令重跑）

## 7. 已知限制／登記

- 對版二次失配（§0）——流程紀律記錄，非缺陷。
- O-3（DAILY 無輸入欄）依工單移交包25 G0；本批未發現新線索。
- pages/ 非凍結頁面 386 處硬寫色（§4）；LaundryCountdownTimer 3 hex 色（§4）。
- 標準 e2e 本機未跑（§6 步 8）。
- node22／node24 的 orval 輸出空白差異（§6 步 1）——已以 CI 環境產物提交。
- 示範行程 6 全數字為示範整數並於名稱／備註標示，非真實營運數據。
