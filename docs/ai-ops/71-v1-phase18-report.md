# V1 包18：`fuel_jpy` 可空與 fail-closed 完工報告

日期：2026-08-08

工作目錄：`C:\Users\Lnovo\Desktop\pika-v1-phase18`

分支：`feat/v1-fuel-nullable`

基底：`efef2a78b157e3ab0a38bcdf59a536d4366210b4`

## 結論

`trip_routes.fuel_jpy` 現在可保存真正的 SQL `NULL`。缺油資時，交通成本會回傳「待確認／missing_fuel_jpy」，不再把缺值當成 0；使用者明確輸入 0 時仍維持原本的零成本結果。API、官方產生的 client/zod 型別、route 與 Trips 畫面均保留 `null`，畫面會顯示「待確認」，而且清空後重新載入不會變回 0。

本包**未實作距離推估**。原因是現有 Trips 產品面沒有距離、油價、油耗三欄的可寫契約，也沒有路線成本結果顯示面；`calculateFuelCost` 與 `calculateRouteCost` 目前都沒有 production 消費者。為避免估算值無標記地流入真實訂單損益快照，本包只完成 nullable 與 fail-closed。

## Commit 清單

| 次序 | SHA                                        | Subject                      | 範圍                                              |
| ---: | ------------------------------------------ | ---------------------------- | ------------------------------------------------- |
|   C1 | `bb25bffd902aa73a7f037f10de9df7ebc81c7793` | `fuel-jpy-drop-not-null`     | additive migration 0034 與 schema nullable        |
|   C2 | `b9ec30160571596c87dc9241dad85c1c0c439c65` | `transport-cost-fail-closed` | 缺油資 pending、明確 0 回歸鎖                     |
|   C3 | `1d5bfa63bae0347c357c2a85377ae88198884bae` | `api-contract-fuel-nullable` | OpenAPI 與官方 codegen 產物                       |
|   C4 | `d6107b178926aa4f313fa99a47cebd01a6b18153` | `api-route-fuel-null`        | POST/PATCH/GET null 語意、DB route 測試與 CI 探索 |
|   C5 | `2a6edc5edac7f0e185c32ea77afe9941775a6dc9` | `ui-fuel-pending`            | Trips 顯示、清空、重載與 jsdom 測試               |
|   C6 | 本提交                                     | `phase18-report`             | 本報告與自校驗值                                  |

六筆均為獨立 commit；未 amend、未 rebase、未 push。

## C1：PostgreSQL 16 migration 實證

使用新建、僅綁定 `127.0.0.1:55449` 的 `postgres:16-alpine` 拋棄庫。先以基底 schema 建立 `fuel_jpy NOT NULL DEFAULT 0` 的遷移前狀態，再套用 `0034_fuel_jpy_nullable.sql`。

遷移前：

```text
ZERO_FUEL_PRE|1
SNAPSHOT_PRE|1|12.340000000000
CHECK_PRE|CHECK (((train_jpy >= (0)::numeric) AND (fuel_jpy >= (0)::numeric) AND (parking_jpy >= (0)::numeric) AND (cardboard_jpy >= (0)::numeric) AND (shipping_jpy >= (0)::numeric)))
```

套用與遷移後：

```text
ALTER TABLE
ALTER TABLE
COLUMN_POST|YES|NULL
ZERO_FUEL_POST|1
SNAPSHOT_POST|1|12.340000000000
CHECK_POST|CHECK (((train_jpy >= (0)::numeric) AND (fuel_jpy >= (0)::numeric) AND (parking_jpy >= (0)::numeric) AND (cardboard_jpy >= (0)::numeric) AND (shipping_jpy >= (0)::numeric)))
2|
INSERT 0 1
```

解讀：

- 欄位變為 nullable，default 也移除。
- 既有 `fuel_jpy=0` 路線數在 migration 前後都是 1；沒有 backfill。
- 原有 `trip_routes_jpy_inputs_non_negative` CHECK 定義逐字保留，SQL CHECK 對 `NULL` 的語意允許新列成功插入。
- captured 訂單的 `count/sum(profit_snapshot_transport_cost_twd)` 前後均為 `1 / 12.340000000000`，既有持久化快照未被改寫。

完成所有測試後的終值：

```text
FINAL_ZERO_FUEL|1
FINAL_NULL_FUEL|1
FINAL_SNAPSHOT|1|12.340000000000
```

## C2：交通成本 fail-closed

`calculateTransportCost` 在既有 ETC fail-closed 之後、任何數值解析或 override 之前檢查油資缺值：

- `null`、`undefined`、空字串與全空白字串 → `pending_confirmation / missing_fuel_jpy`。
- 明確字串 `"0"` → `ready`，保留改動前的精確總額。
- manual total/transport overrides 不能繞過缺油資 gate。
- ETC 與 fuel 同時缺少時仍先回 `missing_etc_jpy`，維持既有優先序。
- Fixture A/B 與其 ExactDecimal 結果未改。

單檔結果：

```text
tests 13
pass 13
fail 0
skipped 0
```

其中 T-5 用同一組其他成本對照 `fuelJpy=null` 與 `fuelJpy="0"`，同時證明缺值不是零；T-6 鎖住明確 0 的舊結果。

## C3：API 契約與 codegen

前置 Order decimal generated 漂移已由 main 的 PR #5 修復。官方命令：

```text
corepack pnpm --filter @workspace/api-spec run codegen
Orval v8.9.1
🎉 api-client-react - Your OpenAPI spec has been converted into ready to use orval!
🎉 zod - Your OpenAPI spec has been converted into ready to use orval!
typecheck:libs exit 0
```

codegen 後只有六個 `fuelJpy` 契約檔：`openapi.yaml` 與五個 generated 檔，沒有 Order 或其他非 fuel 漂移。`TripRoute` response 採「欄位必填、值可為 null」，避免客戶端混淆欄位不存在與已確認為空；create/update input 則接受 null。

## C4：route 與資料庫語意

新增 `tripRouteFuelNullable.route.test.mjs`，並加入 CI 的 database route 清單：

```text
✔ POST without fuelJpy stores SQL NULL
✔ PATCH fuelJpy null changes a stored value to SQL NULL
✔ PATCH fuelJpy zero stores numeric zero instead of NULL
✔ GET returns a JSON null fuelJpy without coercing it
✔ clearing an attached route fuel makes product transport pending
tests 5 / pass 5 / fail 0 / skipped 0
```

因此：

- T-7：POST 不帶 `fuelJpy`，psql/Drizzle 直接讀到 SQL `NULL`。
- T-8：PATCH `fuelJpy:null` 會把既有數值清成 SQL `NULL`。
- T-9：PATCH `fuelJpy:0` 保存 numeric 0，不是 `NULL`。
- T-10：GET 明確包含 `fuelJpy:null`，不是 `NaN`、0 或字串。
- T-16：產品仍連著該路線時，把 route fuel 清成 `NULL` 後，`resolveProductTransportCost` 回 `pending_confirmation / missing_fuel_jpy`，不會靜默算 0。

既有店鋪隔離 T-13：

```text
tests 6 / pass 6 / fail 0 / skipped 0
```

## C5：Trips UI

提示文字採裁決後的真實語意：

> 油資留空＝待確認。系統不會自動填 0，也不會自動推估。

jsdom T-11/T-12：

```text
✔ null fuel displays pending while an actual zero remains zero
✔ blank fuel update sends null and stays blank after reload
✔ blank fuel on create sends an explicit null and shows the fail-closed hint
tests 3 / pass 3 / fail 0 / skipped 0
```

## 回歸與驗證

T-14：

```text
tripProfit.test.mjs: tests 15 / pass 15 / fail 0 / skipped 0
fixedCostSummary.route.test.mjs: tests 5 / pass 5 / fail 0 / skipped 0
```

CI 同範圍純測試因 Windows 命令列長度上限，依同一 5 條 find 探索清單分成 7 批執行後加總：

```text
PURE_FILES=98
PURE_TOTAL tests=430 pass=430 fail=0 skipped=0
```

完整 17 檔 DB route 首跑：

```text
tests 95 / pass 94 / fail 1 / skipped 0
```

唯一失敗為既有 `customerStoreCredit.route.test.mjs` 的同毫秒排序案例：期望 `grant-2`、實際 `adjust-1`。本包沒有修改該 route 或測試；不隱藏此次紀錄。單檔原樣重跑：

```text
tests 8 / pass 8 / fail 0 / skipped 0
```

四套 typecheck：

```text
typecheck:libs exit 0
@workspace/api-server typecheck exit 0
@workspace/shop-app typecheck exit 0
@workspace/scripts typecheck exit 0
```

格式：

```text
Checking formatting...
All matched files use Prettier code style!
git diff --check：零輸出
```

依已確認的 Windows 操作邊界，**Playwright 與 Vite production build 本機未驗，留待 push 後 CI**；本報告不暗示兩者已通過。

## 禁區與安全性核對

- `lib/db/src/operating-cost/fuelCost.ts` 零修改：`git diff efef2a78..HEAD -- lib/db/src/operating-cost/fuelCost.ts` 零輸出。
- 未新增 `resolveFuelJpy`，未實作距離推估。
- 未修改 `productTransportCost`、orders 快照公式、`tripProfit`、手續費或既有 migration 0001–0033。
- generated 全由官方 codegen 產生，未手改。
- POST 省略 `fuelJpy` 的語意由舊的 default 0 改為 SQL `NULL`；這是本包明確的產品契約變更。
- 全程只使用假資料與新建拋棄式 PostgreSQL，未讀取主機 `DATABASE_URL`，未連 production 或既有 DB。
- 未 push、未操作 Replit。

## Docker 清理

```text
CONTAINERS_BEFORE=0
VOLUMES_BEFORE=130
CLEANUP_LABEL_CONTAINERS=0
CLEANUP_LABEL_VOLUMES=0
TOTAL_VOLUMES_AFTER=130
```

只刪除本包精確命名的 container 與 volume；未執行 `docker volume prune`，使用者既有 130 顆 volume 未受影響。

## SELF_SHA256

重算規則：讀取本檔 UTF-8 原始 bytes，刪除整行 `SELF_SHA256:`（含換行）後計算 SHA-256。

PowerShell 重算命令：`$text=[IO.File]::ReadAllText($path,[Text.UTF8Encoding]::new($false)); $normalized=[regex]::Replace($text,'(?m)^SELF_SHA256:.*(?:\r?\n)?',''); $sha=[Security.Cryptography.SHA256]::Create(); (($sha.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($normalized)) | ForEach-Object ToString x2) -join '')`

SELF_SHA256: 7282d6865623812c768d3a0b455d093a197c68592158f6cdd9abb7ac9823ae7e
