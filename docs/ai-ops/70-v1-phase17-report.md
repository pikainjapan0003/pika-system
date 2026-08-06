# V1 包17｜變動成本、採購成本與整趟損益結論

日期：2026-08-06

工作目錄：`C:\Users\Lnovo\Desktop\pika-v1-phase17`

分支：`feat/v1-trip-profit-sections`

起始基底：`4aad5c189154d87ba05dacc489ec525094e240cc`

## 結論

本批完成固定、變動、採購三區成本分類，將三區原幣輸入彙整為可稽核的 JPY 來源、TWD 直接支出與各自手續費；採購本金只在營收來源模式扣除一次，絕不重複放進營運費用。整趟損益摘要只採用已拍板的 UNIT 來源，缺少單件毛利或預估件數時 fail-closed 顯示「缺少單件毛利或預估件數」。估算頁已分成三個區段，自訂項目在沒有分類時明確歸入 FIXED，且 `TripActual` 原本就逐筆保存幣別，因此不需修改。七筆功能 commit 均需原子合併，不可拆開部署；本地尚未 push。

## Commit 清單

| 順序 | Commit    | Subject                                 | 內容                                                                              |
| ---: | --------- | --------------------------------------- | --------------------------------------------------------------------------------- |
|    1 | `034277c` | `add-cost-section-kind`                 | 新增 `cost_categories.kind` 與 `trips.unit_gross_profit_twd`；未觸碰 `fuel_jpy`。 |
|    2 | `5b09b4f` | `seed-variable-and-purchase-categories` | 以既有 seed 入口補 7 筆 VARIABLE 與 1 筆 PURCHASE，維持冪等。                     |
|    3 | `8b7c5e7` | `update-ci-schema-guard`                | CI schema guard 鎖住 11/7/1、總數 19、kind CHECK 與新增欄位。                     |
|    4 | `ebabcae` | `split-payment-fee-by-section`          | 固定／變動／採購分區計費，採購本金只扣一次並回傳 `purchaseCostPrincipalTwd`。     |
|    5 | `1accd72` | `operating-summary-sections`            | 摘要 API 分區輸出，只接受 UNIT 毛利來源，自訂列預設 FIXED。                       |
|    6 | `65e7a90` | `estimate-page-sections`                | 估算頁顯示固定／變動／採購三區與共享的顯示 helper。                               |
|    7 | `ef3e713` | `estimate-page-regression-locks`        | 補 UI、分類、原幣與 fail-closed 回歸測試。                                        |

另有一筆「驗證與報告補強」commit：只把 `fixedCostSummary.route.test.mjs` 納入 CI DB route 清單、加入 C-1 自訂列等價測試，並收錄本報告。既有七筆不 amend、不 rebase、不重寫歷史。

## 資料模型與 migration

`0033_cost_sections.sql` 僅做 additive 變更：

- `cost_categories.kind text NOT NULL DEFAULT 'FIXED'`
- `CHECK (kind IN ('FIXED', 'VARIABLE', 'PURCHASE'))`
- `trips.unit_gross_profit_twd numeric(30,12)`，允許 `NULL`

`trip_routes.fuel_jpy` 完全未變更，沒有 DROP NOT NULL、schema 變更、route 變更或 UI 變更。訂單、profit snapshot、transport-cost、productTransportCost 與 generated 目錄亦零變更。

## 採購本金與手續費契約

- 任一 split 欄位不是 `undefined` 時，採用 split 模式；JPY 與 TWD 兩側必須同時有效，否則 pending。
- split 模式的採購本金為 `purchaseCostJpyOriginTwd + purchaseCostTwdDirectTwd`；否則沿用 legacy `purchaseCostTwd`。
- 採購手續費只對 JPY 來源部分乘既有 `PAYMENT_FEE_RATE`。
- UNIT 模式：`grossProfitTwd = unitGrossProfitTwd × estimatedItemQuantity`，不再扣採購本金。
- REVENUE 模式：`grossProfitTwd = adjustedRevenueTwd - purchaseCostPrincipalTwd`。
- `operatingExpenseTwd` 只含固定成本、變動成本與三區手續費，不含採購本金。

P-1 對照探針（REVENUE，split 採購本金 15,000）：

```text
principal 15000.000000000000
fee 150.000000000000
gross 85000.000000000000
operatingExpense 150.000000000000
final 84850.000000000000
controlFinal 85000.000000000000
difference 150.000000000000
```

這證明採購本金只從 adjusted revenue 扣一次，營運費用只增加 150 手續費。

## 自訂成本 C-1

`categoryId = null` 的列以 `kind ?? "FIXED"` 歸入 FIXED，保留 `customLabel` 顯示名稱。相同的 JPY 100，在 FIXED 預設與 VARIABLE 比較分類下，換算金額、總手續費與營運費用完全一致；唯一差異只有報表所屬區段。

```text
categoryId null
defaultKind FIXED
convertedTwd 205.000000000000
fixedFee 3.075000000000
variableFee 3.075000000000
fixedOperatingExpense 208.075000000000
variableOperatingExpense 208.075000000000
equal true
```

此對照已成為 `fixedCostSummary.route.test.mjs` 的自動 route 回歸測試，並已加入 CI DB route 清單。

## 黃金 fixture

```text
status ready
grossProfitSource UNIT
fixedCostJpyOriginTwd 15215.715000000000
fixedCostTwdDirectTwd 23932.000000000000
fixedCostTotalTwd 39147.715000000000
fixedPaymentFeeTwd 228.235725000000
variableCostJpyOriginTwd 12682.325000000000
variableCostTwdDirectTwd 4960.000000000000
variablePaymentFeeTwd 190.234875000000
purchasePaymentFeeTwd 0.000000000000
operatingExpenseTwd 57208.510600000000
grossProfitTwd 91000.000000000000
finalOperatingProfitTwd 33791.489400000000
outcome SALARY_TARGET_MET
```

Sheet C32 為 `572.215725`，系統固定成本手續費為 `228.235725`，差額 `343.98`。差額來自 Sheet 對台幣直接支出（行銷 5,400、機票 14,532、網卡 485.85）也收取 1.5%；依老闆拍板，TWD 直接支出不收刷卡手續費，因此系統結果為本批採用值。

## PostgreSQL 雙路徑演練

### DB-A：SQL migrations 0001–0032 再 0033

全新 `postgres:16-alpine` 在既有 `0001_seller_agent_settings.sql` 就停止，尚未到 0033：

```text
DB_A_APPLY=0001_seller_agent_settings.sql
DB_A_LEGACY_FAILURE=0001_seller_agent_settings.sql
psql:/migrations/0001_seller_agent_settings.sql:49: ERROR: relation "stores" does not exist
```

這是 pre-0033 的 legacy migration chain 既有前置缺口；依修正版指令，本批沒有修改舊 migration，也沒有把 DB-A 誤報為成功。

### DB-B：Drizzle schema push（權威路徑）

Windows package script 首次因 schema 路徑解析失敗：

```text
Error No schema files found ... lib\db\src\schema\index.ts
DB_B_PUSH_EXIT=1
```

改用已核准的 CLI 參數形式，由 `lib/db` 執行後成功：

```text
[✓] Changes applied
DB_B_CLI_PUSH_EXIT=0
```

同一拋棄式 DB 連跑 seed 兩次，兩次皆為：

```text
V1_COST_DEFAULTS_SEEDED fixed=11 variable=7 purchase=1 total=19 operating_settings_id_1=1
```

schema guard 與 psql 證據：

```text
V1_FIXED_COST_SCHEMA_GUARD=PASS
FIXED|11
PURCHASE|1
VARIABLE|7
TOTAL|19
CHECK ((kind = ANY (ARRAY['FIXED'::text, 'VARIABLE'::text, 'PURCHASE'::text])))
cost_categories|kind|text||
trips|unit_gross_profit_twd|numeric|30|12
DB_B_LOG_SCAN=0
```

## 測試與靜態驗證

- 更新後完整 CI DB route 清單：16 檔，`90 tests / 90 pass / 0 fail / 0 skipped`。
- CI 同一五段純測試探索：`97 files / 424 tests / 424 pass / 0 fail / 0 skipped`；以 `--test-concurrency=2` 模擬兩核心 runner 完成，`duration_ms 509273.5254`。
- 原生 coverage 同一五段探索、`--test-concurrency=2`：exit 0。
- `tripProfit.test.mjs`：`15/15 pass`。
- TripEstimate／TripActual／TripComparison 三頁 component tests：`16/16 pass`。
- `fixedCostSummary.route.test.mjs`（含 C-1）：`5/5 pass`。
- `typecheck:libs`：exit 0（3.7 秒）。
- `@workspace/api-server typecheck`：exit 0（18.8 秒）。
- `@workspace/shop-app typecheck`：exit 0（21.7 秒）。
- `@workspace/scripts typecheck`：exit 0（6.2 秒）。
- Prettier：`All matched files use Prettier code style!`
- `git diff --check`：零輸出。
- 拋棄式 PostgreSQL 清理：先逐一驗證兩個 container 與兩個 volume 的 `codex.v1phase17=true` label，再精確刪除；最終 `PHASE17_LABEL_CONTAINERS=0`、`PHASE17_LABEL_VOLUMES=0`。未執行 `docker volume prune`。

第一次使用 Windows 預設高平行度跑 97 檔 coverage 時，外層 5 分鐘先逾時；第二次則在 `tripEstimatePage.test.mjs` 的固定 1.5 秒 render wait 出現時序失敗。該三頁測試獨立跑為 16/16，且同一完整探索在固定兩個 concurrency 後為 424/424；因此記為本機資源排程波動，不改產品碼、不放寬測試、不隱藏原始失敗。

## TripActual 核對

`TripActual.tsx` 本來就是一次新增一筆成本，每筆表單各自帶 `currency` 並原幣送出；沒有共用單一幣別的問題，所以本批不需修改。估算頁的顯示換算也只供預覽，POST/PATCH 仍送原幣，不把前端換算值寫回資料庫。

## 殘留風險與部署規則

1. DB-A 無法從空庫走完舊 SQL migration chain，故 0033 的空庫 SQL 串行路徑未獲證明；本批以 DB-B Drizzle push、schema guard、psql constraint/column 查詢作為權威驗證。
2. 七筆功能 commit 是原子交付：seed、schema guard、計算、API、UI 與測試不得拆開部署。
3. Windows 預設高平行度下有一次 component render 時序波動；未觀察到產品邏輯錯誤，CI 兩核心對應的完整受控結果為 424/424。
4. 本批沒有接入 orders、profit snapshot、transport-cost、productTransportCost 或 generated；也沒有改 `fuel_jpy`。
5. 本批不 push、不連 production／既有 DB、不操作 Replit。

## Git 狀態

- 七筆功能 commit 全部保留，另加一筆驗證／報告補強 commit；不 amend、不 rebase。
- 分支：`feat/v1-trip-profit-sections`。
- 最終提交後 `git status --short`：零輸出。
- 未 push。

## SELF_SHA256

重算規則：讀取本檔 UTF-8 原始 bytes，刪除整行 `SELF_SHA256:`（含換行）後計算 SHA-256。

PowerShell 重算指令：`$text=[IO.File]::ReadAllText($path,[Text.UTF8Encoding]::new($false)); $normalized=[regex]::Replace($text,'(?m)^SELF_SHA256:.*(?:\r?\n)?',''); $sha=[Security.Cryptography.SHA256]::Create(); (($sha.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($normalized)) | ForEach-Object ToString x2) -join '')`

SELF_SHA256: 49ad67f10d5d5452522036fa0b1499e6857bc19f2c7af1c0aaa76636a88c5054
