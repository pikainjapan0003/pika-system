# V1 第一期：營運成本利潤公式引擎完工報告

日期：2026-08-04

分支：`feat/v1-cost-engine`

基底：`origin/main@20fc7cc916d8661b22801111d4123ce973a47f6d`

狀態：本批未 push

## 結論

本批完成營運設定、行程／路線輸入欄位，以及燃料、HEP、區域路線、集運、整趟營運損益、損益兩平與預估差異等 ExactDecimal 純函式。三支 additive migration 已在拋棄式 PostgreSQL 實彈通過；CI 同範圍 89 檔、369 條純測試全綠，四套 typecheck 與全域 Prettier gate 亦全綠。訂單現有資料沒有凍結 tripId／routeId，無法在不碰禁止的快照寫入鏈下準確回推行程實績；因此包 10 誠實跳過，連帶依賴它且又缺固定成本持久化模型的包 12、13 也跳過，未用現行商品關聯冒充歷史事實。

## 逐包狀態

| 包  | 狀態    | Commit    | 實作與驗證                                                                                                                                                                                                          |
| --- | ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | done    | `8df3fbc` | 新增 singleton `operating_settings`、每日參考工資預設 `1500`、讀寫 helper，以及只存在程式碼的 `PAYMENT_FEE_RATE = "0.015"`；4 tests pass。                                                                          |
| 2   | done    | `f0c3169` | additive migration `0028` 加入 HEP、回饋、三種折扣、總件數欄位；HEP 核定表只保留 `4→7700`、`5→9600`、`10→19200`；rate test pass。                                                                                   |
| 3   | done    | `fbf0351` | additive migration `0029` 加入路線趟數、距離、油價與油耗欄位；保留 `fuel_jpy` 作為實際油資；沒有新增路線手續費設定或特殊 HEP 欄位。                                                                                 |
| 4   | done    | `0b0f5e6` | `fuelCost`：實際油資優先，否則以距離×油價÷油耗估算；缺值 pending、零油耗不產生 Infinity；6 tests pass。                                                                                                             |
| 5   | done    | `1e0f9d6` | `hepCost`：HEP 日圓總額÷總件數×匯率；零／缺件數 fail-closed；5 tests pass。                                                                                                                                         |
| 6   | done    | `900d9a5` | `routeCost`：油資＋ETC＋電車＋停車，換匯後套 1.5% 手續費並乘趟數，再除區域件數；6 tests pass。                                                                                                                      |
| 7   | done    | `ba4e90f` | `consolidationCost`：重量×每公斤費率，套 1.5% 後換匯並除件數；5 tests pass。                                                                                                                                        |
| 8   | done    | `88ce2b3` | `tripProfit`：營收扣三種折扣、進貨成本、固定／變動成本與一次 1.5% 手續費，再加信用卡回饋；含每日工資目標與三態結論；7 tests pass。                                                                                  |
| 9   | done    | `3e53589` | `breakeven`：以單件毛利計算損益兩平件數與含工資目標件數；非正毛利 pending；6 tests pass。                                                                                                                           |
| 10  | skipped | —         | 訂單／快照沒有凍結 tripId 或 routeId；商品目前的 `tripRouteId` 可在下單後改動，cart items 也沒有路線快照。依禁令不得改訂單金額寫入或 profit snapshot 鏈，因此無法準確聚合「每趟實績」，未用現在的商品關聯回推歷史。 |
| 11  | done    | `d854f65` | `variance`：actual−estimated、百分比除以 `abs(estimated)`、estimated=0 時 percent=null，收入／利潤與成本方向分流；7 tests pass。                                                                                    |
| 12  | skipped | —         | `operating-summary` 依賴包 10 的可信實績；`operating-inputs` 又要求固定成本寫入，但包 1–3 未定義固定成本資料模型或持久化欄位。依「整包不可替換」規則，不交付只有部分欄位的假完整 API。                              |
| 13  | skipped | —         | Trips「營運損益」頁與 skill gate 依賴包 12 的 summary/input API；前置不存在，故未做靜態假面板，也未改既有 skill map。                                                                                               |
| 14  | done    | 本 commit | 產出本報告、Sheet 對照值、完整驗證證據、殘留風險與可重算 SELF_SHA256。                                                                                                                                              |

## 公式與 Sheet 對照

### HEP

- 核定表：4 日 `7700 JPY`、5 日 `9600 JPY`、10 日 `19200 JPY`。
- Sheet 樣本：`19200 ÷ 670 × 0.21 = 2016/335 = 6.0179 TWD/件`（顯示至小數 4 位）。
- 計算全程保留 ExactDecimal 分數，僅顯示時取位數。

### 路線與 1.5% 手續費

- 樣本：`(800 + 500 + 1000 + 200) JPY × 0.2 = 500 TWD/趟`。
- 兩趟 base=`1000 TWD`；手續費=`1000 × 0.015 = 15 TWD`；總成本=`1015 TWD`；100 件時=`10.1500 TWD/件`。
- 手續費常數只有一個來源：`PAYMENT_FEE_RATE = "0.015"`。

### 整趟營運損益

- 營收 `100000`，三種折扣合計 `2000`，調整後營收 `98000`。
- 進貨成本 `60000`，毛利 `38000`。
- 固定成本 `20000`、變動成本 base `5000`，手續費=`25000 × 0.015 = 375`，營運費用=`25375`。
- 調整前營運利潤 `12625`，信用卡回饋 `500`，最終營運利潤 `13125`。
- 5 日×每日參考工資 `1500`＝工資目標 `7500`，結論為 `SALARY_TARGET_MET`。

## Migration 實彈

在全新 `postgres:16-alpine` 拋棄式資料庫依序演練：

1. `0027_operating_settings.sql`
2. `0028_trip_operating_inputs.sql`
3. `0029_trip_route_operating_inputs.sql`

驗證原文摘要：

- `reference_daily_wage` 預設=`1500.000000000000`，更新為 `1800.000000000000` 成功。
- trip fixture：`hep_days=10`、`hep_total_jpy=19200`、`total_item_quantity=670`、回饋預設 0。
- route fixture：`trip_count=2`、`distance_km=123.4`、`fuel_price_jpy_per_liter=179.8`、`fuel_efficiency_km_per_liter=12.5`。
- `hep_days=7` 被 check constraint 拒絕。
- `trip_count=0` 被 check constraint 拒絕。
- 容器與 label 清理後均為 0。

## 測試與靜態驗證

- 新增營運設定／公式測試：47 tests，全部通過。
- CI 同一探索範圍，Windows 因命令列長度分 8 組執行：`FILES=89 / TESTS=369 / PASS=369 / FAIL=0`。
- 其中唯一要求 PostgreSQL 的 `trackingWorkerPhase2.integration.test.mjs` 在拋棄式 DB：`5/5 pass`。
- `typecheck:libs`：exit 0。
- `@workspace/api-server typecheck`：exit 0。
- `@workspace/shop-app typecheck`：exit 0。
- `@workspace/scripts typecheck`：exit 0。
- Prettier：`All matched files use Prettier code style!`
- `git diff --check`：零輸出。
- 測試 PostgreSQL container／volume label：0／0。

附註：Windows 的 `drizzle-kit push` 對 schema 中以常數插值的 singleton check 產生 PostgreSQL `$1` DDL 錯誤，且工具錯誤地回傳 exit 0。本批 migration 本體已用 SQL 在獨立拋棄庫完整演練；全回歸用的臨時 schema 只用於既有 worker 整合測試，不把該工具輸出誤報為 migration 成功。

## 殘留風險與下一步前置

1. 目前 `trip_routes.fuel_jpy` 是 `NOT NULL DEFAULT 0`。純函式能以 null／空值區分「沒有實際油資」並轉估算，但若未來 API 直接映射 DB 的 0，會把預設 0 認成實際值；接 UI/API 前需先定義「實際 0」與「未輸入」的持久化語意。
2. 要做可信的 trip actuals，需在下單快照中凍結 trip/route 歸屬，或建立不會隨商品編輯漂移的歷史關聯；這會觸及目前明令禁止的訂單快照鏈，須另包設計與審批。
3. PATCH 固定成本需要先拍板資料模型：欄位、分類、是否按行程持久化、audit 與 nullable 規則。未拍板前不能安全交付 operating-inputs。
4. UI 與 skill gate 應在 summary/input API 的資料契約成立後再接，避免面板顯示由前端自行拼出的第二套金額公式。

## Git 狀態

- 本批 coding commits：10 筆；報告 commit 完成後共 11 筆。
- 分支：`feat/v1-cost-engine`。
- 未 push。
- 禁區 `generated`、`dev-handoff`、`.claude` 未變更。
- 訂單金額寫入鏈與 profit snapshot 邏輯未變更。

## SELF_SHA256

重算規則：讀取本檔 UTF-8 原始 bytes，刪除整行 `SELF_SHA256:`（含換行）後計算 SHA-256。

PowerShell 重算指令：`$text=[IO.File]::ReadAllText($path,[Text.UTF8Encoding]::new($false)); $normalized=[regex]::Replace($text,'(?m)^SELF_SHA256:.*(?:\r?\n)?',''); $sha=[Security.Cryptography.SHA256]::Create(); (($sha.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($normalized)) | ForEach-Object ToString x2) -join '')`

SELF_SHA256: 700c4f79b1816a044e087bb27f75497bad9c930f809a61f5bc5969d375ebe82f
