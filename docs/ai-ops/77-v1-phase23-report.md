# V1 包23 完工報告：D9 境內運大區層

日期：2026-08-13

分支：`feat/v1-domestic-shipping-area-layer`

基底：`origin/main@1c61518bcbd33b3d690a6d6ac824ddb100679ec6`

驗收程式碼 HEAD：`08724da848d522738abcb8ad071de520f71a3b51`

## 交付與 Git 拓樸

| 順序 | Commit        | Subject                               | 結果                           |
| ---: | ------------- | ------------------------------------- | ------------------------------ |
|   C1 | `30e4785`     | `trip-area-schema`                    | 完成                           |
|   C2 | `35f2d28`     | `area-domestic-cost`                  | 完成                           |
|   C3 | `1275bf1`     | `route-cost-reads-area-domestic`      | 完成                           |
|   C4 | `6ae0b07`     | `snapshot-loader-reads-estimate-area` | 完成                           |
| C2.1 | `f2130e8`     | `fixup! area-domestic-cost`           | 完成；向前補 safe-integer 防線 |
|   C5 | `0e00b5a`     | `trip-area-api-and-codegen`           | 完成                           |
|   C6 | `08724da`     | `trip-area-minimal-ui`                | 完成                           |
|   C7 | 本報告 commit | `phase23-report`                      | 本文件                         |

正式驗收前 `origin/main...HEAD=0/7`、工作樹乾淨。七筆皆為線性向前 commit；未 amend、rebase、reset 或 revert。本批未 push。

## A. 與 26.03 權威 Sheet 的逐格對帳

權威來源是 Sheet `1X17blNV…`、gid `98228099` 的「變異成本預估（交通費設定 2026.03）」A76:I79。公式為：

- `E = (C + D) × 1.5%`
- `H = (C + D + E) × G × F`
- `I = H ÷ B`

`calculateAreaDomesticCost` 全程使用 `ExactDecimal`；沒有用 `Number`、`parseFloat` 或浮點算術計算金額。

| 大區   | E：1.5% 手續費 JPY | H：總計 TWD |   I：單件境內運 TWD | I 的 ExactDecimal 分數 | 測試結果 |
| ------ | -----------------: | ----------: | ------------------: | ---------------------: | -------- |
| 東京   |            `39.75` | `1694.5425` | `3.644177419354839` |         `225939/62000` | 精確相符 |
| 北海道 |            `51.12` | `2179.2456` | `3.602058842975207` |       `2724057/756250` | 精確相符 |
| 四國   |            `37.95` | `1617.8085` |         `2.6963475` |       `1078539/400000` | 精確相符 |

三列分別鎖住 Sheet 的 E／H／I。另有 fail-closed 對照：預估商品數缺失、0、負數或不安全整數時 pending；匯率缺失時 pending；箱數 0 時 ready 且總額為 0；負金額、負箱數及不安全整數箱數被拒絕。

## B. 費基由六項改為四項

包19 的六項全收原則沒有被推翻；D9 只是把紙板與境內運從路線層搬到大區層：

- 路線層：`(ETC + 電車 + 油資 + 停車) × 1.5%`
- 大區層：`(每箱紙板 + 每箱運費) × 1.5%`，再乘箱數與匯率

因此所有日圓支出仍各收一次 1.5%。紙板與境內運不再進入路線層的 fee base，避免同一筆金額在路線與大區重複收費；大區的 1.5% 則嚴格對應 Sheet E77:E79。

Fixture reverse locks 也明確拒絕舊六項路線結果：Fixture A 的 route fee／total 由 `394.005`／`26661.005` 收斂為 `281.565`／`19052.565`；Fixture B 由 `268.665`／`18179.665` 收斂為 `156.225`／`10571.225`。大區 TWD 另行加入，不會消失或重收。

最終單件交通成本為：

```text
routeTransportPerItemJpy × exchangeRate
  + areaUnitDomesticTwd
  + hepPerItemTwd
```

`areaUnitDomesticTwd` 已在大區公式內完成 JPY→TWD 換算，故必須加在路線匯率乘法之外。

## C. `domesticPerItem` 正式改名與單位收斂

舊 `domesticPerItem` 表示「路線紙板＋運費的每件日圓值」；新值表示「大區計算後的每件台幣值」。為避免同名跨單位、跨層級誤用，Ready 結果正式改名為 `areaUnitDomesticTwd`，不保留舊名 alias。

這項命名同時明確三個事實：

1. 來源是大區，不是路線。
2. 單位是 TWD，不是 JPY。
3. 值已包含大區紙板／運費的 1.5%、箱數與匯率。

## D. ESTIMATE 讀取鏈與 snapshot 邊界

下單凍結鏈只讀取 `mode=ESTIMATE` 的 `trip_area_costs`：

```text
stores
  → trip_routes
  → trips
  → trip_areas（route.trip_area_id）
  → trip_area_costs（mode = ESTIMATE）
  → resolveProductTransportCost
  → createInitialOrderProfitSnapshot
```

API loader `artifacts/api-server/src/lib/orderProfitSnapshot.ts` 增加 parent area 與 ESTIMATE child cost 的批次查詢；batch test 鎖住 stores／routes／trips／areas／areaCosts 各只查一次，並以 ACTUAL poison value 證明 ACTUAL 不會被誤讀。

缺父大區時回 `missing_trip_area`；父大區存在但缺 ESTIMATE child 時回 `missing_trip_area_cost`。不得以 0 靜默替代。

純計算與凍結語意檔 `lib/db/src/transport-cost/orderProfitSnapshot.ts` 相對基底 diff 為 0。本批沒有重算、回填或覆寫任何既有 captured snapshot；只影響未來建立快照時的取數來源。

## E. 跨店、跨行程與輸入型別防線

大區 CRUD 使用：

- `GET/POST /stores/:storeId/trips/:tripId/areas`
- `PATCH/DELETE /stores/:storeId/trips/:tripId/areas/:areaId`

每個端點先驗證登入、店主與 trip ownership，再以 `areaId + tripId + storeId`（含已核準的 nullable transitional ownership）約束讀寫。路線 POST／PATCH 若指定 `tripAreaId`，API 會確認大區屬於同一 trip 與同一 store；跨行程或跨店一律 400，跨店路徑則先被 403 阻擋。

OpenAPI 的 integer 在目前 Orval Zod 產物會產生 `zod.number().min(...)`，不會自動拒絕 `1.5`。因此 server 額外對 `tripAreaId`、`parcelCount` 與非 null `estimatedItemQuantity` 做 `Number.isSafeInteger`；六組 fractional request 測試確認均回 400，且 transaction 沒有殘留 area／route 變更。

所有 route 證據都追加在 CI 已硬編碼執行的 `tripsStoreIsolation.route.test.mjs`，沒有建立 CI 看不到的新測試檔。正式 DB route suite 為 107/107。

## F. OpenAPI 與官方 codegen

OpenAPI 新增大區 CRUD、`TripArea*` schemas 與 nullable `tripAreaId`；既有 `cardboardJpy`、`shippingJpy`、`parcelCount` 仍保留於 TripRoute contract。

generated 只能由 Linux 官方工具產生。本批使用 Node 24、pnpm 10.34.4、Orval 8.9.1 執行官方 codegen，沒有手改 generated。差異精確為 14 個 generated 檔、722 insertions（7 modified＋7 added）：

- api-client-react：2 個既有檔更新。
- api-zod：`api.ts`、types barrel、7 個新 `TripArea*` type 檔，以及 3 個 `TripRoute*` type 檔更新。

語意漂移只涉及 `TripArea*` 與 `tripAreaId`；沒有 Order、fuel 或其他契約漂移。正式 verifier 再跑 codegen 後得到 `CODEGEN_DRIFT=0`。獨立 codegen 原始 log：

`C:\Users\Lnovo\Documents\Codex\2026-08-13\phase23-codegen-out-02\codegen.log`

SHA-256：`3E790F4C1F68276C53044909D31735BD3DAD76E4DCA95DB7C9ED400B47B9172F`。

第一次 codegen wrapper 在真正執行 Orval 前因 shell `test: too many arguments` 停止，未產生可套回 repo 的 codegen 輸出；這是 wrapper failure，不是 Orval failure。該輪 `codegen.log` SHA-256 為 `08C3E40DA2CCF465ED33FFF2093BA4D90BDBFC51E5FA746A7379857D31B21EAF`。第二次從 clean copy 執行成功，之後正式 verifier 再次證明 drift 為 0。

## G. Schema、migration 與行為一致性

方案 C 使用父表＋mode 子表：

```text
trip_areas
├─ id serial PK
├─ store_id nullable transitional
├─ trip_id → trips.id ON DELETE CASCADE
├─ name
└─ UNIQUE(trip_id, name)

trip_area_costs
├─ id serial PK
├─ trip_area_id → trip_areas.id ON DELETE CASCADE
├─ mode = ESTIMATE | ACTUAL
├─ cardboard_unit_jpy / shipping_unit_jpy >= 0
├─ parcel_count >= 0
├─ estimated_item_quantity IS NULL OR > 0
└─ UNIQUE(trip_area_id, mode)

trip_routes.trip_area_id
└─ → trip_areas.id ON DELETE SET NULL
```

0039 migration-delta 先在獨立 disposable DB push current Drizzle schema，精確檢查 current catalog，再機械還原為 pre-0039 狀態，只套用原始 `0039_trip_areas.sql` 一次，最後重複同一組 catalog 與行為驗證。

原始 `0039_trip_areas.sql` SHA-256：`0C1ED7299EEF18367A4E40E2FAAE439523D829CE3E6369B14BD92125679F83FF`。

驗證結果：11 個 named constraint、3 個 FK referenced-column assertion、3 個 btree index column assertion、所有欄位型別／nullability／default 都精確相符。duplicate name／mode 分別以 23505 拒絕；非法 mode、負金額、負箱數與非正預估商品數以 23514 及指定 constraint 拒絕。

刪除行為也實際執行：直接 DELETE area 後 route 的 `trip_area_id` 變為 NULL；帶有 area、cost 與已連結 route 的 trip 可成功刪除，殘留 areas／costs／routes 均為 0，輸出 `DELETE_TRIP_CASCADE_DIAMOND=PASS`。

## H. 正式動態驗收、證據與 Docker 清理

成功 evidence：

`C:\Users\Lnovo\Documents\Codex\2026-08-13\phase23-final-verification-20260813`

| Gate                 | 結果                                                        |
| -------------------- | ----------------------------------------------------------- |
| Frozen install       | PASS；Node 24.18.0、pnpm 10.34.4                            |
| Official codegen     | Orval 兩 target PASS；`CODEGEN_DRIFT=0`                     |
| Prettier             | `All matched files use Prettier code style!`                |
| Schema push          | PASS                                                        |
| Seed                 | fixed 12／variable 7／purchase 1／total 20                  |
| Schema guard         | `V1_FIXED_COST_SCHEMA_GUARD=PASS`                           |
| Migration 0039 delta | `MIGRATION_0039_CATALOG_GUARD=PASS`                         |
| Delete diamond       | `DELETE_TRIP_CASCADE_DIAMOND=PASS`                          |
| DB routes            | 107 tests／107 pass／0 fail／0 cancelled／0 skipped／0 todo |
| Pure suite           | 467 tests／467 pass／0 fail／0 cancelled／0 skipped／0 todo |
| typecheck:libs       | exit 0                                                      |
| api-server typecheck | exit 0                                                      |
| shop-app typecheck   | exit 0                                                      |
| scripts typecheck    | exit 0                                                      |
| Clean-copy gate      | 空檔，0 bytes                                               |
| Verifier             | `PHASE23_VERIFY_SUCCESS=2026-08-13T08:35:14Z`               |

Evidence manifest：`sha256-manifest.txt`，28 entries，manifest SHA-256：

`02068421A07680206B2982F176843B4C98C8E572A3300762BA70E882F375DE0F`

| Evidence                              | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `01-install.log`                      | `4BAD3A49B79C652A7A102CA7B703FCD574601DFD696CF07ECCF4BFE70D370483` |
| `02-codegen.log`                      | `6F5E7D6A96800559C0657F441A3C8714251D0331AA0694E3C97E1E7C62374CC9` |
| `03-prettier.log`                     | `17AA973D3F004560237D9A95171210B0671DEFF23D61628EECF7322FF5938F20` |
| `04-schema-push.log`                  | `150A950F286688A3FCEFA3477B569F6210F8B8C5BE0352926EA05B6375011646` |
| `05-schema-seed.log`                  | `1203442DEB37D714E6CCB63FB3DB9F718E3658532CB3F2EDA3589A5FDA76BB95` |
| `06-schema-guard.log`                 | `3CE194E7E8109AE76CDFB40C1D747AA01C65C99AC8A0F8AE49B30DC43081624A` |
| `06b-migration-0039.log`              | `5EB86EAC02B12C7043EE7A79679307B00F348B9C3EF123D47A37F3DA80D6C834` |
| `06b-schema-push.log`                 | `DF1F2E064B1AF2A472E6D50BA9412CC096760E025DDA2BC8969421DBEB595C16` |
| `07-database-routes.log`              | `357A5031AE56E18E1CC60AD0DC8C1A46366BD341A1F63870D56C3A4F09009539` |
| `08-pure-tests.log`                   | `92C39BAD8F2DD8162BB71B77DCE77864DA9EDC80B4E29F18610D6F042031A8F4` |
| `08b-junit-summary.log`               | `C4343FE0DF3208A2A32DD9CB8155D24F92BDC216B7F6B7876BEE5054B69E58E9` |
| `09a-typecheck-libs.log`              | `18DC1FDA5AED7851799A3BC5C0B56E15E3CE78C1FB26D94987838DA16866A060` |
| `09b-typecheck-api.log`               | `0CB5E07E90993D5811599446BAD29A4193AF887D8DD9D884787AF5E9F3D222CF` |
| `09c-typecheck-shop.log`              | `BFCE589EA09407A6DCBEDFCCC9B287552E3096BA00BEB2242CACBBB04637CB5B` |
| `09d-typecheck-scripts.log`           | `A7D4A582BC395399E1BA40675C69C809BABBED17555581ED42A9B53D267E9C53` |
| `cleanup-postflight.txt`              | `393B4957CED6D2F499778E156BDA1BD90FD5929670EE65F71523200A8725F8B6` |
| `database-routes.junit.xml`           | `1EEC44ECE2CB31B0C4B152774C7086E2EA2E39EA24DBF7F778B3A54A7483BFB1` |
| `launch-phase23.ps1`                  | `6DB3DFC9EDC26EED66AFDBA18D62A02B608C88B83EC2074517426A7940620FC6` |
| `phase23-full.log`                    | `E5413D6FBE9BB2A95B43446242FCCE33D11B4F34DF0B78F7C832043FF72ACB5B` |
| `phase23-result.txt`                  | `0A784F530BEC1D78DE8423B64F1C22C115BC3EA967EE24F7D90585AEDBAFADAF` |
| `phase23-verify.sh`                   | `05A453B542490AB44BCEC626DDDBA7947B28EFEF697219DFCFB93AB4D51B0B8E` |
| `preflight.txt`                       | `71064C42770500F7C6F64445C9AA0754B6EA18779005788451136C9A560F1CCD` |
| `pure-functions.junit.xml`            | `EB2C4D9936494CDA4CBEC576B881D566E79C79AAAAEAFCA85F7CED1D31CD42B1` |
| `resource-created.txt`                | `B19011E310578224DCB79F8A69959BE03ADFBC2C60716C38BAB3DB12AD710C61` |
| `run-summary.txt`                     | `9A3552ED2EF63B36D93BBDF53F201B896BD5565C8DDBA5865B12AD73AF0EFABA` |
| `test-summary.json`                   | `81E76C758076F0E20834D5325E4B8863B37D102BEE5A5505EC7AD5C504AA2367` |
| `verifier-name-array-patch-audit.txt` | `FBF4EC7EE981E8CC22F5009736CD018E61AD10315E51355ED93F1AB99CF78233` |
| `verify-copy-git-status.txt`          | `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855` |

Docker preflight label container／volume／network 為 0／0／0；本輪建立精確 2／1／1；postflight 回到 0／0／0。total volumes 為 134 → 134，差值 0。未執行 `docker volume prune`，未用名稱萬用字元，也未刪除任何未帶 `v1.phase23=true` label 的資源。

啟動 wrapper 在 PostgreSQL healthy 後、verifier 尚未建立前觸及外層 30 秒工具等待邊界；同一套已核對的 labeled 環境被保留，並以完全相同的 create/start 參數啟動核準 verifier。沒有重建 DB、沒有啟動第二輪 verifier；當時 DB routes 與 pure suite 執行次數均為 0。此操作事實已寫入 `resource-created.txt`。

## I. SELF_SHA256 計算規則

讀取本檔 UTF-8 原始 bytes，刪除整行 `SELF_SHA256:`（包含其換行）後計算 SHA-256。實際值列於本節末尾。

PowerShell：

```powershell
$text = [IO.File]::ReadAllText($path, [Text.UTF8Encoding]::new($false))
$normalized = [regex]::Replace($text, '(?m)^SELF_SHA256:.*(?:\r?\n)?', '')
$sha = [Security.Cryptography.SHA256]::Create()
(($sha.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($normalized)) |
    ForEach-Object ToString x2) -join '')
```

SELF_SHA256: 3eb3b5c2ec2fe7a58c502f02d9e54bea128f46b59d604f56fcad1d6f7cfabf18

## J. 本機驗證邊界

Build 與 Playwright 本機未驗，留待 push 後 current-HEAD CI。不得把本報告中的 codegen、Prettier、DB routes、pure suite、migration guard 與 typecheck 全綠誤述為 Build 或瀏覽器 E2E 已通過。

## K. 路線層舊三欄位停用但保留

`trip_routes.cardboard_jpy`、`shipping_jpy`、`parcel_count` 依 Q10 乙案保留於 DB schema 與 OpenAPI；本批沒有 DROP，也沒有修改 0001–0038。

它們已停止參與計算，Trips UI 不顯示、不送出，collapsed route summary 也不顯示。component test 使用非零 sentinel 鎖住「即使舊值存在也不得重新出現在 UI」。待大區數字上線確認無誤後，另開不可逆清除小包；本批不提前刪除。

## L. 方案 C：父表＋mode 子表

route 指向 mode-agnostic 的 `trip_areas` parent，ESTIMATE／ACTUAL 分別是 `trip_area_costs` child。選擇此模型消除了六類未定義行為：

1. 單一 route FK 不再被迫只指向 ESTIMATE 或 ACTUAL 其中一列。
2. UI 下拉不再同時出現同一邏輯大區的兩個 mode 而產生選擇歧義。
3. snapshot 不需靠可編輯 name 猜測另一 mode 的 sibling。
4. 大區改名不會讓 ESTIMATE／ACTUAL 配對斷鏈。
5. 缺某 mode 直接表現為 child 不存在，可天然 fail-closed。
6. 刪除 parent 時 child cascade、route SET NULL 的責任清楚，不產生 sibling orphan 或懸空配對。

UI 可在同一個 parent 下新增／編輯 ESTIMATE 與 ACTUAL；測試鎖住缺 ACTUAL 時使用 PATCH/upsert 同一 areaId，而不是誤建第二個父大區。

## M. `ON DELETE SET NULL` 與刪除菱形

`trips → trip_areas` 與 `trips → trip_routes` 都是 CASCADE。如果 `trip_routes → trip_areas` 使用 RESTRICT，刪除 trip 時會形成刪除菱形，並依 FK trigger 執行順序產生不確定阻擋。

因此 `trip_routes.trip_area_id` 刻意使用 `ON DELETE SET NULL`：

- 直接刪大區：route 解除連結，下游回 `missing_trip_area`，不會產生錯誤金額。
- 刪除整趟：areas、costs、routes 都可 cascade 清除且無孤兒。

0039 行為驗證已實際證明兩條路徑都成立，不只檢查 catalog。

## N. ACTUAL 大區永久不得接入 D10

ACTUAL 大區本批只提供 CRUD 與未來的預估／實際對照資料，不進入任何毛利計算。

原因是實際紙板與日本境內運收據已經分別透過 VARIABLE 分類 `PACKAGING` 與 `DOMESTIC_SHIPPING`，沿 `cost_entries → actualRouteRollup → routeActualCostTwd → D10` 進入實際單件毛利。若再把 ACTUAL area cost 接入 D10，會把同一筆錢計算兩次。

下列禁區相對基底全部 diff 為 0：`fixedCostSummary.ts`、`actualUnitProfit.ts`、`actualRouteRollup.ts`、`tripProfit.ts` 與 `costEntries.ts`。這個「不得接入 D10」是永久正確性邊界，不是暫緩項目。

## O. Override 處置

- `domestic_per_item_override`：欄位保留但停止消費；不得把舊日圓語意靜默改成大區台幣。
- `fee_1_5pct_override`：保留，語意收斂為路線四項費用專用。
- `total_jpy_override`：保留，語意收斂為路線四項日圓總計專用。

`missing_trip_area` gate 位於 `applyOverride` 之前。測試將五個 legacy override 全開，結果仍必須是 `pending_confirmation / missing_trip_area`，證明任何 override 都不能繞過大區歸屬安全門。

## P. PostgreSQL `name[]` catalog 假紅事件

第一次正式 verifier 在 current schema push 後的第一組 catalog assertion 停於：

```text
trip_areas_pkey local columns="{id}" expected=["id"]
```

因果鏈：

1. `pg_attribute.attname` 型別為 PostgreSQL `name`（OID 19）。
2. `ARRAY(SELECT a.attname ...)` 因此產生 `name[]`（OID 1003）。
3. 當前 node-postgres／pg-types 沒有把 OID 1003 解析成 JS array，回傳 PostgreSQL 陣列字面值字串 `"{id}"`。
4. `JSON.stringify("{id}")` 與 `JSON.stringify(["id"])` 不同，造成 verifier false negative。

錯誤本身已證明 schema 正確：`"{id}"` 表示 `trip_areas_pkey` 確實存在且唯一欄位就是 `id`；錯的是客戶端表示法，不是 catalog 內容。

核準修法只在 local columns、referenced columns 與 index columns 三個子查詢加入 `a.attname::text`，使結果成為 pg-types 可解析的 `text[]`（OID 1009）。比較邏輯、排序、期望陣列與 fail-closed gate 均未改變。

| Verifier | SHA-256                                                            |
| -------- | ------------------------------------------------------------------ |
| 修補前   | `4B04696119387B5BA5AAB9687CEE881733D5E30FD0559B70AEDAA9FFE17139F0` |
| 修補後   | `05A453B542490AB44BCEC626DDDBA7947B28EFEF697219DFCFB93AB4D51B0B8E` |

Byte audit：只增加 18 bytes，即 `::text` 6 bytes × 3；將三處 cast 機械還原後與舊 script byte-for-byte 相同。修補前 failure evidence 位於 `phase23-name-array-failure-20260813`；其 manifest SHA-256 為 `85E0846B668F7FA2A6DDF974710F192832446EEF281F3A1C1D721318436B44CD`。

## Q. 觀察項：verifier 自造假紅已發生兩次

Verifier 已兩度成為停工來源：

1. 包22 clean gate 否決 verifier 按 CI 命令自行產生的 `test-results/`。
2. 包23 catalog gate 將 PostgreSQL `name[]` 的字串表示誤判為欄位不符。

兩次都不是產品、schema 或測試失敗。建議另案為 verifier 加自我測試：至少覆蓋 git artifact lifecycle、PostgreSQL catalog type parsing、單／複合欄位 constraint、FK referenced columns、index columns 及失敗時 label cleanup。本批只登記，不繼續擴大 verifier 基建範圍。

## R. `f2130e8 fixup! area-domestic-cost` 說明

`f2130e8` 在 C2 後向前補上 JS number 的 safe-integer 防線：

- `estimatedItemQuantity` 為 `Number.MAX_SAFE_INTEGER + 1` 時 fail-closed pending。
- `parcelCount` 為不安全整數時拋出 integer input error。
- 對應測試新增兩組反例。

它不改變 Sheet 三列公式或精確值。依既有慣例一律向前修、不 amend／rebase，故 subject 保持 `fixup! area-domestic-cost` 並在本報告顯式記錄。

## 最終邊界

- Build 本機未驗，留待 push 後 current-HEAD CI。
- Playwright 本機未驗，留待 push 後 current-HEAD CI。
- 未連接 production 或既有 DB；所有 DB 均為本批 disposable PostgreSQL。
- 未操作 Replit／Republish。
- 未修改 0001–0038、CI workflow 或本批禁區。
- 未 push；等待審批者 B 終審與 Owner 另案授權。
