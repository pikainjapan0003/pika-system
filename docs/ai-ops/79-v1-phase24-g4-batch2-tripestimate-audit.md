# V1 包24 G4 第 2 批：TripEstimate G4 改造 ＋ color-scheme 缺陷修正 稽核

日期：2026-08-21
L0：`DESIGN.md@76ee361`（design-md-prettier-format）
前提：第 1 批稽核 `docs/ai-ops/78-v1-phase24-g4-foundations-redesign-audit.md`（已提交於 d0c10d6）

> 本批驗證依 Owner 選擇「乙＝完整驗證」逐步執行（ci.yml 順序）。環境見下。

## 環境

- 執行者：DeepSeek Harness（dsh）
- 驗證環境：**node:24-bookworm 容器**（Windows 無法 build，依派工於 Linux 容器驗證）
- Node `v24.18.0`、pnpm `10.34.4`（corepack 啟用）、PostgreSQL `16-alpine`（一次性 disposable，label `pika-g4-phase24-b2-20260821`）
- 工作樹：`C:\Users\Lnovo\Desktop\pika-v1-phase24`，分支 `feat/v1-uiux-design-system`，起點 `76ee361`
- 本機 `node_modules` 沿用第 1 批（`pnpm install --frozen-lockfile` 結果，gitignored），本次免重裝

## 任務 A：color-scheme 缺陷修正（審批者 B 於第 1 批 CI 查獲）

- **病灶**：`themeScope.ts` 原先 `body.style.colorScheme = scope`（scope ∈ light/night）。CSS color-scheme 文法允許自訂名稱，`"night"` 不會報錯但沒有任何瀏覽器認得，認不得即退回亮色，導致 6 個夜間頁的字體／日期選擇器／捲軸等瀏覽器原生零件為亮底。
- **修正**（`applyThemeRouteScope`）：`colorScheme = scope === "night" ? "dark" : "light"`；legacy 維持 removeProperty。
- **測試同步**：`domBootstrap.test.mjs` 中 `assert.equal(document.body.style.colorScheme, "night")` → `"dark"`；同一測試內其他斷言（`pikaTheme=night`、`classList contains dark`）一律未動。
- 全庫僅此一處設定過 `color-scheme`（查證無其他寫點）。

## 任務 B-1：18 處硬寫顏色逐項換法對照

| #   | 原檔案行 | 原樣式                                         | token 換法                                                            | 依據                                                                         |
| --- | -------- | ---------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | 14       | `inputClass` `bg-white`                        | `bg-background`                                                       | 輸入底色隨 scope；shadcn input 慣例                                          |
| 2   | 297      | 成本區 section `bg-white`                      | `bg-card`                                                             | 卡片面 `card`                                                                |
| 3   | 325      | 幣別 select `bg-white`                         | `bg-background`                                                       | 表單控制底色                                                                 |
| 4   | 376      | sticky header `bg-white`                       | `bg-card`                                                             | 卡片面                                                                       |
| 5   | 396      | 錯誤 `bg-red-50 text-red-700`                  | **SemanticStatePanel inlineError**（Alert destructive － 語意 token） | DESIGN.md 356 不利/錯誤→`--destructive`                                      |
| 6   | 401      | 成功訊息 `bg-green-50 text-green-700`          | `bg-secondary text-secondary-foreground`                              | 無 success token；中性確認面 `secondary`                                     |
| 7   | 407      | 估算匯率卡 `bg-white`                          | `bg-card`                                                             | 卡片面                                                                       |
| 8   | 419      | 鎖後修改警告 `text-amber-700`                  | `text-accent`                                                         | DESIGN.md 354 待確認/焦點→`--accent`                                         |
| 9   | 427      | 費用摘要 section `bg-white`                    | `bg-card`                                                             | 卡片面                                                                       |
| 10  | 450      | 整趟損益 section `bg-white`                    | `bg-card`                                                             | 卡片面                                                                       |
| 11  | 516      | projection 待確認 `bg-amber-50 text-amber-800` | **SemanticStatePanel pending**（`border-accent bg-accent/10`）        | DESIGN.md 354、J1 待確認內聯                                                 |
| 12  | 528      | tripProfit 待確認 `bg-amber-50 text-amber-800` | **SemanticStatePanel pending**                                        | 同上                                                                         |
| 13  | 540      | 主要按鈕 `text-white`                          | `text-primary-foreground`                                             | DESIGN.md「filled primary 必須 `--primary-foreground`，禁止硬寫 text-white」 |
| 14  | 557      | 結束並鎖定按鈕 `bg-white`                      | `bg-card`                                                             | 卡片面                                                                       |

（bg-white ×8、bg-amber-50 ×2、text-amber-800 ×2、bg-red-50 ×1、text-red-700 ×1、bg-green-50 ×1、text-green-700 ×1、text-amber-700 ×1、text-white ×1 ＝ 18 處，已全數移出；驗證鏈步驟 0 grep 歸零。）

## 任務 B-2：三個第 1 批元件真正接上

| 元件                                             | 接在哪一段                                                                                                                                                                                                                     | 承接鐵律／規格                                                                                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DualCurrencyCalibrationField`（G10 雙幣校準台） | 估算匯率卡內；`jpyValue=calibrationJpy`，`conversion` 依 `exchangeRate` 給 ready／pending，`interaction` 依 `estimateLocked` 給 editable／disabled，`onClear` 清空；description 標明用途                                       | DESIGN.md 285「只用於 JPY 原幣／NT$ 換算輸入」；鐵律 2（缺匯率走 `status:"pending"`＋`reason:"尚未提供換算匯率"`，絕不顯示 0）、鐵律 3（內建 `tabular-nums lining-nums`）；`exchangeRateLocked` 接 `estimateLocked` |
| `SemanticStatePanel`                             | ① loading（J2 骨架屏，替代「載入中…」文字）② inlineError（J3 內聯錯誤，替代 `bg-red-50`）③ pending ×2（projection／tripProfit 的 `pending_confirmation`，`reason` **照抄後端**不編造）④ empty（J4 字排空態，替代空白 section） | 鐵律 5（空狀態必須設計）；J1–J6 互斥狀態 family；`data-state` 主狀態單一                                                                                                                                            |
| `LedgerLockStamp`（K09 總帳落印）                | `estimateLocked=true` 時在操作列上方渲染；`reason` 具名、`action`＝解鎖估算（onAction→`unlockEstimate()`）；未鎖定不渲染                                                                                                       | DESIGN.md K7「是 `estimateLocked` 的專用實例」；對應 `trips.estimate_locked→summary.estimateLocked`                                                                                                                 |

## 任務 B-3：六條顯示鐵律逐條落實位置

1. **三態結論取後端 outcome**：`OUTCOME_LABELS[projection.outcome]` 不變，前端零判斷；新增 `OUTCOME_SURFACE` 只做語意色呈現。
2. **缺匯率／缺輸入→「待確認」**：`formatConvertedAmount` 既有 fail-closed；G10 校準台缺匯率走 `status:"pending" reason:"尚未提供換算匯率"`；「待確認」Text 由 `OPERATING_COST_PENDING_LABEL` 具名。
3. **tabular-nums**：`inputClass`、每列金額、自訂項目換算、section 合計、費用摘要三項、營業費用合計、projection 毛利／淨利 spans 全部加 `tabular-nums lining-nums`；三元件內建。
4. **預估／實際視覺區別＋有利／不利語意**：本頁為 ESTIMATE 單一模式；三態結論以文字＋色彩雙編碼——達標＝`bg-chart-3/10 text-chart-3`＋「達成日薪目標」；未達標＝`bg-accent/10 text-accent`＋「有利潤但未達日薪目標」；虧損＝`bg-destructive/10 text-destructive`＋「虧損」。
5. **空狀態必須設計**：renderSection 對「無類別且無自訂項」的區塊回傳 `SemanticStatePanel kind:"empty"`（標題＋原因），不再空白。
6. **桌機／手機同等**：容器維持 `max-w-[480px] mx-auto`、雙欄格局保留（`grid-cols-2`）；B-5 無水平捲動（見下）。

## 其他規約

- **B-4 骨架不動**：四層版面（header/main/footer）、成本區三節、費用摘要、整趟損益兩 projection 卡片、按鈕列結構均未改；只改 token／狀態面板／新增 G10 校準台與落印塊。「13 KPI／8 圖表」非本頁範圍。
- **B-5 無水平捲動（390px）**：`max-w-[480px] px-5` 容器不變；成本列 `grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_5.5rem]` 各柱 `minmax(0,…)`＋`min-w-0`；G10 校準台於 <640px 單欄；未新增任何 `overflow-x`。
- **B-6 金額運算**：未引入 `Number`／`parseFloat`／`toFixed`；金額一律沿用 `ExactDecimal` 字串管線（`formatApiTwd`／`formatConvertedAmount`）。

## 驗證鏈逐步結果（ci.yml 順序）

0. 硬寫顏色 grep（`(bg|text|border|ring)-(white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-?[0-9]*` on `TripEstimate.tsx`）：**無輸出 ✅**
1. codegen drift：orval＋`tsc --build` exit 0，`lib/api-client-react/src/generated`、`lib/api-zod/src/generated` diff＝0 ✅
2. Prettier 全庫（`--check . --ignore-path .prettierignore --end-of-line auto`）：新增測試初檢有 1 檔（我新增的測試）未格式化，`prettier --write` 後 **全庫通過**（含 DESIGN.md，76ee361 已格式化）✅
3. schema push（disposable pg）：exit 0，`[✓] Changes applied` ✅
4. seed-fixed-cost-defaults：**fixed=12 variable=7 purchase=1 total=20** operating_settings_id_1=1 ✅
5. V1_FIXED_COST_SCHEMA_GUARD：**PASS** ✅
6. DB routes：**tests 107 / pass 107 / fail 0 / skipped 0 / todo 0**，duration 436,553 ms，exit 0 ✅
7. pure suites（`--test-concurrency=1`）：**tests 471 / pass 471 / fail 0 / skipped 0 / todo 0**，duration 4,716,144 ms，PURE_EXIT=0 ✅（467 既有 ＋ 本批新增 4 測試；首次 run 曾因**我自撰測試**誤用 renderPage 的 15s `waitForCondition`（把等待錨文字「商品進貨成本」所在之 PURCHASE 分類清空）而 fail 1（15,121ms＝harness 等待上限，非 jsdom 變慢）；已修正為清空 FIXED 分類（保留錨文字），re-run 全綠，修正後該測 378ms 通過）
8. Playwright：**本機未驗，留待 push 後 current-HEAD CI** —— 依包23 先例與第 1 批終審：Playwright 不在本機驗證鏈；`e2e/playwright.config.mjs` 的 `timeout: 120_000` webServer 窗維持不變（不調高）。原因：本機常態負載下 api-server 啟動實測 ~137s ＞ 120s（第 1 批量測；shop-app dev 約 16s），且本次 fresh 容器未安裝 chromium。不謊報為通過。
9. Typecheck：api-server／mockup-sandbox／shop-app／scripts ＋ `tsc --build` → **ALL_TYPECHECK_PASS=1**（全 exit 0）✅
10. Build（PORT=3000 BASE_PATH=/）：api-server esbuild（162s）＋ mockup-sandbox ＋ shop-app vite（6m17s，chunk-size 警告為資訊性）→ **BUILD_DONE=1** ✅

## 已知限制

- **Playwright 本機未驗**（見上，步驟 8）；120s webServer 窗未更動，改由 push 後 GitHub CI 覆核。
- 本機負載：`domBootstrap` 首個 jsdom 測試仍見 ~36–39s 通過（F-10 型放慢但不逾錯），其餘測試多數正常；CD 資源無 cgroup 上限（nproc 8、memory.max/cpu.max=max）。
- G10 雙幣校準台採「估算匯率實用校準」落點（輸入已知日圓金額即時驗算台幣並顯示匯率），未逐列改寫 20 個成本列輸入結構 —— 遵守 B-4「元件結構不動」；既有每列 JPY→TWD 換算維持並補 `tabular-nums`。
- 三態結論語意色（達標→chart-3、未達標→accent、虧損→destructive）為呈現強化，三態判定仍 100% 依後端 `outcome`，前端零判斷。
- 語意色契約依 DESIGN.md：缺縮寫「待確認」對 `--accent`；有利／不利文字與色彩雙編碼，不只靠紅綠。
- 本批未動計算核心、schema、migration、API 契約、ci.yml、pnpm-workspace.yaml、lockfile、DESIGN.md。
