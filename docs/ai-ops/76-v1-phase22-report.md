# V1 包22 完工報告：實際成本彙總、雙毛利投影與實際單件毛利

日期：2026-08-13

分支：`feat/v1-dual-profit-and-actual-quantity`

基底：`origin/main@f2061ceee4c63d1ff6fae0be35ebcb6a665001ed`

驗收程式碼 HEAD：`b1bc4946e2bd23ecc09039b163961b0bdc1ce3d9`

## 交付與 Git 拓樸

| 順序 | Commit        | Subject                            | 結果                        |
| ---: | ------------- | ---------------------------------- | --------------------------- |
|   C1 | `5b69ae8`     | `actual-route-rollup-and-quantity` | 完成                        |
|   C2 | `f6f1869`     | `unit-and-daily-gross-profit`      | 完成                        |
|   C3 | `fd0695a`     | `actual-unit-profit`               | 完成                        |
|   C4 | `a878113`     | `fix-wait-for-call-wall-clock`     | 完成；補齊測試 harness 牆鐘 |
|   C5 | `b1bc494`     | `fix-trip-profit-type-narrowing`   | 完成；收斂兩個 TS2339       |
|   C6 | 本報告 commit | `phase22-report`                   | 本文件                      |

驗收前 `origin/main...HEAD=0/5`、工作樹乾淨。五筆皆為線性向前 commit，未 amend、rebase、reset 或 revert；本批未 push。

## A. `tripProfit` 新回傳結構與不變量

```text
tripProfit
├─ status: ready | pending_confirmation
├─ 共用成本側（只有 top-level ready 時存在）
│  ├─ fixed / variable / purchase 的 JPY-origin、TWD-direct 與 total
│  ├─ fixedPaymentFeeTwd / variablePaymentFeeTwd / purchasePaymentFeeTwd
│  ├─ paymentFeeTwd
│  └─ operatingExpenseTwd
└─ projections
   ├─ unit:  ready | pending_confirmation
   └─ daily: ready | pending_confirmation
```

逐條對照派工不變量：

1. 成本側只有一份。兩個 projection 共用同一個 `operatingExpenseTwd`、三段成本與 payment fee，沒有為 UNIT／DAILY 重算兩套成本。
2. 毛利側各自獨立。每個 ready projection 自帶 `grossProfitTwd`、`grossMarginRate`、`operatingProfitBeforeAdjustmentsTwd`、`finalOperatingProfitTwd`、`salaryTargetTwd` 與 `outcome`。
3. UNIT 與 DAILY 各自 ready／pending。`dailyGrossProfitTwd` 缺值只讓 DAILY 回 `pending_confirmation`，不會阻塞已具備 `unitGrossProfitTwd × estimatedItemQuantity` 的 UNIT。
4. `REVENUE` 保留在核心 `GrossProfitSource` 與舊相容計算中，但行程 operating-summary 沒有餵入 revenue 四欄，因此本批行程 UI 只啟用 UNIT 與 DAILY，沒有把 REVENUE 當成第三張投影卡。

公式：

- UNIT 毛利總額：`unitGrossProfitTwd × estimatedItemQuantity`
- DAILY 毛利總額：`dailyGrossProfitTwd × workingDays`
- 營業利益（調整前）：`grossProfitTwd - operatingExpenseTwd`
- 最終營業利益：`operatingProfitBeforeAdjustmentsTwd + creditCardRebateTwd`
- 薪資目標：`workingDays × referenceDailyWageTwd`
- 結論：負值為 `LOSS`；低於薪資目標為 `PROFIT_BELOW_SALARY_TARGET`；其餘為 `SALARY_TARGET_MET`

所有運算使用 `ExactDecimal`，只有序列化或顯示時才取位。

## B. D8 實際件數查詢鏈與狀態範圍

查詢鏈精確為：

```text
orders.product_id
  → products.id / products.trip_route_id
  → trip_routes.id / trip_routes.trip_id
  → current trip
```

查詢同時綁定 `orders.store_id`、`products.store_id` 與 current `trip_id`。納入狀態：

- `awaiting_payment`
- `preparing`
- `shipped`
- `completed`

排除狀態：

- `pending`
- `cancelled`

實測覆蓋納入／排除、跨行程與未掛路線商品。件數來源為 `orders.quantity`，只彙總已掛到本行程路線的商品；結果按 `tripRouteId` 分組後再加總為 `totalActualQuantity`。此為即時查詢結果，沒有寫回 `trips.total_item_quantity`。

實際成本只納入 `mode=ACTUAL` 且 `status=ACTIVE` 的 cost entries，按 `trip_route_id` 分組；JPY 使用 `actualExchangeRate` 換算，缺匯率且存在 JPY 金額時 fail-closed 為 `missing_actual_exchange_rate`。`trip_route_id=NULL` 的 trip-wide 實際費用另列，不會錯配到任一路線。

## C. D10 實際單件毛利與 fail-closed

每條路線：

- 實際單件交通成本：`routeActualCostTwd ÷ routeActualQuantity`
- 商品成本台幣：`costJpy × actualExchangeRate`
- 分攤交通成本：一般商品取實際單件交通成本；交通成本豁免商品取精確 0
- 實際單件毛利：`unitPriceTwd - productCostTwd - allocatedActualUnitTransportCostTwd`

安全契約：

1. 即時計算、不持久化，不新增或更新任何 profit snapshot。
2. `routeActualQuantity` 缺失或為 0 時回 `pending_confirmation / missing_actual_quantity`，不除以 0，也不代入 0。
3. `actualExchangeRate` 缺失時回 `missing_actual_exchange_rate`。
4. 商品進貨成本、售價或路線實際成本缺失時分別回明確 pending reason。
5. 計算全程使用 `ExactDecimal`；不得使用 `Number` 或 `parseFloat` 做金額算術。

route 與 pure tests 覆蓋 ready、交通成本豁免、負毛利，以及缺件數／匯率／商品成本／售價／路線成本等對照組。

## D. `orderProfitSnapshot` 零改動證明

下列檔案相對 `origin/main` 的 diff 為零：

- `lib/db/src/transport-cost/orderProfitSnapshot.ts`
- `artifacts/api-server/src/lib/orderProfitSnapshot.ts`

既有 snapshot 仍只在建單路徑透過 `createInitialOrderProfitSnapshot` 建立；本批新增的 ACTUAL 彙總與實際單件毛利只存在 operating-summary 的即時讀取鏈。`captured order stays frozen`、order/cart snapshot 與 batch snapshot 回歸均在 450/450 pure suite 中通過，因此沒有重算、回填或覆寫已 captured snapshot。

## E. Schema、migration 與 API 契約一致性

Drizzle schema 與 `0038_trip_daily_gross_profit.sql` 均定義：

- 欄位：`trips.daily_gross_profit_twd`
- 型別：`numeric(30,12)`
- nullable：是
- named CHECK：`trips_daily_gross_profit_twd_non_negative`
- 規則：`daily_gross_profit_twd IS NULL OR daily_gross_profit_twd >= 0`

API PATCH 契約：decimal 字串可寫入；`null` 或空字串清空；負值、非 decimal 與 number 型別拒絕。route test 也直接查 DB 並驗證 named CHECK。

本輪 migration-delta verifier 先以 current Drizzle schema 建立獨立 disposable DB，再機械移除 0038 的欄位與 constraint，只套用原始 0038 一次。結果：catalog 型別／nullable／constraint 均精確相符；NULL、0、正值可寫；負值以 SQLSTATE `23514` 與同名 constraint 拒絕；輸出 `MIGRATION_0038_CATALOG_GUARD=PASS`。

採 delta 模式的理由：`migrations/0001` 是歷史手寫 DDL 記錄，不是可從空庫重播的正式 bootstrap chain；直接重播 0001–0037 會在 `stores` 尚不存在時得到假紅，不能驗證 0038 本身。

## F. 最終動態驗收與證據

最終成功 evidence：

`C:\Users\Lnovo\Documents\Codex\2026-08-12\phase22-final-clean-gate-rerun-20260812`

結果：

| Gate                 | 結果                                          |
| -------------------- | --------------------------------------------- |
| Frozen install       | PASS；Node 24.18.0、pnpm 10.34.4              |
| Codegen              | Orval 兩 target PASS；`CODEGEN_DRIFT=0`       |
| Prettier             | `All matched files use Prettier code style!`  |
| Schema push          | PASS                                          |
| Seed                 | fixed 12／variable 7／purchase 1／total 20    |
| Schema guard         | `V1_FIXED_COST_SCHEMA_GUARD=PASS`             |
| Migration 0038 delta | `MIGRATION_0038_CATALOG_GUARD=PASS`           |
| DB routes            | 103 tests／103 pass／0 fail／0 skipped        |
| Pure suite           | 450 tests／450 pass／0 fail／0 skipped        |
| typecheck:libs       | exit 0                                        |
| api-server typecheck | exit 0                                        |
| shop-app typecheck   | exit 0                                        |
| scripts typecheck    | exit 0                                        |
| Clean-copy gate      | 空檔，0 bytes                                 |
| Verifier             | `PHASE22_VERIFY_SUCCESS=2026-08-12T16:23:06Z` |

Evidence manifest：`sha256-manifest.txt`，26 entries，manifest SHA-256：

`BEDC3DDF7C7255479D4725C89A98A265CF2B4F8EC40CAC34F1E1EB282E2C0672`

| Evidence                     | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `01-install.log`             | `6EF00F3660057A184FBDD0B9C1F2482A2109B3E388624CA7F3735F89B5EBADFA` |
| `02-codegen.log`             | `6F5E7D6A96800559C0657F441A3C8714251D0331AA0694E3C97E1E7C62374CC9` |
| `03-prettier.log`            | `17AA973D3F004560237D9A95171210B0671DEFF23D61628EECF7322FF5938F20` |
| `04-schema-push.log`         | `D4A96111C4F4754FCE1D05E0505C22F2F3FD49D39D1C5CEF4A81EB212A14A8DF` |
| `05-schema-seed.log`         | `1203442DEB37D714E6CCB63FB3DB9F718E3658532CB3F2EDA3589A5FDA76BB95` |
| `06-schema-guard.log`        | `3CE194E7E8109AE76CDFB40C1D747AA01C65C99AC8A0F8AE49B30DC43081624A` |
| `06b-schema-push.log`        | `08FCC55289A649CD53EEB05A8BEDAF2F63EB2C62D1A4845742DCD59C03BF69E7` |
| `06b-migration-0038.log`     | `BD0F1BCD035FD2465AAA19CF6C99CD8A9CCFAFF63826B671C87295A0312C2E63` |
| `07-database-routes.log`     | `EAED662921B007281C3E378D935CA7E536C4B0135AA3BFB8E160C186C65EBE48` |
| `database-routes.junit.xml`  | `95F57122DA4A03325CF114114A15DA4716AF771D95E780B909C7F5FA5F3D3107` |
| `08-pure-tests.log`          | `B35D479DB0353197A64B6EC6C8FEE282E64E8FA9EB199E8CAE72E27C8DCF76BE` |
| `pure-functions.junit.xml`   | `58A9A5D382BF1961E4DDE7F20B07B7042FAA944D8CA2056852B3EAF3144F5946` |
| `09a-typecheck-libs.log`     | `18DC1FDA5AED7851799A3BC5C0B56E15E3CE78C1FB26D94987838DA16866A060` |
| `09b-typecheck-api.log`      | `0CB5E07E90993D5811599446BAD29A4193AF887D8DD9D884787AF5E9F3D222CF` |
| `09c-typecheck-shop.log`     | `BFCE589EA09407A6DCBEDFCCC9B287552E3096BA00BEB2242CACBBB04637CB5B` |
| `09d-typecheck-scripts.log`  | `A7D4A582BC395399E1BA40675C69C809BABBED17555581ED42A9B53D267E9C53` |
| `phase22-full.log`           | `8D5964522701F89211E3AED8DF89B6F77AB9DC9961A76B57B1F0028714BF3BFF` |
| `phase22-result.txt`         | `C10FDFBEC01049D6D58C59A59FBA9144A81000E17E561B701AC21B4AA2ED9CF7` |
| `verify-copy-git-status.txt` | `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855` |
| `phase22-verify.sh`          | `A6251A0E3C1115F82F52C0A1448744003B9E57D27308F1DE99A50419DE805786` |
| `preflight.txt`              | `AA04E5BCCB5E71339DAB45524F8E091E1C4995AF3B4D5C9479FF39F48A483088` |
| `launch-env.txt`             | `2034EE70F1061E1FC09B6B871369111240F7A0E9F650F5D233A05EC60A717579` |
| `resource-created.txt`       | `C526C9D0B9FF19A8B010FDF2E7B70F0DC308C88140154ABEC3A414FC057863E1` |
| `cleanup-postflight.txt`     | `7FC3762A24FBD436EF9C4FCB00146F595EF854C4A51533B38B0D18C56EF131EC` |
| `run-summary.txt`            | `EEE603B4004DFD61EFBB7A561FC70DF74714BC9AE6CB817DCED2A2E2EC12E2EF` |
| `verifier-patch-audit.txt`   | `5EF47DD0D8B71E1B0677609149960BFD0F49D3B25346F90D9F8DD3208611B18B` |

Docker：preflight label container／volume／network 為 0／0／0；建立精確 2／1／1；postflight 回到 0／0／0。total volumes 為 134 → 134，delta 0。未使用 `docker volume prune`，未用名稱萬用字元，也未刪除任何未帶 `v1.phase22=true` label 的資源。

## G. SELF_SHA256 計算規則

讀取本檔 UTF-8 原始 bytes，刪除整行 `SELF_SHA256:`（包含其換行）後計算 SHA-256。實際值列於 Q 節。

PowerShell：

```powershell
$text = [IO.File]::ReadAllText($path, [Text.UTF8Encoding]::new($false))
$normalized = [regex]::Replace($text, '(?m)^SELF_SHA256:.*(?:\r?\n)?', '')
$sha = [Security.Cryptography.SHA256]::Create()
(($sha.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($normalized)) |
    ForEach-Object ToString x2) -join '')
```

## H. 本機驗證邊界

Build 與 Playwright 本機未驗，留待 push 後 current-HEAD CI。不得把本報告中的 codegen、Prettier、DB、pure suite 與 typecheck 全綠誤述為 Build 或瀏覽器 E2E 已通過。

## I. 技術債登記

- F-7（併入）：`daily_gross_profit_twd` 與 HEP 都沒有 shop-app UI 寫入路徑，唯一入口是 PATCH operating-inputs。留待包23補 UI／UX，本批不擴 scope。
- F-9：`products.trip_route_id` 仍可為空，系統不強制商品掛路線。漏掛商品會使 D8 實際件數靜默少算；建立時強制掛路線或在 UI 列出未掛路線商品，均留待包23決策。

## J. `waitForCall` 事件完整軌跡

1. 第一份完整 suite：450 中 448 pass、2 fail，兩條皆卡在 `tripEstimatePage.test.mjs` 的 `waitForCall`。
2. 核准的一次單檔診斷得到「第三種結果」：等待第 1 個 PATCH 的案例恢復；等待較後序位、categoryId 7 的 PATCH 仍失敗。單檔零 full-suite 負載下，該案例耗時 `5070.462414ms`。
3. 靜態因果：`save()` 先做 1 個 operating-inputs PATCH，再對 20 個分類逐一 `await` POST／PATCH；`waitForCall` 無論等待第 1 或較後請求都只有固定 1,500ms。
4. C4 將 helper 預設上限由 1,500ms 對齊既有 `waitForCondition` 的 15,000ms；成功路徑找到請求即返回，不增加正常等待。
5. C4 後兩次完整 pure suite 都為 450/450，因此裁決為 F-1 同族測試 harness 缺陷，非產品回歸。

診斷證據：

| Evidence                       | SHA-256                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| 首次 `failure-summary.txt`     | `E62CEC88D14D1FA5AEF31FC876A5091BB88183E993AD649BBE2C299FDEAC1F87` |
| 首次 `08-pure-tests.log`       | `77773EAC851EFAD3651FFA3C38E29E70CC9307703096F2D05D7DE7320B3F6972` |
| 單檔 `run-a-hypothesis.txt`    | `188D01BEE14E5C76120CB7AA2989756EB0039E63493A3C4FB7E9C7C829E60016` |
| 單檔 `diagnostic-full.log`     | `3C6F07D6C0EEFDCFD4568D5C2F66ACAC750CE16259BC038E46DF77BF866FB410` |
| 單檔 `trip-estimate.junit.xml` | `24B63B5CA37AF7F8F3E73B08F7FBB04F9404BD28A32254FD22CC70541361871F` |
| 單檔 `run-diagnostic.sh`       | `3B1C1D0E095000DE04F688BA4270012D844CFEC46D1E3761F80D30A9E2A9BB26` |

## K. F-10：基建包 F 的牆鐘修復不完整

基建包 F 只把同檔 `waitForCondition` 從 1,500ms 修到 15,000ms，遺漏 `waitForCall`。分類數由 19 增為 20 後，較後序位請求更容易超過固定 1.5 秒；未來 D9 若再增加分類或循序請求，風險會繼續放大。C4 已補本 helper，但應另案檢查「等待預算是否與循序工作量耦合」的其他測試 helper。

## L. Verifier 三版 SHA 與 P3 記錄

| 版本                          | SHA-256                                                            | 結論                                                              |
| ----------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 原始 verifier                 | `00E3929DC0BA622DEE6A392629241FE64A72812EB5F6129D108C87E0F628CE19` | file-mode、PowerShell hostname 與 migration baseline 問題依序揭露 |
| 核准 migration-delta verifier | `48007523EC81CC54B6E2CEE9462D16DB118E01CFE4459D9F74A66EC50FE4347A` | 06b 設計通過唯讀審查；產品 gates 全綠，但 clean gate 否決自產物   |
| clean-gate patched verifier   | `A6251A0E3C1115F82F52C0A1448744003B9E57D27308F1DE99A50419DE805786` | 只插入核准的 574 bytes；完整端到端成功                            |

本次 patch 的 byte audit：共同 prefix 12,259 bytes、刪除 0 bytes、插入 574 bytes、共同 suffix 307 bytes；prefix／suffix byte-for-byte 相同。

兩項已核准 P3：

1. `pika_phase22_migration` 沒有在容器內單獨 DROP；它只存在 disposable PostgreSQL container，並隨本批 label 清理一併銷毀。
2. `/tmp/phase22-migration-url` 在 disposable verifier container 內含 DB 憑證；該檔未寫入 evidence，container 已精確清理。密碼遮罩後的 hostname 證據另存於 `launch-env.txt`。

## M. 型別契約事件

C4 後 runtime tests 已為 450/450，但 shop-app typecheck 揭露兩個 TS2339：

1. `OUTCOME_LABELS` 錯用 top-level `ReadyTripProfit["outcome"]`；`outcome` 實際屬於 `ReadyTripProfitProjection`。
2. JSX 外層雖以 `summary.tripProfit.status === "ready"` 收窄，TypeScript 不會把可變物件屬性的收窄穩定帶入 `.map()` closure，因此 closure 內直接讀 `summary.tripProfit.projections` 仍不安全。

C5 改用 `ReadyTripProfitProjection["outcome"]`，並在 callback 內建立 `const tripProfit = summary.tripProfit` 後再次做 discriminant guard，再讀取 projections。沒有 cast、非空斷言或 TS ignore。

450/450 無法取代 typecheck：執行期只走 ready 資料且 JSX 可正常渲染，並不代表 TypeScript 的所有 union 路徑已被靜態證明。先前 verifier 前兩輪都在 typecheck 前 fail-fast，故此缺陷直到後續完整流程首次抵達 shop-app typecheck 才揭露。

## N. Clean gate 自體衝突

真正來源是 `.github/workflows/ci.yml` 自己的測試命令：它建立 repo-root `test-results/` 並將 JUnit／pure log 寫入其中。verifier 的契約是逐字複製 CI 測試命令，因此產生該目錄是正確行為；但 verifier 額外加入 CI 沒有的 unrestricted clean gate，導致它否決自己的必然產物。

核准 patch 在既有 `git status --short` 前：

1. `test -s` 確認兩份 JUnit 已安全複製到 `/evidence`；任一缺失即 fail-closed。
2. 精確執行 `rm -rf /work/test-results`，只刪 verifier 自建目錄。
3. 保留不加排除條件的原始 `git status --short`，因此其他任何 tracked／untracked 漂移仍會紅燈。

未使用 `--untracked-files=no`、未修改 `.gitignore`、未改 JUnit 位置，也未弱化 clean gate。最终 `verify-copy-git-status.txt` 為空檔，SHA-256 是空檔標準值。

## O. 兩輪完整驗收對照

repo 狀態兩輪皆為 `b1bc494`，未修改任何 repo 檔案：

| Gate                 |          Clean patch 前 |          Clean patch 後 | 一致性                                 |
| -------------------- | ----------------------: | ----------------------: | -------------------------------------- |
| DB routes            | 103/103，fail 0，skip 0 | 103/103，fail 0，skip 0 | 一致                                   |
| Pure suite           | 450/450，fail 0，skip 0 | 450/450，fail 0，skip 0 | 一致                                   |
| typecheck:libs       |                  exit 0 |                  exit 0 | 一致                                   |
| api-server typecheck |                  exit 0 |                  exit 0 | 一致                                   |
| shop-app typecheck   |                  exit 0 |                  exit 0 | 一致                                   |
| scripts typecheck    |                  exit 0 |                  exit 0 | 一致                                   |
| Generated drift      |                       0 |                       0 | 一致                                   |
| Migration 0038 guard |                    PASS |                    PASS | 一致                                   |
| Clean gate           |      `?? test-results/` |                      空 | 預期差異，只受核准 verifier patch 影響 |

前一輪 DB／pure duration 分別約 240.3s／672.1s；本輪約 241.4s／587.5s。牆鐘是環境診斷值，不是功能結果；pass/fail/skip 與所有 gate conclusion 完全一致。兩輪證據均保留，沒有擇優採樣。

前一輪 evidence manifest SHA-256：`F5030D3FF1998EEDA83DCD766F1AD13F7F906F8362E8D6C00E18AFE40032746B`。

## P. Follow-up：repo 衛生

`test-results/` 由 CI 同型命令產生，但 repo `.gitignore` 沒有對應規則。任何開發者在本機從 repo root 跑相同 DB／pure reporter 命令，都會多出未追蹤目錄。這是既有 repo 衛生問題；本批不修改 `.gitignore`，另案決定要忽略該目錄或把測試產物移到 repo 外。

## Q. SELF_SHA256

SELF_SHA256: 15913ed87c44fe78aefdd466baaad40a6f2aebd95f9eb7b5ac9ae2c03b64b927

## R. 最終邊界與待辦

- Build 本機未驗，留待 push 後 current-HEAD CI。
- Playwright 本機未驗，留待 push 後 current-HEAD CI。
- 未連 production 或既有 DB；所有 DB 均為本批 disposable PostgreSQL。
- 未操作 Replit／Republish。
- 未 push；等待審批者 B 終審與 Owner 另案授權。
