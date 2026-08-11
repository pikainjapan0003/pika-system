# V1 包21 完工報告

日期：2026-08-11

派工：審批者 B（Fable 5），2026-08-10

基底：`origin/main@ce36df85f07393912f93f2db7668ac1f2db8023d`

分支：`feat/v1-cost-entry-route-tag`

## 結論

本批只完成 D4「成本明細加所屬路線標籤」的後端管線：`cost_entries` 新增可空的 `trip_route_id`、以兩個互斥 partial unique indexes 保住路線明細與整趟共用明細的唯一性、API 支援建立／讀取／更新／清空標籤，並在寫入前阻擋跨行程及跨店路線。UI、按路線彙總、`trip_routes` 與毛利計算均未改動。

完整動態驗收使用 Node 24、pnpm 10.34.4 與 PostgreSQL 16 拋棄環境。Codegen 零漂移、Prettier 通過、schema push／seed／guard 通過、0037 migration delta catalog guard 通過、DB routes `101/101`、pure suite `440/440`，四套 typecheck 全部 exit 0。DB routes 與 pure suite 各只執行一次，沒有 retry、filter、concurrency flag、skip 或測試 timeout 修改。

## Commit 清單

| 次序 | SHA                                        | Subject                     | 範圍                                                 |
| ---: | ------------------------------------------ | --------------------------- | ---------------------------------------------------- |
|   C1 | `bca7d434e9220a8ca2c203eed98e53c0482c4a84` | `cost-entry-trip-route-tag` | Drizzle schema、0037 migration、兩個 partial indexes |
|   C2 | `d72e6cdae8753f4d9d17f151462cb0a211f6b3ff` | `cost-entry-route-tag-api`  | API 解析／歸屬防護與 route tests                     |
| 報告 | 本提交                                     | `phase21-report`            | 本報告、驗收證據索引與 `SELF_SHA256`                 |

## A. 唯一索引前後對照

### 改前

`cost_entries_estimate_category_active_unique` 只索引 `(trip_id, category_id)`，套用於 ACTIVE ESTIMATE 且分類非空的明細。同一趟同一分類只能有一筆，因此無法同時估算兩條不同路線的同類成本。

### 改後

| Index                                                   | Columns                                 | Predicate                           | 語意                                         |
| ------------------------------------------------------- | --------------------------------------- | ----------------------------------- | -------------------------------------------- |
| `cost_entries_estimate_category_route_active_unique`    | `(trip_id, category_id, trip_route_id)` | ACTIVE ESTIMATE、分類非空、路線非空 | 同一分類可分別屬於不同路線；同一路線不可重複 |
| `cost_entries_estimate_category_tripwide_active_unique` | `(trip_id, category_id)`                | ACTIVE ESTIMATE、分類非空、路線為空 | 整趟共用明細仍只能有一筆                     |

兩個 predicate 對 `trip_route_id IS NULL／IS NOT NULL` 互斥且窮盡。若只改為三欄 unique index，PostgreSQL 會把不同 NULL 視為不相等，整趟共用明細即可無限重複；若用 `UNIQUE NULLS NOT DISTINCT`，會增加 PostgreSQL 版本與 Drizzle 表達能力依賴。本批採兩個標準 partial indexes，既保住 NULL 語意，也不依賴該版本特性。

route test 實證：同趟同分類不同路線可同時存在；相同路線第二筆回 409；兩筆皆未指定路線時第二筆亦回 409。

## B. 跨行程與跨店防護

實作位置：`artifacts/api-server/src/routes/fixedCosts.ts`。

- `parseEntryBody` 對 `tripRouteId` 採既有正整數慣例：PATCH 省略代表不改；`null` 或空字串清成 SQL NULL；正整數接受；其他值回 400。
- `tripRouteBelongsToTrip` 以路線 id、目標 trip id 與 store 歸屬同時查驗。路線 store 必須等於已驗證行程的 store，或只在既有 backfill 過渡語意下允許 NULL。
- 上層 `loadTrip` 已先執行 `verifyStoreOwner` 並把 trip 綁定 authenticated store；因此跨店路線不能透過 NULL 標籤或外鍵繞過。
- PATCH payload 不允許改 `tripId`；檢查與寫入間若路線被刪除，只可能由 FK 失敗，不會把明細污染到另一趟。
- PostgreSQL `23505` 只轉為既有 409 語意，其他資料庫錯誤仍原樣拋出。
- GET 與 summary serializer 都展開整列 entry，故 `tripRouteId` 會自然回傳，未改其他 response 欄位。

新增於 `artifacts/api-server/src/routes/fixedCostEstimateUnlock.route.test.mjs` 的判別力案例涵蓋：有值／NULL round-trip、PATCH 省略保持原值、PATCH 清空、同店跨行程拒絕、跨店拒絕、三組唯一索引對照，以及被成本明細引用的路線刪除時精確命中 PostgreSQL `23503` 與 FK 名稱。

可選 follow-up：`tripRouteBelongsToTrip` 日後可改用 `trips.ts` 既有的 `ownedOrAwaitingBackfill` helper，以避免兩處過渡語意分岔；本批不為此重構。

## C. Schema 與 migration 一致性

CI 使用 current Drizzle schema 的 `push-force`；production 手寫升級使用 `0037_cost_entry_trip_route.sql`。本批分開驗證兩條路徑：

1. Current schema：全新 `pika_ci` 執行 `push-force` 成功，seed 維持 FIXED 12／VARIABLE 7／PURCHASE 1／total 20，CI 原文 schema guard 印出 `V1_FIXED_COST_SCHEMA_GUARD=PASS`。
2. Migration delta：同一個 PostgreSQL 16 拋棄環境另建 `pika_migration21`，先建立 current schema，再機械還原 `cost_entries` 為包21前狀態：移除 `trip_route_id`、FK 與兩個新索引，恢復舊索引。確認欄位數為 0、舊索引存在後，套用原始 0037。
3. Catalog guard：回讀確認 `trip_route_id` 為 nullable integer；FK 精確命名為 `cost_entries_trip_route_id_trip_routes_id_fk` 且 `ON DELETE RESTRICT`；舊索引消失；兩個新 unique index 的欄位順序與 predicate 逐字命中，輸出 `MIGRATION_0037_CATALOG_GUARD=PASS`。

`0001–0036` 零修改，沒有使用 production／既有 DB。Schema 與 migration 都可獨立建立本批契約，避免「CI 綠但 production migration 壞」的落差。

## D. 驗收結果與證據 SHA-256

### 前次環境阻塞

第一次驗收在 PostgreSQL ready 後停於容器內 `corepack prepare pnpm@10.34.4 --activate`，外層 1200 秒到期時 `pnpm install` 尚未開始；因此分類為工具鏈取得階段阻塞，不是 schema、codegen、測試、typecheck 或產品失敗。當次只依 label 清理，資源回到 0／0／0；四份原始證據如下：

| 證據                             | SHA-256                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `preflight.log`                  | `E4126A0B98369DAE7573DCA1A5368CB18B07E14CFB7260D6F25F1430D6466740` |
| `postgres-ready.log`             | `47661C5E264CF032B498B71720B7DBC8573657A5EF326A2AA05113C38C63E2B4` |
| `install-timeout-diagnostic.log` | `0BC091170DE0ABE3D0A289636F62155FFB6F763BA142ED9CBBDCD985FA555748` |
| `postflight.log`                 | `CD387C561D98591C015D1198B91A8EB5C8B392A8103FD3CB15F02263FD136553` |

### 重新核准後的工具鏈探針

Phase 0.5 由審批者 B 確認 Docker Engine 29.6.1、`docker-desktop` WSL Running、三組 `v1.phase21*` label 資源均為 0，preflight total volumes 134。唯一一次無 repo／DB／volume 的 probe 結果：

```text
Preparing pnpm@10.34.4 for immediate activation...
v24.18.0
10.34.4
duration_seconds=78.52
exit_code=0
```

probe 容器使用 `v1.phase21.probe=true`，結束後 label container 為 0。

### 完整驗收

| 步驟                 | 結果                                                       |
| -------------------- | ---------------------------------------------------------- |
| frozen install       | success；670 packages                                      |
| codegen drift        | Orval 8.9.1 兩 target 成功；intent-to-add guard 零差異     |
| Prettier             | `All matched files use Prettier code style!`               |
| schema push          | `[✓] Changes applied`                                      |
| seed                 | fixed=12／variable=7／purchase=1／total=20／singleton=1    |
| schema guard         | `V1_FIXED_COST_SCHEMA_GUARD=PASS`                          |
| migration 0037       | `MIGRATION_0037_CATALOG_GUARD=PASS`                        |
| DB routes            | 101 tests／101 pass／0 fail／0 skipped；只跑一次           |
| pure suite           | 440 tests／440 pass／0 fail／0 skipped；預設併發，只跑一次 |
| typecheck:libs       | exit 0                                                     |
| api-server typecheck | exit 0                                                     |
| shop-app typecheck   | exit 0                                                     |
| scripts typecheck    | exit 0                                                     |

容器 orchestration 曾出現三個不影響驗收內容的 harness 事件：PowerShell 將「volume 不存在」stderr 升格為例外、第一個合併式 setup 命令在建立 network 前遇到 180 秒外層等待上限，以及第一次抽取 CI guard 時 `sed` 引號錯誤。三次都發生於相應驗證命令啟動前、label 資源為 0 或測試額度仍為 0；後續只改外層命令等待／機械抽取方式，未改 repo、CI、測試參數或產品 timeout。完整紀錄見 `phase2-harness-observations.log`。

證據目錄：`C:\Users\Lnovo\Documents\Codex\2026-08-11\v1-phase21-verify-round2`

| 證據                              | SHA-256                                                            | 結果                             |
| --------------------------------- | ------------------------------------------------------------------ | -------------------------------- |
| `phase1-toolchain-probe.log`      | `656E850F2EC042285DE51EF210DF79D26C5A0E284CB3F4558BDCAF2E7DADAA0A` | Node／pnpm 探針通過              |
| `phase2-environment.log`          | `5FB0F7FD1D8BC1D2CFEEA946FCA285ECEC7747B089070C5EB7A43F6505930941` | 拋棄環境身分與邊界               |
| `phase2-install.log`              | `04B395C9EE83DD6BD237D5D6EEDD4D475DB3EE349FAE1286DD6DE5DC96E48E21` | frozen install 成功              |
| `phase2-codegen-drift.log`        | `6F5E7D6A96800559C0657F441A3C8714251D0331AA0694E3C97E1E7C62374CC9` | generated 零漂移                 |
| `phase2-prettier.log`             | `0251A11825C689B88028B24CA9ADAFB78F030D21B528F0E36965AC42D7FE274D` | Prettier 通過                    |
| `phase2-schema-push.log`          | `A69A96AEF561CB30A5CD8693BA30C4022602349A381C1D132966CA547B4E59BC` | schema push 成功                 |
| `phase2-schema-seed.log`          | `7633E96B4D939AD7B5AAEDAB05ACF37CCB6EBCD516CCFBCED821E1E02E7D1816` | 12／7／1／20                     |
| `phase2-schema-guard.log`         | `3CE194E7E8109AE76CDFB40C1D747AA01C65C99AC8A0F8AE49B30DC43081624A` | schema guard PASS                |
| `phase2-migration-0037.log`       | `D81B79BB2C380BFBB120318386CA278E71C5B2AF82039422CA8416EDD6111C95` | delta 與 catalog guard PASS      |
| `phase2-database-routes.log`      | `593DB68F901B389FEF28558A3D8C00D58DA2EF2FE50501AA682CFF8853E4981F` | 101/101                          |
| `database-routes.junit.xml`       | `934565CB6FAFC9CF8BC05B18034D187C4059203998C420C36F03C93DBF232796` | DB JUnit，fail/skipped 0/0       |
| `phase2-pure-functions.log`       | `A204BA390470E710A0BB7C39CEB50B8EED863D4BD1B11808C88CF1FF20CD18EE` | 440/440                          |
| `pure-functions.junit.xml`        | `A4F88A3F7F71ACF350533D3A8C2E0743855462765A7A069CAF5AC6B6D11C1FAA` | pure JUnit，fail/skipped 0/0     |
| `phase2-typechecks.log`           | `A475390C566D742A15F2F450213F5CAD8FDE7412454C0552B441D2E33F2BF75F` | 四套 exit 0                      |
| `phase2-harness-observations.log` | `B70B70F2E83A11BB556EB9D27770EF66C4751B87C41E659F8B2D363BC40E5DA1` | orchestration 事件完整紀錄       |
| `phase2-postflight.log`           | `D2485DB5AAF785BDEE99D7060B99B06F7C21BF48483C0AC802FFD865EC05BA9E` | label 0／0／0，total volumes 134 |

## E. Docker preflight／postflight

| 階段                | Label                    | Containers | Volumes | Networks | Total volumes |
| ------------------- | ------------------------ | ---------: | ------: | -------: | ------------: |
| Phase 0.5 preflight | `v1.phase21*`            |          0 |       0 |        0 |           134 |
| Phase 1 postflight  | `v1.phase21.probe=true`  |          0 |       0 |   不建立 |           134 |
| Phase 2 cleanup 前  | `v1.phase21.verify=true` |          2 |       1 |        1 |    診斷不量測 |
| Phase 2 postflight  | `v1.phase21.verify=true` |          0 |       0 |        0 |           134 |

Phase 2 只刪除帶 `v1.phase21.verify=true` label 的資源；未使用 `docker volume prune`、未使用名稱萬用字元、未碰 `buzz-*` 或任何外部資源。Total volumes 前後差異為 0；絕對數僅作本輪診斷，不作跨批不變量。

## F. SELF_SHA256

重算規則：讀取本檔 UTF-8 原始 bytes，刪除整行 `SELF_SHA256:`（含換行）後計算 SHA-256。

PowerShell 重算指令：`$text=[IO.File]::ReadAllText($path,[Text.UTF8Encoding]::new($false)); $normalized=[regex]::Replace($text,'(?m)^SELF_SHA256:.*(?:\r?\n)?',''); $sha=[Security.Cryptography.SHA256]::Create(); (($sha.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($normalized)) | ForEach-Object ToString x2) -join '')`

SELF_SHA256: 8bc616ebfb0b5ab450d5348d7d4efffb5a56244fe3bbff0cd1ccc642aaaa3497

## G. 未驗項、邊界與發布狀態

Build 與 Playwright 本機未驗，留待 push 後 current-HEAD CI；本報告不宣稱兩者通過。

- UI 未實作；`TripEstimate.tsx`、`TripActual.tsx` 零修改，畫面工作留給包23。
- 未實作按路線彙總、D10 雙軌毛利或其他包22內容。
- `trip_routes`、transport-cost、order profit snapshots 與既有 migration `0001–0036` 零修改。
- 未連 production／既有 DB；未操作 Replit／Republish。
- 未 push；等待審批者 B 終審與 Owner 授權。
- 報告前相對 `origin/main` 為 0 behind／2 ahead；報告 commit 後應為 0 behind／3 ahead。
